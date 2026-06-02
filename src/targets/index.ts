export {
  AGENT_TARGET_ORDER,
  AGENT_TARGETS,
  getDefaultInstallTargets,
  getDefaultTargets,
  getEnabledTargets,
  getResearchTargets,
  getTargetById,
  getTargetsByArtifactKind,
  getTargetsByProduct,
  getTargetsByStatus,
  getWriteCapableTargets,
  listInstallTargets
} from "./registry.js";
export {
  TARGET_ALIASES,
  TARGET_GROUP_ALIASES,
  isBroadTargetGroupAlias,
  isTargetGroupAlias,
  resolveTargetAlias,
  resolveTargetSelection
} from "./aliases.js";
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
  TargetScopeSupport,
  TargetStatus,
  TargetVerificationStatus
} from "./types.js";
