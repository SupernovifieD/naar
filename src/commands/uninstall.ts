import { checkbox, confirm } from "@inquirer/prompts";
import type { CliFlags } from "../types/index.js";
import { resolveRepoRoot } from "./shared.js";
import { loadInstalledState, loadLockfile, saveInstalledState, saveLockfile } from "../installer/state.js";
import { uninstallManagedFiles } from "../installer/apply.js";
import { printJson } from "../utils/json.js";
import { warningLine } from "../utils/output.js";
import { recordUninstallHistory } from "../history/historyService.js";
import { command, danger, heading, joinSegments, skill, warning, withSpinner } from "../utils/terminal.js";

export async function runUninstall(flags: CliFlags, skillIdsFromArgs: string[]): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const state = await loadInstalledState(repoRoot);

  if (state.skills.length === 0) {
    process.stdout.write(`${warning("No installed skills found by Naar.")}\n`);
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
    process.stdout.write(`${heading("Uninstall plan")}\n\n`);
    for (const file of preview.slice(0, flags.verbose ? preview.length : 10)) {
      process.stdout.write(`- ${danger(file)}\n`);
    }
    if (!flags.verbose && preview.length > 10) {
      process.stdout.write(`…and ${preview.length - 10} more. Use ${command("naar uninstall --verbose")} to show all.\n`);
    }
    process.stdout.write(`\n${joinSegments([`${preview.length} files/managed blocks will be removed`])}\n`);
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

  const removed = await withSpinner(
    "Applying uninstall",
    async () => uninstallManagedFiles(repoRoot, state, selectedIds),
    {
      enabled: !flags.json,
      successText: "Managed files removed",
      failText: "Uninstall failed"
    }
  );
  const lock = await loadLockfile(repoRoot);

  state.skills = state.skills.filter((skill) => !selectedIds.includes(skill.canonicalSkillId));
  lock.skills = lock.skills.filter((skill) => !selectedIds.includes(skill.canonicalSkillId));

  await saveInstalledState(repoRoot, state);
  await saveLockfile(repoRoot, lock);

  process.stdout.write(`✔ Uninstalled ${selectedIds.length} skill${selectedIds.length === 1 ? "" : "s"}\n`);
  process.stdout.write(`Removed ${removed.length} managed entr${removed.length === 1 ? "y" : "ies"}.\n`);
  const historyWarning = await updateUninstallHistoryBestEffort(flags, repoRoot, state.skills, selected);
  if (historyWarning) {
    if (flags.json) {
      printJson({ historyWarning });
    } else {
      process.stdout.write(`${warningLine(historyWarning)}\n`);
    }
  }
  if (!flags.json) {
    process.stdout.write(`Next: run ${command("naar list")}\n`);
  }
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
    choices: available.map((id) => ({ name: skill(id), value: id }))
  });
}

async function updateUninstallHistoryBestEffort(
  flags: CliFlags,
  repoRoot: string,
  remainingInstalledSkills: Parameters<typeof recordUninstallHistory>[0]["remainingInstalledSkills"],
  uninstalledSkills: Parameters<typeof recordUninstallHistory>[0]["uninstalledSkills"]
): Promise<string | undefined> {
  try {
    await recordUninstallHistory({
      repoPath: repoRoot,
      remainingInstalledSkills,
      uninstalledSkills,
      history: flags.history
    });
  } catch {
    return "Uninstall succeeded, but Naar could not update local history.";
  }
  return undefined;
}
