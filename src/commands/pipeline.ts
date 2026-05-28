import { loadConfig } from "../config/store.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import { recommendSkills } from "../recommend/recommend.js";
import { scanRepo } from "../scanner/scanRepo.js";
import type { CliFlags, RepoFacts, SkillRecommendation } from "../types/index.js";
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
  const providerIds = flags.provider.length > 0 ? flags.provider : config.defaultProviders;
  const providers = buildProviders(providerIds);
  const providerResults = await queryProviders(providers, {
    repoFacts,
    targets: flags.target,
    limit: 200
  });

  const candidates = providerResults.flatMap((result) => result.candidates);
  const recommendations = recommendSkills(repoFacts, candidates, {
    minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
    noScripts: flags.noScripts,
    targetAssistants: repoFacts.aiAssistants.map((assistant) => assistant.id),
    maxResults: 10
  });

  const warnings = providerResults.flatMap((result) => result.warnings ?? []);

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    recommendations,
    generatedAtIso: new Date().toISOString()
  });

  return {
    repoFacts,
    recommendations,
    providerWarnings: warnings
  };
}

export async function loadOrBuildRecommendations(repoRoot: string, flags: CliFlags): Promise<PipelineResult> {
  const cached = await loadRecommendationCache(repoRoot);
  if (cached) {
    return {
      repoFacts: cached.repoFacts,
      recommendations: cached.recommendations,
      providerWarnings: []
    };
  }

  return buildRecommendations(repoRoot, flags);
}
