import type { TargetRenderContext } from "../types.js";

export function resolveInstallPath(context: TargetRenderContext): string {
  const template = context.target.installPathTemplate ?? context.target.pathHint;
  return template.replace(/\{slug\}/g, context.slug);
}

export function buildConciseTargetContent(context: TargetRenderContext): string {
  const lines = [
    `# Naar Skill: ${context.skillName}`,
    "",
    context.skillSummary.trim() || "Use this installed Naar skill when it is relevant to the current task.",
    "",
    "## Usage",
    `- Apply the guidance from the Naar-managed skill \`${context.slug}\` when it matches the repository task.`,
    "- Prefer the canonical installed skill content for detailed procedures and examples.",
    "- Do not run commands or modify files unless the active task explicitly requires it.",
    "",
    "## Provenance",
    `- Source provider: ${context.sourceProviderId ?? "unknown"}`,
    `- Target: ${context.target.displayName}`
  ];

  return `${lines.join("\n")}\n`;
}

export function buildManagedBlockBody(context: TargetRenderContext): string {
  return [
    context.skillSummary.trim() || "Use this installed Naar skill when it is relevant to the current task.",
    "",
    "### Usage",
    `- Apply the Naar-managed skill \`${context.slug}\` when it matches the repository task.`,
    "- Keep detailed procedures in the installed skill content; this file is a concise activation hint.",
    "- Do not run commands or modify files unless the active task explicitly requires it.",
    "",
    "### Provenance",
    `- Source provider: ${context.sourceProviderId ?? "unknown"}`,
    `- Target: ${context.target.displayName}`
  ].join("\n");
}
