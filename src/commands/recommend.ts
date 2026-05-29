import ora from "ora";
import pc from "picocolors";
import type { CliFlags, SkillCandidate } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { loadConfig } from "../config/store.js";
import { loadScanCache, saveRecommendationCache, saveScanCache } from "./cache.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import { recommendSkills } from "../recommend/recommend.js";
import { loadInstalledState } from "../installer/state.js";
import { colorRisk, colorScore, formatReason, warningHeader, warningLine } from "../utils/output.js";

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
  const installedIds = new Set((await loadInstalledState(repoRoot)).skills.map((skill) => skill.canonicalSkillId));

  const spinner = flags.json ? null : ora("Fetching skill candidates from providers").start();
  const providerResults = await queryProviders(providers, {
    repoFacts,
    targets: flags.target,
    limit: 200
  });

  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const candidates: SkillCandidate[] = providerResults
    .flatMap((result) => result.candidates)
    .filter((candidate) => !installedIds.has(candidate.canonicalSkillId));

  const recommendations = recommendSkills(repoFacts, candidates, {
    minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
    noScripts: flags.noScripts,
    targetAssistants: repoFacts.aiAssistants.map((assistant) => assistant.id),
    maxResults: 20
  });

  await saveRecommendationCache(repoRoot, {
    repoFacts,
    recommendations,
    generatedAtIso: new Date().toISOString()
  });

  spinner?.succeed(pc.green(`Ranked ${recommendations.length} recommendations`));

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
    process.stdout.write(`\n${warningHeader("Provider notes")}:\n`);
    for (const warning of warnings) {
      process.stdout.write(`- ${warningLine(warning)}\n`);
    }
  }

  process.stdout.write(`\n${pc.bold("Recommendations")}:\n`);
  for (const recommendation of recommendations) {
    const blockedLabel = recommendation.blocked ? ` ${pc.red("[BLOCKED]")}` : "";
    process.stdout.write(
      `- ${pc.bold(recommendation.candidate.name)} (${pc.cyan(recommendation.candidate.source.providerId)}) `
      + `score=${colorScore(recommendation.score)} risk=${colorRisk(recommendation.candidate.risk.score)}${blockedLabel}\n`
    );
    process.stdout.write(
      `  ${pc.magenta("why")}: ${recommendation.reasons.slice(0, 3).map((reason) => formatReason(reason)).join(`${pc.dim("; ")} `)}\n`
    );
    if (recommendation.blocked && recommendation.blockReasons && recommendation.blockReasons.length > 0) {
      process.stdout.write(`  ${pc.red("blocked")}: ${recommendation.blockReasons.join(`${pc.dim("; ")} `)}\n`);
    }
  }
}
