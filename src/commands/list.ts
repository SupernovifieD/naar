import type { CliFlags } from "../types/index.js";
import { resolveRepoRoot } from "./shared.js";
import { loadInstalledState } from "../installer/state.js";
import { printJson } from "../utils/json.js";
import { command, formatDateOnly, heading, info, joinSegments, keyValue, muted, pathText, skill as skillText, warning } from "../utils/terminal.js";

export async function runList(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const state = await loadInstalledState(repoRoot);

  if (flags.json) {
    printJson(state);
    return;
  }

  if (state.skills.length === 0) {
    process.stdout.write(`${warning("No skills installed by Naar.")}\n`);
    process.stdout.write(`Next: run ${command("naar go")}\n`);
    return;
  }

  process.stdout.write(`${heading(`Installed skills: ${state.skills.length}`)}\n\n`);
  for (const [index, installedSkill] of state.skills.entries()) {
    const installDate = formatInstallDate(installedSkill.installedAtIso);
    process.stdout.write(
      `${skillText(`${index + 1}. ${installedSkill.canonicalSkillId}`)} ${info(`[${installedSkill.providerId}]`)}\n`
    );
    process.stdout.write(`   ${joinSegments([
      `Version ${installedSkill.installedVersion}`,
      `Targets ${installedSkill.targets.join(", ")}`,
      `Installed ${installDate}`
    ])}\n`);
    if (flags.verbose) {
      process.stdout.write(`   ${keyValue("Provider scoped ID", installedSkill.providerScopedId ?? `${installedSkill.providerId}:${installedSkill.providerSkillId}`)}\n`);
      process.stdout.write(`   ${keyValue("Provider skill ID", installedSkill.providerSkillId)}\n`);
      process.stdout.write(`   ${keyValue("Pinned ref", installedSkill.pinnedRef)}\n`);
      process.stdout.write(`   ${keyValue("Security score at install", `${installedSkill.securityScoreAtInstall}/100`)}\n`);
      process.stdout.write(`   ${keyValue("Managed files", formatLocations(installedSkill.managedFiles, flags.verbose))}\n`);
    }
    if (index < state.skills.length - 1) {
      process.stdout.write("\n");
    }
  }

  if (!flags.verbose) {
    process.stdout.write(`\nNext: run ${command("naar list --verbose")} to see managed files.\n`);
  }
}

function formatInstallDate(installedAtIso: string | undefined): string {
  return formatDateOnly(installedAtIso);
}

function formatLocations(managedFiles: string[] | undefined, verbose: boolean): string {
  if (!managedFiles || managedFiles.length === 0) {
    return "unknown";
  }

  const locations = [...new Set(
    managedFiles.map((path) => path.split("#")[0])
  )].sort((left, right) => left.localeCompare(right));

  return locations
    .map((location) => {
      if (!verbose) {
        return location;
      }
      return pathText(location);
    })
    .join(muted(", "));
}
