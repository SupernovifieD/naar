import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { RepoFacts, SkillRecommendation } from "../types/index.js";

const CACHE_DIR = path.join(".naar", "cache");
const SCAN_FILE = "scan.json";
const RECOMMEND_FILE = "recommendations.json";

export interface RecommendationCache {
  repoFacts: RepoFacts;
  recommendations: SkillRecommendation[];
  generatedAtIso: string;
}

export async function saveScanCache(repoRoot: string, facts: RepoFacts): Promise<void> {
  const dir = path.join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, SCAN_FILE), JSON.stringify(facts, null, 2) + "\n", "utf8");
}

export async function loadScanCache(repoRoot: string): Promise<RepoFacts | null> {
  try {
    const raw = await readFile(path.join(repoRoot, CACHE_DIR, SCAN_FILE), "utf8");
    return JSON.parse(raw) as RepoFacts;
  } catch {
    return null;
  }
}

export async function saveRecommendationCache(repoRoot: string, cache: RecommendationCache): Promise<void> {
  const dir = path.join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, RECOMMEND_FILE), JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export async function loadRecommendationCache(repoRoot: string): Promise<RecommendationCache | null> {
  try {
    const raw = await readFile(path.join(repoRoot, CACHE_DIR, RECOMMEND_FILE), "utf8");
    return JSON.parse(raw) as RecommendationCache;
  } catch {
    return null;
  }
}
