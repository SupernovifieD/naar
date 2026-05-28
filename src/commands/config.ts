import type { CliFlags } from "../types/index.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { printJson } from "../utils/json.js";
import { resolveRepoRoot } from "./shared.js";

interface ConfigUpdates {
  setProvider?: string[];
  setTarget?: string[];
  setMinSecurityScore?: number;
  allowScripts?: boolean;
}

export async function runConfig(flags: CliFlags, updates: ConfigUpdates): Promise<void> {
  const repoRoot = resolveRepoRoot(flags.repo);
  const config = await loadConfig(repoRoot);

  let changed = false;
  if (updates.setProvider && updates.setProvider.length > 0) {
    config.defaultProviders = [...new Set(updates.setProvider)];
    changed = true;
  }
  if (updates.setTarget && updates.setTarget.length > 0) {
    config.defaultTargets = updates.setTarget as typeof config.defaultTargets;
    changed = true;
  }
  if (typeof updates.setMinSecurityScore === "number" && !Number.isNaN(updates.setMinSecurityScore)) {
    config.minSecurityScore = updates.setMinSecurityScore;
    changed = true;
  }
  if (updates.allowScripts === true) {
    config.noScripts = false;
    changed = true;
  }

  if (changed) {
    await saveConfig(repoRoot, config);
  }

  if (flags.json) {
    printJson(config);
    return;
  }

  process.stdout.write(`Config path: ${repoRoot}/.pom/config.json\n`);
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}
