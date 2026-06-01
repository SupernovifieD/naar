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
  for (const [index, skill] of state.skills.entries()) {
    const installDate = formatInstallDate(skill.installedAtIso);
    const locations = formatLocations(skill.managedFiles);
    process.stdout.write(
      `${pc.bold(`${index + 1}) ${skill.canonicalSkillId}`)} (${pc.cyan(skill.providerId)})\n`
    );
    process.stdout.write(`  ${pc.blue("Version")}: ${pc.white(skill.installedVersion)}\n`);
    process.stdout.write(`  ${pc.blue("Targets")}: ${skill.targets.map((target) => pc.cyan(target)).join(", ")}\n`);
    process.stdout.write(`  ${pc.blue("Location")}: ${pc.white(locations)}\n`);
    process.stdout.write(`  ${pc.blue("Install date")}: ${pc.white(installDate)}\n`);
    if (index < state.skills.length - 1) {
      process.stdout.write("\n\n");
    }
  }
}

function formatInstallDate(installedAtIso: string | undefined): string {
  if (!installedAtIso) return "unknown";
  const date = new Date(installedAtIso);
  if (Number.isNaN(date.getTime())) {
    return installedAtIso;
  }
  return date.toISOString().slice(0, 10);
}

function formatLocations(managedFiles: string[] | undefined): string {
  if (!managedFiles || managedFiles.length === 0) {
    return "unknown";
  }

  const locations = [...new Set(
    managedFiles.map((path) => path.split("#")[0])
  )].sort((left, right) => left.localeCompare(right));

  return locations.join(", ");
}
