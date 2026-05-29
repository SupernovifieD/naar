import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { NaarConfig } from "../types/index.js";

const NAAR_DIR = ".naar";
const CONFIG_FILE = "config.json";

export async function loadConfig(repoRoot: string): Promise<NaarConfig> {
  const file = path.join(repoRoot, NAAR_DIR, CONFIG_FILE);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<NaarConfig>;
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

export async function saveConfig(repoRoot: string, config: NaarConfig): Promise<string> {
  const dir = path.join(repoRoot, NAAR_DIR);
  const file = path.join(dir, CONFIG_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return file;
}
