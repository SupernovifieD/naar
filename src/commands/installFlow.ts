import path from "node:path";
import { checkbox, confirm } from "@inquirer/prompts";
import ora from "ora";
import pc from "picocolors";
import { readFile } from "node:fs/promises";
import type {
  CliFlags,
  InstallAction,
  InstallTarget,
  SkillCandidate,
  SkillRecommendation,
  SkillRef
} from "../types/index.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { applyInstallPlan } from "../installer/apply.js";
import { createInstallPlan, type ResolvedSkill } from "../installer/plan.js";
import {
  buildInstalledRecord,
  loadInstalledState,
  loadLockfile,
  saveInstalledState,
  saveLockfile,
  toProviderScopedId
} from "../installer/state.js";
import { buildProviders } from "../providers/orchestrator.js";
import { printJson } from "../utils/json.js";
import { buildRecommendations, loadOrBuildRecommendations } from "./pipeline.js";
import { resolveRepoRoot } from "./shared.js";
import { toSlug } from "../utils/slug.js";
import { colorRisk, colorScore, warningHeader, warningLine } from "../utils/output.js";
import { analyzeSkill, isInstallAllowed } from "../security/analyzeSkill.js";

export interface InstallFlowOptions {
  forceFreshRecommendations?: boolean;
  printHeader?: boolean;
}

const INSTALL_TARGET_ORDER: InstallTarget[] = [
  "claude_project_skills",
  "cursor_project_rules",
  "copilot_repo_instructions",
  "codex_repo_skills",
  "generic_agent_skills"
];

const INSTALL_TARGET_LABELS: Record<InstallTarget, { name: string; pathHint: string }> = {
  claude_project_skills: {
    name: "Claude Code project skills",
    pathHint: ".claude/skills/"
  },
  cursor_project_rules: {
    name: "Cursor rules",
    pathHint: ".cursor/rules/"
  },
  copilot_repo_instructions: {
    name: "GitHub Copilot instructions",
    pathHint: ".github/copilot-instructions.md"
  },
  codex_repo_skills: {
    name: "OpenAI Codex repo skills",
    pathHint: ".agents/skills/"
  },
  generic_agent_skills: {
    name: "Generic agent skills",
    pathHint: ".agents/skills/"
  }
};

export async function runInstallFlow(flags: CliFlags, flowOptions: InstallFlowOptions = {}): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const config = await loadConfig(repoRoot);

  const pipeline = flowOptions.forceFreshRecommendations
    ? await buildRecommendations(repoRoot, flags)
    : await loadOrBuildRecommendations(repoRoot, flags);

  const recommendations = pipeline.recommendations;
  const selectedRecommendations = await chooseRecommendations(flags, recommendations);

  if (selectedRecommendations.length === 0) {
    process.stdout.write(`${warningLine("No skills selected for installation.")}\n`);
    return;
  }

  const targets = await chooseInstallTargets(flags, config.defaultTargets, selectedRecommendations);
  if (targets.length === 0) {
    process.stdout.write(`${warningLine("No coding assistant targets selected. Installation canceled.")}\n`);
    return;
  }

  const spinner = flags.json ? null : ora("Preparing install plan").start();
  const resolvedSkills = await resolveBundles(selectedRecommendations, targets);

  const blockedAfterFetch = resolvedSkills
    .map((resolved) => {
      const risk = analyzeSkill(resolved.bundle.skill);
      resolved.bundle.skill.risk = risk;
      const allowed = isInstallAllowed(risk, {
        minSecurityScore: flags.minSecurityScore || config.minSecurityScore,
        noScripts: flags.noScripts
      }, !!resolved.bundle.skill.metadata.hasScripts);

      return {
        skillName: resolved.bundle.skill.name,
        allowed,
        risk
      };
    })
    .filter((entry) => !entry.allowed.allowed);

  if (blockedAfterFetch.length > 0) {
    spinner?.stop();
    process.stderr.write(`${warningHeader("Security")}: fetched bundles failed policy checks.\n`);
    for (const entry of blockedAfterFetch) {
      process.stderr.write(
        `- ${entry.skillName} risk=${colorRisk(entry.risk.score, { percent: true })} reason=${entry.allowed.reasons.join("; ")}\n`
      );
    }
    return;
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
      selectedSkills: selectedRecommendations.map((recommendation) => recommendation.candidate),
      plan
    });
    if (!flags.apply) {
      return;
    }
  }

  if (flowOptions.printHeader && flags.json === false) {
    process.stdout.write(`${pc.bold("[5/5]")} Installation plan preview\n`);
  }

  const includePlanTitle = flowOptions.printHeader && flags.json === false ? false : true;
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

  const shouldWrite = flags.yes
    ? true
    : flags.nonInteractive
      ? flags.apply
      : await confirm({ message: "Proceed with installation?", default: false });

  if (!shouldWrite) {
    process.stdout.write(`${warningLine("Installation canceled.")}\n`);
    return;
  }

  await applyInstallPlan(repoRoot, plan);
  await persistInstallationState(repoRoot, resolvedSkills, plan.actions);

  process.stdout.write(`\n${pc.green("✔ Installation complete.")}\n`);
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

async function chooseRecommendations(
  flags: CliFlags,
  recommendations: SkillRecommendation[]
): Promise<SkillRecommendation[]> {
  if (flags.from) {
    const match = selectFromReference(flags.from, recommendations);
    return match ? [match] : [];
  }

  if (flags.fromPlan) {
    const requested = await readPlanSelections(flags.fromPlan);
    return recommendations.filter((recommendation) =>
      requested.includes(recommendation.candidate.canonicalSkillId)
      || requested.includes(recommendation.candidate.providerSkillId)
    );
  }

  const eligible = recommendations.filter((recommendation) => !recommendation.blocked);
  if (eligible.length === 0) {
    return [];
  }

  if (flags.allCompatible || flags.nonInteractive || flags.yes || flags.json) {
    return eligible;
  }

  const selectedIds = await checkbox<string>({
    message: "Select skills to install",
    choices: eligible.map((recommendation, index) => ({
      name: formatChoiceLabel(recommendation),
      value: recommendation.candidate.canonicalSkillId,
      checked: index < 2
    }))
  });

  return eligible.filter((recommendation) => selectedIds.includes(recommendation.candidate.canonicalSkillId));
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
  for (const target of INSTALL_TARGET_ORDER) {
    const compatibleCount = selectedRecommendations.filter((recommendation) =>
      targetCompatible(recommendation.candidate, target)
    ).length;
    compatibilityCountByTarget.set(target, compatibleCount);
  }

  const hasAnyCompatibleTarget = [...compatibilityCountByTarget.values()].some((count) => count > 0);
  if (!hasAnyCompatibleTarget) {
    return [];
  }

  const selectedTargets = await checkbox<InstallTarget>({
    message: "Select coding assistant rules/skills to install",
    choices: INSTALL_TARGET_ORDER.map((target) => {
      const compatibilityCount = compatibilityCountByTarget.get(target) ?? 0;
      const targetLabel = INSTALL_TARGET_LABELS[target];
      return {
        name: `${pc.bold(targetLabel.name)} (${pc.dim(targetLabel.pathHint)}) ${pc.cyan(`[${compatibilityCount} compatible skills]`)}`,
        value: target,
        checked: configuredTargets.includes(target),
        disabled: compatibilityCount === 0 ? "No selected skills are compatible with this target" : false
      };
    })
  });

  return dedupeInstallTargets(selectedTargets);
}

function selectFromReference(
  fromRef: string,
  recommendations: SkillRecommendation[]
): SkillRecommendation | undefined {
  const [providerAndSkill] = fromRef.split("@");
  const [providerId, skillId] = providerAndSkill.includes(":")
    ? providerAndSkill.split(":", 2)
    : ["", providerAndSkill];

  return recommendations.find((recommendation) => {
    const candidate = recommendation.candidate;
    if (providerId && candidate.source.providerId !== providerId) return false;
    return candidate.providerSkillId === skillId
      || candidate.canonicalSkillId === skillId
      || candidate.providerSkillId.endsWith(`/${skillId}`);
  });
}

async function readPlanSelections(filePath: string): Promise<string[]> {
  const raw = await readFile(path.resolve(filePath), "utf8");
  const parsed = JSON.parse(raw) as { skills?: Array<string | { id?: string; skillId?: string; canonicalSkillId?: string }> };
  const skills = parsed.skills ?? [];
  const ids: string[] = [];

  for (const skill of skills) {
    if (typeof skill === "string") ids.push(skill);
    if (typeof skill === "object") {
      if (skill.id) ids.push(skill.id);
      if (skill.skillId) ids.push(skill.skillId);
      if (skill.canonicalSkillId) ids.push(skill.canonicalSkillId);
    }
  }

  return ids;
}

async function resolveBundles(
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
    const targets = selectedTargets.filter((target) => targetCompatible(candidate, target));
    resolved.push({ bundle, targets });
  }

  return resolved;
}

function targetCompatible(candidate: SkillCandidate, target: InstallTarget): boolean {
  const mapping: Record<InstallTarget, string> = {
    claude_project_skills: "claude",
    cursor_project_rules: "cursor",
    copilot_repo_instructions: "copilot",
    codex_repo_skills: "codex",
    generic_agent_skills: "generic"
  };

  const assistant = mapping[target];
  return candidate.compatibility.assistants.includes(assistant as never) || candidate.compatibility.assistants.includes("generic");
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
          if (action.type === "append" && action.path === ".github/copilot-instructions.md") {
            return `${action.path}#naar:skill:${slug}`;
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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeInstallTargets(targets: InstallTarget[]): InstallTarget[] {
  return [...new Set(targets)];
}

function formatChoiceLabel(recommendation: SkillRecommendation): string {
  return `${pc.bold(recommendation.candidate.name)} (${pc.cyan(recommendation.candidate.source.providerId)}) `
    + `score=${colorScore(recommendation.score, { percent: true })} risk=${colorRisk(recommendation.candidate.risk.score, { percent: true })}`;
}
