import { extractZipBundle } from "./bundle.js";
import { ProviderHttpClient, ProviderHttpError } from "./http.js";
import { buildCandidate, describeFiles, inferMetadataFromFiles, toCanonicalSkillId } from "./normalize.js";
import { resolveProviderRuntimeConfig } from "./runtime.js";
import type {
  ProviderSearchQuery,
  SkillCandidate,
  SkillFetchedBundle,
  SkillProvider,
  SkillProviderResult,
  SkillRef
} from "../types/index.js";

interface ClawHubListItem {
  slug: string;
  displayName?: string;
  summary?: string | null;
  stats?: {
    downloads?: number;
    installsAllTime?: number;
    stars?: number;
    versions?: number;
  };
  latestVersion?: {
    version?: string;
    createdAt?: number;
    changelog?: string;
    license?: string | null;
  };
  updatedAt?: number;
  createdAt?: number;
  tags?: Record<string, string>;
  owner?: { handle?: string; displayName?: string | null } | null;
  ownerHandle?: string | null;
}

interface ClawHubSkillDetailResponse {
  skill?: ClawHubListItem;
  latestVersion?: {
    version?: string;
    createdAt?: number;
    changelog?: string;
    license?: string | null;
  };
  owner?: { handle?: string; displayName?: string | null } | null;
  moderation?: {
    isSuspicious?: boolean;
    isMalwareBlocked?: boolean;
    verdict?: string;
    reasonCodes?: string[];
  } | null;
}

interface ClawHubSearchResponse {
  results?: ClawHubListItem[];
}

interface ClawHubListResponse {
  items?: ClawHubListItem[];
  nextCursor?: string;
}

interface ClawHubScanResponse {
  security?: {
    status?: string;
    hasWarnings?: boolean;
    capabilityTags?: string[];
    hasScanResult?: boolean;
  };
  moderation?: {
    isSuspicious?: boolean;
    isMalwareBlocked?: boolean;
    verdict?: string;
  } | null;
}

export class ClawHubProvider implements SkillProvider {
  readonly id = "clawhub";
  readonly displayName = "ClawHub";
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
    const mode = this.runtime.clawhub.token ? "token" : "public";
    const limit = Math.max(1, Math.min(query.limit ?? 80, 200));
    const authHeaders = this.authHeaders();

    const listUrl = `${this.runtime.clawhub.baseUrl}/api/v1/skills?limit=${limit}&nonSuspiciousOnly=true`;

    let listItems: ClawHubListItem[] = [];
    let nextCursor: string | undefined;
    try {
      const response = await this.http.getJson<ClawHubListResponse>(listUrl, authHeaders);
      listItems = response.data.items ?? [];
      nextCursor = response.data.nextCursor;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`ClawHub list failed: ${message}`);
      return {
        providerId: this.id,
        fetchedAtIso: new Date().toISOString(),
        mode,
        candidates: [],
        warnings
      };
    }

    const queryTerm = inferQueryTerm(query);
    let searchItems: ClawHubListItem[] = [];
    if (queryTerm) {
      try {
        const searchUrl = `${this.runtime.clawhub.baseUrl}/api/v1/search?q=${encodeURIComponent(queryTerm)}&limit=${Math.min(limit, 20)}&nonSuspiciousOnly=true`;
        const searchResponse = await this.http.getJson<ClawHubSearchResponse>(searchUrl, authHeaders);
        searchItems = searchResponse.data.results ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`ClawHub search failed for "${queryTerm}": ${message}`);
      }
    }

    const merged = dedupeBySlug([...searchItems, ...listItems]);
    const limited = merged.slice(0, limit);

    const details = await Promise.all(
      limited.map(async (item) => {
        try {
          return await this.fetchSkillDetail(item.slug);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`ClawHub detail failed for ${item.slug}: ${message}`);
          return null;
        }
      })
    );

    const candidates: SkillCandidate[] = details
      .filter((detail): detail is ClawHubSkillDetailResponse => detail !== null)
      .map((detail) => this.toCandidate(detail))
      .filter((candidate) => candidate.canonicalSkillId.length > 0);

    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      mode,
      candidates,
      nextCursor,
      warnings
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const slug = extractSlug(ref.skillId);
    const detail = await this.fetchSkillDetail(slug);
    const latestVersion = detail.latestVersion?.version;
    const version = ref.version ?? latestVersion;
    const candidate = this.toCandidate(detail);

    const authHeaders = this.authHeaders();
    const query = new URLSearchParams({ slug });
    if (version) query.set("version", version);

    const downloadUrl = `${this.runtime.clawhub.baseUrl}/api/v1/download?${query.toString()}`;

    let files: Record<string, string> = {};
    let hadBinary = false;

    try {
      const zipResponse = await this.http.getBytes(downloadUrl, {
        ...authHeaders,
        Accept: "application/zip"
      });
      const extracted = await extractZipBundle(zipResponse.data);
      files = extracted.textFiles;
      hadBinary = extracted.binaryPaths.length > 0;
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) {
        throw error;
      }

      // Fallback for environments where download may be blocked.
      const fileQuery = new URLSearchParams({ slug, path: "SKILL.md" });
      if (version) fileQuery.set("version", version);
      const fileUrl = `${this.runtime.clawhub.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}/file?path=SKILL.md${version ? `&version=${encodeURIComponent(version)}` : ""}`;
      const fallbackFile = await this.http.getText(fileUrl, {
        ...authHeaders,
        Accept: "text/plain"
      });
      files = { "SKILL.md": fallbackFile.data };
    }

    if (!files["SKILL.md"]) {
      throw new Error(`ClawHub skill ${slug} did not include SKILL.md`);
    }

    const descriptors = describeFiles(files);
    candidate.files = descriptors;
    candidate.metadata = inferMetadataFromFiles(candidate, files);
    if (hadBinary) {
      candidate.metadata.hasBinaries = true;
    }

    if (version) {
      candidate.source.version = version;
      candidate.source.ref = `${slug}@${version}`;
      candidate.metadata.pinnedRef = version;
    }

    return {
      skill: candidate,
      files
    };
  }

  private async fetchSkillDetail(slug: string): Promise<ClawHubSkillDetailResponse> {
    const authHeaders = this.authHeaders();

    const detailUrl = `${this.runtime.clawhub.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`;
    const detail = (await this.http.getJson<ClawHubSkillDetailResponse>(detailUrl, authHeaders)).data;

    const latestVersion = detail.latestVersion?.version;
    let scan: ClawHubScanResponse | null = null;

    if (latestVersion) {
      try {
        const scanUrl = `${this.runtime.clawhub.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}/scan?version=${encodeURIComponent(latestVersion)}`;
        scan = (await this.http.getJson<ClawHubScanResponse>(scanUrl, authHeaders)).data;
      } catch {
        // Optional enrichment only.
      }
    }

    if (scan?.moderation && !detail.moderation) {
      detail.moderation = scan.moderation;
    }

    if (scan?.security?.status === "warning" && detail.skill) {
      detail.skill.summary = detail.skill.summary ?? "";
    }

    return detail;
  }

  private toCandidate(detail: ClawHubSkillDetailResponse): SkillCandidate {
    const skill = detail.skill;
    if (!skill || !skill.slug) {
      throw new Error("ClawHub detail response missing skill payload");
    }

    const slug = skill.slug;
    const canonicalSkillId = toCanonicalSkillId(slug);
    const ownerHandle = detail.owner?.handle ?? skill.ownerHandle ?? undefined;
    const publisher = ownerHandle || "clawhub-community";
    const version = detail.latestVersion?.version;

    const tags = Object.keys(skill.tags ?? {}).filter((tag) => tag !== "latest");
    const summary = skill.summary?.trim() || `Skill from ClawHub: ${skill.displayName ?? slug}`;

    const trustLevel = detail.moderation?.isMalwareBlocked
      ? "unknown"
      : detail.moderation?.isSuspicious
        ? "unknown"
        : "trusted";

    const popularity = (skill.stats?.downloads ?? 0) + (skill.stats?.stars ?? 0) * 20;

    const candidate = buildCandidate({
      providerId: this.id,
      providerSkillId: slug,
      canonicalSkillId,
      name: skill.displayName || slug,
      summary,
      tags,
      source: {
        url: ownerHandle
          ? `${this.runtime.clawhub.baseUrl}/${ownerHandle}/${slug}`
          : `${this.runtime.clawhub.baseUrl}/skills/${slug}`,
        version,
        ref: version ? `${slug}@${version}` : slug,
        publisher
      },
      compatibility: {
        assistants: ["claude", "cursor", "codex", "copilot", "generic"]
      },
      metadata: {
        publisher,
        description: summary,
        popularity,
        license: detail.latestVersion?.license ?? undefined,
        lastUpdatedIso: toIso(skill.updatedAt ?? detail.latestVersion?.createdAt),
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        trustLevel,
        pinnedRef: version || undefined
      }
    });

    return candidate;
  }

  private authHeaders(): Record<string, string> {
    if (!this.runtime.clawhub.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.runtime.clawhub.token}`
    };
  }
}

function dedupeBySlug(items: ClawHubListItem[]): ClawHubListItem[] {
  const map = new Map<string, ClawHubListItem>();
  for (const item of items) {
    if (!item.slug) continue;
    if (!map.has(item.slug)) {
      map.set(item.slug, item);
    }
  }
  return [...map.values()];
}

function inferQueryTerm(query: ProviderSearchQuery): string | null {
  const firstFramework = query.repoFacts.frameworks[0]?.id;
  if (firstFramework) return firstFramework;
  const firstLanguage = query.repoFacts.languages[0];
  if (firstLanguage) return firstLanguage;
  return null;
}

function toIso(value?: number): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

function extractSlug(skillId: string): string {
  const normalized = skillId.trim();
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex >= 0) {
    return normalized.slice(slashIndex + 1);
  }
  const scopedIndex = normalized.lastIndexOf(":");
  if (scopedIndex >= 0) {
    return normalized.slice(scopedIndex + 1);
  }
  return normalized;
}
