import { checkbox } from "@inquirer/prompts";
import pc from "picocolors";
import type { CliFlags, InstallTarget, SkillRecommendation, SkillRef } from "../types/index.js";
import { loadConfig } from "../config/store.js";
import { buildProviders } from "../providers/orchestrator.js";
import type { ResolvedSkill } from "../installer/plan.js";
import { installResolvedSkills } from "../installer/installService.js";
import {
  colorRisk,
  colorScore,
  formatRecommendationChoiceDescription,
  warningLine
} from "../utils/output.js";
import { isCandidateCompatibleWithTarget, listInstallTargets } from "../targets/index.js";
import { resolveRepoRoot } from "./shared.js";
import type { RepoFacts } from "../types/index.js";

interface RecommendationInstallFlowOptions {
  repoFacts?: RepoFacts;
  printHeader?: boolean;
  source?: "go" | "recommendation";
  skipRecommendationSelection?: boolean;
}

class PromptExitRequestedError extends Error {
  constructor() {
    super("Prompt exited by user");
    this.name = "PromptExitRequestedError";
  }
}

const INSTALL_TARGETS = listInstallTargets().filter((target) => target.canWrite && target.status === "stable");

const CHECKBOX_THEME_WITH_QUIT_HINT = {
  style: {
    keysHelpTip: (keys: [string, string][]): string => {
      const entries = [...keys];
      if (!entries.some(([key]) => key.toLowerCase() === "q")) {
        entries.push(["q", "quit"]);
      }
      return entries.map(([key, action]) => `${pc.cyan(key)} ${action}`).join(pc.dim(" · "));
    }
  }
};

export async function runInstallFlowFromRecommendations(
  flags: CliFlags,
  recommendations: SkillRecommendation[],
  options: RecommendationInstallFlowOptions = {}
): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const config = await loadConfig(repoRoot);

  let selectedRecommendations: SkillRecommendation[] = [];
  try {
    selectedRecommendations = options.skipRecommendationSelection === true
      ? recommendations.filter((recommendation) => isRecommendationSelectable(recommendation, flags.allowRisky))
      : await chooseRecommendations(flags, recommendations);
  } catch (error) {
    if (error instanceof PromptExitRequestedError) {
      process.stdout.write(`${warningLine("Installation canceled.")}\n`);
      return;
    }
    throw error;
  }

  if (selectedRecommendations.length === 0) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ installSkipped: true, error: "No skills selected for installation." }, null, 2));
      process.stdout.write("\n");
    } else {
      process.stdout.write(`${warningLine("No skills selected for installation.")}\n`);
    }
    return;
  }

  let targets: InstallTarget[] = [];
  try {
    targets = await chooseInstallTargets(flags, config.defaultTargets, selectedRecommendations);
  } catch (error) {
    if (error instanceof PromptExitRequestedError) {
      process.stdout.write(`${warningLine("Installation canceled.")}\n`);
      return;
    }
    throw error;
  }

  if (targets.length === 0) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ installSkipped: true, error: "No coding assistant targets selected." }, null, 2));
      process.stdout.write("\n");
    } else {
      process.stdout.write(`${warningLine("No coding assistant targets selected. Installation canceled.")}\n`);
    }
    return;
  }

  const resolvedSkills = await resolveRecommendationBundles(selectedRecommendations, targets);
  await installResolvedSkills({
    repoRoot,
    flags,
    resolvedSkills,
    repoFacts: options.repoFacts,
    source: options.source ?? "recommendation",
    printHeader: options.printHeader
  });
}

async function chooseRecommendations(
  flags: CliFlags,
  recommendations: SkillRecommendation[]
): Promise<SkillRecommendation[]> {
  const selectable = recommendations.filter((recommendation) => isRecommendationSelectable(recommendation, flags.allowRisky));
  if (selectable.length === 0) {
    return [];
  }

  if (flags.allCompatible || flags.nonInteractive || flags.yes || flags.json) {
    return selectable;
  }

  const selectedIds = await runPromptWithQuitShortcut((context) =>
    checkbox<string>(
      {
        message: "Select skills to install (press q to quit)",
        theme: CHECKBOX_THEME_WITH_QUIT_HINT,
        choices: recommendations.map((recommendation, index) => {
          const disabled = resolveRecommendationDisabledReason(recommendation, flags.allowRisky);
          const shouldPrecheck = disabled === false && index < 2;
          return {
            name: formatChoiceLabel(recommendation),
            description: flags.compact ? undefined : formatRecommendationChoiceDescription(recommendation),
            value: recommendation.candidate.canonicalSkillId,
            checked: shouldPrecheck,
            disabled
          };
        })
      },
      context
    )
  );

  return selectable.filter((recommendation) => selectedIds.includes(recommendation.candidate.canonicalSkillId));
}

function isRecommendationSelectable(recommendation: SkillRecommendation, allowRisky: boolean): boolean {
  const status = resolveRecommendationStatus(recommendation);
  if (status === "eligible") return true;
  if (status === "risky" && allowRisky) return true;
  return false;
}

async function chooseInstallTargets(
  flags: CliFlags,
  defaultTargets: InstallTarget[],
  selectedRecommendations: SkillRecommendation[]
): Promise<InstallTarget[]> {
  const configuredTargets = dedupeInstallTargets(flags.target.length > 0 ? flags.target : defaultTargets);

  if (flags.target.length > 0 || flags.nonInteractive || flags.yes || flags.json) {
    return configuredTargets;
  }

  const compatibilityCountByTarget = new Map<InstallTarget, number>();
  for (const target of INSTALL_TARGETS) {
    const compatibleCount = selectedRecommendations.filter((recommendation) =>
      isCandidateCompatibleWithTarget(recommendation.candidate, target.id)
    ).length;
    compatibilityCountByTarget.set(target.id, compatibleCount);
  }

  const hasAnyCompatibleTarget = [...compatibilityCountByTarget.values()].some((count) => count > 0);
  if (!hasAnyCompatibleTarget) {
    return [];
  }

  const selectedTargets = await runPromptWithQuitShortcut((context) =>
    checkbox<InstallTarget>(
      {
        message: "Select coding assistant rules/skills to install (press q to quit)",
        theme: CHECKBOX_THEME_WITH_QUIT_HINT,
        choices: INSTALL_TARGETS.map((target) => {
          const compatibilityCount = compatibilityCountByTarget.get(target.id) ?? 0;
          return {
            name: `${pc.bold(target.displayName)} (${pc.dim(target.pathHint)}) ${pc.cyan(`[${compatibilityCount} compatible skills]`)}`,
            value: target.id,
            checked: configuredTargets.includes(target.id),
            disabled: compatibilityCount === 0 ? "No selected skills are compatible with this target" : false
          };
        })
      },
      context
    )
  );

  return dedupeInstallTargets(selectedTargets);
}

async function resolveRecommendationBundles(
  selected: SkillRecommendation[],
  selectedTargets: InstallTarget[]
): Promise<ResolvedSkill[]> {
  const providers = buildProviders([...new Set(selected.map((recommendation) => recommendation.candidate.source.providerId))]);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const resolved: ResolvedSkill[] = [];

  for (const recommendation of selected) {
    const candidate = recommendation.candidate;
    const provider = byId.get(candidate.source.providerId);
    if (!provider) {
      throw new Error(`Provider not configured for candidate: ${candidate.source.providerId}`);
    }

    const ref: SkillRef = {
      providerId: provider.id,
      skillId: candidate.providerSkillId,
      version: candidate.source.version
    };
    const bundle = await provider.fetchFiles(ref);
    const targets = selectedTargets.filter((target) => isCandidateCompatibleWithTarget(candidate, target));
    resolved.push({ bundle, targets });
  }

  return resolved;
}

function resolveRecommendationStatus(recommendation: SkillRecommendation): NonNullable<SkillRecommendation["status"]> {
  if (recommendation.status) {
    return recommendation.status;
  }
  return recommendation.blocked ? "blocked" : "eligible";
}

function resolveRecommendationDisabledReason(
  recommendation: SkillRecommendation,
  allowRisky: boolean
): string | false {
  const status = resolveRecommendationStatus(recommendation);
  if (status === "eligible") return false;
  if (status === "risky") {
    return allowRisky ? false : "Requires --allow-risky.";
  }
  if (status === "incompatible") {
    return recommendation.blockReasons?.[0] ?? "Incompatible with selected targets.";
  }
  if (recommendation.overrideable && !recommendation.hardBlocked && allowRisky) {
    return false;
  }
  if (recommendation.hardBlocked) {
    return recommendation.blockReasons?.[0] ?? "Hard-blocked by security policy.";
  }
  return recommendation.blockReasons?.[0] ?? "Blocked by security policy.";
}

function formatChoiceLabel(recommendation: SkillRecommendation): string {
  const status = resolveRecommendationStatus(recommendation);
  const statusLabel = colorPreliminaryRecommendationStatus(status);
  return `${pc.bold(recommendation.candidate.name)} (${pc.cyan(recommendation.candidate.source.providerId)}) `
    + `match=${colorScore(recommendation.score, { percent: true })} `
    + `pre-fetch-risk=${colorRisk(recommendation.candidate.risk.score, { percent: true })} `
    + `status=${statusLabel}`;
}

function colorPreliminaryRecommendationStatus(
  status: "eligible" | "risky" | "blocked" | "incompatible"
): string {
  const label = formatPreliminaryRecommendationStatus(status);
  if (status === "eligible") return pc.green(label);
  if (status === "risky") return pc.yellow(label);
  return pc.red(label);
}

function formatPreliminaryRecommendationStatus(
  status: "eligible" | "risky" | "blocked" | "incompatible"
): string {
  if (status === "eligible") return "PRELIMINARILY ELIGIBLE";
  if (status === "risky") return "PRELIMINARILY RISKY";
  if (status === "incompatible") return "PRELIMINARILY INCOMPATIBLE";
  return "PRELIMINARILY BLOCKED";
}

async function runPromptWithQuitShortcut<T>(runner: (context: { signal: AbortSignal }) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let quitPressed = false;

  const onData = (chunk: Buffer | string): void => {
    const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (raw.length === 1 && (raw === "q" || raw === "Q")) {
      quitPressed = true;
      controller.abort();
    }
  };

  process.stdin.on("data", onData);
  try {
    return await runner({ signal: controller.signal });
  } catch (error) {
    if (quitPressed || isPromptAbortError(error)) {
      throw new PromptExitRequestedError();
    }
    throw error;
  } finally {
    process.stdin.off("data", onData);
  }
}

function isPromptAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortPromptError" || error.name === "ExitPromptError";
}

function dedupeInstallTargets(targets: InstallTarget[]): InstallTarget[] {
  return [...new Set(targets)];
}
