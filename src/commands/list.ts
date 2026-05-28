import type { CliFlags } from "../types/index.js";
import { resolveRepoRoot } from "./shared.js";
import { loadInstalledState } from "../installer/state.js";
import { printJson } from "../utils/json.js";

export async function runList(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const state = await loadInstalledState(repoRoot);

  if (flags.json) {
    printJson(state);
    return;
  }

  if (state.skills.length === 0) {
    process.stdout.write("No skills installed by Pomegranate.\n");
    return;
  }

  process.stdout.write(`Installed skills (${state.skills.length}):\n`);
  for (const skill of state.skills) {
    process.stdout.write(
      `- ${skill.canonicalSkillId} (${skill.providerId}) version=${skill.installedVersion} pinned=${skill.pinnedRef}\n`
    );
    process.stdout.write(`  targets: ${skill.targets.join(", ")}\n`);
  }
}
