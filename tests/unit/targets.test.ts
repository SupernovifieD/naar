import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS } from "../../src/config/defaults.js";
import { parseTargets } from "../../src/commands/shared.js";
import {
  getDefaultInstallTargets,
  isCandidateCompatibleWithTarget,
  listInstallTargets,
  resolveTargetAlias
} from "../../src/targets/index.js";
import type { AssistantId, SkillCandidate } from "../../src/types/index.js";

const TARGET_ORDER = [
  "claude_project_skills",
  "cursor_project_rules",
  "copilot_repo_instructions",
  "codex_repo_skills",
  "generic_agent_skills"
] as const;

describe("agent target registry", () => {
  it("resolves short aliases and full target ids", () => {
    expect(resolveTargetAlias("claude")).toBe("claude_project_skills");
    expect(resolveTargetAlias("cursor")).toBe("cursor_project_rules");
    expect(resolveTargetAlias("copilot")).toBe("copilot_repo_instructions");
    expect(resolveTargetAlias("codex")).toBe("codex_repo_skills");
    expect(resolveTargetAlias("generic")).toBe("generic_agent_skills");

    for (const target of TARGET_ORDER) {
      expect(resolveTargetAlias(target)).toBe(target);
    }
  });

  it("keeps CLI target parsing backward-compatible", () => {
    expect(parseTargets(["claude", "cursor", "unknown", "codex_repo_skills", "claude"])).toEqual([
      "claude_project_skills",
      "cursor_project_rules",
      "codex_repo_skills"
    ]);
  });

  it("preserves target order and default target set", () => {
    expect(listInstallTargets().map((target) => target.id)).toEqual([...TARGET_ORDER]);
    expect(getDefaultInstallTargets()).toEqual([
      "claude_project_skills",
      "cursor_project_rules",
      "copilot_repo_instructions",
      "codex_repo_skills"
    ]);
    expect(DEFAULT_TARGETS).toEqual(getDefaultInstallTargets());
  });

  it("keeps display labels and path hints centralized", () => {
    expect(listInstallTargets().map((target) => [target.displayName, target.pathHint])).toEqual([
      ["Claude Code project skills", ".claude/skills/"],
      ["Cursor rules", ".cursor/rules/"],
      ["GitHub Copilot instructions", ".github/copilot-instructions.md"],
      ["OpenAI Codex repo skills", ".agents/skills/"],
      ["Generic agent skills", ".agents/skills/"]
    ]);
  });

  it("uses registry compatibility metadata and keeps generic skills compatible with every target", () => {
    expect(isCandidateCompatibleWithTarget(makeCandidate(["claude"]), "claude_project_skills")).toBe(true);
    expect(isCandidateCompatibleWithTarget(makeCandidate(["claude"]), "cursor_project_rules")).toBe(false);

    for (const target of TARGET_ORDER) {
      expect(isCandidateCompatibleWithTarget(makeCandidate(["generic"]), target)).toBe(true);
    }
  });
});

function makeCandidate(assistants: AssistantId[]): SkillCandidate {
  return {
    providerSkillId: "example",
    canonicalSkillId: "example",
    name: "Example",
    source: { providerId: "test" },
    summary: "Example skill",
    tags: [],
    compatibility: { assistants },
    metadata: {},
    risk: { score: 100, level: "low", signals: [], requiresOverride: false }
  };
}
