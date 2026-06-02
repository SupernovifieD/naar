import type { InstallAction } from "../../types/index.js";
import type { TargetRenderContext } from "../types.js";
import { buildConciseTargetContent, resolveInstallPath } from "./shared.js";

export function renderConciseFileTarget(context: TargetRenderContext): InstallAction[] {
  return [
    {
      type: "write",
      path: resolveInstallPath(context),
      content: buildConciseTargetContent(context),
      overwrite: false
    }
  ];
}
