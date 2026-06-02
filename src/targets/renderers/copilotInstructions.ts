import type { InstallAction } from "../../types/index.js";
import type { TargetRenderContext } from "../types.js";
import { buildNaarSkillManagedBlock } from "./managedMarkdownBlock.js";

export function renderCopilotInstructionsTarget(context: TargetRenderContext): InstallAction[] {
  return [
    {
      type: "append",
      path: context.target.pathHint,
      content: buildNaarSkillManagedBlock(
        context.slug,
        context.skillName,
        context.skillSummary,
        context.skillMarkdown
      )
    }
  ];
}
