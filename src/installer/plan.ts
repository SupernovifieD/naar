import path from "node:path";
import { exists } from "../utils/fs.js";
import { toSlug } from "../utils/slug.js";
import type {
  InstallAction,
  InstallConflict,
  InstallPlan,
  InstallTarget,
  SkillFetchedBundle
} from "../types/index.js";
import { renderTargetInstallActions } from "../targets/index.js";

export interface ResolvedSkill {
  bundle: SkillFetchedBundle;
  targets: InstallTarget[];
}

interface CreatePlanOptions {
  repoRoot: string;
  resolvedSkills: ResolvedSkill[];
  force?: boolean;
}

export async function createInstallPlan(options: CreatePlanOptions): Promise<InstallPlan> {
  const actions: InstallAction[] = [];
  const conflicts: InstallConflict[] = [];
  const force = options.force ?? false;

  for (const resolved of options.resolvedSkills) {
    const { skill } = resolved.bundle;
    const slug = toSlug(skill.canonicalSkillId || skill.name);
    const skillMarkdown = resolved.bundle.files["SKILL.md"] ?? `# ${skill.name}\n`;

    actions.push({
      type: "write",
      path: `.naar/skills/${slug}/SKILL.md`,
      content: skillMarkdown,
      sourceSkillId: skill.canonicalSkillId,
      overwrite: true
    });

    for (const target of resolved.targets) {
      const targetActions = renderTargetInstallActions({
        targetId: target,
        slug,
        skillName: skill.name,
        skillSummary: skill.summary,
        skillMarkdown,
        sourceProviderId: skill.source.providerId
      });
      for (const action of targetActions) {
        action.sourceSkillId = skill.canonicalSkillId;
        actions.push(action);
      }
    }
  }

  const dedupedActions = dedupeActions(actions);

  for (const action of dedupedActions) {
    const fullPath = path.join(options.repoRoot, action.path);
    if (action.type === "write") {
      const fileExists = await exists(fullPath);
      if (fileExists && !action.overwrite && !force) {
        conflicts.push({
          path: action.path,
          reason: "Target file already exists and overwrite is not enabled."
        });
      }
    }
  }

  const summary = {
    filesToWrite: dedupedActions.filter((action) => action.type === "write").length,
    filesToUpdate: dedupedActions.filter((action) => action.type === "append").length,
    filesBlocked: conflicts.length
  };

  return {
    planId: `plan-${Date.now()}`,
    repoRoot: options.repoRoot,
    targets: [...new Set(options.resolvedSkills.flatMap((resolved) => resolved.targets))],
    actions: dedupedActions,
    conflicts,
    summary,
    requiresConfirmation: true
  };
}

function dedupeActions(actions: InstallAction[]): InstallAction[] {
  const map = new Map<string, InstallAction>();

  for (const action of actions) {
    const key =
      action.type === "append"
        ? `${action.type}:${action.path}:${action.sourceSkillId ?? "unknown"}`
        : `${action.type}:${action.path}`;
    if (map.has(key)) {
      const existing = map.get(key)!;
      if (existing.type === "append" && action.type === "append") {
        existing.content = `${existing.content ?? ""}${action.content ?? ""}`;
      }
      continue;
    }
    map.set(key, { ...action });
  }

  return [...map.values()];
}
