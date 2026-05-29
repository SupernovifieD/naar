import pc from "picocolors";
import type { CliFlags } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations } from "./pipeline.js";
import { colorRisk, colorScore, formatReason, warningHeader, warningLine } from "../utils/output.js";

export async function runRecommend(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const pipeline = await buildRecommendations(repoRoot, flags);

  if (flags.json) {
    printJson({
      repoFacts: pipeline.repoFacts,
      providers: pipeline.providerSummaries,
      warnings: pipeline.providerWarnings,
      recommendations: pipeline.recommendations
    });
    return;
  }

  if (pipeline.providerWarnings.length > 0) {
    process.stdout.write(`\n${warningHeader("Provider notes")}:\n`);
    for (const warning of pipeline.providerWarnings) {
      process.stdout.write(`- ${warningLine(warning)}\n`);
    }
  }

  if (pipeline.providerSummaries.length > 0) {
    process.stdout.write(`\n${pc.bold("Providers")}:\n`);
    for (const provider of pipeline.providerSummaries) {
      const mode = provider.mode ? ` mode=${pc.cyan(provider.mode)}` : "";
      process.stdout.write(
        `- ${pc.bold(provider.providerId)}${mode} candidates=${pc.cyan(String(provider.candidateCount))}\n`
      );
    }
  }

  process.stdout.write(`\n${pc.bold("Recommendations")}:\n`);
  for (const recommendation of pipeline.recommendations) {
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
