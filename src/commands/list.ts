import type { CliFlags } from "../types/index.js";
import pc from "picocolors";
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
    process.stdout.write(`${pc.yellow("⚠ No skills installed by Naar.")}\n`);
    return;
  }

  process.stdout.write(`${pc.bold("Installed skills")} (${pc.cyan(String(state.skills.length))}):\n`);
  for (const skill of state.skills) {
    process.stdout.write(
      `- ${pc.bold(skill.canonicalSkillId)} (${pc.cyan(skill.providerId)}) `
      + `version=${pc.green(skill.installedVersion)} pinned=${pc.dim(skill.pinnedRef)}\n`
    );
    process.stdout.write(`  ${pc.magenta("targets")}: ${skill.targets.map((target) => pc.cyan(target)).join(", ")}\n`);
  }
}
