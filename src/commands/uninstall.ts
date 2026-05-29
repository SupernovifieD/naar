import { checkbox, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import type { CliFlags } from "../types/index.js";
import { resolveRepoRoot } from "./shared.js";
import { loadInstalledState, loadLockfile, saveInstalledState, saveLockfile } from "../installer/state.js";
import { uninstallManagedFiles } from "../installer/apply.js";
import { printJson } from "../utils/json.js";
import { warningLine } from "../utils/output.js";

export async function runUninstall(flags: CliFlags, skillIdsFromArgs: string[]): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const state = await loadInstalledState(repoRoot);

  if (state.skills.length === 0) {
    process.stdout.write(`${warningLine("No installed skills found.")}\n`);
    return;
  }

  const selectedIds = await chooseSkills(flags, state.skills.map((skill) => skill.canonicalSkillId), skillIdsFromArgs);
  if (selectedIds.length === 0) {
    process.stdout.write(`${warningLine("No skills selected for uninstall.")}\n`);
    return;
  }

  const selected = state.skills.filter((skill) => selectedIds.includes(skill.canonicalSkillId));
  const preview = selected.flatMap((skill) => skill.managedFiles);

  if (flags.json) {
    printJson({
      selected: selectedIds,
      files: preview
    });
    if (!flags.apply) {
      return;
    }
  } else {
    process.stdout.write(`${pc.bold("Files that will be removed/edited")}:\n`);
    for (const file of preview) {
      process.stdout.write(`- ${pc.red(file)}\n`);
    }
  }

  if (flags.dryRun) {
    process.stdout.write(`${warningLine("Dry run enabled. Nothing was changed.")}\n`);
    return;
  }

  const shouldProceed = flags.yes
    ? true
    : flags.nonInteractive
      ? flags.apply
      : await confirm({ message: "Proceed with uninstall?", default: false });

  if (!shouldProceed) {
    process.stdout.write(`${warningLine("Uninstall canceled.")}\n`);
    return;
  }

  const removed = await uninstallManagedFiles(repoRoot, state, selectedIds);
  const lock = await loadLockfile(repoRoot);

  state.skills = state.skills.filter((skill) => !selectedIds.includes(skill.canonicalSkillId));
  lock.skills = lock.skills.filter((skill) => !selectedIds.includes(skill.canonicalSkillId));

  await saveInstalledState(repoRoot, state);
  await saveLockfile(repoRoot, lock);

  process.stdout.write(`${pc.green("✔ Uninstall complete")}: removed ${pc.cyan(String(removed.length))} managed entries.\n`);
}

async function chooseSkills(
  flags: CliFlags,
  available: string[],
  fromArgs: string[]
): Promise<string[]> {
  if (fromArgs.length > 0) {
    return fromArgs.filter((id) => available.includes(id));
  }

  if (flags.nonInteractive || flags.yes || flags.json) {
    return available;
  }

  return checkbox<string>({
    message: "Select skills to uninstall",
    choices: available.map((id) => ({ name: pc.bold(id), value: id }))
  });
}
