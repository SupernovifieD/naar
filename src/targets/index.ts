export {
  AGENT_TARGET_ORDER,
  AGENT_TARGETS,
  getDefaultInstallTargets,
  getEnabledTargets,
  getTargetById,
  listInstallTargets
} from "./registry.js";
export { TARGET_ALIASES, resolveTargetAlias } from "./aliases.js";
export {
  dedupeAssistants,
  getAllTargetAssistantIds,
  getTargetAssistantIds,
  isCandidateCompatibleWithTarget
} from "./compatibility.js";
export { detectAssistantTargets } from "./detection.js";
export { renderTargetInstallActions } from "./renderers/index.js";
export type {
  AgentArtifactKind,
  AgentTargetDefinition,
  InstallStrategy,
  TargetDetectionDefinition,
  TargetRenderContext,
  TargetRenderer,
  TargetStatus
} from "./types.js";
