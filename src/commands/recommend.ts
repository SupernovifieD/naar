import ora from "ora";
import type { CliFlags, SkillCandidate } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { loadConfig } from "../config/store.js";
import { loadScanCache, saveRecommendationCache, saveScanCache } from "./cache.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import { recommendSkills } from "../recommend/recommend.js";

export async function runRecommend(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const config = await loadConfig(repoRoot);

  let repoFacts = await loadScanCache(repoRoot);
  if (!repoFacts) {
    repoFacts = await scanRepo(repoRoot);
    await saveScanCache(repoRoot, repoFacts);
  }

  const providerIds = flags.provider.length > 0 ? flags.provider : config.defaultProviders;
  const providers = buildProviders(providerIds);

  const spinner = flags.json ? null : ora("Fetching skill candidates from providers").start();
  const providerResults = await queryProviders(providers, {
    repoFacts,
    targets: flags.target,
    limit: 200
  });

  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const candidates: SkillCandidate[] = providerResults.flatMap((result) => result.candidates);

  const recommendations = recommendSkills(repoFacts, candidates, {
    minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
    noScripts: flags.noScripts,
    targetAssistants: repoFacts.aiAssistants.map((assistant) => assistant.id),
    maxResults: 10
  });

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    recommendations,
    generatedAtIso: new Date().toISOString()
  });

  spinner?.succeed(`Ranked ${recommendations.length} recommendations`);

  if (flags.json) {
    printJson({
      repoFacts,
      providers: providerResults.map((result) => ({ providerId: result.providerId, count: result.candidates.length })),
      warnings,
      recommendations
    });
    return;
  }

  if (warnings.length > 0) {
    process.stdout.write("\nProvider notes:\n");
    for (const warning of warnings) {
      process.stdout.write(`- ${warning}\n`);
    }
  }

  process.stdout.write("\nRecommendations:\n");
  for (const recommendation of recommendations) {
    const blockedLabel = recommendation.blocked ? " [BLOCKED]" : "";
    process.stdout.write(
      `- ${recommendation.candidate.name} (${recommendation.candidate.source.providerId}) score=${recommendation.score} risk=${recommendation.candidate.risk.score}${blockedLabel}\n`
    );
    process.stdout.write(`  why: ${recommendation.reasons.slice(0, 3).join("; ")}\n`);
    if (recommendation.blocked && recommendation.blockReasons && recommendation.blockReasons.length > 0) {
      process.stdout.write(`  blocked: ${recommendation.blockReasons.join("; ")}\n`);
    }
  }
}
