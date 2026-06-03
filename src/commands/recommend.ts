import pc from "picocolors";
import type { CliFlags } from "../types/index.js";
import { renderRecommendationQueryPlan } from "../recommend/queryPlan.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations } from "./pipeline.js";
import { renderRecommendationCards, warningHeader, warningLine } from "../utils/output.js";

export async function runRecommend(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const pipeline = await buildRecommendations(repoRoot, flags);

  if (flags.json) {
    printJson({
      repoFacts: pipeline.repoFacts,
      repoNeeds: pipeline.repoNeeds,
      queryPlan: pipeline.queryPlan,
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
      const queryCount = typeof provider.queryCount === "number" && provider.queryCount > 0
        ? ` queries=${pc.cyan(String(provider.queryCount))}`
        : "";
      process.stdout.write(
        `- ${pc.bold(provider.providerId)}${mode}${queryCount} candidates=${pc.cyan(String(provider.candidateCount))}\n`
      );
    }
  }

  if (flags.verbose && pipeline.queryPlan) {
    process.stdout.write(`\n${renderRecommendationQueryPlan(pipeline.queryPlan)}\n`);
  }

  process.stdout.write(`\n${pc.bold("Recommendations")}:\n`);
  process.stdout.write(renderRecommendationCards(pipeline.recommendations, {
    indent: "  ",
    reasonLimit: 3,
    compact: flags.compact,
    verbose: flags.verbose
  }));
}
