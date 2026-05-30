import ora from "ora";
import pc from "picocolors";
import type { CliFlags } from "../types/index.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { saveScanCache } from "./cache.js";
import { colorAssistantStatus, colorFindingSeverity, colorScore, formatList, warningHeader } from "../utils/output.js";

export async function runScan(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const spinner = flags.json ? null : ora(`Scanning repository at ${repoRoot}`).start();

  const facts = await scanRepo(repoRoot);
  await saveScanCache(repoRoot, facts);

  spinner?.succeed(pc.green("Scan complete"));

  if (flags.json) {
    printJson(facts);
    return;
  }

  process.stdout.write(`\n${pc.bold("Repo")}: ${pc.dim(repoRoot)}\n`);
  process.stdout.write(`${pc.bold("Languages")}: ${formatList(facts.languages)}\n`);
  process.stdout.write(
    `${pc.bold("Package managers")}: ${formatList(facts.packageManagers.map((packageManager) => packageManager.id))}\n`
  );
  process.stdout.write(
    `${pc.bold("Frameworks")}: ${formatList(facts.frameworks.map((framework) => framework.id))}\n`
  );
  process.stdout.write(`${pc.bold("Readiness")}: ${colorScore(facts.readiness.score, { percent: true })} (${pc.bold(facts.readiness.grade)})\n`);

  process.stdout.write(`\n${pc.bold("AI assistants")}:\n`);
  for (const assistant of facts.aiAssistants) {
    process.stdout.write(`- ${pc.cyan(assistant.id)}: ${colorAssistantStatus(assistant.status)}\n`);
  }

  if (facts.findings.length > 0) {
    process.stdout.write(`\n${warningHeader("Findings")}:\n`);
    for (const finding of facts.findings) {
      process.stdout.write(`- [${colorFindingSeverity(finding.severity)}] ${finding.message}\n`);
    }
  }
}
