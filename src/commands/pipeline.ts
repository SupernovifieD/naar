import { loadConfig } from "../config/store.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import { recommendSkills } from "../recommend/recommend.js";
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

export interface PipelineResult {
  repoFacts: RepoFacts;
  repoNeeds: RepoNeed[];
  recommendations: SkillRecommendation[];
  providerWarnings: string[];
  providerSummaries: Array<{
    providerId: string;
    mode?: string;
    candidateCount: number;
    warnings?: string[];
  }>;
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
  const providerResults = await queryProviders(providers, {
    repoFacts,
    targets: flags.target,
    limit: 200
  });
  await hooks.onPhase?.({ phase: "providers:done", providerIds, providerResults });

  const candidates: SkillCandidate[] = providerResults
    .flatMap((result) => result.candidates)
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
    maxResults: 10
  });

  const filteredRecommendations = filterInstalledRecommendations(recommendationResult.recommendations, installedIds);
  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const providerSummaries = providerResults.map((result) => ({
    providerId: result.providerId,
    mode: result.mode,
    candidateCount: result.candidates.length,
    warnings: result.warnings
  }));

  const pipelineResult: PipelineResult = {
    repoFacts,
    repoNeeds: recommendationResult.repoNeeds,
    recommendations: filteredRecommendations,
    providerWarnings: warnings,
    providerSummaries
  };

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    repoNeeds: recommendationResult.repoNeeds,
    recommendations: filteredRecommendations,
    providerSummaries,
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
    providerSummaries: cached.providerSummaries ?? []
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
      assistants: dedupeAssistants(flags.target.map(targetToAssistant)),
      source: "explicit-targets"
    };
  }

  if (defaultTargets.length > 0) {
    return {
      assistants: dedupeAssistants(defaultTargets.map(targetToAssistant)),
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
    assistants: ["claude", "cursor", "copilot", "codex", "generic"],
    source: "fallback-all"
  };
}

function targetToAssistant(target: InstallTarget): AssistantId {
  if (target === "claude_project_skills") return "claude";
  if (target === "cursor_project_rules") return "cursor";
  if (target === "copilot_repo_instructions") return "copilot";
  if (target === "codex_repo_skills") return "codex";
  return "generic";
}

function dedupeAssistants(values: AssistantId[]): AssistantId[] {
  return [...new Set(values)];
}
