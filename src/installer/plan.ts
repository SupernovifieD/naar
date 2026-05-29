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
      const targetActions = buildTargetActions(target, slug, skill.name, skill.summary, skillMarkdown);
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

function buildTargetActions(
  target: InstallTarget,
  slug: string,
  skillName: string,
  skillSummary: string,
  skillMarkdown: string
): InstallAction[] {
  switch (target) {
    case "claude_project_skills":
      return [
        {
          type: "write",
          path: `.claude/skills/${slug}/SKILL.md`,
          content: skillMarkdown,
          overwrite: false
        }
      ];
    case "cursor_project_rules":
      return [
        {
          type: "write",
          path: `.cursor/rules/naar-${slug}.mdc`,
          content: buildCursorRule(skillName, skillSummary, skillMarkdown),
          overwrite: false
        }
      ];
    case "copilot_repo_instructions":
      return [
        {
          type: "append",
          path: `.github/copilot-instructions.md`,
          content: buildCopilotBlock(slug, skillName, skillSummary, skillMarkdown)
        }
      ];
    case "codex_repo_skills":
    case "generic_agent_skills":
      return [
        {
          type: "write",
          path: `.agents/skills/${slug}/SKILL.md`,
          content: skillMarkdown,
          overwrite: false
        }
      ];
    default:
      return [];
  }
}

function buildCursorRule(skillName: string, summary: string, markdown: string): string {
  return `---\ndescription: ${escapeYaml(skillName)}\nalwaysApply: true\n---\n\n# ${skillName}\n\n${summary}\n\n${markdown}`;
}

function buildCopilotBlock(slug: string, skillName: string, summary: string, markdown: string): string {
  return `\n<!-- naar:skill:${slug}:start -->\n## Naar Skill: ${skillName}\n${summary}\n\n${markdown}\n<!-- naar:skill:${slug}:end -->\n`;
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

function escapeYaml(input: string): string {
  return input.replace(/"/g, "'");
}
