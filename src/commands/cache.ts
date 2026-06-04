import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { RepoFacts, RepoNeed, SkillRecommendation } from "../types/index.js";
import type { RecommendationQueryPlan } from "../recommend/queryPlan.js";
import { buildLegacyFitSummary } from "../recommend/explain.js";
import { ensureNaarRuntimeGitignore } from "../utils/gitignore.js";
import { SCAN_SCHEMA_VERSION } from "../scanner/scanRepo.js";

const CACHE_DIR = path.join(".naar", "cache");
const SCAN_FILE = "scan.json";
const RECOMMEND_FILE = "recommendations.json";

export interface RecommendationCache {
  repoFacts: RepoFacts;
  repoNeeds?: RepoNeed[];
  recommendations: SkillRecommendation[];
  providerSummaries?: Array<{
    providerId: string;
    mode?: string;
    candidateCount: number;
    warnings?: string[];
    queryCount?: number;
    queries?: string[];
    dedupedCandidateCount?: number;
  }>;
  queryPlan?: RecommendationQueryPlan;
  generatedAtIso: string;
}

export async function saveScanCache(repoRoot: string, facts: RepoFacts): Promise<void> {
  await ensureNaarRuntimeGitignore(repoRoot);
  const dir = path.join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, SCAN_FILE), JSON.stringify(facts, null, 2) + "\n", "utf8");
}

export async function loadScanCache(repoRoot: string): Promise<RepoFacts | null> {
  try {
    const raw = await readFile(path.join(repoRoot, CACHE_DIR, SCAN_FILE), "utf8");
    const parsed = JSON.parse(raw) as RepoFacts;
    if ((parsed.scanSchemaVersion ?? 0) !== SCAN_SCHEMA_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRecommendationCache(repoRoot: string, cache: RecommendationCache): Promise<void> {
  await ensureNaarRuntimeGitignore(repoRoot);
  const dir = path.join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, RECOMMEND_FILE), JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export async function loadRecommendationCache(repoRoot: string): Promise<RecommendationCache | null> {
  try {
    const raw = await readFile(path.join(repoRoot, CACHE_DIR, RECOMMEND_FILE), "utf8");
    const parsed = JSON.parse(raw) as RecommendationCache;
    if ((parsed.repoFacts.scanSchemaVersion ?? 0) !== SCAN_SCHEMA_VERSION) {
      return null;
    }
    parsed.recommendations = parsed.recommendations.map((recommendation) => ({
      ...recommendation,
      status: recommendation.status ?? (recommendation.blocked ? "blocked" : "eligible"),
      overrideable: recommendation.overrideable ?? false,
      hardBlocked: recommendation.hardBlocked ?? false,
      rawScore: recommendation.rawScore ?? recommendation.score,
      relevanceRaw: recommendation.relevanceRaw ?? recommendation.score,
      qualityRaw: recommendation.qualityRaw ?? 0,
      dimensionScores: recommendation.dimensionScores ?? {
        relevance: recommendation.relevanceRaw ?? recommendation.score ?? 0,
        specificity: 0,
        compatibility: 0,
        quality: recommendation.qualityRaw ?? 0,
        safety: recommendation.candidate?.risk?.score ?? 0,
        final: recommendation.score ?? 0
      },
      blockers: recommendation.blockers ?? [],
      fitSummary: recommendation.fitSummary ?? buildLegacyFitSummary(recommendation),
      matchedNeeds: recommendation.matchedNeeds ?? [],
      matchedNeedDetails: recommendation.matchedNeedDetails ?? [],
      matchedFacts: recommendation.matchedFacts ?? [],
      eligibilityReasons: recommendation.eligibilityReasons ?? [],
      penalties: recommendation.penalties ?? [],
      capsApplied: recommendation.capsApplied ?? [],
      skillCategories: recommendation.skillCategories ?? [],
      domainSignals: recommendation.domainSignals ?? [],
      scoreBreakdown: recommendation.scoreBreakdown ?? []
    }));
    parsed.repoNeeds = parsed.repoNeeds ?? [];
    parsed.providerSummaries = (parsed.providerSummaries ?? []).map((summary) => ({
      ...summary,
      queryCount: summary.queryCount ?? 0,
      queries: summary.queries ?? [],
      dedupedCandidateCount: summary.dedupedCandidateCount ?? summary.candidateCount
    }));
    return parsed;
  } catch {
    return null;
  }
}
