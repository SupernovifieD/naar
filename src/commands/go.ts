import type { CliFlags } from "../types/index.js";
import { resolveRepoRoot } from "./shared.js";
import { buildRecommendations } from "./pipeline.js";
import { runInstallFlow } from "./installFlow.js";
import { printJson } from "../utils/json.js";

export async function runGo(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const pipeline = await buildRecommendations(repoRoot, flags);

  if (flags.json) {
    printJson({
      repoRoot,
      repoFacts: pipeline.repoFacts,
      recommendations: pipeline.recommendations
    });
    if (!flags.apply) {
      return;
    }
  } else {
    renderSummary(repoRoot, pipeline.repoFacts, pipeline.recommendations);
  }

  await runInstallFlow(flags, { forceFreshRecommendations: false });
}

function renderSummary(
  repoRoot: string,
  repoFacts: Awaited<ReturnType<typeof buildRecommendations>>["repoFacts"],
  recommendations: Awaited<ReturnType<typeof buildRecommendations>>["recommendations"]
): void {
  process.stdout.write(`Naar v0.1\n`);
  process.stdout.write(`Repo: ${repoRoot}\n\n`);

  process.stdout.write("[1/5] Scanning repository...\n");
  process.stdout.write(`  Languages: ${repoFacts.languages.join(", ") || "none"}\n`);
  process.stdout.write(
    `  Package manager: ${repoFacts.packageManagers.map((packageManager) => packageManager.id).join(", ") || "unknown"}\n`
  );

  const byCategory = groupFrameworks(repoFacts.frameworks);
  process.stdout.write(`  Frontend: ${byCategory.frontend.join(", ") || "none"}\n`);
  process.stdout.write(`  Backend: ${byCategory.backend.join(", ") || "none"}\n`);
  process.stdout.write(`  Tests: ${byCategory.testing.join(", ") || "none"}\n`);
  process.stdout.write(`  Styling: ${byCategory.styling.join(", ") || "none"}\n`);
  process.stdout.write(
    `  CI/CD: ${repoFacts.frameworks.some((framework) => framework.id === "github-actions") ? "github-actions" : "none"}\n`
  );

  process.stdout.write("  AI config:\n");
  for (const assistant of repoFacts.aiAssistants) {
    const status = assistant.status === "found" ? "found" : "missing";
    process.stdout.write(`    - ${assistant.id}: ${status}\n`);
  }
  process.stdout.write(
    `  Readiness score: ${repoFacts.readiness.score}/100 (${repoFacts.readiness.grade})\n\n`
  );

  process.stdout.write("[2/5] Fetching skill candidates...\n");
  process.stdout.write(`  Providers: anthropic, clawhub\n\n`);

  process.stdout.write("[3/5] Ranking recommendations...\n");
  for (const [index, recommendation] of recommendations.entries()) {
    process.stdout.write(
      `  ${index + 1}) ${recommendation.candidate.name} (${recommendation.candidate.source.providerId}) [score ${recommendation.score}, risk ${recommendation.candidate.risk.score}]\n`
    );
    process.stdout.write(`     Why: ${recommendation.reasons.slice(0, 2).join("; ")}\n`);
  }

  const blocked = recommendations.filter((recommendation) => recommendation.blocked);
  if (blocked.length > 0) {
    process.stdout.write(`\nWarnings:\n`);
    process.stdout.write(`  - ${blocked.length} candidates blocked by security policy\n`);
  }

  process.stdout.write("\n[4/5] Select skills to install\n");
  process.stdout.write("[5/5] Installation plan preview\n\n");
}

function groupFrameworks(frameworks: Awaited<ReturnType<typeof buildRecommendations>>["repoFacts"]["frameworks"]): Record<string, string[]> {
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
