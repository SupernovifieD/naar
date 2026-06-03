import { loadConfig } from "../config/store.js";
import { buildProviders } from "../providers/orchestrator.js";
import { deriveRepoNeeds } from "../recommend/needs.js";
import { buildRecommendationQueryPlan, type RecommendationQueryPlan } from "../recommend/queryPlan.js";
import { recommendSkills } from "../recommend/recommend.js";
import { retrieveRecommendationCandidates } from "../recommend/retrieval.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { loadInstalledState, toProviderScopedId } from "../installer/state.js";
import type {
  AssistantId,
  CliFlags,
  InstallTarget,
  RepoFacts,
  RepoNeed,
  SkillCandidate,
  SkillRecommendation,
  SkillProviderResult
} from "../types/index.js";
import { loadRecommendationCache, loadScanCache, saveRecommendationCache, saveScanCache } from "./cache.js";
import { dedupeAssistants, getAllTargetAssistantIds, getTargetAssistantIds } from "../targets/index.js";

export interface PipelineResult {
  repoFacts: RepoFacts;
  repoNeeds: RepoNeed[];
  recommendations: SkillRecommendation[];
  providerWarnings: string[];
  providerSummaries: ProviderSummary[];
  queryPlan?: RecommendationQueryPlan;
  retrievalWarnings?: string[];
}

export interface ProviderSummary {
  providerId: string;
  mode?: string;
  candidateCount: number;
  warnings?: string[];
  queryCount?: number;
  queries?: string[];
  dedupedCandidateCount?: number;
}

export type PipelinePhase =
  | "scan:start"
  | "scan:done"
  | "providers:start"
  | "providers:done"
  | "rank:start"
  | "rank:done";

export interface PipelinePhaseEvent {
  phase: PipelinePhase;
  repoFacts?: RepoFacts;
  providerIds?: string[];
  providerResults?: SkillProviderResult[];
  providerSummaries?: ProviderSummary[];
  queryPlan?: RecommendationQueryPlan;
  result?: PipelineResult;
}

export interface PipelineBuildHooks {
  onPhase?: (event: PipelinePhaseEvent) => void | Promise<void>;
}

export async function ensureScan(repoRoot: string, useCache = true): Promise<RepoFacts> {
  if (useCache) {
    const cached = await loadScanCache(repoRoot);
    if (cached) return cached;
  }

  const facts = await scanRepo(repoRoot);
  await saveScanCache(repoRoot, facts);
  return facts;
}

export async function buildRecommendations(
  repoRoot: string,
  flags: CliFlags,
  hooks: PipelineBuildHooks = {}
): Promise<PipelineResult> {
  const config = await loadConfig(repoRoot);
  await hooks.onPhase?.({ phase: "scan:start" });
  const repoFacts = await ensureScan(repoRoot, true);
  await hooks.onPhase?.({ phase: "scan:done", repoFacts });
  const installedIds = await getInstalledSkillIds(repoRoot);

  const providerIds = flags.provider.length > 0 ? flags.provider : config.defaultProviders;
  await hooks.onPhase?.({ phase: "providers:start", providerIds });
  const providers = buildProviders(providerIds);
  const repoNeeds = deriveRepoNeeds(repoFacts);
  const queryPlan = buildRecommendationQueryPlan(repoFacts, repoNeeds);
  const selectedTargets = flags.target.length > 0 ? flags.target : config.defaultTargets;
  const retrieval = await retrieveRecommendationCandidates(providers, repoFacts, repoNeeds, queryPlan, {
    targets: selectedTargets,
    baseLimit: 200,
    queryLimit: 40,
    maxProviderQueries: 12
  });
  const providerSummaries = summarizeRecommendationProviders(
    providerIds,
    retrieval.providerResults,
    queryPlan.providerQueries
  );
  await hooks.onPhase?.({
    phase: "providers:done",
    providerIds,
    providerResults: retrieval.providerResults,
    providerSummaries,
    queryPlan
  });

  const candidates: SkillCandidate[] = retrieval.candidates
    .filter((candidate) => {
      const candidateScopedId = candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
      return !installedIds.has(candidateScopedId);
    });

  const eligibility = resolveEligibleAssistants(flags, config.defaultTargets, repoFacts);

  await hooks.onPhase?.({ phase: "rank:start" });
  const recommendationResult = recommendSkills(repoFacts, candidates, {
    minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
    noScripts: flags.noScripts,
    allowRisky: flags.allowRisky,
    eligibleAssistants: eligibility.assistants,
    eligibilitySource: eligibility.source,
    allCompatible: flags.allCompatible,
    maxResults: 10,
    precomputedRepoNeeds: repoNeeds
  });

  const filteredRecommendations = filterInstalledRecommendations(recommendationResult.recommendations, installedIds);
  const warnings = retrieval.warnings;

  const pipelineResult: PipelineResult = {
    repoFacts,
    repoNeeds: recommendationResult.repoNeeds,
    recommendations: filteredRecommendations,
    providerWarnings: warnings,
    providerSummaries,
    queryPlan,
    retrievalWarnings: warnings
  };

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    repoNeeds: recommendationResult.repoNeeds,
    recommendations: filteredRecommendations,
    providerSummaries,
    queryPlan,
    generatedAtIso: new Date().toISOString()
  });

  await hooks.onPhase?.({ phase: "rank:done", result: pipelineResult });
  return pipelineResult;
}

export async function loadOrBuildRecommendations(repoRoot: string, flags: CliFlags): Promise<PipelineResult> {
  const cached = await loadRecommendationCache(repoRoot);
  if (!cached) {
    return buildRecommendations(repoRoot, flags);
  }

  const installedIds = await getInstalledSkillIds(repoRoot);
  return {
    repoFacts: cached.repoFacts,
    repoNeeds: cached.repoNeeds ?? [],
    recommendations: filterInstalledRecommendations(cached.recommendations, installedIds),
    providerWarnings: [],
    providerSummaries: cached.providerSummaries ?? [],
    queryPlan: cached.queryPlan
  };
}

async function getInstalledSkillIds(repoRoot: string): Promise<Set<string>> {
  const state = await loadInstalledState(repoRoot);
  return new Set(
    state.skills.map((skill) => skill.providerScopedId ?? toProviderScopedId(skill.providerId, skill.providerSkillId))
  );
}

function filterInstalledRecommendations(
  recommendations: SkillRecommendation[],
  installedIds: Set<string>
): SkillRecommendation[] {
  return recommendations.filter((recommendation) => {
    const candidate = recommendation.candidate;
    const scopedId = candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
    return !installedIds.has(scopedId);
  });
}

function resolveEligibleAssistants(
  flags: CliFlags,
  defaultTargets: InstallTarget[],
  repoFacts: RepoFacts
): { assistants: AssistantId[]; source: "explicit-targets" | "config-default-targets" | "detected-assistants" | "fallback-all" } {
  if (flags.target.length > 0) {
    return {
      assistants: dedupeAssistants(flags.target.flatMap(getTargetAssistantIds)),
      source: "explicit-targets"
    };
  }

  if (defaultTargets.length > 0) {
    return {
      assistants: dedupeAssistants(defaultTargets.flatMap(getTargetAssistantIds)),
      source: "config-default-targets"
    };
  }

  const detected = dedupeAssistants(
    repoFacts.aiAssistants
      .filter((assistant) => assistant.status === "found")
      .map((assistant) => assistant.id)
  );
  if (detected.length > 0) {
    return {
      assistants: detected,
      source: "detected-assistants"
    };
  }

  return {
    assistants: getAllTargetAssistantIds(),
    source: "fallback-all"
  };
}

function summarizeRecommendationProviders(
  providerIds: string[],
  providerResults: SkillProviderResult[],
  providerQueries: string[]
): ProviderSummary[] {
  return providerIds.map((providerId) => {
    const results = providerResults.filter((result) => result.providerId === providerId);
    const warnings = results.flatMap((result) => result.warnings ?? []);
    const dedupedCandidates = new Map<string, SkillCandidate>();
    for (const result of results) {
      for (const candidate of result.candidates) {
        const key = candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
        if (!dedupedCandidates.has(key)) {
          dedupedCandidates.set(key, candidate);
        }
      }
    }

    return {
      providerId,
      mode: "recommend+planned-search",
      candidateCount: dedupedCandidates.size,
      dedupedCandidateCount: dedupedCandidates.size,
      warnings: warnings.length > 0 ? warnings : undefined,
      queryCount: 1 + providerQueries.length,
      queries: providerQueries
    };
  });
}
