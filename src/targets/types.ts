import type { AssistantId, InstallAction, InstallTarget } from "../types/index.js";

export type AgentArtifactKind =
  | "skill"
  | "rule"
  | "instruction"
  | "context"
  | "agents-md"
  | "generic-skill"
  | "unknown";

export type TargetStatus =
  | "stable"
  | "experimental"
  | "research"
  | "deprecated";

export type TargetVerificationStatus =
  | "verified-docs"
  | "project-convention"
  | "research-unverified";

export type TargetScopeSupport = "repo" | "workspace" | "path" | "mode";

export type InstallStrategy =
  | "write-skill-folder"
  | "write-rule-file"
  | "write-concise-file"
  | "append-managed-block"
  | "research-only";

export interface TargetDetectionDefinition {
  exactPaths?: string[];
  pathPrefixes?: string[];
  globHints?: string[];
}

export interface AgentTargetDefinition {
  id: InstallTarget;
  displayName: string;
  product: string;
  aliases: string[];
  status: TargetStatus;
  enabledByDefault: boolean;
  canWrite: boolean;
  artifactKind: AgentArtifactKind;
  installStrategy: InstallStrategy;
  pathHint: string;
  installPathTemplate?: string;
  documentationUrl?: string;
  verificationStatus: TargetVerificationStatus;
  scopeSupport: TargetScopeSupport[];
  supportsBundledFiles: boolean;
  supportsManagedBlocks: boolean;
  supportsPathScopedRules: boolean;
  supportsModeSpecificRules: boolean;
  acceptsGenericSkills: boolean;
  acceptsAgentsMd: boolean;
  detection: TargetDetectionDefinition;
  compatibility: {
    assistantIds: AssistantId[];
    acceptsGenericSkills: boolean;
  };
  notes?: string[];
}

export interface TargetRenderContext {
  target: AgentTargetDefinition;
  slug: string;
  skillName: string;
  skillSummary: string;
  skillMarkdown: string;
  sourceProviderId?: string;
}

export type TargetRenderer = (context: TargetRenderContext) => InstallAction[];
