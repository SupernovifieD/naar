import type { CliFlags } from "../types/index.js";
import ora from "ora";
import pc from "picocolors";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations, type PipelinePhaseEvent } from "./pipeline.js";
import { runInstallFlowFromRecommendations } from "./installFlow.js";
import { printJson } from "../utils/json.js";
import { CLI_VERSION } from "../utils/version.js";
import { renderRecommendationQueryPlan } from "../recommend/queryPlan.js";
import {
  colorAssistantStatus,
  colorScore,
  renderRecommendationCards,
  warningHeader,
  warningLine
} from "../utils/output.js";
import { heading, joinSegments, keyValue, muted, pathText, section, statusBadge } from "../utils/terminal.js";

const DEFAULT_RECOMMENDATION_DISPLAY_LIMIT = 5;

export async function runGo(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  if (flags.json) {
    const pipeline = await buildRecommendations(repoRoot, flags);
    printJson({
      repoRoot,
      repoFacts: pipeline.repoFacts,
      repoNeeds: pipeline.repoNeeds,
      queryPlan: pipeline.queryPlan,
      providers: pipeline.providerSummaries,
      warnings: pipeline.providerWarnings,
      recommendations: pipeline.recommendations
    });
    if (flags.apply === false) {
      return;
    }
    await runInstallFlowFromRecommendations(flags, pipeline.recommendations, {
      repoFacts: pipeline.repoFacts,
      source: "go",
      printHeader: true
    });
    return;
  }

  const progress = createGoProgressRenderer(repoRoot, flags);
  const pipeline = await buildRecommendations(repoRoot, flags, { onPhase: (event) => progress(event) });

  await runInstallFlowFromRecommendations(flags, pipeline.recommendations, {
    repoFacts: pipeline.repoFacts,
    source: "go",
    printHeader: true
  });
}

function createGoProgressRenderer(repoRoot: string, flags: CliFlags): (event: PipelinePhaseEvent) => void {
  let activeSpinner: ReturnType<typeof ora> | null = null;

  process.stdout.write(`${pc.bold("Naar")} v${CLI_VERSION}\n`);
  process.stdout.write(`Repo: ${pathText(repoRoot)}\n\n`);

  return (event: PipelinePhaseEvent): void => {
    if (event.phase.endsWith(":start")) {
      activeSpinner?.stop();
    }

    switch (event.phase) {
      case "scan:start": {
        process.stdout.write(`${pc.bold("[1/5]")} Scan\n`);
        activeSpinner = ora("Scanning repository").start();
        return;
      }
      case "scan:done": {
        activeSpinner?.succeed("Repository scanned");
        activeSpinner = null;
        if (!event.repoFacts) return;
        renderScanSummary(event.repoFacts);
        return;
      }
      case "providers:start": {
        process.stdout.write(`\n${pc.bold("[2/5]")} Providers\n`);
        activeSpinner = ora("Fetching providers").start();
        return;
      }
      case "providers:done": {
        activeSpinner?.succeed("Providers fetched");
        activeSpinner = null;
        const providerSummaries = event.providerSummaries ?? [];
        if (providerSummaries.length > 0) {
          for (const provider of providerSummaries) {
            process.stdout.write(`* ${provider.providerId}${muted(" · ")}${provider.candidateCount} candidates\n`);
          }
        }
        return;
      }
      case "rank:start": {
        process.stdout.write(`\n${pc.bold("[3/5]")} Recommendations\n`);
        activeSpinner = ora("Ranking skills").start();
        return;
      }
      case "rank:done": {
        activeSpinner?.succeed("Ranked skills");
        activeSpinner = null;
        if (!event.result) return;
        renderRankingSummary(event.result, flags);
        process.stdout.write(`\n${pc.bold("[4/5]")} Selection\n\n`);
        return;
      }
      default:
        return;
    }
  };
}

function renderScanSummary(
  repoFacts: Awaited<ReturnType<typeof buildRecommendations>>["repoFacts"]
): void {
  const stackParts = [
    repoFacts.languages.join(", "),
    repoFacts.packageManagers.map((packageManager) => packageManager.id).join(", "),
    repoFacts.primaryFacts?.testTools?.map((tool) => tool.id).join(", "),
    repoFacts.primaryFacts?.ci?.map((tool) => tool.id).join(", ")
  ].map((part) => part?.trim()).filter(Boolean) as string[];
  const foundAssistants = repoFacts.aiAssistants.filter((assistant) => assistant.status === "found");

  process.stdout.write(`${keyValue("Stack", stackParts.join(muted(" · ")) || muted("unknown"))}\n`);
  process.stdout.write(`${keyValue(
    "Assistants",
    foundAssistants.length > 0
      ? foundAssistants.map((assistant) => `${assistant.id} ${statusBadge("found")}`).join(muted(" · "))
      : muted("none found")
  )}\n`);
  process.stdout.write(`${keyValue("Readiness", `${colorScore(repoFacts.readiness.score, { percent: true })} ${statusBadge(repoFacts.readiness.grade)}`)}\n`);
}

function renderRankingSummary(
  result: Awaited<ReturnType<typeof buildRecommendations>>,
  flags: CliFlags
): void {
  const { recommendations, providerWarnings } = result;

  if (flags.verbose && result.queryPlan) {
    process.stdout.write(`${renderRecommendationQueryPlan(result.queryPlan)}\n\n`);
  }

  if (recommendations.length === 0) {
    process.stdout.write(`${warningLine("No recommendations available for this run.")}\n`);
  }

  const visibleRecommendations = flags.all || flags.verbose
    ? recommendations
    : recommendations.slice(0, Math.max(1, flags.limit ?? DEFAULT_RECOMMENDATION_DISPLAY_LIMIT));
  process.stdout.write(`Showing top ${visibleRecommendations.length} of ${recommendations.length}\n\n`);
  process.stdout.write(renderRecommendationCards(visibleRecommendations, {
    reasonLimit: 3,
    compact: flags.compact,
    verbose: flags.verbose
  }));

  const blocked = recommendations.filter((recommendation) => resolveRecommendationStatus(recommendation) === "blocked");
  const risky = recommendations.filter((recommendation) => resolveRecommendationStatus(recommendation) === "risky");
  const warnings: string[] = [];
  if (blocked.length > 0) {
    warnings.push(`${blocked.length} candidates blocked by security policy`);
  }
  if (risky.length > 0) {
    warnings.push(`${risky.length} candidates require explicit risky override`);
  }
  warnings.push(...providerWarnings);

  if (warnings.length > 0) {
    process.stdout.write(`\n${warningHeader("Warnings")}\n`);
    for (const warning of warnings) {
      process.stdout.write(`${warningLine(warning)}\n`);
    }
  }
}

function resolveRecommendationStatus(recommendation: { status?: string; blocked: boolean }): string {
  if (recommendation.status) return recommendation.status;
  return recommendation.blocked ? "blocked" : "eligible";
}
