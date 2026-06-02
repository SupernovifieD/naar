import type { AssistantId, InstallTarget } from "../types/index.js";
import type { AgentArtifactKind, AgentTargetDefinition, InstallStrategy, TargetStatus, TargetVerificationStatus } from "./types.js";

type TargetInput = Omit<AgentTargetDefinition, "enabledByDefault" | "canWrite" | "scopeSupport" | "supportsBundledFiles" | "supportsManagedBlocks" | "supportsPathScopedRules" | "supportsModeSpecificRules" | "acceptsGenericSkills" | "acceptsAgentsMd" | "compatibility" | "detection" | "verificationStatus"> & {
  enabledByDefault?: boolean;
  canWrite?: boolean;
  verificationStatus?: TargetVerificationStatus;
  assistantIds: AssistantId[];
  acceptsGenericSkills?: boolean;
  acceptsAgentsMd?: boolean;
  scopeSupport?: AgentTargetDefinition["scopeSupport"];
  supportsBundledFiles?: boolean;
  supportsManagedBlocks?: boolean;
  supportsPathScopedRules?: boolean;
  supportsModeSpecificRules?: boolean;
  detection?: AgentTargetDefinition["detection"];
};

function target(input: TargetInput): AgentTargetDefinition {
  const canWrite = input.canWrite ?? input.status !== "research";
  const acceptsGenericSkills = input.acceptsGenericSkills ?? canWrite;
  return {
    ...input,
    enabledByDefault: input.enabledByDefault ?? false,
    canWrite,
    verificationStatus: input.verificationStatus ?? (input.status === "research" ? "research-unverified" : "verified-docs"),
    scopeSupport: input.scopeSupport ?? ["repo"],
    supportsBundledFiles: input.supportsBundledFiles ?? (input.artifactKind === "skill" || input.artifactKind === "generic-skill"),
    supportsManagedBlocks: input.supportsManagedBlocks ?? input.installStrategy === "append-managed-block",
    supportsPathScopedRules: input.supportsPathScopedRules ?? false,
    supportsModeSpecificRules: input.supportsModeSpecificRules ?? false,
    acceptsGenericSkills,
    acceptsAgentsMd: input.acceptsAgentsMd ?? false,
    detection: input.detection ?? {},
    compatibility: {
      assistantIds: input.assistantIds,
      acceptsGenericSkills
    }
  };
}

function researchTarget(input: {
  id: InstallTarget;
  displayName: string;
  product: string;
  aliases: string[];
  assistantIds: AssistantId[];
  pathHint?: string;
  documentationUrl?: string;
  detection?: AgentTargetDefinition["detection"];
  acceptsAgentsMd?: boolean;
  notes?: string[];
}): AgentTargetDefinition {
  return target({
    id: input.id,
    displayName: input.displayName,
    product: input.product,
    aliases: input.aliases,
    status: "research",
    canWrite: false,
    artifactKind: "unknown",
    installStrategy: "research-only",
    pathHint: input.pathHint ?? "Research only",
    documentationUrl: input.documentationUrl,
    verificationStatus: "research-unverified",
    assistantIds: input.assistantIds,
    acceptsGenericSkills: false,
    acceptsAgentsMd: input.acceptsAgentsMd ?? false,
    supportsBundledFiles: false,
    detection: input.detection,
    notes: input.notes
  });
}

const DOCS = {
  claudeMemory: "https://docs.anthropic.com/en/docs/claude-code/memory",
  claudeSkills: "https://docs.anthropic.com/en/docs/claude-code/skills",
  cursorRules: "https://docs.cursor.com/en/context/rules",
  copilotInstructions: "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions",
  codexSkills: "https://developers.openai.com/codex/skills",
  geminiMd: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md",
  windsurfMemories: "https://docs.windsurf.com/windsurf/cascade/memories",
  windsurfSkills: "https://docs.windsurf.com/windsurf/cascade/skills",
  clineRules: "https://docs.cline.bot/customization/cline-rules",
  clineSkills: "https://docs.cline.bot/customization/skills",
  rooRules: "https://roocodeinc.github.io/Roo-Code/features/custom-instructions",
  continueRules: "https://docs.continue.dev/customize/deep-dives/rules",
  kiroSteering: "https://kiro.dev/docs/steering/",
  kiroSkills: "https://kiro.dev/docs/cli/skills/",
  agentsMd: "https://agents.md/"
} as const;

export const AGENT_TARGETS = {
  claude_project_skills: target({
    id: "claude_project_skills",
    displayName: "Claude Code project skills",
    product: "Claude Code",
    aliases: ["claude"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".claude/skills/",
    installPathTemplate: ".claude/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.claudeSkills,
    assistantIds: ["claude"],
    detection: {
      exactPaths: ["CLAUDE.md", ".claude/CLAUDE.md"],
      pathPrefixes: [".claude/"]
    }
  }),
  cursor_project_rules: target({
    id: "cursor_project_rules",
    displayName: "Cursor rules",
    product: "Cursor",
    aliases: ["cursor"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "rule",
    installStrategy: "write-rule-file",
    pathHint: ".cursor/rules/",
    installPathTemplate: ".cursor/rules/naar-{slug}.mdc",
    documentationUrl: DOCS.cursorRules,
    assistantIds: ["cursor"],
    supportsPathScopedRules: true,
    detection: {
      pathPrefixes: [".cursor/rules/"]
    }
  }),
  copilot_repo_instructions: target({
    id: "copilot_repo_instructions",
    displayName: "GitHub Copilot instructions",
    product: "GitHub Copilot",
    aliases: ["copilot"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "instruction",
    installStrategy: "append-managed-block",
    pathHint: ".github/copilot-instructions.md",
    installPathTemplate: ".github/copilot-instructions.md",
    documentationUrl: DOCS.copilotInstructions,
    assistantIds: ["copilot"],
    supportsBundledFiles: false,
    detection: {
      exactPaths: [".github/copilot-instructions.md"],
      globHints: [".github/instructions/*.instructions.md"]
    }
  }),
  codex_repo_skills: target({
    id: "codex_repo_skills",
    displayName: "OpenAI Codex repo skills",
    product: "OpenAI Codex",
    aliases: ["codex"],
    status: "stable",
    enabledByDefault: true,
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".agents/skills/",
    installPathTemplate: ".agents/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.codexSkills,
    assistantIds: ["codex"],
    acceptsAgentsMd: true,
    detection: {
      exactPaths: ["AGENTS.md"],
      pathPrefixes: [".codex/", ".agents/skills/"]
    }
  }),
  generic_agent_skills: target({
    id: "generic_agent_skills",
    displayName: "Generic agent skills",
    product: "Generic Agent",
    aliases: ["generic"],
    status: "stable",
    artifactKind: "generic-skill",
    installStrategy: "write-skill-folder",
    pathHint: ".agents/skills/",
    installPathTemplate: ".agents/skills/{slug}/SKILL.md",
    verificationStatus: "project-convention",
    assistantIds: ["generic"],
    detection: {
      pathPrefixes: [".agents/skills/"]
    }
  }),
  claude_project_memory: target({
    id: "claude_project_memory",
    displayName: "Claude Code project memory",
    product: "Claude Code",
    aliases: ["claude-memory"],
    status: "stable",
    artifactKind: "context",
    installStrategy: "append-managed-block",
    pathHint: "CLAUDE.md",
    installPathTemplate: "CLAUDE.md",
    documentationUrl: DOCS.claudeMemory,
    assistantIds: ["claude"],
    supportsBundledFiles: false,
    detection: {
      exactPaths: ["CLAUDE.md", ".claude/CLAUDE.md"]
    }
  }),
  copilot_path_instructions: target({
    id: "copilot_path_instructions",
    displayName: "GitHub Copilot path instructions",
    product: "GitHub Copilot",
    aliases: ["copilot-path"],
    status: "stable",
    artifactKind: "instruction",
    installStrategy: "write-concise-file",
    pathHint: ".github/instructions/",
    installPathTemplate: ".github/instructions/naar-{slug}.instructions.md",
    documentationUrl: DOCS.copilotInstructions,
    assistantIds: ["copilot"],
    supportsBundledFiles: false,
    supportsPathScopedRules: true,
    detection: {
      globHints: [".github/instructions/*.instructions.md"]
    }
  }),
  gemini_context: target({
    id: "gemini_context",
    displayName: "Gemini CLI context",
    product: "Gemini CLI",
    aliases: ["gemini", "gemini-context"],
    status: "stable",
    artifactKind: "context",
    installStrategy: "append-managed-block",
    pathHint: "GEMINI.md",
    installPathTemplate: "GEMINI.md",
    documentationUrl: DOCS.geminiMd,
    assistantIds: ["gemini"],
    supportsBundledFiles: false,
    detection: {
      exactPaths: ["GEMINI.md", ".gemini/settings.json"],
      pathPrefixes: [".gemini/"]
    }
  }),
  agents_md_standard: target({
    id: "agents_md_standard",
    displayName: "AGENTS.md standard instructions",
    product: "AGENTS.md",
    aliases: ["agents-md", "agents"],
    status: "stable",
    artifactKind: "agents-md",
    installStrategy: "append-managed-block",
    pathHint: "AGENTS.md",
    installPathTemplate: "AGENTS.md",
    documentationUrl: DOCS.agentsMd,
    assistantIds: ["agents-md"],
    supportsBundledFiles: false,
    acceptsAgentsMd: true,
    detection: {
      exactPaths: ["AGENTS.md"]
    }
  }),
  windsurf_workspace_skills: target({
    id: "windsurf_workspace_skills",
    displayName: "Windsurf workspace skills",
    product: "Windsurf",
    aliases: ["windsurf-skills"],
    status: "experimental",
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".windsurf/skills/",
    installPathTemplate: ".windsurf/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.windsurfSkills,
    assistantIds: ["windsurf"],
    scopeSupport: ["workspace"],
    detection: {
      pathPrefixes: [".windsurf/skills/"]
    }
  }),
  windsurf_agents_skills: target({
    id: "windsurf_agents_skills",
    displayName: "Windsurf .agents skills",
    product: "Windsurf",
    aliases: ["windsurf-agents-skills"],
    status: "experimental",
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".agents/skills/",
    installPathTemplate: ".agents/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.windsurfSkills,
    assistantIds: ["windsurf"],
    acceptsAgentsMd: true,
    detection: {
      pathPrefixes: [".agents/skills/"]
    }
  }),
  windsurf_rules: target({
    id: "windsurf_rules",
    displayName: "Windsurf rules",
    product: "Windsurf",
    aliases: ["windsurf"],
    status: "experimental",
    artifactKind: "rule",
    installStrategy: "write-concise-file",
    pathHint: ".windsurf/rules/",
    installPathTemplate: ".windsurf/rules/naar-{slug}.md",
    documentationUrl: DOCS.windsurfMemories,
    assistantIds: ["windsurf"],
    supportsBundledFiles: false,
    detection: {
      pathPrefixes: [".windsurf/rules/"]
    }
  }),
  cline_workspace_skills: target({
    id: "cline_workspace_skills",
    displayName: "Cline workspace skills",
    product: "Cline",
    aliases: ["cline-skills"],
    status: "experimental",
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".cline/skills/",
    installPathTemplate: ".cline/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.clineSkills,
    assistantIds: ["cline"],
    scopeSupport: ["workspace"],
    detection: {
      pathPrefixes: [".cline/skills/"]
    }
  }),
  cline_clinerules_skills: target({
    id: "cline_clinerules_skills",
    displayName: "Cline .clinerules skills",
    product: "Cline",
    aliases: ["cline-rules-skills"],
    status: "experimental",
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".clinerules/skills/",
    installPathTemplate: ".clinerules/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.clineSkills,
    assistantIds: ["cline"],
    detection: {
      pathPrefixes: [".clinerules/skills/"]
    }
  }),
  cline_rules: target({
    id: "cline_rules",
    displayName: "Cline rules",
    product: "Cline",
    aliases: ["cline"],
    status: "experimental",
    artifactKind: "rule",
    installStrategy: "write-concise-file",
    pathHint: ".clinerules/",
    installPathTemplate: ".clinerules/naar-{slug}.md",
    documentationUrl: DOCS.clineRules,
    assistantIds: ["cline"],
    supportsBundledFiles: false,
    detection: {
      pathPrefixes: [".clinerules/"]
    }
  }),
  roo_rules: target({
    id: "roo_rules",
    displayName: "Roo Code rules",
    product: "Roo Code",
    aliases: ["roo"],
    status: "experimental",
    artifactKind: "rule",
    installStrategy: "write-concise-file",
    pathHint: ".roo/rules/",
    installPathTemplate: ".roo/rules/naar-{slug}.md",
    documentationUrl: DOCS.rooRules,
    assistantIds: ["roo"],
    supportsBundledFiles: false,
    supportsModeSpecificRules: true,
    detection: {
      pathPrefixes: [".roo/rules/"],
      globHints: [".roo/rules-*/*.md"]
    }
  }),
  continue_rules: target({
    id: "continue_rules",
    displayName: "Continue rules",
    product: "Continue",
    aliases: ["continue"],
    status: "experimental",
    artifactKind: "rule",
    installStrategy: "write-concise-file",
    pathHint: ".continue/rules/",
    installPathTemplate: ".continue/rules/naar-{slug}.md",
    documentationUrl: DOCS.continueRules,
    assistantIds: ["continue"],
    supportsBundledFiles: false,
    detection: {
      pathPrefixes: [".continue/rules/"]
    }
  }),
  kiro_workspace_skills: target({
    id: "kiro_workspace_skills",
    displayName: "Kiro workspace skills",
    product: "Kiro",
    aliases: ["kiro-skills"],
    status: "experimental",
    artifactKind: "skill",
    installStrategy: "write-skill-folder",
    pathHint: ".kiro/skills/",
    installPathTemplate: ".kiro/skills/{slug}/SKILL.md",
    documentationUrl: DOCS.kiroSkills,
    assistantIds: ["kiro"],
    scopeSupport: ["workspace"],
    detection: {
      pathPrefixes: [".kiro/skills/"]
    }
  }),
  kiro_steering: target({
    id: "kiro_steering",
    displayName: "Kiro steering",
    product: "Kiro",
    aliases: ["kiro"],
    status: "experimental",
    artifactKind: "context",
    installStrategy: "write-concise-file",
    pathHint: ".kiro/steering/",
    installPathTemplate: ".kiro/steering/naar-{slug}.md",
    documentationUrl: DOCS.kiroSteering,
    assistantIds: ["kiro"],
    supportsBundledFiles: false,
    detection: {
      pathPrefixes: [".kiro/steering/"]
    }
  }),
  cursor_legacy_rules: target({
    id: "cursor_legacy_rules",
    displayName: "Cursor legacy rules",
    product: "Cursor",
    aliases: ["cursor-legacy"],
    status: "deprecated",
    artifactKind: "rule",
    installStrategy: "append-managed-block",
    pathHint: ".cursorrules",
    installPathTemplate: ".cursorrules",
    documentationUrl: DOCS.cursorRules,
    assistantIds: ["cursor"],
    supportsBundledFiles: false,
    detection: {
      exactPaths: [".cursorrules"]
    },
    notes: ["Legacy Cursor rules path retained for compatibility."]
  }),
  roo_legacy_rules: target({
    id: "roo_legacy_rules",
    displayName: "Roo Code legacy rules",
    product: "Roo Code",
    aliases: ["roo-legacy"],
    status: "deprecated",
    artifactKind: "rule",
    installStrategy: "append-managed-block",
    pathHint: ".roorules",
    installPathTemplate: ".roorules",
    documentationUrl: DOCS.rooRules,
    assistantIds: ["roo"],
    supportsBundledFiles: false,
    detection: {
      exactPaths: [".roorules"]
    },
    notes: ["Legacy Roo Code rules path retained for compatibility."]
  }),
  gemini_workspace_skills_research: researchTarget({
    id: "gemini_workspace_skills_research",
    displayName: "Gemini CLI workspace skills research",
    product: "Gemini CLI",
    aliases: ["gemini-skills-research"],
    assistantIds: ["gemini"],
    pathHint: ".gemini/skills/",
    notes: ["No verified Gemini CLI project-level skill folder write path is enabled yet."]
  }),
  roo_workspace_skills_research: researchTarget({ id: "roo_workspace_skills_research", displayName: "Roo Code workspace skills research", product: "Roo Code", aliases: ["roo-skills-research"], assistantIds: ["roo"], pathHint: ".roo/skills/" }),
  roo_mode_rules_research: researchTarget({ id: "roo_mode_rules_research", displayName: "Roo Code mode-specific rules research", product: "Roo Code", aliases: ["roo-mode-rules-research"], assistantIds: ["roo"], pathHint: ".roo/rules-{mode}/" }),
  roo_mode_skills_research: researchTarget({ id: "roo_mode_skills_research", displayName: "Roo Code mode-specific skills research", product: "Roo Code", aliases: ["roo-mode-skills-research"], assistantIds: ["roo"], pathHint: ".roo/skills-{mode}/" }),
  aider_research: researchTarget({ id: "aider_research", displayName: "Aider research", product: "Aider", aliases: ["aider-research"], assistantIds: ["aider"], acceptsAgentsMd: true }),
  openhands_research: researchTarget({ id: "openhands_research", displayName: "OpenHands research", product: "OpenHands", aliases: ["openhands-research"], assistantIds: ["openhands"] }),
  junie_research: researchTarget({ id: "junie_research", displayName: "JetBrains Junie research", product: "JetBrains Junie", aliases: ["junie-research"], assistantIds: ["junie"], acceptsAgentsMd: true }),
  kilo_research: researchTarget({ id: "kilo_research", displayName: "Kilo Code research", product: "Kilo Code", aliases: ["kilo-research"], assistantIds: ["kilo"], acceptsAgentsMd: true }),
  zed_research: researchTarget({ id: "zed_research", displayName: "Zed Agent research", product: "Zed", aliases: ["zed-research"], assistantIds: ["zed"], acceptsAgentsMd: true }),
  warp_research: researchTarget({ id: "warp_research", displayName: "Warp research", product: "Warp", aliases: ["warp-research"], assistantIds: ["warp"], acceptsAgentsMd: true }),
  devin_research: researchTarget({ id: "devin_research", displayName: "Devin research", product: "Devin", aliases: ["devin-research"], assistantIds: ["devin"], acceptsAgentsMd: true }),
  factory_research: researchTarget({ id: "factory_research", displayName: "Factory research", product: "Factory", aliases: ["factory-research"], assistantIds: ["factory"], acceptsAgentsMd: true }),
  jules_research: researchTarget({ id: "jules_research", displayName: "Jules research", product: "Jules", aliases: ["jules-research"], assistantIds: ["jules"], acceptsAgentsMd: true }),
  amp_research: researchTarget({ id: "amp_research", displayName: "Amp research", product: "Amp", aliases: ["amp-research"], assistantIds: ["amp"], acceptsAgentsMd: true }),
  augment_research: researchTarget({ id: "augment_research", displayName: "Augment Code research", product: "Augment Code", aliases: ["augment-research"], assistantIds: ["augment"], acceptsAgentsMd: true }),
  goose_research: researchTarget({ id: "goose_research", displayName: "Goose research", product: "Goose", aliases: ["goose-research"], assistantIds: ["goose"], acceptsAgentsMd: true }),
  opencode_research: researchTarget({ id: "opencode_research", displayName: "OpenCode research", product: "OpenCode", aliases: ["opencode-research"], assistantIds: ["opencode"], acceptsAgentsMd: true }),
  phoenix_research: researchTarget({ id: "phoenix_research", displayName: "Phoenix research", product: "Phoenix", aliases: ["phoenix-research"], assistantIds: ["phoenix"], acceptsAgentsMd: true }),
  semgrep_research: researchTarget({ id: "semgrep_research", displayName: "Semgrep research", product: "Semgrep", aliases: ["semgrep-research"], assistantIds: ["semgrep"], acceptsAgentsMd: true }),
  ona_research: researchTarget({ id: "ona_research", displayName: "Ona research", product: "Ona", aliases: ["ona-research"], assistantIds: ["ona"], acceptsAgentsMd: true }),
  trae_research: researchTarget({
    id: "trae_research",
    displayName: "Trae research",
    product: "Trae",
    aliases: ["trae-research"],
    assistantIds: ["trae"],
    pathHint: "Research only",
    notes: [
      "No verified project-level .trae/skills/, .trae/rules/, .trae/instructions.md, AGENTS.md, .agents/skills/, Cursor-compatible rules, VS Code-style custom instruction file, or MCP-only repo write target was confirmed."
    ]
  })
} satisfies Record<InstallTarget, AgentTargetDefinition>;

export const AGENT_TARGET_ORDER = Object.keys(AGENT_TARGETS) as InstallTarget[];

export function listInstallTargets(): AgentTargetDefinition[] {
  return AGENT_TARGET_ORDER.map((target) => AGENT_TARGETS[target]);
}

export function getTargetById(target: InstallTarget): AgentTargetDefinition {
  return AGENT_TARGETS[target];
}

export function getEnabledTargets(): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.status !== "deprecated" && target.canWrite);
}

export function getDefaultInstallTargets(): InstallTarget[] {
  return listInstallTargets()
    .filter((target) => target.enabledByDefault)
    .map((target) => target.id);
}

export const getDefaultTargets = getDefaultInstallTargets;

export function getTargetsByArtifactKind(kind: AgentArtifactKind): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.artifactKind === kind);
}

export function getWriteCapableTargets(): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.canWrite && target.installStrategy !== "research-only");
}

export function getResearchTargets(): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.status === "research" || !target.canWrite);
}

export function getTargetsByProduct(product: string): AgentTargetDefinition[] {
  const normalized = product.trim().toLowerCase();
  return listInstallTargets().filter((target) => target.product.toLowerCase() === normalized);
}

export function getTargetsByStatus(status: TargetStatus): AgentTargetDefinition[] {
  return listInstallTargets().filter((target) => target.status === status);
}
