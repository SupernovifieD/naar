import type { CliFlags } from "../types/index.js";
import pc from "picocolors";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations } from "./pipeline.js";
import { runInstallFlow } from "./installFlow.js";
import { printJson } from "../utils/json.js";
import {
  colorAssistantStatus,
  colorRisk,
  colorScore,
  formatList,
  formatReason,
  warningHeader,
  warningLine
} from "../utils/output.js";

export async function runGo(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const pipeline = await buildRecommendations(repoRoot, flags);

  if (flags.json) {
    printJson({
      repoRoot,
      repoFacts: pipeline.repoFacts,
      recommendations: pipeline.recommendations
    });
    if (flags.apply === false) {
      return;
    }
  } else {
    renderSummary(repoRoot, pipeline.repoFacts, pipeline.recommendations, pipeline.providerWarnings);
  }

  await runInstallFlow(flags, { forceFreshRecommendations: false, printHeader: true });
}

function renderSummary(
  repoRoot: string,
  repoFacts: Awaited<ReturnType<typeof buildRecommendations>>["repoFacts"],
  recommendations: Awaited<ReturnType<typeof buildRecommendations>>["recommendations"],
  providerWarnings: string[]
): void {
  process.stdout.write(`${pc.bold("Naar")} v0.1\n`);
  process.stdout.write(`Repo: ${pc.dim(repoRoot)}\n\n`);

  process.stdout.write(`${pc.bold("[1/5]")} Scanning repository...\n`);
  process.stdout.write(`  Languages: ${formatList(repoFacts.languages)}\n`);
  process.stdout.write(
    `  Package manager: ${formatList(repoFacts.packageManagers.map((packageManager) => packageManager.id), "unknown")}\n`
  );

  const byCategory = groupFrameworks(repoFacts.frameworks);
  process.stdout.write(`  Frontend: ${formatList(byCategory.frontend)}\n`);
  process.stdout.write(`  Backend: ${formatList(byCategory.backend)}\n`);
  process.stdout.write(`  Tests: ${formatList(byCategory.testing)}\n`);
  process.stdout.write(`  Styling: ${formatList(byCategory.styling)}\n`);
  process.stdout.write(
    `  CI/CD: ${
      repoFacts.frameworks.some((framework) => framework.id === "github-actions")
        ? pc.cyan("github-actions")
        : pc.dim("none")
    }\n`
  );

  process.stdout.write("  AI config:\n");
  for (const assistant of repoFacts.aiAssistants) {
    process.stdout.write(`    - ${pc.cyan(assistant.id)}: ${colorAssistantStatus(assistant.status)}\n`);
  }
  process.stdout.write(
    `  Readiness score: ${colorScore(repoFacts.readiness.score)}/100 (${pc.bold(repoFacts.readiness.grade)})\n\n`
  );

  process.stdout.write(`${pc.bold("[2/5]")} Fetching skill candidates...\n`);
  process.stdout.write(`  Providers: ${pc.cyan("anthropic")}, ${pc.cyan("clawhub")}\n\n`);

  process.stdout.write(`${pc.bold("[3/5]")} Ranking recommendations...\n`);
  for (const [index, recommendation] of recommendations.entries()) {
    process.stdout.write(
      `  ${index + 1}) ${pc.bold(recommendation.candidate.name)} (${pc.cyan(recommendation.candidate.source.providerId)}) `
      + `[score ${colorScore(recommendation.score)}, risk ${colorRisk(recommendation.candidate.risk.score)}]\n`
    );
    const reasons = recommendation.reasons
      .slice(0, 2)
      .map((reason) => formatReason(reason))
      .join(`${pc.dim("; ")} `);
    process.stdout.write(`     ${pc.magenta("Why")}: ${reasons}\n`);
  }

  const blocked = recommendations.filter((recommendation) => recommendation.blocked);
  const warnings: string[] = [];
  if (blocked.length > 0) {
    warnings.push(`${blocked.length} candidates blocked by security policy`);
  }
  warnings.push(...providerWarnings);

  if (warnings.length > 0) {
    process.stdout.write(`\n${warningHeader("Warnings")}\n`);
    for (const warning of warnings) {
      process.stdout.write(`  ${warningLine(warning)}\n`);
    }
  }

  process.stdout.write(`\n${pc.bold("[4/5]")} Select skills to install\n\n`);
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
