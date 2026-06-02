import type { InstallAction } from "../../types/index.js";
import type { TargetRenderContext } from "../types.js";
import { buildNaarSkillManagedBlock, buildTargetManagedBlock } from "./managedMarkdownBlock.js";
import { buildManagedBlockBody, resolveInstallPath } from "./shared.js";

export function renderManagedBlockTarget(context: TargetRenderContext): InstallAction[] {
  if (context.target.id === "copilot_repo_instructions") {
    const marker = `naar:skill:${context.slug}`;
    return [
      {
        type: "append",
        path: context.target.pathHint,
        content: buildNaarSkillManagedBlock(
          context.slug,
          context.skillName,
          context.skillSummary,
          context.skillMarkdown
        ),
        managedMarker: marker
      }
    ];
  }

  const marker = `naar:target:${context.target.id}:skill:${context.slug}`;
  return [
    {
      type: "append",
      path: resolveInstallPath(context),
      content: buildTargetManagedBlock(marker, `Naar Skill: ${context.skillName}`, buildManagedBlockBody(context)),
      managedMarker: marker
    }
  ];
}
