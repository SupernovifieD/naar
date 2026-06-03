import type { CliFlags } from "../types/index.js";
import ora from "ora";
import pc from "picocolors";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations, type PipelinePhaseEvent } from "./pipeline.js";
import { runInstallFlowFromRecommendations } from "./installFlow.js";
import { printJson } from "../utils/json.js";
import { CLI_VERSION } from "../utils/version.js";
import {
  colorAssistantStatus,
  colorScore,
  formatList,
  renderRecommendationCards,
  warningHeader,
  warningLine
} from "../utils/output.js";

export async function runGo(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  if (flags.json) {
    const pipeline = await buildRecommendations(repoRoot, flags);
    printJson({
      repoRoot,
      repoFacts: pipeline.repoFacts,
      repoNeeds: pipeline.repoNeeds,
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
  process.stdout.write(`Repo: ${pc.dim(repoRoot)}\n\n`);

  return (event: PipelinePhaseEvent): void => {
    if (event.phase.endsWith(":start")) {
      activeSpinner?.stop();
    }

    switch (event.phase) {
      case "scan:start": {
        process.stdout.write(`${pc.bold("[1/5]")} Scanning repository...\n`);
        activeSpinner = ora("Detecting stack and project topology").start();
        return;
      }
      case "scan:done": {
        activeSpinner?.succeed("Scan complete");
        activeSpinner = null;
        if (!event.repoFacts) return;
        renderScanSummary(event.repoFacts);
        return;
      }
      case "providers:start": {
        process.stdout.write(`${pc.bold("[2/5]")} Fetching skill candidates...\n`);
        if (event.providerIds && event.providerIds.length > 0) {
          process.stdout.write(`  Providers: ${event.providerIds.map((id) => pc.cyan(id)).join(pc.dim(", "))}\n`);
        }
        activeSpinner = ora("Fetching from providers").start();
        return;
      }
      case "providers:done": {
        activeSpinner?.succeed("Provider fetch complete");
        activeSpinner = null;
        const providerResults = event.providerResults ?? [];
        const hasWarnings = providerResults.some((result) => (result.warnings ?? []).length > 0);
        if (hasWarnings) {
          process.stdout.write(`  Mode: ${pc.yellow("degraded (partial provider failures)")}\n`);
        }
        if (providerResults.length > 0) {
          process.stdout.write("\n");
          for (const provider of providerResults) {
            const mode = provider.mode ? ` mode=${pc.cyan(provider.mode)}` : "";
            process.stdout.write(
              `    - ${pc.bold(provider.providerId)}${mode} candidates=${pc.cyan(String(provider.candidates.length))}\n`
            );
          }
        }
        process.stdout.write("\n");
        return;
      }
      case "rank:start": {
        process.stdout.write(`${pc.bold("[3/5]")} Ranking recommendations...\n`);
        activeSpinner = ora("Scoring and filtering candidates").start();
        return;
      }
      case "rank:done": {
        activeSpinner?.succeed("Ranking complete");
        activeSpinner = null;
        if (!event.result) return;
        renderRankingSummary(event.result, flags);
        process.stdout.write(`\n${pc.bold("[4/5]")} Select skills to install\n\n`);
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
  process.stdout.write(`  Languages: ${formatList(repoFacts.languages)}\n`);
  process.stdout.write(
    `  Package manager: ${formatList(repoFacts.packageManagers.map((packageManager) => packageManager.id), "unknown")}\n`
  );

  const byCategory = groupFrameworks(repoFacts.frameworks);
  const ciTools = repoFacts.primaryFacts?.ci?.map((tool) => tool.id)
    ?? (repoFacts.frameworks.some((framework) => framework.id === "github-actions") ? ["github-actions"] : []);
  process.stdout.write(`  Frontend: ${formatList(byCategory.frontend)}\n`);
  process.stdout.write(`  Backend: ${formatList(byCategory.backend)}\n`);
  process.stdout.write(`  Tests: ${formatList(byCategory.testing)}\n`);
  process.stdout.write(`  Styling: ${formatList(byCategory.styling)}\n`);
  process.stdout.write(`  CI/CD: ${formatList(ciTools)}\n`);

  process.stdout.write("  AI config:\n");
  for (const assistant of repoFacts.aiAssistants) {
    process.stdout.write(`    - ${pc.cyan(assistant.id)}: ${colorAssistantStatus(assistant.status)}\n`);
  }
  process.stdout.write(
    `  Readiness score: ${colorScore(repoFacts.readiness.score, { percent: true })} (${pc.bold(repoFacts.readiness.grade)})\n\n`
  );
}

function renderRankingSummary(
  result: Awaited<ReturnType<typeof buildRecommendations>>,
  flags: CliFlags
): void {
  const { recommendations, providerWarnings } = result;

  if (recommendations.length === 0) {
    process.stdout.write(`  ${warningLine("No recommendations available for this run.")}\n`);
  }

  process.stdout.write(renderRecommendationCards(recommendations, {
    indent: "  ",
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
      process.stdout.write(`  ${warningLine(warning)}\n`);
    }
  }
}

function groupFrameworks(
  frameworks: Awaited<ReturnType<typeof buildRecommendations>>["repoFacts"]["frameworks"]
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {
    frontend: [],
    backend: [],
    testing: [],
    styling: [],
    build: [],
    infra: []
  };

  for (const framework of frameworks) {
    grouped[framework.category].push(framework.id);
  }

  return grouped;
}

function resolveRecommendationStatus(recommendation: { status?: string; blocked: boolean }): string {
  if (recommendation.status) return recommendation.status;
  return recommendation.blocked ? "blocked" : "eligible";
}
