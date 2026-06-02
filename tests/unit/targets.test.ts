import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS } from "../../src/config/defaults.js";
import { parseTargets } from "../../src/commands/shared.js";
import {
  TARGET_GROUP_ALIASES,
  getDefaultInstallTargets,
  getResearchTargets,
  getTargetsByStatus,
  getWriteCapableTargets,
  isCandidateCompatibleWithTarget,
  listInstallTargets,
  resolveTargetAlias
} from "../../src/targets/index.js";
import type { AssistantId, SkillCandidate } from "../../src/types/index.js";

const EXISTING_TARGET_ORDER = [
  "claude_project_skills",
  "cursor_project_rules",
  "copilot_repo_instructions",
  "codex_repo_skills",
  "generic_agent_skills"
] as const;

describe("agent target registry", () => {
  it("resolves existing short aliases and full target ids", () => {
    expect(resolveTargetAlias("claude")).toBe("claude_project_skills");
    expect(resolveTargetAlias("cursor")).toBe("cursor_project_rules");
    expect(resolveTargetAlias("copilot")).toBe("copilot_repo_instructions");
    expect(resolveTargetAlias("codex")).toBe("codex_repo_skills");
    expect(resolveTargetAlias("generic")).toBe("generic_agent_skills");

    for (const target of EXISTING_TARGET_ORDER) {
      expect(resolveTargetAlias(target)).toBe(target);
    }
  });

  it("keeps CLI target parsing backward-compatible and expands group aliases", () => {
    expect(parseTargets(["claude", "cursor", "unknown", "codex_repo_skills", "claude"])).toEqual([
      "claude_project_skills",
      "cursor_project_rules",
      "codex_repo_skills"
    ]);
    expect(parseTargets(["agents-md"])).toEqual(["agents_md_standard"]);
    expect(parseTargets(["experimental"])).toEqual(TARGET_GROUP_ALIASES.experimental);
  });

  it("preserves existing target order prefix and default target set", () => {
    expect(listInstallTargets().map((target) => target.id).slice(0, 5)).toEqual([...EXISTING_TARGET_ORDER]);
    expect(getDefaultInstallTargets()).toEqual([
      "claude_project_skills",
      "cursor_project_rules",
      "copilot_repo_instructions",
      "codex_repo_skills"
    ]);
    expect(DEFAULT_TARGETS).toEqual(getDefaultInstallTargets());
  });

  it("validates target safety metadata", () => {
    for (const target of listInstallTargets()) {
      expect(target.id).toBeTruthy();
      expect(target.product).toBeTruthy();
      expect(target.artifactKind).toBeTruthy();
      expect(target.pathHint).toBeTruthy();
      expect(target.verificationStatus).toBeTruthy();
      expect(Array.isArray(target.scopeSupport)).toBe(true);
      if (target.canWrite) {
        expect(target.installStrategy).not.toBe("research-only");
        expect(target.documentationUrl || target.verificationStatus === "project-convention").toBeTruthy();
      }
      if (target.status === "research") {
        expect(target.canWrite).toBe(false);
        expect(target.installStrategy).toBe("research-only");
      }
    }
  });

  it("groups targets by safety status and artifact kind", () => {
    const all = TARGET_GROUP_ALIASES.all.map((target) => listInstallTargets().find((entry) => entry.id === target)!);
    expect(all.every((target) => target.canWrite && target.status !== "research" && target.status !== "deprecated")).toBe(true);
    expect(TARGET_GROUP_ALIASES.all).not.toContain("cursor_legacy_rules");
    expect(TARGET_GROUP_ALIASES.all).not.toContain("trae_research");

    const experimental = TARGET_GROUP_ALIASES.experimental.map((target) => listInstallTargets().find((entry) => entry.id === target)!);
    expect(experimental.length).toBeGreaterThan(0);
    expect(experimental.every((target) => target.status === "experimental" && target.canWrite)).toBe(true);

    const deprecated = TARGET_GROUP_ALIASES.deprecated.map((target) => listInstallTargets().find((entry) => entry.id === target)!);
    expect(deprecated.map((target) => target.id)).toEqual(["cursor_legacy_rules", "roo_legacy_rules"]);
    expect(deprecated.every((target) => target.status === "deprecated" && target.canWrite)).toBe(true);

    expect(TARGET_GROUP_ALIASES["all-skills"]).toContain("windsurf_workspace_skills");
    expect(TARGET_GROUP_ALIASES["all-skills"]).not.toContain("windsurf_rules");
    expect(TARGET_GROUP_ALIASES["all-rules"]).toContain("continue_rules");
    expect(TARGET_GROUP_ALIASES["all-rules"]).not.toContain("cursor_legacy_rules");
    expect(TARGET_GROUP_ALIASES["all-instructions"]).toEqual(expect.arrayContaining(["claude_project_memory", "gemini_context"]));
    expect(TARGET_GROUP_ALIASES.research).toEqual(getResearchTargets().map((target) => target.id));
  });

  it("uses registry compatibility metadata and keeps generic skills compatible with write-capable targets", () => {
    expect(isCandidateCompatibleWithTarget(makeCandidate(["claude"]), "claude_project_skills")).toBe(true);
    expect(isCandidateCompatibleWithTarget(makeCandidate(["claude"]), "cursor_project_rules")).toBe(false);

    for (const target of getWriteCapableTargets()) {
      expect(isCandidateCompatibleWithTarget(makeCandidate(["generic"]), target.id)).toBe(target.acceptsGenericSkills);
    }
    for (const target of getTargetsByStatus("research")) {
      expect(isCandidateCompatibleWithTarget(makeCandidate(["generic"]), target.id)).toBe(false);
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
