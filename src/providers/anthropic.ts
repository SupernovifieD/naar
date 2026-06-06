import { ProviderHttpClient } from "./http.js";
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

const ANTHROPIC_REPO_OWNER = "anthropics";
const ANTHROPIC_REPO_NAME = "skills";
const ANTHROPIC_REPO_SLUG = `${ANTHROPIC_REPO_OWNER}/${ANTHROPIC_REPO_NAME}`;
const GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com";

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
    const searchMode = query.mode === "search";
    const term = searchMode ? query.term?.trim() : undefined;
    const limit = query.limit ?? 80;

    const result = await this.searchViaGitHub(limit);

    if (searchMode && term) {
      return {
        ...result,
        candidates: filterCandidatesForSearchTerm(result.candidates, term, limit),
        warnings: result.warnings ?? []
      };
    }

    return {
      ...result,
      warnings: result.warnings ?? []
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    return this.fetchFilesViaGitHub(extractSkillId(ref.skillId));
  }

  private async searchViaGitHub(limit: number): Promise<SkillProviderResult> {
    const warnings: string[] = [];
    const headers = this.githubHeaders();

    let repo: GitHubRepo;
    try {
      repo = (await this.http.getJson<GitHubRepo>(`${this.runtime.github.apiBaseUrl}/repos/${ANTHROPIC_REPO_SLUG}`, headers)).data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        providerId: this.id,
        fetchedAtIso: new Date().toISOString(),
        mode: "github",
        candidates: [],
        warnings: [`Anthropic official skills catalog failed: ${message}`]
      };
    }

    const branch = repo.default_branch || "main";
    const treeUrl = `${this.runtime.github.apiBaseUrl}/repos/${ANTHROPIC_REPO_SLUG}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeResponse = await this.http.getJson<GitHubTreeResponse>(treeUrl, headers);
    const tree = treeResponse.data.tree ?? [];

    const skillEntries = tree
      .filter((entry) => entry.type === "blob" && /^skills\/[^/]+\/SKILL\.md$/.test(entry.path))
      .slice(0, Math.max(1, Math.min(limit, 120)));

    const candidates: SkillCandidate[] = [];
    for (const entry of skillEntries) {
      const slug = entry.path.split("/")[1];
      const rawUrl = `${GITHUB_RAW_BASE_URL}/${ANTHROPIC_REPO_SLUG}/${encodeURIComponent(branch)}/${entry.path}`;

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
          url: `https://github.com/${ANTHROPIC_REPO_SLUG}/tree/${branch}/skills/${slug}`,
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
      mode: "github",
      candidates,
      warnings
    };
  }

  private async fetchFilesViaGitHub(skillId: string): Promise<SkillFetchedBundle> {
    const headers = this.githubHeaders();
    const repo = (await this.http.getJson<GitHubRepo>(`${this.runtime.github.apiBaseUrl}/repos/${ANTHROPIC_REPO_SLUG}`, headers)).data;
    const branch = repo.default_branch || "main";

    const treeUrl = `${this.runtime.github.apiBaseUrl}/repos/${ANTHROPIC_REPO_SLUG}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeResponse = await this.http.getJson<GitHubTreeResponse>(treeUrl, headers);
    const tree = treeResponse.data.tree ?? [];

    const normalizedSkillId = skillId.replace(/^anthropic[/:]/, "");
    const skillPath = `skills/${normalizedSkillId}/SKILL.md`;
    const skillEntry = tree.find((entry) => entry.path === skillPath);
    if (!skillEntry) {
      throw new Error(`Anthropic skill not found in the public repository: ${skillId}`);
    }

    const skillFolder = `skills/${normalizedSkillId}/`;
    const folderEntries = tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(skillFolder));

    const files: Record<string, string> = {};
    for (const entry of folderEntries) {
      const relative = entry.path.slice(skillFolder.length);
      const rawUrl = `${GITHUB_RAW_BASE_URL}/${ANTHROPIC_REPO_SLUG}/${encodeURIComponent(branch)}/${entry.path}`;
      const content = (await this.http.getText(rawUrl)).data;
      files[relative] = content;
    }

    if (!files["SKILL.md"]) {
      throw new Error(`Anthropic skill is missing SKILL.md in the public repository: ${skillId}`);
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
        url: `https://github.com/${ANTHROPIC_REPO_SLUG}/tree/${branch}/${skillFolder}`,
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

  private githubHeaders(): Record<string, string> {
    if (!this.runtime.github.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.runtime.github.token}`
    };
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
