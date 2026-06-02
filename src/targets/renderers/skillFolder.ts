import type { InstallAction } from "../../types/index.js";
import type { TargetRenderContext } from "../types.js";

export function renderSkillFolderTarget(context: TargetRenderContext): InstallAction[] {
  return [
    {
      type: "write",
      path: `${context.target.pathHint}${context.slug}/SKILL.md`,
      content: context.skillMarkdown,
      overwrite: false
    }
  ];
}
