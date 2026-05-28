import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { PomConfig } from "../types/index.js";

const POM_DIR = ".pom";
const CONFIG_FILE = "config.json";

export async function loadConfig(repoRoot: string): Promise<PomConfig> {
  const file = path.join(repoRoot, POM_DIR, CONFIG_FILE);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<PomConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      defaultProviders: parsed.defaultProviders ?? DEFAULT_CONFIG.defaultProviders,
      defaultTargets: parsed.defaultTargets ?? DEFAULT_CONFIG.defaultTargets
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(repoRoot: string, config: PomConfig): Promise<string> {
  const dir = path.join(repoRoot, POM_DIR);
  const file = path.join(dir, CONFIG_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return file;
}
