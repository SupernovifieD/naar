import { extractZipBundle } from "./bundle.js";
import { ProviderHttpClient, ProviderHttpError } from "./http.js";
import { buildCandidate, describeFiles, inferMetadataFromFiles, parseFrontmatter, toCanonicalSkillId } from "./normalize.js";
import { resolveProviderRuntimeConfig } from "./runtime.js";
import { filterCandidatesForSearchTerm } from "../search/rank.js";
import type {
  ProviderSearchQuery,
  SkillCandidate,
  SkillFetchedBundle,
  SkillProvider,
  SkillProviderResult,
  SkillRef
} from "../types/index.js";

interface AnthropicApiListResponse {
  data?: AnthropicApiSkill[];
  skills?: AnthropicApiSkill[];
  items?: AnthropicApiSkill[];
  has_more?: boolean;
  next_cursor?: string | null;
}

interface AnthropicApiSkill {
  id?: string;
  name?: string;
  description?: string;
  summary?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  publisher?: { name?: string } | string;
  latest_version?: {
    version?: string;
    license?: string | null;
    updated_at?: string;
  };
}

interface GitHubRepo {
  default_branch: string;
  stargazers_count?: number;
  pushed_at?: string;
}

interface GitHubTreeResponse {
  tree?: Array<{
    path: string;
    type: string;
    sha: string;
  }>;
}

export class OfficialAnthropicSkillsProvider implements SkillProvider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic Official Skills";
  readonly capabilities = {
    search: true,
    fetchFiles: true,
    fetchMetadata: true,
    verifyVersion: true,
    popularity: true,
    publisherInfo: true,
    license: true,
    lastUpdated: true,
    prepareInstall: true
  };

  private readonly runtime = resolveProviderRuntimeConfig();
  private readonly http = new ProviderHttpClient({
    timeoutMs: this.runtime.timeoutMs,
    maxAttempts: this.runtime.retryMaxAttempts
  });

  async search(query: ProviderSearchQuery): Promise<SkillProviderResult> {
    const warnings: string[] = [];
    const searchMode = query.mode === "search";
    const term = searchMode ? query.term?.trim() : undefined;
    const limit = query.limit ?? 80;

    if (this.runtime.anthropic.apiKey) {
      try {
        const apiResult = await this.searchViaApi(limit, term);
        return {
          ...apiResult,
          warnings
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(searchMode
          ? `Anthropic Skills API unavailable; falling back to catalog filtering. ${message}`
          : `Anthropic Skills API unavailable; falling back to GitHub catalog. ${message}`);

        if (searchMode && term) {
          try {
            const catalogResult = await this.searchViaApi(limit);
            return {
              ...catalogResult,
              candidates: filterCandidatesForSearchTerm(catalogResult.candidates, term, limit),
              warnings: [...warnings, ...(catalogResult.warnings ?? [])]
            };
          } catch {
            // Continue to GitHub fallback below.
          }
        }
      }
    } else {
      warnings.push("ANTHROPIC_API_KEY not set; using Anthropic GitHub fallback catalog.");
    }

    const fallback = await this.searchViaGitHub(limit);
    return {
      ...fallback,
      candidates: searchMode && term
        ? filterCandidatesForSearchTerm(fallback.candidates, term, limit)
        : fallback.candidates,
      warnings: [...warnings, ...(fallback.warnings ?? [])]
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const skillId = extractSkillId(ref.skillId);

    if (this.runtime.anthropic.apiKey) {
      try {
        const bundle = await this.fetchFilesViaApi(skillId, ref.version);
        if (bundle) {
          return bundle;
        }
      } catch {
        // API path is optional in MVP; continue to GitHub fallback.
      }
    }

    return this.fetchFilesViaGitHub(skillId);
  }

  private async searchViaApi(limit: number, term?: string): Promise<SkillProviderResult> {
    const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 200))) });
    if (term && term.trim().length > 0) {
      params.set("search", term.trim());
    }
    const url = `${this.runtime.anthropic.baseUrl}/v1/skills?${params.toString()}`;
    const response = await this.http.getJson<AnthropicApiListResponse>(url, this.anthropicHeaders());
    const payload = response.data;
    const items = payload.data ?? payload.skills ?? payload.items ?? [];

    const candidates = items
      .map((item) => this.mapAnthropicApiSkill(item))
      .filter((candidate): candidate is SkillCandidate => candidate !== null);

    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      mode: "api",
      candidates,
      nextCursor: payload.next_cursor ?? undefined,
      warnings: []
    };
  }

  private async searchViaGitHub(limit: number): Promise<SkillProviderResult> {
    const warnings: string[] = [];
    const headers = this.githubHeaders();

    let repo: GitHubRepo;
    try {
      repo = (await this.http.getJson<GitHubRepo>(`${this.runtime.github.apiBaseUrl}/repos/anthropics/skills`, headers)).data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        providerId: this.id,
        fetchedAtIso: new Date().toISOString(),
        mode: "github_fallback",
        candidates: [],
        warnings: [`Anthropic GitHub fallback failed: ${message}`]
      };
    }

    const branch = repo.default_branch || "main";
    const treeUrl = `${this.runtime.github.apiBaseUrl}/repos/anthropics/skills/git/trees/${encodeURIComponent(branch)}?recursive=1`;

    const treeResponse = await this.http.getJson<GitHubTreeResponse>(treeUrl, headers);
    const tree = treeResponse.data.tree ?? [];

    const skillEntries = tree
      .filter((entry) => entry.type === "blob" && /^skills\/[^/]+\/SKILL\.md$/.test(entry.path))
      .slice(0, Math.max(1, Math.min(limit, 120)));

    const candidates: SkillCandidate[] = [];
    for (const entry of skillEntries) {
      const slug = entry.path.split("/")[1];
      const rawUrl = `https://raw.githubusercontent.com/anthropics/skills/${encodeURIComponent(branch)}/${entry.path}`;

      let markdown = "";
      try {
        markdown = (await this.http.getText(rawUrl)).data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to load Anthropic skill markdown for ${slug}: ${message}`);
      }

      const frontmatter = parseFrontmatter(markdown);
      const name = frontmatter.name || slug;
      const summary = frontmatter.description || firstNonEmptyParagraph(markdown) || `Anthropic skill: ${slug}`;
      const tags = dedupe([slug, ...extractTagsFromText(summary)]);

      const candidate = buildCandidate({
        providerId: this.id,
        providerSkillId: slug,
        canonicalSkillId: toCanonicalSkillId(slug),
        name,
        summary,
        tags,
        source: {
          url: `https://github.com/anthropics/skills/tree/${branch}/skills/${slug}`,
          ref: `${branch}:${entry.sha}`,
          version: branch,
          publisher: "Anthropic"
        },
        compatibility: {
          assistants: ["claude", "cursor", "copilot", "codex", "generic"]
        },
        metadata: {
          publisher: "Anthropic",
          description: summary,
          popularity: repo.stargazers_count ?? undefined,
          license: frontmatter.license ?? "Custom",
          lastUpdatedIso: repo.pushed_at,
          hasScripts: false,
          hasBinaries: false,
          hasPackageManifests: false,
          trustLevel: "official",
          pinnedRef: entry.sha
        }
      });

      candidates.push(candidate);
    }

    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      mode: "github_fallback",
      candidates,
      warnings
    };
  }

  private async fetchFilesViaApi(skillId: string, version?: string): Promise<SkillFetchedBundle | null> {
    const headers = {
      ...this.anthropicHeaders(),
      Accept: "application/zip, application/json"
    };

    const endpoints = version
      ? [
        `/v1/skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/content`,
        `/v1/skills/${encodeURIComponent(skillId)}/content`
      ]
      : [
        `/v1/skills/${encodeURIComponent(skillId)}/content`
      ];

    for (const endpoint of endpoints) {
      try {
        const bytesResponse = await this.http.getBytes(`${this.runtime.anthropic.baseUrl}${endpoint}`, headers);
        const contentType = (bytesResponse.headers.get("content-type") || "").toLowerCase();
        const contentDisposition = (bytesResponse.headers.get("content-disposition") || "").toLowerCase();

        if (contentType.includes("application/zip") || contentDisposition.includes(".zip")) {
          const extracted = await extractZipBundle(bytesResponse.data);
          const files = extracted.textFiles;
          if (!files["SKILL.md"]) {
            continue;
          }

          const candidate = buildCandidate({
            providerId: this.id,
            providerSkillId: skillId,
            canonicalSkillId: toCanonicalSkillId(skillId),
            name: skillId,
            summary: firstNonEmptyParagraph(files["SKILL.md"]) || `Anthropic skill ${skillId}`,
            tags: [skillId],
            source: {
              url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
              version,
              ref: version ? `${skillId}@${version}` : skillId,
              publisher: "Anthropic"
            },
            compatibility: { assistants: ["claude", "cursor", "copilot", "codex", "generic"] },
            metadata: {
              publisher: "Anthropic",
              trustLevel: "official",
              pinnedRef: version,
              hasBinaries: extracted.binaryPaths.length > 0
            }
          });
          candidate.files = describeFiles(files);
          candidate.metadata = inferMetadataFromFiles(candidate, files);

          return {
            skill: candidate,
            files
          };
        }

        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytesResponse.data);
        const parsed = tryParseJson(text);
        if (!parsed) {
          continue;
        }

        const files = extractFilesFromAnthropicJson(parsed);
        if (!files["SKILL.md"]) {
          continue;
        }

        const candidate = buildCandidate({
          providerId: this.id,
          providerSkillId: skillId,
          canonicalSkillId: toCanonicalSkillId(skillId),
          name: skillId,
          summary: firstNonEmptyParagraph(files["SKILL.md"]) || `Anthropic skill ${skillId}`,
          tags: [skillId],
          source: {
            url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
            version,
            ref: version ? `${skillId}@${version}` : skillId,
            publisher: "Anthropic"
          },
          compatibility: { assistants: ["claude", "cursor", "copilot", "codex", "generic"] },
          metadata: {
            publisher: "Anthropic",
            trustLevel: "official",
            pinnedRef: version
          }
        });
        candidate.files = describeFiles(files);
        candidate.metadata = inferMetadataFromFiles(candidate, files);

        return {
          skill: candidate,
          files
        };
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) {
          continue;
        }

        if (error.status && error.status < 500 && error.status !== 429) {
          continue;
        }
      }
    }

    return null;
  }

  private async fetchFilesViaGitHub(skillId: string): Promise<SkillFetchedBundle> {
    const headers = this.githubHeaders();
    const repo = (await this.http.getJson<GitHubRepo>(`${this.runtime.github.apiBaseUrl}/repos/anthropics/skills`, headers)).data;
    const branch = repo.default_branch || "main";

    const treeUrl = `${this.runtime.github.apiBaseUrl}/repos/anthropics/skills/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeResponse = await this.http.getJson<GitHubTreeResponse>(treeUrl, headers);
    const tree = treeResponse.data.tree ?? [];

    const normalizedSkillId = skillId.replace(/^anthropic[/:]/, "");
    const skillPath = `skills/${normalizedSkillId}/SKILL.md`;
    const skillEntry = tree.find((entry) => entry.path === skillPath);
    if (!skillEntry) {
      throw new Error(`Anthropic GitHub skill not found: ${skillId}`);
    }

    const skillFolder = `skills/${normalizedSkillId}/`;
    const folderEntries = tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(skillFolder));

    const files: Record<string, string> = {};
    for (const entry of folderEntries) {
      const relative = entry.path.slice(skillFolder.length);
      const rawUrl = `https://raw.githubusercontent.com/anthropics/skills/${encodeURIComponent(branch)}/${entry.path}`;
      const content = (await this.http.getText(rawUrl)).data;
      files[relative] = content;
    }

    if (!files["SKILL.md"]) {
      throw new Error(`Anthropic GitHub skill missing SKILL.md: ${skillId}`);
    }

    const frontmatter = parseFrontmatter(files["SKILL.md"]);
    const summary = frontmatter.description || firstNonEmptyParagraph(files["SKILL.md"]) || `Anthropic skill ${normalizedSkillId}`;

    const candidate = buildCandidate({
      providerId: this.id,
      providerSkillId: normalizedSkillId,
      canonicalSkillId: toCanonicalSkillId(normalizedSkillId),
      name: frontmatter.name || normalizedSkillId,
      summary,
      tags: dedupe([normalizedSkillId, ...extractTagsFromText(summary)]),
      source: {
        url: `https://github.com/anthropics/skills/tree/${branch}/${skillFolder}`,
        version: branch,
        ref: `${branch}:${skillEntry.sha}`,
        publisher: "Anthropic"
      },
      compatibility: {
        assistants: ["claude", "cursor", "copilot", "codex", "generic"]
      },
      metadata: {
        publisher: "Anthropic",
        description: summary,
        popularity: repo.stargazers_count,
        license: frontmatter.license || (files["LICENSE.txt"] ? "Custom" : undefined),
        lastUpdatedIso: repo.pushed_at,
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        trustLevel: "official",
        pinnedRef: skillEntry.sha
      }
    });

    candidate.files = describeFiles(files);
    candidate.metadata = inferMetadataFromFiles(candidate, files);

    return {
      skill: candidate,
      files
    };
  }

  private anthropicHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "anthropic-version": this.runtime.anthropic.apiVersion,
      "anthropic-beta": this.runtime.anthropic.betaHeaders.join(",")
    };

    if (this.runtime.anthropic.apiKey) {
      headers["x-api-key"] = this.runtime.anthropic.apiKey;
    }

    return headers;
  }

  private githubHeaders(): Record<string, string> {
    if (!this.runtime.github.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.runtime.github.token}`
    };
  }

  private mapAnthropicApiSkill(skill: AnthropicApiSkill): SkillCandidate | null {
    const id = skill.id || skill.name;
    if (!id) return null;

    const name = skill.name || id;
    const summary = skill.description || skill.summary || `Anthropic skill ${name}`;
    const publisher = typeof skill.publisher === "string"
      ? skill.publisher
      : skill.publisher?.name || "Anthropic";

    return buildCandidate({
      providerId: this.id,
      providerSkillId: id,
      canonicalSkillId: toCanonicalSkillId(id),
      name,
      summary,
      tags: dedupe([...(skill.tags ?? []), ...extractTagsFromText(summary), toCanonicalSkillId(name)]),
      source: {
        url: `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview`,
        version: skill.latest_version?.version,
        ref: skill.latest_version?.version ? `${id}@${skill.latest_version.version}` : id,
        publisher
      },
      compatibility: {
        assistants: ["claude", "cursor", "copilot", "codex", "generic"]
      },
      metadata: {
        publisher,
        description: summary,
        license: skill.latest_version?.license ?? undefined,
        lastUpdatedIso: skill.updated_at || skill.latest_version?.updated_at || skill.created_at,
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        trustLevel: "official",
        pinnedRef: skill.latest_version?.version
      }
    });
  }
}

function extractSkillId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("/")) {
    return trimmed.slice(trimmed.lastIndexOf("/") + 1);
  }
  if (trimmed.includes(":")) {
    return trimmed.slice(trimmed.lastIndexOf(":") + 1);
  }
  return trimmed;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractTagsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const candidate of [
    "react",
    "nextjs",
    "next",
    "vue",
    "nuxt",
    "svelte",
    "angular",
    "tailwind",
    "typescript",
    "javascript",
    "python",
    "fastapi",
    "django",
    "flask",
    "copilot",
    "cursor",
    "codex",
    "claude"
  ]) {
    if (lower.includes(candidate)) {
      tags.push(candidate);
    }
  }
  return tags;
}

function firstNonEmptyParagraph(markdown: string): string | null {
  const body = markdown
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith("#"));
  return body ?? null;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractFilesFromAnthropicJson(payload: Record<string, unknown>): Record<string, string> {
  if (isRecord(payload.files)) {
    return coerceStringRecord(payload.files);
  }

  if (typeof payload.content === "string") {
    return { "SKILL.md": payload.content };
  }

  if (isRecord(payload.skill) && typeof payload.skill.content === "string") {
    return { "SKILL.md": payload.skill.content };
  }

  if (Array.isArray(payload.files)) {
    const mapped: Record<string, string> = {};
    for (const entry of payload.files) {
      if (!isRecord(entry)) continue;
      const filePath = typeof entry.path === "string" ? entry.path : (typeof entry.name === "string" ? entry.name : "");
      const content = typeof entry.content === "string" ? entry.content : "";
      if (filePath && content) {
        mapped[filePath] = content;
      }
    }
    return mapped;
  }

  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceStringRecord(value: Record<string, unknown>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      mapped[key] = entry;
    }
  }
  return mapped;
}
