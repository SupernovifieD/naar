import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import pc from "picocolors";
import { printJson } from "../utils/json.js";
import type { HistoryRuntimeOptions } from "./historyService.js";
import {
  clearHistory,
  findMissingProjects,
  findProjectByPath,
  forgetProject,
  isHistoryEnabled,
  listProjects,
  listSkillSummaries,
  loadHistoryForDisplay,
  pruneMissingProjects
} from "./historyService.js";
import {
  historySummaryJson,
  renderHistoryProject,
  renderHistoryProjectList,
  renderHistorySkills,
  renderHistorySummary
} from "./historyFormat.js";

export interface HistoryCommandFlags extends HistoryRuntimeOptions {
  json?: boolean;
  verbose?: boolean;
  yes?: boolean;
}

export function parseHistoryBooleanOption(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid history value: ${value}. Use true or false.`);
}

export function registerHistoryCommand(program: Command): void {
  const history = program
    .command("history")
    .description("View and manage Naar's local skill lifecycle history across projects");

  addHistoryOptions(history)
    .action(async function (this: Command) {
      await runHistorySummary(toHistoryFlags(this));
    });

  addHistoryOptions(history.command("list").description("List remembered projects"))
    .action(async function (this: Command) {
      await runHistoryList(toHistoryFlags(this));
    });

  addHistoryOptions(history.command("skills").description("List remembered skills"))
    .action(async function (this: Command) {
      await runHistorySkills(toHistoryFlags(this));
    });

  addHistoryOptions(history.command("show <project-path>").description("Show history for one remembered project"))
    .action(async function (this: Command, projectPath: string) {
      await runHistoryShow(projectPath, toHistoryFlags(this));
    });

  addHistoryOptions(history.command("prune").description("Remove remembered projects whose paths no longer exist"))
    .action(async function (this: Command) {
      await runHistoryPrune(toHistoryFlags(this));
    });

  addHistoryOptions(history.command("forget <project-path>").description("Remove one project from local history"))
    .action(async function (this: Command, projectPath: string) {
      await runHistoryForget(projectPath, toHistoryFlags(this));
    });

  addHistoryOptions(history.command("clear").description("Clear all local history"))
    .action(async function (this: Command) {
      await runHistoryClear(toHistoryFlags(this));
    });
}

export async function runHistorySummary(flags: HistoryCommandFlags = {}): Promise<void> {
  const disabled = !isHistoryEnabled(flags);
  const loaded = await loadHistoryForDisplay(flags);
  if (flags.json) {
    printJson({
      ...historySummaryJson(loaded.history, disabled),
      warning: loaded.warning
    });
    return;
  }
  renderHistorySummary(loaded.history, { disabled, warning: loaded.warning, verbose: flags.verbose });
}

export async function runHistoryList(flags: HistoryCommandFlags = {}): Promise<void> {
  const loaded = await loadHistoryForDisplay(flags);
  const projects = listProjects(loaded.history);
  if (flags.json) {
    printJson({ projects, warning: loaded.warning });
    return;
  }
  renderHistoryProjectList(projects, { warning: loaded.warning, verbose: flags.verbose });
}

export async function runHistorySkills(flags: HistoryCommandFlags = {}): Promise<void> {
  const loaded = await loadHistoryForDisplay(flags);
  const skills = listSkillSummaries(loaded.history);
  if (flags.json) {
    printJson({ skills, warning: loaded.warning });
    return;
  }
  renderHistorySkills(skills, { warning: loaded.warning, verbose: flags.verbose });
}

export async function runHistoryShow(projectPath: string, flags: HistoryCommandFlags = {}): Promise<void> {
  const loaded = await findProjectByPath(projectPath, flags);
  if (!loaded.result) {
    if (flags.json) {
      printJson({ error: "Project not found in Naar history.", projectPath });
      return;
    }
    throw new Error(`Project not found in Naar history: ${projectPath}`);
  }

  if (flags.json) {
    printJson({ project: loaded.result, warning: loaded.warning });
    return;
  }
  renderHistoryProject(loaded.result, { warning: loaded.warning, verbose: flags.verbose });
}

export async function runHistoryPrune(flags: HistoryCommandFlags = {}): Promise<void> {
  const preview = await findMissingProjects(flags);
  if (preview.result.length === 0) {
    if (flags.json) {
      printJson({ pruned: 0, remaining: Object.keys(preview.history.projects).length });
    } else {
      process.stdout.write(`${pc.green("Pruned 0 missing projects from Naar history.")}\n`);
    }
    return;
  }

  const confirmed = await confirmDestructive(flags, `Prune ${preview.result.length} missing projects from Naar history?`);
  if (!confirmed) return;

  const pruned = await pruneMissingProjects(flags);
  if (flags.json) {
    printJson({ pruned: pruned.result.pruned, remaining: pruned.result.remaining });
    return;
  }
  process.stdout.write(`${pc.green(`Pruned ${pruned.result.pruned} missing projects from Naar history.`)}\n`);
}

export async function runHistoryForget(projectPath: string, flags: HistoryCommandFlags = {}): Promise<void> {
  const found = await findProjectByPath(projectPath, flags);
  if (!found.result) {
    if (flags.json) {
      printJson({ removed: false, error: "Project not found in Naar history.", projectPath });
      return;
    }
    throw new Error(`Project not found in Naar history: ${projectPath}`);
  }

  const confirmed = await confirmDestructive(
    flags,
    "This will remove this project from Naar's local history. It will not modify the project itself."
  );
  if (!confirmed) return;

  const forgotten = await forgetProject(projectPath, flags);
  if (flags.json) {
    printJson({ removed: forgotten.result.removed, project: forgotten.result.project });
    return;
  }
  process.stdout.write(`${pc.green("Removed project from Naar history")}: ${found.result.path}\n`);
}

export async function runHistoryClear(flags: HistoryCommandFlags = {}): Promise<void> {
  const confirmed = await confirmDestructive(
    flags,
    "This will delete Naar's local history on this machine. It will not uninstall skills from any project."
  );
  if (!confirmed) return;

  await clearHistory(flags);
  if (flags.json) {
    printJson({ cleared: true, projectCount: 0, skillCount: 0, currentSkillCount: 0, installEventCount: 0, uninstallEventCount: 0 });
    return;
  }
  process.stdout.write(`${pc.green("Naar local history cleared.")}\n`);
}

function addHistoryOptions(command: Command): Command {
  return command
    .option("--json", "Emit JSON output")
    .option("--verbose", "Show extra history metadata")
    .option("--yes", "Skip confirmation prompts for destructive history commands")
    .option("--history <true|false>", "Enable or disable lifecycle history for this invocation", parseHistoryBooleanOption);
}

function toHistoryFlags(command: Command): HistoryCommandFlags {
  const options = command.optsWithGlobals() as HistoryCommandFlags;
  return {
    json: Boolean(options.json),
    verbose: Boolean(options.verbose),
    yes: Boolean(options.yes),
    history: options.history
  };
}

async function confirmDestructive(flags: HistoryCommandFlags, message: string): Promise<boolean> {
  if (flags.yes) return true;
  if (flags.json) {
    printJson({ confirmationRequired: true, message });
    return false;
  }
  return confirm({ message, default: false });
}
