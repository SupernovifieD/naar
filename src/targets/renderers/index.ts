import type { InstallAction } from "../../types/index.js";
import { getTargetById } from "../registry.js";
import type { TargetRenderContext } from "../types.js";
import { renderConciseFileTarget } from "./conciseFile.js";
import { renderCursorRuleTarget } from "./cursorRule.js";
import { renderManagedBlockTarget } from "./managedBlockTarget.js";
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
    skillMarkdown: context.skillMarkdown,
    sourceProviderId: context.sourceProviderId
  };

  if (!target.canWrite) return [];

  switch (target.installStrategy) {
    case "write-skill-folder":
      return renderSkillFolderTarget(renderContext);
    case "write-rule-file":
      return renderCursorRuleTarget(renderContext);
    case "write-concise-file":
      return renderConciseFileTarget(renderContext);
    case "append-managed-block":
      return renderManagedBlockTarget(renderContext);
    case "research-only":
      return [];
    default:
      return [];
  }
}
