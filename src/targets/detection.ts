import type { AIAssistantDetection, AssistantId, InstallTarget } from "../types/index.js";
import { listInstallTargets } from "./registry.js";
import type { AgentTargetDefinition } from "./types.js";

const MAX_CONFIG_PATHS = 20;
const ALWAYS_REPORT_ASSISTANTS: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];

export function detectAssistantTargets(paths: string[]): AIAssistantDetection[] {
  const grouped = new Map<AssistantId, AgentTargetDefinition[]>();
  for (const target of listInstallTargets()) {
    const assistantId = target.compatibility.assistantIds[0];
    if (!assistantId) continue;
    const existing = grouped.get(assistantId) ?? [];
    existing.push(target);
    grouped.set(assistantId, existing);
  }

  const detections: AIAssistantDetection[] = [];
  for (const [assistantId, targets] of grouped) {
    const configPathsFound = dedupe(
      targets.flatMap((target) => paths.filter((file) => matchesTargetDetection(file, target)))
    ).slice(0, MAX_CONFIG_PATHS);
    const recommendedInstallTargets = dedupeTargets(targets.map((target) => target.id));
    const shouldReport = configPathsFound.length > 0
      || ALWAYS_REPORT_ASSISTANTS.includes(assistantId)
      || targets.some((target) => target.enabledByDefault);

    if (!shouldReport) continue;

    detections.push({
      id: assistantId,
      status: configPathsFound.length > 0 ? "found" : "missing",
      configPathsFound,
      recommendedInstallTargets,
      notes: targets.some((target) => target.status === "research")
        ? ["Some matching target definitions are research-only and cannot write files."]
        : undefined
    });
  }

  return detections;
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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeTargets(values: InstallTarget[]): InstallTarget[] {
  return [...new Set(values)];
}
