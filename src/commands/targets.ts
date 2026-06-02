import pc from "picocolors";
import { printJson } from "../utils/json.js";
import { getTargetById, listInstallTargets, resolveTargetAlias, resolveTargetSelection } from "../targets/index.js";
import type { AgentTargetDefinition } from "../targets/index.js";

interface TargetCommandFlags {
  json?: boolean;
}

export function runTargetsList(flags: TargetCommandFlags = {}): void {
  const targets = listInstallTargets();
  if (flags.json) {
    printJson({ targets });
    return;
  }

  process.stdout.write(`${pc.bold("Supported targets")} (${pc.cyan(String(targets.length))}):\n`);
  for (const target of targets) {
    process.stdout.write(formatTargetListLine(target));
  }
}

export function runTargetsInspect(targetInput: string, flags: TargetCommandFlags = {}): void {
  const direct = resolveTargetAlias(targetInput);
  const group = direct ? [] : resolveTargetSelection(targetInput);

  if (!direct && group.length > 1) {
    const targets = group.map((target) => getTargetById(target));
    if (flags.json) {
      printJson({ group: targetInput, targets });
      return;
    }
    process.stdout.write(`${pc.bold("Target group")}: ${pc.cyan(targetInput)}\n`);
    for (const target of targets) {
      process.stdout.write(formatTargetListLine(target));
    }
    return;
  }

  const targetId = direct ?? group[0];
  if (!targetId) {
    throw new Error(`Unknown target: ${targetInput}`);
  }

  const target = getTargetById(targetId);
  if (flags.json) {
    printJson(target);
    return;
  }

  process.stdout.write(`${pc.bold(target.displayName)} (${pc.cyan(target.id)})\n`);
  process.stdout.write(`  ${pc.blue("Product")}: ${target.product}\n`);
  process.stdout.write(`  ${pc.blue("Artifact kind")}: ${target.artifactKind}\n`);
  process.stdout.write(`  ${pc.blue("Status")}: ${formatStatus(target.status)}\n`);
  process.stdout.write(`  ${pc.blue("Write-capable")}: ${target.canWrite ? pc.green("yes") : pc.yellow("no")}\n`);
  process.stdout.write(`  ${pc.blue("Default")}: ${target.enabledByDefault ? pc.green("yes") : pc.white("no")}\n`);
  process.stdout.write(`  ${pc.blue("Path")}: ${target.pathHint}\n`);
  process.stdout.write(`  ${pc.blue("Aliases")}: ${target.aliases.length > 0 ? target.aliases.map((alias) => pc.cyan(alias)).join(", ") : "none"}\n`);
  if (target.documentationUrl) {
    process.stdout.write(`  ${pc.blue("Docs")}: ${target.documentationUrl}\n`);
  }
  if (target.notes && target.notes.length > 0) {
    process.stdout.write(`  ${pc.blue("Notes")}:\n`);
    for (const note of target.notes) {
      process.stdout.write(`  - ${note}\n`);
    }
  }
}

function formatTargetListLine(target: AgentTargetDefinition): string {
  return `- ${pc.cyan(target.id)} ${pc.dim(`(${target.product})`)} kind=${pc.white(target.artifactKind)} status=${formatStatus(target.status)} write=${target.canWrite ? pc.green("yes") : pc.yellow("no")} default=${target.enabledByDefault ? pc.green("yes") : pc.white("no")} path=${pc.dim(target.pathHint)}\n`;
}

function formatStatus(status: AgentTargetDefinition["status"]): string {
  if (status === "stable") return pc.green(status);
  if (status === "experimental") return pc.yellow(status);
  if (status === "deprecated") return pc.red(status);
  return pc.dim(status);
}
