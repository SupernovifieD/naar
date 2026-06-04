import type { CliFlags } from "../types/index.js";
import { renderRecommendationQueryPlan } from "../recommend/queryPlan.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations, type PipelinePhaseEvent } from "./pipeline.js";
import { renderRecommendationCards, warningHeader, warningLine } from "../utils/output.js";
import { createSpinner, heading, muted, section } from "../utils/terminal.js";

const DEFAULT_RECOMMENDATION_DISPLAY_LIMIT = 5;

export async function runRecommend(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const pipeline = flags.json
    ? await buildRecommendations(repoRoot, flags)
    : await buildRecommendations(repoRoot, flags, { onPhase: createRecommendProgressRenderer() });

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

  if (flags.verbose && pipeline.queryPlan) {
    process.stdout.write(`\n${renderRecommendationQueryPlan(pipeline.queryPlan)}\n`);
  }

  const visibleRecommendations = resolveVisibleRecommendations(pipeline.recommendations, flags);
  process.stdout.write(`\n${heading("Recommendations")}\n`);
  if (pipeline.recommendations.length > visibleRecommendations.length) {
    process.stdout.write(muted(`Showing ${visibleRecommendations.length} of ${pipeline.recommendations.length}. Use --limit <n> or --all for more.`));
    process.stdout.write("\n\n");
  } else {
    process.stdout.write("\n");
  }

  process.stdout.write(renderRecommendationCards(visibleRecommendations, {
    reasonLimit: 3,
    compact: flags.compact,
    verbose: flags.verbose
  }));

  if (flags.verbose && pipeline.providerSummaries.length > 0) {
    process.stdout.write(`\n\n${section("Providers")}\n`);
    for (const provider of pipeline.providerSummaries) {
      const details = [
        provider.mode ? `mode ${provider.mode}` : undefined,
        typeof provider.queryCount === "number" ? `${provider.queryCount} queries` : undefined,
        `${provider.candidateCount} candidates`
      ].filter(Boolean).join(" · ");
      process.stdout.write(`* ${provider.providerId}${details ? `${muted(" · ")}${details}` : ""}\n`);
    }
  }

  if (pipeline.providerWarnings.length > 0) {
    process.stdout.write(`\n${warningHeader("Provider notes")}:\n`);
    for (const warning of pipeline.providerWarnings) {
      process.stdout.write(`- ${warningLine(warning)}\n`);
    }
  }
}

function resolveVisibleRecommendations<T>(recommendations: T[], flags: CliFlags): T[] {
  if (flags.all || flags.verbose) {
    return recommendations;
  }
  const limit = typeof flags.limit === "number" ? flags.limit : DEFAULT_RECOMMENDATION_DISPLAY_LIMIT;
  return recommendations.slice(0, Math.max(1, limit));
}

function createRecommendProgressRenderer(): (event: PipelinePhaseEvent) => void {
  let spinner = createSpinner("Scanning repository", { enabled: true });
  spinner?.stop();

  return (event: PipelinePhaseEvent): void => {
    if (event.phase === "scan:start") {
      spinner = createSpinner("Scanning repository", { enabled: true });
      return;
    }
    if (event.phase === "scan:done") {
      spinner?.succeed("Repository scanned");
      spinner = null;
      return;
    }
    if (event.phase === "providers:start") {
      spinner = createSpinner("Fetching providers", { enabled: true });
      return;
    }
    if (event.phase === "providers:done") {
      spinner?.succeed("Providers fetched");
      spinner = null;
      return;
    }
    if (event.phase === "rank:start") {
      spinner = createSpinner("Ranking skills", { enabled: true });
      return;
    }
    if (event.phase === "rank:done") {
      spinner?.succeed("Skills ranked");
      spinner = null;
    }
  };
}
