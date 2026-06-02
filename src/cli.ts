#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { coerceFlags, parseTargets } from "./commands/shared.js";
import { runScan } from "./commands/scan.js";
import { runRecommend } from "./commands/recommend.js";
import { runInstall } from "./commands/install.js";
import { runGo } from "./commands/go.js";
import { runList } from "./commands/list.js";
import { runUninstall } from "./commands/uninstall.js";
import { runConfig } from "./commands/config.js";
import { runTargetsInspect, runTargetsList } from "./commands/targets.js";
import { CLI_VERSION } from "./utils/version.js";

const program = new Command();

program.configureOutput({
  writeOut: (str) => {
    process.stdout.write(colorizeCommanderOutput(str));
  },
  writeErr: (str) => {
    process.stderr.write(colorizeCommanderOutput(str));
  },
  outputError: (str, write) => {
    write(pc.red(str));
  }
});

program
  .name("naar")
  .description("Naar: a repo-aware package manager for AI-agent skills, rules, and instructions")
  .version(CLI_VERSION);

applySharedOptions(program
  .command("go")
  .description("Scan, recommend, and install with guided flow")
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runGo(flags);
  }));

applySharedOptions(program
  .command("scan")
  .description("Audit repository and output repo facts")
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runScan(flags);
  }));

applySharedOptions(program
  .command("recommend")
  .description("Recommend skills from configured providers")
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runRecommend(flags);
  }));

applySharedOptions(program
  .command("install")
  .description("Install selected skills with preview and confirmation")
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runInstall(flags);
  }));

applySharedOptions(program
  .command("list")
  .description("List installed skills and provenance")
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runList(flags);
  }));

applySharedOptions(program
  .command("uninstall [skills...]")
  .description("Remove installed skills by canonical skill id")
  .action(async (skills: string[], _opts, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    await runUninstall(flags, skills ?? []);
  }));

applySharedOptions(program
  .command("config")
  .description("View or update Naar config")
  .option("--set-provider <id>", "Set default provider (repeatable)", collectOption, [])
  .option("--set-target <id>", "Set default target (repeatable)", collectOption, [])
  .option("--set-min-security-score <n>", "Set default min security score", parseIntOption)
  .action(async (_args, cmd) => {
    const flags = coerceFlags(cmd.optsWithGlobals());
    const opts = cmd.opts();
    await runConfig(flags, {
      setProvider: opts.setProvider,
      setTarget: parseTargets(opts.setTarget),
      setMinSecurityScore: opts.setMinSecurityScore,
      allowScripts: opts.allowScripts === true ? true : undefined
    });
  }));

const targetsCommand = program
  .command("targets")
  .description("List and inspect supported assistant targets");

targetsCommand
  .command("list")
  .description("List supported assistant targets")
  .option("--json", "Emit JSON output")
  .action((options: { json?: boolean }) => {
    runTargetsList({ json: Boolean(options.json) });
  });

targetsCommand
  .command("inspect <target>")
  .description("Inspect a supported assistant target or target group")
  .option("--json", "Emit JSON output")
  .action((target: string, options: { json?: boolean }) => {
    runTargetsInspect(target, { json: Boolean(options.json) });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${pc.red(`Error: ${message}`)}\n`);
  process.exitCode = 1;
});

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseIntOption(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return n;
}

function applySharedOptions(command: Command): Command {
  return command
    .option("--repo <path>", "Repository path", process.cwd())
    .option("--provider <id>", "Provider id (repeatable)", collectOption, [])
    .option("--target <id>", "Install target id (repeatable)", collectOption, [])
    .option("--json", "Emit JSON output")
    .option("--compact", "Compact recommendation output")
    .option("--apply", "Apply writes in non-interactive/json modes")
    .option("--non-interactive", "Disable prompts")
    .option("--yes", "Skip confirmation prompts")
    .option("--verbose", "Verbose output")
    .option("--min-security-score <n>", "Minimum security score", parseIntOption, 80)
    .option("--dry-run", "Preview only, no writes")
    .option("--all-compatible", "Install all compatible unblocked recommendations")
    .option("--force", "Allow overwrite on install conflicts")
    .option("--from <provider:skill@version>", "Install a specific provider skill reference")
    .option("--from-plan <file>", "Load install selections from plan JSON")
    .option("--no-scripts", "Disallow script-bearing skills")
    .option("--allow-scripts", "Allow script-bearing skills (unsafe)")
    .option("--allow-risky", "Acknowledge risky security concerns; required for non-interactive concern overrides (unsafe)");
}

function colorizeCommanderOutput(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return line;
      }

      if (/^Usage:/.test(trimmed)) {
        return line.replace(trimmed, pc.bold(pc.cyan(trimmed)));
      }

      if (/^(Commands|Options|Arguments):$/.test(trimmed)) {
        return line.replace(trimmed, pc.bold(trimmed));
      }

      const termMatch = line.match(/^(\s{2,})(\S.*?)(\s{2,}.*)$/);
      if (termMatch) {
        const [, indent, term, detail] = termMatch;
        return `${indent}${pc.cyan(term)}${detail}`;
      }

      return line;
    })
    .join("\n");
}
