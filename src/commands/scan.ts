import ora from "ora";
import type { CliFlags } from "../types/index.js";
import { scanRepo } from "../scanner/scanRepo.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";
import { saveScanCache } from "./cache.js";

export async function runScan(flags: CliFlags): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const spinner = flags.json ? null : ora(`Scanning repository at ${repoRoot}`).start();

  const facts = await scanRepo(repoRoot);
  await saveScanCache(repoRoot, facts);

  spinner?.succeed("Scan complete");

  if (flags.json) {
    printJson(facts);
    return;
  }

  process.stdout.write(`\nRepo: ${repoRoot}\n`);
  process.stdout.write(`Languages: ${facts.languages.join(", ") || "none"}\n`);
  process.stdout.write(
    `Package managers: ${facts.packageManagers.map((packageManager) => packageManager.id).join(", ") || "none"}\n`
  );
  process.stdout.write(
    `Frameworks: ${facts.frameworks.map((framework) => framework.id).join(", ") || "none"}\n`
  );
  process.stdout.write(`Readiness: ${facts.readiness.score}/100 (${facts.readiness.grade})\n`);

  process.stdout.write("\nAI assistants:\n");
  for (const assistant of facts.aiAssistants) {
    process.stdout.write(`- ${assistant.id}: ${assistant.status}\n`);
  }

  if (facts.findings.length > 0) {
    process.stdout.write("\nFindings:\n");
    for (const finding of facts.findings) {
      process.stdout.write(`- [${finding.severity}] ${finding.message}\n`);
    }
  }
}
