import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { applyInstallPlan } from "../../src/installer/apply.js";
import { createInstallPlan } from "../../src/installer/plan.js";
import type { InstallTarget, SkillFetchedBundle } from "../../src/types/index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("createInstallPlan target rendering", () => {
  it("preserves install action paths for every existing target", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{
        bundle: makeBundle(),
        targets: [
          "claude_project_skills",
          "cursor_project_rules",
          "copilot_repo_instructions",
          "codex_repo_skills",
          "generic_agent_skills"
        ]
      }]
    });

    expect(plan.actions.map((action) => [action.type, action.path, action.overwrite])).toEqual([
      ["write", ".naar/skills/react-skill/SKILL.md", true],
      ["write", ".claude/skills/react-skill/SKILL.md", false],
      ["write", ".cursor/rules/naar-react-skill.mdc", false],
      ["append", ".github/copilot-instructions.md", undefined],
      ["write", ".agents/skills/react-skill/SKILL.md", false]
    ]);
    expect(plan.summary).toEqual({ filesToWrite: 4, filesToUpdate: 1, filesBlocked: 0 });
  });

  it.each([
    ["claude_project_skills", ".claude/skills/react-skill/SKILL.md", "write"],
    ["cursor_project_rules", ".cursor/rules/naar-react-skill.mdc", "write"],
    ["copilot_repo_instructions", ".github/copilot-instructions.md", "append"],
    ["codex_repo_skills", ".agents/skills/react-skill/SKILL.md", "write"],
    ["generic_agent_skills", ".agents/skills/react-skill/SKILL.md", "write"]
  ] as const)("renders %s without changing its output path", async (target, expectedPath, expectedType) => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{ bundle: makeBundle(), targets: [target] }]
    });

    const targetAction = plan.actions.find((action) => action.path !== ".naar/skills/react-skill/SKILL.md");
    expect(targetAction).toMatchObject({
      type: expectedType,
      path: expectedPath,
      sourceSkillId: "react-skill"
    });
  });

  it("preserves cursor rule and legacy Copilot managed block content", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{
        bundle: makeBundle(),
        targets: ["cursor_project_rules", "copilot_repo_instructions"]
      }]
    });

    const cursorRule = plan.actions.find((action) => action.path === ".cursor/rules/naar-react-skill.mdc");
    expect(cursorRule?.content).toContain("---\ndescription: React Skill\nalwaysApply: true\n---");
    expect(cursorRule?.content).toContain("# React Skill\n\nSummary text\n\n# React Skill\nBody");

    const copilotBlock = plan.actions.find((action) => action.path === ".github/copilot-instructions.md");
    expect(copilotBlock?.managedMarker).toBe("naar:skill:react-skill");
    expect(copilotBlock?.content).toContain("<!-- naar:skill:react-skill:start -->");
    expect(copilotBlock?.content).toContain("## Naar Skill: React Skill");
    expect(copilotBlock?.content).toContain("<!-- naar:skill:react-skill:end -->");
  });

  it("renders new skill-folder targets with full SKILL.md content", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{
        bundle: makeBundle(),
        targets: ["windsurf_workspace_skills", "cline_workspace_skills", "kiro_workspace_skills"]
      }]
    });

    expect(plan.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ".windsurf/skills/react-skill/SKILL.md", content: "# React Skill\nBody" }),
      expect.objectContaining({ path: ".cline/skills/react-skill/SKILL.md", content: "# React Skill\nBody" }),
      expect.objectContaining({ path: ".kiro/skills/react-skill/SKILL.md", content: "# React Skill\nBody" })
    ]));
  });

  it("renders concise rule/context targets without dumping full SKILL.md", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{
        bundle: makeBundle(),
        targets: ["windsurf_rules", "continue_rules", "kiro_steering", "copilot_path_instructions"]
      }]
    });

    for (const action of plan.actions.filter((action) => action.path !== ".naar/skills/react-skill/SKILL.md")) {
      expect(action.content).toContain("# Naar Skill: React Skill");
      expect(action.content).toContain("Summary text");
      expect(action.content).not.toContain("# React Skill\nBody");
    }
    expect(plan.actions.map((action) => action.path)).toEqual(expect.arrayContaining([
      ".windsurf/rules/naar-react-skill.md",
      ".continue/rules/naar-react-skill.md",
      ".kiro/steering/naar-react-skill.md",
      ".github/instructions/naar-react-skill.instructions.md"
    ]));
  });

  it("renders AGENTS.md managed block idempotently", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{ bundle: makeBundle(), targets: ["agents_md_standard"] }]
    });

    const agentsAction = plan.actions.find((action) => action.path === "AGENTS.md");
    expect(agentsAction?.managedMarker).toBe("naar:target:agents_md_standard:skill:react-skill");
    expect(agentsAction?.content).toContain("<!-- naar:target:agents_md_standard:skill:react-skill:start -->");
    expect(agentsAction?.content).not.toContain("# React Skill\nBody");

    await applyInstallPlan(repoRoot, plan);
    await applyInstallPlan(repoRoot, plan);
    const content = await readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
    expect(content.match(/naar:target:agents_md_standard:skill:react-skill:start/g)).toHaveLength(1);
  });

  it("does not render target-specific actions for research-only targets", async () => {
    const repoRoot = await makeTempRoot();
    const plan = await createInstallPlan({
      repoRoot,
      resolvedSkills: [{ bundle: makeBundle(), targets: ["trae_research"] }]
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].path).toBe(".naar/skills/react-skill/SKILL.md");
  });
});

async function makeTempRoot(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-plan-"));
  tempRoots.push(repoRoot);
  return repoRoot;
}

function makeBundle(): SkillFetchedBundle {
  return {
    skill: {
      providerSkillId: "react-skill",
      canonicalSkillId: "react-skill",
      name: "React Skill",
      source: { providerId: "test", version: "1.0.0" },
      summary: "Summary text",
      tags: [],
      compatibility: { assistants: ["claude", "cursor", "copilot", "codex", "generic"] },
      metadata: {},
      risk: { score: 100, level: "low", signals: [], requiresOverride: false }
    },
    files: {
      "SKILL.md": "# React Skill\nBody"
    }
  };
}
