import path from "node:path";
import { ProviderHttpClient } from "./http.js";
import { buildCandidate, describeFiles, inferMetadataFromFiles, parseFrontmatter, toCanonicalSkillId } from "./normalize.js";
import { resolveProviderRuntimeConfig } from "./runtime.js";
import { filterCandidatesForSearchTerm } from "../search/rank.js";
import type {
  AssistantId,
  ProviderSearchQuery,
  SkillCandidate,
  SkillFetchedBundle,
  SkillProvider,
  SkillProviderResult,
  SkillRef
} from "../types/index.js";

const AWESOME_REPO_OWNER = "VoltAgent";
const AWESOME_REPO_NAME = "awesome-agent-skills";
const AWESOME_REPO_SLUG = `${AWESOME_REPO_OWNER}/${AWESOME_REPO_NAME}`;
const AWESOME_README_PATH = "README.md";
const GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com";
const SUPPORTED_ASSISTANTS: AssistantId[] = [
  "claude",
  "cursor",
  "copilot",
  "codex",
  "gemini",
  "windsurf",
  "cline",
  "roo",
  "continue",
  "kiro",
  "agents-md",
  "generic"
];

const ENTRY_PATTERN =
  /^\s*-\s+\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*\s+-\s+(.+?)\s*$/gm;

const SKIPPED_BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".bin"
]);

interface GitHubRepo {
  default_branch: string;
  stargazers_count?: number;
  pushed_at?: string;
  license?: {
    spdx_id?: string | null;
    name?: string | null;
  } | null;
}

interface GitHubTreeResponse {
  tree?: Array<{
    path: string;
    type: string;
    sha: string;
  }>;
}

interface AwesomeSkillEntry {
  providerSkillId: string;
  label: string;
  namespace: string;
  skillName: string;
  url: string;
  description: string;
  sectionTitle?: string;
  trustLevel: "official" | "trusted" | "unknown";
}

interface AwesomeIndexData {
  repo: GitHubRepo;
  branch: string;
  readmeRef: string;
  entries: AwesomeSkillEntry[];
}

interface ResolvedGitHubSkillSource {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  sourceUrl: string;
}

interface FetchedGitHubFolder {
  repo: GitHubRepo;
  branch: string;
  sourceUrl: string;
  skillEntrySha: string;
  files: Record<string, string>;
  hasBinaryPaths: boolean;
}

export class AwesomeAgentSkillsProvider implements SkillProvider {
  readonly id = "awesome";
  readonly displayName = "Awesome Agent Skills";
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
    const limit = query.limit ?? 80;
    const searchMode = query.mode === "search";
    const term = searchMode ? query.term?.trim() : undefined;

    let index: AwesomeIndexData;
    try {
      index = await this.loadAwesomeIndex();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        providerId: this.id,
        fetchedAtIso: new Date().toISOString(),
        mode: "awesome-index",
        candidates: [],
        warnings: [`Awesome Agent Skills index failed: ${message}`]
      };
    }

    if (index.entries.length === 0) {
      return {
        providerId: this.id,
        fetchedAtIso: new Date().toISOString(),
        mode: "awesome-index",
        candidates: [],
        warnings: ["Awesome Agent Skills index did not contain parseable skill entries."]
      };
    }

    const allCandidates = index.entries.map((entry) => this.buildIndexCandidate(entry, index));
    const candidates = searchMode && term
      ? filterCandidatesForSearchTerm(allCandidates, term, limit)
      : allCandidates.slice(0, Math.max(0, limit));

    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      mode: "awesome-index",
      candidates,
      warnings: []
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const index = await this.loadAwesomeIndex();
    const requestedId = ref.skillId.trim().toLowerCase();
    const entry = index.entries.find((candidate) => candidate.providerSkillId === requestedId);

    if (!entry) {
      throw new Error(`Awesome Agent Skills entry not found: ${ref.skillId}`);
    }

    const source = await this.resolveEntryToGitHubSource(entry);
    const fetched = await this.fetchGitHubFolder(entry, source);
    const skillMarkdown = fetched.files["SKILL.md"];
    if (!skillMarkdown) {
      throw new Error(`Awesome Agent Skills entry "${entry.providerSkillId}" resolved to GitHub, but no SKILL.md was found.`);
    }

    const frontmatter = parseFrontmatter(skillMarkdown);
    const summary = frontmatter.description || entry.description || firstNonEmptyParagraph(skillMarkdown) || entry.label;
    const license = normalizeLicense(frontmatter.license) || normalizeLicense(fetched.repo.license?.spdx_id) || normalizeLicense(fetched.repo.license?.name);
    const pinnedRef = `${fetched.branch}:${fetched.skillEntrySha}`;

    const candidate = buildCandidate({
      providerId: this.id,
      providerSkillId: entry.providerSkillId,
      canonicalSkillId: toCanonicalSkillId(entry.skillName),
      name: frontmatter.name || entry.label,
      summary,
      tags: buildEntryTags(entry),
      source: {
        url: fetched.sourceUrl,
        version: fetched.branch,
        ref: pinnedRef,
        publisher: entry.namespace
      },
      compatibility: {
        assistants: SUPPORTED_ASSISTANTS
      },
      metadata: {
        publisher: entry.namespace,
        description: summary,
        popularity: fetched.repo.stargazers_count,
        license,
        lastUpdatedIso: fetched.repo.pushed_at,
        trustLevel: entry.trustLevel,
        hasScripts: false,
        hasBinaries: fetched.hasBinaryPaths,
        hasPackageManifests: false,
        pinnedRef
      }
    });

    candidate.files = describeFiles(fetched.files);
    const inferred = inferMetadataFromFiles(candidate, fetched.files);
    inferred.hasBinaries = inferred.hasBinaries || fetched.hasBinaryPaths;
    candidate.metadata = inferred;

    return {
      skill: candidate,
      files: fetched.files
    };
  }

  private async loadAwesomeIndex(): Promise<AwesomeIndexData> {
    const headers = this.githubHeaders();
    const repoUrl = `${this.runtime.github.apiBaseUrl}/repos/${AWESOME_REPO_SLUG}`;
    const repo = (await this.http.getJson<GitHubRepo>(repoUrl, headers)).data;
    const branch = repo.default_branch || "main";
    const readmeUrl = `${GITHUB_RAW_BASE_URL}/${AWESOME_REPO_SLUG}/${branch}/${AWESOME_README_PATH}`;
    const markdown = (await this.http.getText(readmeUrl)).data;
    const readmeRef = `${branch}:${repo.pushed_at ?? branch}`;

    return {
      repo,
      branch,
      readmeRef,
      entries: parseAwesomeEntries(markdown)
    };
  }

  private buildIndexCandidate(entry: AwesomeSkillEntry, index: AwesomeIndexData): SkillCandidate {
    return buildCandidate({
      providerId: this.id,
      providerSkillId: entry.providerSkillId,
      canonicalSkillId: toCanonicalSkillId(entry.skillName),
      name: entry.label,
      summary: entry.description,
      tags: buildEntryTags(entry),
      source: {
        url: entry.url,
        version: index.branch,
        ref: index.readmeRef,
        publisher: entry.namespace
      },
      compatibility: {
        assistants: SUPPORTED_ASSISTANTS
      },
      metadata: {
        publisher: entry.namespace,
        description: entry.description,
        popularity: index.repo.stargazers_count,
        lastUpdatedIso: index.repo.pushed_at,
        trustLevel: entry.trustLevel,
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        pinnedRef: index.readmeRef
      }
    });
  }

  private async resolveEntryToGitHubSource(entry: AwesomeSkillEntry): Promise<ResolvedGitHubSkillSource> {
    const directGitHub = parseGitHubSourceUrl(entry.url);
    if (directGitHub) {
      return directGitHub;
    }

    const url = safeParseUrl(entry.url);
    if (!url || url.hostname !== "officialskills.sh") {
      throw unsupportedSourceError(entry.providerSkillId);
    }

    const page = (await this.http.getText(entry.url)).data;
    const treeUrlMatch = page.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tree\/[^\s"'<>]+/);
    if (treeUrlMatch) {
      const resolved = parseGitHubSourceUrl(treeUrlMatch[0]);
      if (resolved) {
        return resolved;
      }
    }

    const installCommandMatch = page.match(
      /npx\s+skills\s+add\s+(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+--skill\s+([A-Za-z0-9._-]+)/
    );
    if (installCommandMatch) {
      const repoUrl = installCommandMatch[1];
      const skillName = installCommandMatch[2];
      const resolvedRepo = parseGitHubSourceUrl(repoUrl);
      if (resolvedRepo) {
        return {
          ...resolvedRepo,
          path: normalizeFolderPath(`skills/${skillName}`)
        };
      }
    }

    throw unsupportedSourceError(entry.providerSkillId);
  }

  private async fetchGitHubFolder(
    entry: AwesomeSkillEntry,
    source: ResolvedGitHubSkillSource
  ): Promise<FetchedGitHubFolder> {
    const headers = this.githubHeaders();
    const repoUrl = `${this.runtime.github.apiBaseUrl}/repos/${source.owner}/${source.repo}`;
    const repo = (await this.http.getJson<GitHubRepo>(repoUrl, headers)).data;
    const branch = source.branch || repo.default_branch || "main";

    const treeUrl = `${this.runtime.github.apiBaseUrl}/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const tree = (await this.http.getJson<GitHubTreeResponse>(treeUrl, headers)).data.tree ?? [];
    const folder = resolveSkillFolder(tree, source.path, entry.skillName);

    if (folder === null) {
      throw new Error(`Awesome Agent Skills entry "${entry.providerSkillId}" resolved to GitHub, but no SKILL.md was found.`);
    }

    const skillEntryPath = folder ? `${folder}/SKILL.md` : "SKILL.md";
    const skillEntry = tree.find((treeEntry) => treeEntry.type === "blob" && treeEntry.path === skillEntryPath);
    if (!skillEntry) {
      throw new Error(`Awesome Agent Skills entry "${entry.providerSkillId}" resolved to GitHub, but no SKILL.md was found.`);
    }

    const files: Record<string, string> = {};
    let hasBinaryPaths = false;

    for (const treeEntry of tree) {
      if (treeEntry.type !== "blob") continue;
      if (!isPathWithinFolder(treeEntry.path, folder)) continue;

      const relativePath = folder ? treeEntry.path.slice(folder.length + 1) : treeEntry.path;
      if (shouldSkipBinaryFile(relativePath)) {
        hasBinaryPaths = true;
        continue;
      }

      const rawUrl = `${GITHUB_RAW_BASE_URL}/${source.owner}/${source.repo}/${branch}/${treeEntry.path}`;
      const content = (await this.http.getText(rawUrl)).data;
      files[relativePath] = content;
    }

    return {
      repo,
      branch,
      sourceUrl: buildGitHubSourceUrl(source.owner, source.repo, branch, folder),
      skillEntrySha: skillEntry.sha,
      files,
      hasBinaryPaths
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

function parseAwesomeEntries(markdown: string): AwesomeSkillEntry[] {
  const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)]
    .map((match) => ({
      index: match.index ?? 0,
      title: match[2].trim()
    }))
    .sort((left, right) => left.index - right.index);

  const entries: AwesomeSkillEntry[] = [];
  const seen = new Set<string>();
  let headingIndex = 0;

  for (const match of markdown.matchAll(ENTRY_PATTERN)) {
    const label = match[1]?.trim();
    const url = match[2]?.trim();
    const description = match[3]?.trim();
    const entryIndex = match.index ?? 0;

    while (headingIndex + 1 < headings.length && headings[headingIndex + 1].index <= entryIndex) {
      headingIndex += 1;
    }

    if (!label || !url || !description || !url.startsWith("https://") || !label.includes("/")) {
      continue;
    }

    const providerSkillId = label.toLowerCase().trim();
    if (seen.has(providerSkillId)) {
      continue;
    }

    const parts = label.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }

    const sectionTitle = headings[headingIndex] && headings[headingIndex].index <= entryIndex
      ? headings[headingIndex].title
      : undefined;
    entries.push({
      providerSkillId,
      label,
      namespace: parts[0],
      skillName: parts[parts.length - 1],
      url,
      description,
      sectionTitle,
      trustLevel: determineTrustLevel(sectionTitle)
    });
    seen.add(providerSkillId);
  }

  return entries;
}

function determineTrustLevel(sectionTitle: string | undefined): "official" | "trusted" | "unknown" {
  if (!sectionTitle) return "trusted";
  if (/community/i.test(sectionTitle)) return "unknown";
  if (/^(skills by|skill by|official)/i.test(sectionTitle) || /team/i.test(sectionTitle)) return "official";
  return "trusted";
}

function buildEntryTags(entry: AwesomeSkillEntry): string[] {
  return dedupe([
    entry.namespace,
    entry.skillName,
    ...tokenizeTagText(entry.description),
    ...tokenizeTagText(entry.sectionTitle)
  ]);
}

function tokenizeTagText(text: string | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9.+#/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseGitHubSourceUrl(rawUrl: string): ResolvedGitHubSkillSource | null {
  const url = safeParseUrl(rawUrl);
  if (!url) return null;

  if (url.hostname === "github.com") {
    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1];
    if (segments.length === 2) {
      return { owner, repo, sourceUrl: `https://github.com/${owner}/${repo}` };
    }

    const kind = segments[2];
    if ((kind === "tree" || kind === "blob") && segments.length >= 4) {
      const branch = decodeURIComponent(segments[3]);
      const fullPath = segments.slice(4).join("/");
      const resolvedPath = kind === "blob" ? stripSkillFilename(fullPath) : normalizeFolderPath(fullPath);
      return {
        owner,
        repo,
        branch,
        path: resolvedPath,
        sourceUrl: rawUrl
      };
    }

    return { owner, repo, sourceUrl: `https://github.com/${owner}/${repo}` };
  }

  if (url.hostname === "raw.githubusercontent.com") {
    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segments.length < 4) return null;

    const owner = segments[0];
    const repo = segments[1];
    const branch = decodeURIComponent(segments[2]);
    const fullPath = segments.slice(3).join("/");
    const resolvedPath = fullPath.endsWith("SKILL.md") ? stripSkillFilename(fullPath) : normalizeFolderPath(fullPath);
    return {
      owner,
      repo,
      branch,
      path: resolvedPath,
      sourceUrl: buildGitHubSourceUrl(owner, repo, branch, resolvedPath)
    };
  }

  return null;
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function stripSkillFilename(filePath: string): string {
  const normalized = normalizeFolderPath(filePath);
  if (normalized.endsWith("/SKILL.md")) {
    return normalized.slice(0, -"/SKILL.md".length);
  }
  const dirname = path.posix.dirname(normalized);
  return dirname === "." ? "" : normalizeFolderPath(dirname);
}

function normalizeFolderPath(value: string | undefined): string {
  return (value ?? "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
}

function resolveSkillFolder(
  tree: Array<{ path: string; type: string; sha: string }>,
  resolvedPath: string | undefined,
  skillName: string
): string | null {
  const rawCandidates = resolvedPath
    ? [normalizeFolderPath(resolvedPath)]
    : [normalizeFolderPath(`skills/${skillName}`), normalizeFolderPath(skillName), ""];
  const candidates = [...new Set(rawCandidates)];

  for (const candidate of candidates) {
    const skillPath = candidate ? `${candidate}/SKILL.md` : "SKILL.md";
    if (tree.some((entry) => entry.type === "blob" && entry.path === skillPath)) {
      return candidate;
    }
  }

  return null;
}

function isPathWithinFolder(filePath: string, folder: string): boolean {
  if (!folder) return true;
  return filePath === folder || filePath.startsWith(`${folder}/`);
}

function shouldSkipBinaryFile(filePath: string): boolean {
  return SKIPPED_BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function buildGitHubSourceUrl(owner: string, repo: string, branch: string, folder: string): string {
  if (!folder) {
    return `https://github.com/${owner}/${repo}`;
  }
  return `https://github.com/${owner}/${repo}/tree/${branch}/${folder}`;
}

function normalizeLicense(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toUpperCase() === "NOASSERTION") {
    return undefined;
  }
  return trimmed;
}

function unsupportedSourceError(providerSkillId: string): Error {
  return new Error(`Awesome Agent Skills entry "${providerSkillId}" does not expose a supported public GitHub skill source.`);
}

function firstNonEmptyParagraph(markdown: string): string | null {
  const body = markdown
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith("#"));
  return body ?? null;
}
