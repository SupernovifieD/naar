import type { InstallTarget } from "../types/index.js";
import {
  getResearchTargets,
  getTargetsByArtifactKind,
  getTargetsByStatus,
  getWriteCapableTargets,
  listInstallTargets
} from "./registry.js";

export const TARGET_ALIASES: Record<string, InstallTarget> = Object.fromEntries(
  listInstallTargets().flatMap((target) => [
    [target.id, target.id],
    ...target.aliases.map((alias) => [alias, target.id])
  ])
) as Record<string, InstallTarget>;

export const TARGET_GROUP_ALIASES: Record<string, InstallTarget[]> = {
  all: getWriteCapableTargets()
    .filter((target) => target.status !== "deprecated")
    .map((target) => target.id),
  "all-skills": getWriteCapableTargets()
    .filter((target) => target.status !== "deprecated" && (target.artifactKind === "skill" || target.artifactKind === "generic-skill"))
    .map((target) => target.id),
  "all-rules": getWriteCapableTargets()
    .filter((target) => target.status !== "deprecated" && target.artifactKind === "rule")
    .map((target) => target.id),
  "all-instructions": getWriteCapableTargets()
    .filter((target) => target.status !== "deprecated" && (target.artifactKind === "instruction" || target.artifactKind === "context"))
    .map((target) => target.id),
  "agents-md": getTargetsByArtifactKind("agents-md").map((target) => target.id),
  experimental: getTargetsByStatus("experimental")
    .filter((target) => target.canWrite)
    .map((target) => target.id),
  deprecated: getTargetsByStatus("deprecated")
    .filter((target) => target.canWrite)
    .map((target) => target.id),
  research: getResearchTargets().map((target) => target.id)
};

export function resolveTargetAlias(input: string): InstallTarget | undefined {
  return TARGET_ALIASES[input];
}

export function resolveTargetSelection(input: string): InstallTarget[] {
  const group = TARGET_GROUP_ALIASES[input];
  if (group) return group;
  const target = resolveTargetAlias(input);
  return target ? [target] : [];
}

export function isTargetGroupAlias(input: string): boolean {
  return Object.prototype.hasOwnProperty.call(TARGET_GROUP_ALIASES, input);
}

export function isBroadTargetGroupAlias(input: string): boolean {
  return input === "all" || input === "experimental" || input === "deprecated";
}
