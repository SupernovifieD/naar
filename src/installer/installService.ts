import path from "node:path";
import { confirm, input } from "@inquirer/prompts";
import ora from "ora";
import pc from "picocolors";
import type {
  CliFlags,
  InstallAction,
  InstallTarget,
  RepoFacts,
  SkillCandidate
} from "../types/index.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { applyInstallPlan } from "./apply.js";
import { createInstallPlan, type ResolvedSkill } from "./plan.js";
import {
  buildInstalledRecord,
  loadInstalledState,
  loadLockfile,
  saveInstalledState,
  saveLockfile,
  toProviderScopedId
} from "./state.js";
import { printJson } from "../utils/json.js";
import { toSlug } from "../utils/slug.js";
import {
  colorRisk,
  warningHeader,
  warningLine
} from "../utils/output.js";
import { analyzeSkill, evaluateInstallDecision, mergeSecuritySignals } from "../security/analyzeSkill.js";
import { analyzeSkillContent } from "../security/analyzeSkillContent.js";
import { getTargetById } from "../targets/index.js";
import { recordInstallHistory } from "../history/historyService.js";

export interface InstallResolvedSkillsOptions {
  repoRoot: string;
  flags: CliFlags;
  resolvedSkills: ResolvedSkill[];
  repoFacts?: RepoFacts;
  source: "direct" | "go" | "recommendation" | "search" | "plan";
  printHeader?: boolean;
}

class PromptExitRequestedError extends Error {
  constructor() {
    super("Prompt exited by user");
    this.name = "PromptExitRequestedError";
  }
}

const RISK_CONFIRMATION_TIMEOUT_MS = 60_000;
const DANGEROUS_RISK_CONFIRMATION_TIMEOUT_MS = 60_000;
const RISK_CONFIRMATION_MAX_ATTEMPTS = 3;

type FinalSecurityStatus = "eligible" | "risky" | "blocked" | "hard-blocked";

interface PostFetchSecurityEntry {
  skill: SkillCandidate;
  skillName: string;
  providerId: string;
  status: FinalSecurityStatus;
  decision: ReturnType<typeof evaluateInstallDecision>;
  risk: ReturnType<typeof analyzeSkill>;
}

export async function installResolvedSkills(options: InstallResolvedSkillsOptions): Promise<void> {
  const { repoRoot, flags, repoFacts } = options;
  const config = await loadConfig(repoRoot);
  const prechecked = await filterAlreadyInstalledSkills(repoRoot, flags, options.resolvedSkills);
  if (prechecked.resolvedSkills.length === 0) {
    if (flags.json) {
      printJson({
        repoRoot,
        installSkipped: true,
        error: "All requested skills are already installed.",
        skippedAlreadyInstalled: prechecked.skipped
      });
    } else {
      process.stdout.write(`${warningLine("All requested skills are already installed. Use --reinstall to install again.")}\n`);
    }
    return;
  }

  const resolvedWithWriteableTargets = filterWriteCapableResolvedSkills(prechecked.resolvedSkills, flags);
  const selectedTargets = dedupeInstallTargets(resolvedWithWriteableTargets.flatMap((resolved) => resolved.targets));
  if (selectedTargets.length === 0) {
    if (flags.json) {
      printJson({
        repoRoot,
        installSkipped: true,
        error: "No coding assistant targets selected.",
        hint: "Use --target <id> or configure defaults with naar config --set-target <id>."
      });
    } else {
      process.stdout.write(`${warningLine("No coding assistant targets selected. Installation canceled.")}\n`);
      process.stdout.write(`Use ${pc.cyan("--target <id>")} or configure defaults with ${pc.bold("naar config --set-target <id>")}.\n`);
    }
    return;
  }

  const broadTargetConfirmed = await confirmBroadTargetSelection(flags, selectedTargets);
  if (!broadTargetConfirmed) {
    return;
  }

  const spinner = flags.json ? null : ora("Preparing install plan").start();
  const resolvedSkills = resolvedWithWriteableTargets;

  const evaluatedAfterFetch: PostFetchSecurityEntry[] = resolvedSkills
    .map((resolved) => {
      const metadataRisk = analyzeSkill(resolved.bundle.skill);
      const contentSignals = analyzeSkillContent(resolved.bundle.files);
      const risk = mergeSecuritySignals(metadataRisk, contentSignals);
      resolved.bundle.skill.risk = risk;
      const decision = evaluateInstallDecision(risk, {
        minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
        noScripts: flags.noScripts,
        allowRisky: flags.allowRisky
      }, !!resolved.bundle.skill.metadata.hasScripts);

      return {
        skill: resolved.bundle.skill,
        skillName: resolved.bundle.skill.name,
        providerId: resolved.bundle.skill.source.providerId,
        status: decision.hardBlocked ? "hard-blocked" : decision.status,
        decision,
        risk
      };
    });

  const concerningAfterFetch = evaluatedAfterFetch
    .filter((entry) => entry.status !== "eligible");
  const hasBlockedOrHardBlocked = concerningAfterFetch
    .some((entry) => entry.status === "blocked" || entry.status === "hard-blocked");

  if (concerningAfterFetch.length > 0) {
    spinner?.stop();
    if (flags.json) {
      const canProceedNonInteractive = flags.apply && flags.allowRisky && flags.yes;
      if (!canProceedNonInteractive) {
        printJson({
          repoRoot,
          error: "Security review required before installation.",
          selectedSkills: resolvedSkills.map((resolved) => resolved.bundle.skill),
          installSkipped: true,
          installSkippedDueToMissingConfirmation: flags.apply === true,
          securityReview: buildSecurityReviewPayload(concerningAfterFetch)
        });
        return;
      }
    } else {
      renderSecurityReview(concerningAfterFetch, {
        printStepHeader: options.printHeader === true,
        hasBlockedOrHardBlocked
      });
    }

    if (flags.nonInteractive || flags.json) {
      const hasExplicitNonInteractiveOverride = flags.allowRisky && flags.yes;
      if (!hasExplicitNonInteractiveOverride) {
        if (!flags.json) {
          process.stderr.write(
            `${warningLine("Non-interactive security concerns require both --allow-risky and --yes. Installation canceled. No files were written.")}\n`
          );
        }
        return;
      }
      if (!flags.json) {
        process.stdout.write(`${warningLine("Proceeding with explicit non-interactive dangerous override (--allow-risky --yes).")}\n`);
      }
    } else {
      let continueInstall = false;
      try {
        continueInstall = await runPromptWithQuitShortcut((context) =>
          confirm(
            {
              message: hasBlockedOrHardBlocked
                ? "Continue with dangerous security override? (press q to quit)"
                : "Continue despite security concerns? (press q to quit)",
              default: false
            },
            context
          )
        );
      } catch (error) {
        if (error instanceof PromptExitRequestedError) {
          process.stdout.write(`${warningLine("Installation canceled. No files were written.")}\n`);
          return;
        }
        throw error;
      }

      if (!continueInstall) {
        process.stdout.write(`${warningLine("Installation canceled. No files were written.")}\n`);
        return;
      }

      const confirmed = await runRiskyInstallChallenge(concerningAfterFetch, {
        dangerousOverrideRequired: hasBlockedOrHardBlocked
      });
      if (!confirmed) {
        return;
      }
    }
  }

  const plan = await createInstallPlan({
    repoRoot,
    resolvedSkills,
    force: flags.force
  });
  spinner?.succeed("Install plan generated");

  if (flags.json) {
    printJson({
      repoRoot,
      selectedSkills: resolvedSkills.map((resolved) => resolved.bundle.skill),
      skippedAlreadyInstalled: prechecked.skipped.length > 0 ? prechecked.skipped : undefined,
      securityReview: concerningAfterFetch.length > 0
        ? buildSecurityReviewPayload(concerningAfterFetch)
        : undefined,
      installSkippedDueToMissingConfirmation: false,
      plan
    });
    if (!flags.apply) {
      return;
    }
  }

  if (options.printHeader && flags.json === false) {
    process.stdout.write(`${pc.bold("[5/5]")} Installation plan preview\n`);
  }

  const includePlanTitle = options.printHeader && flags.json === false ? false : true;
  renderPlanPreview(plan, includePlanTitle);

  if (plan.conflicts.length > 0 && !flags.force) {
    process.stderr.write(`\n${warningHeader("Conflicts")}: ${pc.yellow("Resolve manually or rerun with --force.")}\n`);
    for (const conflict of plan.conflicts) {
      process.stderr.write(`- ${pc.red(conflict.path)}: ${conflict.reason}\n`);
    }
    return;
  }

  if (flags.dryRun) {
    process.stdout.write(`\n${warningLine("Dry run enabled. No files were written.")}\n`);
    return;
  }

  if (flags.nonInteractive && !flags.apply && !flags.yes) {
    process.stderr.write(`${pc.red("Non-interactive mode requires --apply to perform writes.")}\n`);
    return;
  }

  let shouldWrite = flags.yes
    ? true
    : flags.nonInteractive
      ? flags.apply
      : false;

  if (!flags.yes && !flags.nonInteractive) {
    try {
      shouldWrite = await runPromptWithQuitShortcut((context) =>
        confirm(
          { message: "Proceed with installation? (press q to quit)", default: false },
          context
        )
      );
    } catch (error) {
      if (error instanceof PromptExitRequestedError) {
        process.stdout.write(`${warningLine("Installation canceled.")}\n`);
        return;
      }
      throw error;
    }
  }

  if (!shouldWrite) {
    process.stdout.write(`${warningLine("Installation canceled.")}\n`);
    return;
  }

  await applyInstallPlan(repoRoot, plan);
  await persistInstallationState(repoRoot, resolvedSkills, plan.actions);
  const historyWarning = await updateInstallHistoryBestEffort(
    flags,
    repoRoot,
    repoFacts,
    resolvedSkills
  );

  process.stdout.write(`\n${pc.green("✔ Installation complete.")}\n`);
  if (historyWarning) {
    if (flags.json) {
      printJson({ historyWarning });
    } else {
      process.stdout.write(`${warningLine(historyWarning)}\n`);
    }
  }
  renderInstallLocations(repoRoot, plan.actions);
  if (concerningAfterFetch.length > 0) {
    renderInstalledRiskSummary(concerningAfterFetch, plan.actions);
  }
  process.stdout.write(`${pc.cyan("Next")}: run ${pc.bold("naar list")} to review installed skills.\n`);

  // Keep config synced with explicit runtime flags when used.
  if (flags.target.length > 0 || flags.provider.length > 0 || flags.minSecurityScore !== config.minSecurityScore) {
    await saveConfig(repoRoot, {
      ...config,
      defaultProviders: flags.provider.length > 0 ? flags.provider : config.defaultProviders,
      defaultTargets: flags.target.length > 0 ? flags.target : config.defaultTargets,
      minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
      noScripts: flags.noScripts
    });
  }
}

function filterWriteCapableTargetsForInstall(targets: InstallTarget[], flags: CliFlags): InstallTarget[] {
  const writeableTargets = targets.filter((target) => getTargetById(target).canWrite);
  const skippedTargets = targets.filter((target) => !getTargetById(target).canWrite);

  if (skippedTargets.length > 0 && !flags.json) {
    process.stdout.write(
      `${warningLine(`Skipping non-writeable research targets: ${skippedTargets.join(", ")}.`)}\n`
    );
  }

  return dedupeInstallTargets(writeableTargets);
}

function filterWriteCapableResolvedSkills(resolvedSkills: ResolvedSkill[], flags: CliFlags): ResolvedSkill[] {
  return resolvedSkills.map((resolved) => ({
    ...resolved,
    targets: filterWriteCapableTargetsForInstall(resolved.targets, flags)
  }));
}

async function filterAlreadyInstalledSkills(
  repoRoot: string,
  flags: CliFlags,
  resolvedSkills: ResolvedSkill[]
): Promise<{
  resolvedSkills: ResolvedSkill[];
  skipped: Array<{ name: string; providerId: string; providerSkillId: string; canonicalSkillId: string }>;
}> {
  if (flags.reinstall) {
    return { resolvedSkills, skipped: [] };
  }

  const state = await loadInstalledState(repoRoot);
  const installedScopedIds = new Set(
    state.skills.map((skill) => skill.providerScopedId ?? toProviderScopedId(skill.providerId, skill.providerSkillId))
  );
  const remaining: ResolvedSkill[] = [];
  const skipped: Array<{ name: string; providerId: string; providerSkillId: string; canonicalSkillId: string }> = [];

  for (const resolved of resolvedSkills) {
    const skill = resolved.bundle.skill;
    const scopedId = skill.providerScopedId ?? toProviderScopedId(skill.source.providerId, skill.providerSkillId);
    if (installedScopedIds.has(scopedId)) {
      skipped.push({
        name: skill.name,
        providerId: skill.source.providerId,
        providerSkillId: skill.providerSkillId,
        canonicalSkillId: skill.canonicalSkillId
      });
      if (!flags.json) {
        process.stdout.write(`${pc.cyan(skill.canonicalSkillId)} ${pc.cyan(`[${skill.source.providerId}]`)} is already installed. Skipping.\n`);
      }
      continue;
    }
    remaining.push(resolved);
  }

  return { resolvedSkills: remaining, skipped };
}

async function confirmBroadTargetSelection(flags: CliFlags, targets: InstallTarget[]): Promise<boolean> {
  if (!flags.broadTargetSelection) return true;

  if (flags.nonInteractive || flags.json) {
    if (flags.yes) return true;
    if (flags.json) {
      printJson({
        installSkipped: true,
        error: "Broad target groups require --yes in non-interactive/json mode.",
        targets
      });
    } else {
      process.stdout.write(`${warningLine("Broad target groups require --yes in non-interactive mode. Installation canceled.")}\n`);
    }
    return false;
  }

  let confirmed = false;
  try {
    confirmed = await runPromptWithQuitShortcut((context) =>
      confirm(
        {
          message: `Install to ${targets.length} targets from a broad target group? (press q to quit)`,
          default: false
        },
        context
      )
    );
  } catch (error) {
    if (error instanceof PromptExitRequestedError) {
      process.stdout.write(`${warningLine("Installation canceled.")}\n`);
      return false;
    }
    throw error;
  }

  if (!confirmed) {
    process.stdout.write(`${warningLine("Installation canceled.")}\n`);
  }
  return confirmed;
}

function renderPlanPreview(
  plan: { actions: Array<{ type: string; path: string }>; summary: { filesToWrite: number; filesToUpdate: number; filesBlocked: number } },
  includeTitle = true
): void {
  if (includeTitle) {
    process.stdout.write(`\n${pc.bold("Installation plan preview")}:\n`);
  } else {
    process.stdout.write("\n");
  }

  for (const action of plan.actions) {
    const prefix = action.type === "append" ? pc.yellow("~") : pc.green("+");
    process.stdout.write(`  ${prefix} ${action.path}\n`);
  }
  process.stdout.write(
    `\n${pc.bold("Summary")}: write=${pc.green(String(plan.summary.filesToWrite))}, `
    + `update=${pc.yellow(String(plan.summary.filesToUpdate))}, blocked=${pc.red(String(plan.summary.filesBlocked))}\n`
  );
}

async function persistInstallationState(
  repoRoot: string,
  resolvedSkills: ResolvedSkill[],
  actions: InstallAction[]
): Promise<void> {
  const state = await loadInstalledState(repoRoot);
  const lock = await loadLockfile(repoRoot);

  for (const resolved of resolvedSkills) {
    const skill = resolved.bundle.skill;
    const scopedId = skill.providerScopedId ?? toProviderScopedId(skill.source.providerId, skill.providerSkillId);
    const slug = toSlug(skill.canonicalSkillId);
    const managedFiles = dedupe(
      actions
        .filter((action) => action.sourceSkillId === skill.canonicalSkillId)
        .map((action) => {
          if (action.type === "append") {
            return `${action.path}#${action.managedMarker ?? `naar:skill:${slug}`}`;
          }
          return action.path;
        })
    );

    state.skills = state.skills.filter((entry) => {
      const entryScopedId = entry.providerScopedId ?? toProviderScopedId(entry.providerId, entry.providerSkillId);
      return entryScopedId !== scopedId;
    });
    state.skills.push(buildInstalledRecord(skill, managedFiles, resolved.targets));

    lock.skills = lock.skills.filter((entry) => !(
      entry.providerId === skill.source.providerId
      && entry.providerSkillId === skill.providerSkillId
    ));
    lock.skills.push({
      canonicalSkillId: skill.canonicalSkillId,
      providerId: skill.source.providerId,
      providerSkillId: skill.providerSkillId,
      pinnedRef: skill.metadata.pinnedRef ?? skill.source.ref ?? "unversioned",
      installedVersion: skill.source.version ?? "unknown",
      installedAtIso: new Date().toISOString()
    });
  }

  await saveInstalledState(repoRoot, state);
  await saveLockfile(repoRoot, lock);
}

async function updateInstallHistoryBestEffort(
  flags: CliFlags,
  repoRoot: string,
  repoFacts: RepoFacts | undefined,
  resolvedSkills: ResolvedSkill[]
): Promise<string | undefined> {
  try {
    const state = await loadInstalledState(repoRoot);
    const selectedScopedIds = new Set(
      resolvedSkills.map((resolved) => {
        const skill = resolved.bundle.skill;
        return skill.providerScopedId ?? toProviderScopedId(skill.source.providerId, skill.providerSkillId);
      })
    );
    const installedSkills = state.skills.filter((skill) => {
      const scopedId = skill.providerScopedId ?? toProviderScopedId(skill.providerId, skill.providerSkillId);
      return selectedScopedIds.has(scopedId);
    });
    await recordInstallHistory({
      repoPath: repoRoot,
      repoFacts,
      currentInstalledSkills: state.skills,
      installedSkills,
      history: flags.history
    });
  } catch {
    return "Installed successfully, but Naar could not update local history.";
  }
  return undefined;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeInstallTargets(targets: InstallTarget[]): InstallTarget[] {
  return [...new Set(targets)];
}

function renderInstallLocations(repoRoot: string, actions: InstallAction[]): void {
  const locations = collectInstallLocations(repoRoot, actions);
  process.stdout.write(`${pc.bold("Install locations")}:\n`);
  for (const location of locations) {
    process.stdout.write(`- ${pc.dim(location)}\n`);
  }
  process.stdout.write("\n");
}

function collectInstallLocations(repoRoot: string, actions: InstallAction[]): string[] {
  const locations = new Set<string>();

  for (const action of actions) {
    if (action.type === "append") {
      locations.add(path.resolve(repoRoot, action.path));
      continue;
    }

    const directory = path.dirname(action.path);
    locations.add(path.resolve(repoRoot, directory));
  }

  locations.add(path.resolve(repoRoot, ".naar/installed.json"));
  locations.add(path.resolve(repoRoot, "naar.lock.json"));

  return [...locations].sort((left, right) => left.localeCompare(right));
}

function buildSecurityReviewPayload(concerningAfterFetch: PostFetchSecurityEntry[]): {
  hasConcerns: boolean;
  hasBlockedOrHardBlocked: boolean;
  skills: Array<{
    skillName: string;
    providerId: string;
    status: FinalSecurityStatus;
    hardBlocked: boolean;
    overrideable: boolean;
    reasons: string[];
    risk: PostFetchSecurityEntry["risk"];
    decisionDetails: PostFetchSecurityEntry["decision"]["details"];
  }>;
} {
  const hasBlockedOrHardBlocked = concerningAfterFetch
    .some((entry) => entry.status === "blocked" || entry.status === "hard-blocked");

  return {
    hasConcerns: concerningAfterFetch.length > 0,
    hasBlockedOrHardBlocked,
    skills: concerningAfterFetch.map((entry) => ({
      skillName: entry.skillName,
      providerId: entry.providerId,
      status: entry.status,
      hardBlocked: entry.decision.hardBlocked,
      overrideable: entry.decision.overrideable,
      reasons: sanitizeSecurityReasons(entry.decision.reasons).slice(0, 6),
      risk: {
        ...entry.risk,
        signals: entry.risk.signals.map((signal) => ({
          ...signal,
          evidence: (signal.evidence ?? []).slice(0, 3)
        }))
      },
      decisionDetails: entry.decision.details.slice(0, 12)
    }))
  };
}

function renderSecurityReview(
  concerningAfterFetch: PostFetchSecurityEntry[],
  options: {
    printStepHeader: boolean;
    hasBlockedOrHardBlocked: boolean;
  }
): void {
  if (options.printStepHeader) {
    process.stdout.write(`${pc.bold("[4/5]")} Security review\n\n`);
  }

  process.stdout.write(`${warningHeader("Security review required")}\n`);
  process.stdout.write("Naar found security concerns in the selected skill bundles.\n");
  process.stdout.write("No files have been written yet.\n\n");
  process.stdout.write(`${pc.bold("Selected risky skills")}:\n\n`);

  for (const [index, entry] of concerningAfterFetch.entries()) {
    process.stdout.write(
      `- ${pc.bold(entry.skillName)} ${pc.cyan(`[${entry.providerId}]`)}\n`
      + `  ${pc.blue("Status")}: ${formatFinalStatusForDisplay(entry.status)}\n`
      + `  ${pc.blue("Security Score")}: ${colorSecurityScore(entry.risk.score)}`
      + `   ${pc.blue("Risk")}: ${colorRisk(entry.risk.score, { percent: true })}`
      + `   ${pc.blue("Risk Level")}: ${colorSecurityLevel(entry.risk.level)}\n`
    );

    const reasons = sanitizeSecurityReasons(entry.decision.reasons).slice(0, 5);
    if (reasons.length > 0) {
      process.stdout.write(`  ${pc.blue("Reasons")}:\n`);
      for (const reason of reasons) {
        process.stdout.write(`  - ${colorSecurityReason(reason)}\n`);
      }
    }

    const signalLines = entry.risk.signals.slice(0, 5);
    let evidencePrinted = 0;
    for (const signal of signalLines) {
      process.stdout.write(
        `  ${pc.blue("Signal")}: ${pc.cyan(toDisplayLabel(signal.id))} `
        + `[${colorSignalSeverity(signal.severity)}] `
        + `${pc.white(capitalizeSentence(signal.detail))}\n`
      );
      const evidences = signal.evidence ?? [];
      for (const evidence of evidences) {
        if (evidencePrinted >= 3) break;
        process.stdout.write(`  ${pc.blue("Evidence")}: ${pc.white(formatSecurityEvidence(evidence))}\n`);
        evidencePrinted += 1;
      }
    }

    if (index < concerningAfterFetch.length - 1) {
      process.stdout.write("\n");
    }
  }

  process.stdout.write("\n");
  process.stdout.write("Installing these skills may expose your project, secrets, local environment, or AI assistant workflow to unsafe instructions.\n");
  if (options.hasBlockedOrHardBlocked) {
    process.stdout.write(`${warningLine("Blocked or hard-blocked skills require dangerous override confirmation.")}\n`);
  }
  process.stdout.write("You can continue with explicit confirmation or cancel installation.\n");
}

function renderInstalledRiskSummary(
  concerningAfterFetch: PostFetchSecurityEntry[],
  actions: InstallAction[]
): void {
  process.stdout.write(`\n${warningHeader("Risky skills were installed")}\n`);
  process.stdout.write("Please inspect installed files before using your AI assistant in this repository.\n\n");
  process.stdout.write(`${pc.bold("Installed risky skills")}:\n`);
  for (const entry of concerningAfterFetch) {
    const installedFiles = listInstalledFilesForSkill(actions, entry.skill.canonicalSkillId);
    process.stdout.write(
      `- ${pc.bold(entry.skillName)} ${pc.cyan(`[${entry.providerId}]`)}\n`
      + `  ${pc.blue("Status at install")}: ${formatFinalStatusForDisplay(entry.status)}\n`
      + `  ${pc.blue("Security Score")}: ${colorSecurityScore(entry.risk.score)}`
      + `   ${pc.blue("Risk")}: ${colorRisk(entry.risk.score, { percent: true })}\n`
    );
    if (installedFiles.length > 0) {
      process.stdout.write(`  ${pc.blue("Installed files")}:\n`);
      for (const filePath of installedFiles) {
        process.stdout.write(`  - ${pc.white(filePath)}\n`);
      }
    }
  }
  process.stdout.write("\n");
  process.stdout.write(`${pc.bold("Recommended next steps")}:\n`);
  process.stdout.write("- Review installed skill files.\n");
  process.stdout.write("- Check for shell commands, network calls, package installation instructions, API-key usage, and secret handling.\n");
  process.stdout.write("- Remove any skill you do not fully trust.\n");
}

function listInstalledFilesForSkill(actions: InstallAction[], canonicalSkillId: string): string[] {
  return dedupe(actions
    .filter((action) => action.sourceSkillId === canonicalSkillId)
    .map((action) => action.path))
    .sort((left, right) => left.localeCompare(right));
}

function sanitizeSecurityReasons(reasons: string[]): string[] {
  return reasons
    .map((reason) => reason.trim())
    .filter(Boolean)
    .filter((reason) => reason.includes("--allow-risky") === false);
}

async function runRiskyInstallChallenge(
  concerningAfterFetch: PostFetchSecurityEntry[],
  options: { dangerousOverrideRequired: boolean }
): Promise<boolean> {
  const timeoutMs = options.dangerousOverrideRequired
    ? DANGEROUS_RISK_CONFIRMATION_TIMEOUT_MS
    : RISK_CONFIRMATION_TIMEOUT_MS;
  process.stdout.write(`\n${warningHeader(options.dangerousOverrideRequired ? "Dangerous security override required" : "Security confirmation required")}\n`);
  if (options.dangerousOverrideRequired) {
    process.stdout.write("You are about to override blocked or hard-blocked security decisions.\n");
    process.stdout.write("Proceed only if you fully understand and accept the risk.\n");
  } else {
    process.stdout.write("You are about to install skills with explicit security risk overrides.\n");
  }
  process.stdout.write(
    `Type the confirmation code within ${Math.round(timeoutMs / 1000)} seconds to continue. `
    + `You have ${RISK_CONFIRMATION_MAX_ATTEMPTS} attempts.\n\n`
  );
  for (const entry of concerningAfterFetch) {
    process.stdout.write(
      `- ${pc.bold(entry.skillName)} ${pc.cyan(`[${entry.providerId}]`)}\n`
      + `  ${pc.blue("Status")}: ${formatFinalStatusForDisplay(entry.status)}`
      + `   ${pc.blue("Security Score")}: ${colorSecurityScore(entry.risk.score)}`
      + `   ${pc.blue("Risk")}: ${colorRisk(entry.risk.score, { percent: true })}`
      + `   ${pc.blue("Risk Level")}: ${colorSecurityLevel(entry.risk.level)}\n`
    );
    for (const reason of sanitizeSecurityReasons(entry.decision.reasons).slice(0, 3)) {
      process.stdout.write(`  - ${colorSecurityReason(reason)}\n`);
    }
  }

  for (let attempt = 1; attempt <= RISK_CONFIRMATION_MAX_ATTEMPTS; attempt += 1) {
    const confirmationCode = generateRiskConfirmationCode();
    process.stdout.write(`\nConfirmation code (${attempt}/${RISK_CONFIRMATION_MAX_ATTEMPTS}): ${pc.bold(pc.yellow(confirmationCode))}\n`);

    let timedOut = false;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);

    try {
      const value = await runPromptWithQuitShortcut(
        (context) => input(
          { message: `Type ${confirmationCode} to continue (press q to quit)` },
          { signal: AbortSignal.any([context.signal, timeoutController.signal]) }
        ),
        { abortAsExit: false }
      );

      if (value.trim() === confirmationCode) {
        process.stdout.write(`${pc.green("Security override confirmation accepted.")}\n`);
        return true;
      }

      if (attempt < RISK_CONFIRMATION_MAX_ATTEMPTS) {
        process.stdout.write(`${warningLine("Incorrect confirmation code. A new code has been generated.")}\n`);
        continue;
      }

      process.stdout.write(`${warningLine("Incorrect confirmation code. You failed all 3 attempts. Rerun the command to try again. No files were written.")}\n`);
      return false;
    } catch (error) {
      if (error instanceof PromptExitRequestedError) {
        process.stdout.write(`${warningLine("Installation canceled. No files were written.")}\n`);
        return false;
      }
      if (timedOut && isPromptAbortError(error)) {
        if (attempt < RISK_CONFIRMATION_MAX_ATTEMPTS) {
          process.stdout.write(`${warningLine("Security confirmation expired. A new code has been generated.")}\n`);
          continue;
        }
        process.stdout.write(`${warningLine("Security confirmation expired. You failed all 3 attempts. Rerun the command to try again. No files were written.")}\n`);
        return false;
      }
      if (isPromptAbortError(error)) {
        process.stdout.write(`${warningLine("Installation canceled. No files were written.")}\n`);
        return false;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  process.stdout.write(`${warningLine("You failed all 3 attempts. Rerun the command to try again. No files were written.")}\n`);
  return false;
}

function generateRiskConfirmationCode(): string {
  const value = Math.floor(Math.random() * 900) + 100;
  return `NR-${value}`;
}

async function runPromptWithQuitShortcut<T>(
  runner: (context: { signal: AbortSignal }) => Promise<T>,
  options: { abortAsExit?: boolean } = {}
): Promise<T> {
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
    if (quitPressed || (options.abortAsExit !== false && isPromptAbortError(error))) {
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

function formatSecurityEvidence(evidence: { path: string; line?: number; excerpt?: string }): string {
  const location = evidence.line ? `${evidence.path}:${evidence.line}` : evidence.path;
  if (!evidence.excerpt) {
    return location;
  }
  return `${location} \`${evidence.excerpt}\``;
}

function formatFinalStatusForDisplay(status: FinalSecurityStatus): string {
  if (status === "hard-blocked") {
    return `${colorFinalSecurityStatus(status)} ${pc.red("(dangerous override required)")}`;
  }
  return colorFinalSecurityStatus(status);
}

function colorFinalSecurityStatus(status: "eligible" | "risky" | "blocked" | "hard-blocked"): string {
  if (status === "eligible") return pc.green(status);
  if (status === "risky") return pc.yellow(status);
  return pc.red(status);
}

function colorSecurityScore(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label = `${clamped}/100`;
  if (clamped >= 80) return pc.green(label);
  if (clamped >= 60) return pc.yellow(label);
  return pc.red(label);
}

function colorSecurityLevel(level: string): string {
  if (level === "low") return pc.green(level);
  if (level === "medium") return pc.yellow(level);
  return pc.red(level);
}

function colorSignalSeverity(severity: string): string {
  const label = capitalizeSentence(severity);
  if (severity === "low") return pc.green(label);
  if (severity === "medium") return pc.yellow(label);
  return pc.red(label);
}

function colorSecurityReason(reason: string): string {
  if (reason.includes("--allow-risky")) {
    return `${pc.yellow("⚠ Use")} ${pc.cyan("--allow-risky")} ${pc.white("to explicitly acknowledge and install overrideable risky skills.")}`;
  }

  const signalReason = reason.match(/^([a-z0-9_/-]+)\s+\[([a-z]+)\]:\s+(.+)$/i);
  if (signalReason) {
    const [, signalId, severity, detail] = signalReason;
    return `${pc.cyan(toDisplayLabel(signalId))} [${colorSignalSeverity(severity.toLowerCase())}]: ${pc.white(capitalizeSentence(detail))}`;
  }

  if (reason.toLowerCase().includes("hard block")) {
    return pc.red(capitalizeSentence(reason));
  }
  if (reason.toLowerCase().includes("exceeds required threshold")) {
    return pc.yellow(capitalizeSentence(reason));
  }
  return pc.white(capitalizeSentence(reason));
}

function toDisplayLabel(value: string): string {
  const withSpaces = value.replace(/[_-]+/g, " ").trim();
  return withSpaces
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function capitalizeSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
