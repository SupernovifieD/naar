import type { InstallAction } from "../../types/index.js";
import { getTargetById } from "../registry.js";
import type { TargetRenderContext } from "../types.js";
import { renderCopilotInstructionsTarget } from "./copilotInstructions.js";
import { renderCursorRuleTarget } from "./cursorRule.js";
import { renderSkillFolderTarget } from "./skillFolder.js";

export function renderTargetInstallActions(
  context: Omit<TargetRenderContext, "target"> & { targetId: TargetRenderContext["target"]["id"] }
): InstallAction[] {
  const target = getTargetById(context.targetId);
  const renderContext: TargetRenderContext = {
    target,
    slug: context.slug,
    skillName: context.skillName,
    skillSummary: context.skillSummary,
    skillMarkdown: context.skillMarkdown
  };

  switch (target.installStrategy) {
    case "write-skill-folder":
      return renderSkillFolderTarget(renderContext);
    case "write-rule-file":
      return renderCursorRuleTarget(renderContext);
    case "append-managed-block":
      return renderCopilotInstructionsTarget(renderContext);
    case "research-only":
      return [];
    default:
      return [];
  }
}
