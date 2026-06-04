import type { CliFlags } from "../types/index.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { saveScanCache } from "./cache.js";
import { colorAssistantStatus, colorFindingSeverity, colorScore, formatList, warningHeader } from "../utils/output.js";
import { formatDateOnly, heading, joinSegments, keyValue, muted, pathText, section, statusBadge, withSpinner } from "../utils/terminal.js";

export async function runScan(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const facts = await withSpinner(
    "Scanning repository",
    async () => scanRepo(repoRoot),
    {
      enabled: !flags.json,
      successText: "Repository scanned",
      failText: "Repository scan failed"
    }
  );
  await saveScanCache(repoRoot, facts);

  if (flags.json) {
    printJson(facts);
    return;
  }

  const stackParts = [
    facts.languages.join(", "),
    facts.packageManagers.map((packageManager) => packageManager.id).join(", "),
    facts.primaryFacts?.testTools?.map((tool) => tool.id).join(", "),
    facts.primaryFacts?.ci?.map((tool) => tool.id).join(", ")
  ].map((part) => part?.trim()).filter(Boolean) as string[];
  const foundAssistants = facts.aiAssistants.filter((assistant) => assistant.status === "found");

  process.stdout.write(`${heading("Repo scan")}\n\n`);
  process.stdout.write(`${keyValue("Repo", pathText(repoRoot))}\n`);
  process.stdout.write(`${keyValue("Scanned", muted(formatDateOnly(facts.scanTimeIso)))}\n`);
  process.stdout.write(`${keyValue("Stack", stackParts.length > 0 ? stackParts.join(muted(" · ")) : muted("unknown"))}\n`);
  process.stdout.write(`${keyValue(
    "Assistants",
    foundAssistants.length > 0
      ? foundAssistants.map((assistant) => `${assistant.id} ${statusBadge("found")}`).join(muted(" · "))
      : muted("none found")
  )}\n`);
  process.stdout.write(`${keyValue("Readiness", `${colorScore(facts.readiness.score, { percent: true })} ${statusBadge(facts.readiness.grade)}`)}\n`);

  if (flags.verbose) {
    process.stdout.write(`\n${section("Frameworks")}\n`);
    process.stdout.write(`${formatList(facts.frameworks.map((framework) => framework.id))}\n`);
    process.stdout.write(`\n${section("Assistant details")}\n`);
    for (const assistant of facts.aiAssistants) {
      process.stdout.write(`* ${assistant.id} ${muted("·")} ${colorAssistantStatus(assistant.status)}\n`);
    }
  }

  if (facts.findings.length > 0) {
    process.stdout.write(`\n${warningHeader("Warnings")}:\n`);
    for (const finding of facts.findings) {
      process.stdout.write(`- [${colorFindingSeverity(finding.severity)}] ${finding.message}\n`);
    }
  }
}
