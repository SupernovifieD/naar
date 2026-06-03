import { checkbox } from "@inquirer/prompts";
import pc from "picocolors";
import type { CliFlags, InstallTarget } from "../types/index.js";
import { loadConfig } from "../config/store.js";
import { installResolvedSkills } from "../installer/installService.js";
import { parseSkillRef, toSkillRef } from "../installer/refs.js";
import { resolveSkillRefs } from "../installer/resolveRefs.js";
import { listInstallTargets } from "../targets/index.js";
import { printJson } from "../utils/json.js";
import { warningLine } from "../utils/output.js";
import { resolveRepoRoot } from "./shared.js";

const INSTALL_TARGETS = listInstallTargets().filter((target) => target.canWrite && target.status === "stable");

const CHECKBOX_THEME_WITH_QUIT_HINT = {
  style: {
    keysHelpTip: (keys: [string, string][]): string => {
      const entries = [...keys];
      if (!entries.some(([key]) => key.toLowerCase() === "q")) {
        entries.push(["q", "quit"]);
      }
      return entries.map(([key, action]) => `${pc.cyan(key)} ${action}`).join(pc.dim(" · "));
    }
  }
};

class PromptExitRequestedError extends Error {
  constructor() {
    super("Prompt exited by user");
    this.name = "PromptExitRequestedError";
  }
}

export async function runInstall(flags: CliFlags, refs: string[] = []): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const normalizedRefs = refs.map((ref) => ref.trim()).filter(Boolean);

  if (normalizedRefs.length === 0) {
    renderNoRefHelp(flags);
    return;
  }

  const parsedRefs = normalizedRefs.map((ref) => parseSkillRef(ref));
  const config = await loadConfig(repoRoot);
  const targets = await resolveInstallTargets(flags, config.defaultTargets);
  if (targets.length === 0) {
    if (flags.json) {
      printJson({
        installSkipped: true,
        error: "No coding assistant targets selected.",
        hint: "Use --target <id> or configure defaults with naar config --set-target <id>."
      });
    } else {
      process.stdout.write(`${warningLine("No coding assistant targets selected. Installation canceled.")}\n`);
      process.stdout.write(`Use ${pc.cyan("--target <id>")} or configure defaults with ${pc.bold("naar config --set-target <id>")}.\n`);
    }
    return;
  }

  const resolvedSkills = await resolveSkillRefs(parsedRefs.map(toSkillRef), targets);
  await installResolvedSkills({
    repoRoot,
    flags,
    resolvedSkills,
    source: "direct"
  });
}

function renderNoRefHelp(flags: CliFlags): void {
  const examples = [
    "naar install clawhub:ui-ux",
    "naar install anthropic:frontend-design",
    "naar search \"ui ux\"",
    "naar go"
  ];

  if (flags.json) {
    printJson({
      installSkipped: true,
      error: "No skill reference provided.",
      examples
    });
    return;
  }

  process.stdout.write(`${warningLine("No skill reference provided.")}\n\n`);
  process.stdout.write(`${pc.bold("Install a known skill")}:
  ${pc.cyan(examples[0])}\n\n`);
  process.stdout.write(`${pc.bold("Search first")}:
  ${pc.cyan(examples[2])}\n\n`);
  process.stdout.write(`${pc.bold("Or run the guided flow")}:
  ${pc.cyan(examples[3])}\n`);
}

async function resolveInstallTargets(flags: CliFlags, defaultTargets: InstallTarget[]): Promise<InstallTarget[]> {
  const configuredTargets = dedupeInstallTargets(flags.target.length > 0 ? flags.target : defaultTargets);
  if (configuredTargets.length > 0 || flags.nonInteractive || flags.yes || flags.json) {
    return configuredTargets;
  }

  try {
    const selectedTargets = await runPromptWithQuitShortcut((context) =>
      checkbox<InstallTarget>(
        {
          message: "Select coding assistant rules/skills to install (press q to quit)",
          theme: CHECKBOX_THEME_WITH_QUIT_HINT,
          choices: INSTALL_TARGETS.map((target, index) => ({
            name: `${pc.bold(target.displayName)} (${pc.dim(target.pathHint)})`,
            value: target.id,
            checked: index < 4
          }))
        },
        context
      )
    );
    return dedupeInstallTargets(selectedTargets);
  } catch (error) {
    if (error instanceof PromptExitRequestedError) {
      return [];
    }
    throw error;
  }
}

async function runPromptWithQuitShortcut<T>(runner: (context: { signal: AbortSignal }) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let quitPressed = false;

  const onData = (chunk: Buffer | string): void => {
    const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (raw.length === 1 && (raw === "q" || raw === "Q")) {
      quitPressed = true;
      controller.abort();
    }
  };

  process.stdin.on("data", onData);
  try {
    return await runner({ signal: controller.signal });
  } catch (error) {
    if (quitPressed || isPromptAbortError(error)) {
      throw new PromptExitRequestedError();
    }
    throw error;
  } finally {
    process.stdin.off("data", onData);
  }
}

function isPromptAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortPromptError" || error.name === "ExitPromptError";
}

function dedupeInstallTargets(targets: InstallTarget[]): InstallTarget[] {
  return [...new Set(targets)];
}
