import type { InstallAction } from "../../types/index.js";
import type { TargetRenderContext } from "../types.js";

export function renderCursorRuleTarget(context: TargetRenderContext): InstallAction[] {
  return [
    {
      type: "write",
      path: `.cursor/rules/naar-${context.slug}.mdc`,
      content: buildCursorRule(context.skillName, context.skillSummary, context.skillMarkdown),
      overwrite: false
    }
  ];
}

function buildCursorRule(skillName: string, summary: string, markdown: string): string {
  return `---\ndescription: ${escapeYaml(skillName)}\nalwaysApply: true\n---\n\n# ${skillName}\n\n${summary}\n\n${markdown}`;
}

function escapeYaml(input: string): string {
  return input.replace(/"/g, "'");
}
