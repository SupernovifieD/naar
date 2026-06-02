import type { InstallTarget } from "../types/index.js";
import type { AgentTargetDefinition } from "./types.js";

export const AGENT_TARGETS = {
  claude_project_skills: {
    id: "claude_project_skills",
    displayName: "Claude Code project skills",
    product: "Claude Code",
    aliases: ["claude"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".claude/skills/",
    detection: {
      exactPaths: ["CLAUDE.md", ".claude/CLAUDE.md"],
      pathPrefixes: [".claude/"]
    },
    compatibility: {
      assistantIds: ["claude"],
      acceptsGenericSkills: true
    }
  },
  cursor_project_rules: {
    id: "cursor_project_rules",
    displayName: "Cursor rules",
    product: "Cursor",
    aliases: ["cursor"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "rule",
    installStrategy: "write-rule-file",
    pathHint: ".cursor/rules/",
    detection: {
      exactPaths: [".cursorrules"],
      pathPrefixes: [".cursor/"]
    },
    compatibility: {
      assistantIds: ["cursor"],
      acceptsGenericSkills: true
    }
  },
  copilot_repo_instructions: {
    id: "copilot_repo_instructions",
    displayName: "GitHub Copilot instructions",
    product: "GitHub Copilot",
    aliases: ["copilot"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "instruction",
    installStrategy: "append-managed-block",
    pathHint: ".github/copilot-instructions.md",
    detection: {
      exactPaths: [".github/copilot-instructions.md"],
      globHints: [".github/instructions/*.instructions.md"]
    },
    compatibility: {
      assistantIds: ["copilot"],
      acceptsGenericSkills: true
    }
  },
  codex_repo_skills: {
    id: "codex_repo_skills",
    displayName: "OpenAI Codex repo skills",
    product: "OpenAI Codex",
    aliases: ["codex"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".agents/skills/",
    detection: {
      exactPaths: ["AGENTS.md"],
      pathPrefixes: [".codex/", ".agents/skills/"]
    },
    compatibility: {
      assistantIds: ["codex"],
      acceptsGenericSkills: true
    }
  },
  generic_agent_skills: {
    id: "generic_agent_skills",
    displayName: "Generic agent skills",
    product: "Generic Agent",
    aliases: ["generic"],
    status: "stable",
    enabledByDefault: false,
    artifactKind: "generic-skill",
    installStrategy: "write-skill-folder",
    pathHint: ".agents/skills/",
    detection: {
      pathPrefixes: [".agents/skills/"]
    },
    compatibility: {
      assistantIds: ["generic"],
      acceptsGenericSkills: true
    }
  }
} satisfies Record<InstallTarget, AgentTargetDefinition>;

export const AGENT_TARGET_ORDER = Object.keys(AGENT_TARGETS) as InstallTarget[];

export function listInstallTargets(): AgentTargetDefinition[] {
  return AGENT_TARGET_ORDER.map((target) => AGENT_TARGETS[target]);
}

export function getTargetById(target: InstallTarget): AgentTargetDefinition {
  return AGENT_TARGETS[target];
}

export function getEnabledTargets(): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.status !== "deprecated");
}

export function getDefaultInstallTargets(): InstallTarget[] {
  return listInstallTargets()
    .filter((target) => target.enabledByDefault)
    .map((target) => target.id);
}
