import type { AssistantId, InstallTarget, SkillCandidate } from "../types/index.js";
import { getTargetById, getWriteCapableTargets } from "./registry.js";

export function getTargetAssistantIds(target: InstallTarget): AssistantId[] {
  return getTargetById(target).compatibility.assistantIds;
}

export function getAllTargetAssistantIds(): AssistantId[] {
  return dedupeAssistants(getWriteCapableTargets().flatMap((target) => target.compatibility.assistantIds));
}

export function isCandidateCompatibleWithTarget(candidate: SkillCandidate, target: InstallTarget): boolean {
  const definition = getTargetById(target);
  if (!definition.canWrite) return false;
  const candidateAssistants = candidate.compatibility.assistants;
  return definition.compatibility.assistantIds.some((assistant) => candidateAssistants.includes(assistant))
    || (definition.acceptsGenericSkills && candidateAssistants.includes("generic"));
}

export function dedupeAssistants(values: AssistantId[]): AssistantId[] {
  return [...new Set(values)];
}
