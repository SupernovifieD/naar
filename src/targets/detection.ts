import type { AIAssistantDetection } from "../types/index.js";
import { listInstallTargets } from "./registry.js";
import type { AgentTargetDefinition } from "./types.js";

const MAX_CONFIG_PATHS = 20;

export function detectAssistantTargets(paths: string[]): AIAssistantDetection[] {
  return listInstallTargets().map((target) => {
    const configPathsFound = paths.filter((file) => matchesTargetDetection(file, target)).slice(0, MAX_CONFIG_PATHS);
    const assistantId = target.compatibility.assistantIds[0];

    return {
      id: assistantId,
      status: configPathsFound.length > 0 ? "found" : "missing",
      configPathsFound,
      recommendedInstallTargets: [target.id]
    };
  });
}

function matchesTargetDetection(file: string, target: AgentTargetDefinition): boolean {
  const { detection } = target;
  return (detection.exactPaths ?? []).includes(file)
    || (detection.pathPrefixes ?? []).some((prefix) => file.startsWith(prefix))
    || (detection.globHints ?? []).some((globHint) => matchesGlobHint(file, globHint));
}

function matchesGlobHint(file: string, globHint: string): boolean {
  const wildcardIndex = globHint.indexOf("*");
  if (wildcardIndex === -1) return file === globHint;

  const prefix = globHint.slice(0, wildcardIndex);
  const suffix = globHint.slice(wildcardIndex + 1);
  return file.startsWith(prefix) && file.endsWith(suffix);
}
