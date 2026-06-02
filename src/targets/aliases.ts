import type { InstallTarget } from "../types/index.js";
import { listInstallTargets } from "./registry.js";

export const TARGET_ALIASES: Record<string, InstallTarget> = Object.fromEntries(
  listInstallTargets().flatMap((target) => [
    [target.id, target.id],
    ...target.aliases.map((alias) => [alias, target.id])
  ])
) as Record<string, InstallTarget>;

export function resolveTargetAlias(input: string): InstallTarget | undefined {
  return TARGET_ALIASES[input];
}
