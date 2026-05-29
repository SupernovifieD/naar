import { loadConfig } from "../config/store.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import { recommendSkills } from "../recommend/recommend.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { loadInstalledState } from "../installer/state.js";
import type { CliFlags, RepoFacts, SkillCandidate, SkillRecommendation } from "../types/index.js";
import { loadRecommendationCache, loadScanCache, saveRecommendationCache, saveScanCache } from "./cache.js";

export interface PipelineResult {
  repoFacts: RepoFacts;
  recommendations: SkillRecommendation[];
  providerWarnings: string[];
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

export async function buildRecommendations(repoRoot: string, flags: CliFlags): Promise<PipelineResult> {
  const config = await loadConfig(repoRoot);
  const repoFacts = await ensureScan(repoRoot, true);
  const installedIds = await getInstalledSkillIds(repoRoot);

  const providerIds = flags.provider.length > 0 ? flags.provider : config.defaultProviders;
  const providers = buildProviders(providerIds);
  const providerResults = await queryProviders(providers, {
    repoFacts,
    targets: flags.target,
    limit: 200
  });

  const candidates: SkillCandidate[] = providerResults
    .flatMap((result) => result.candidates)
    .filter((candidate) => !installedIds.has(candidate.canonicalSkillId));

  const recommendations = recommendSkills(repoFacts, candidates, {
    minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
    noScripts: flags.noScripts,
    targetAssistants: repoFacts.aiAssistants.map((assistant) => assistant.id),
    maxResults: 20
  });

  const filteredRecommendations = filterInstalledRecommendations(recommendations, installedIds);
  const warnings = providerResults.flatMap((result) => result.warnings ?? []);

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    recommendations: filteredRecommendations,
    generatedAtIso: new Date().toISOString()
  });

  return {
    repoFacts,
    recommendations: filteredRecommendations,
    providerWarnings: warnings
  };
}

export async function loadOrBuildRecommendations(repoRoot: string, flags: CliFlags): Promise<PipelineResult> {
  const cached = await loadRecommendationCache(repoRoot);
  if (!cached) {
    return buildRecommendations(repoRoot, flags);
  }

  const installedIds = await getInstalledSkillIds(repoRoot);
  return {
    repoFacts: cached.repoFacts,
    recommendations: filterInstalledRecommendations(cached.recommendations, installedIds),
    providerWarnings: []
  };
}

async function getInstalledSkillIds(repoRoot: string): Promise<Set<string>> {
  const state = await loadInstalledState(repoRoot);
  return new Set(state.skills.map((skill) => skill.canonicalSkillId));
}

function filterInstalledRecommendations(
  recommendations: SkillRecommendation[],
  installedIds: Set<string>
): SkillRecommendation[] {
  return recommendations.filter((recommendation) => !installedIds.has(recommendation.candidate.canonicalSkillId));
}
