import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { InstalledState, PomLock, SkillCandidate, InstallTarget } from "../types/index.js";

const POM_DIR = ".pom";
const INSTALLED_FILE = "installed.json";
const LOCK_FILE = "pom.lock.json";

export function installedStatePath(repoRoot: string): string {
  return path.join(repoRoot, POM_DIR, INSTALLED_FILE);
}

export function lockfilePath(repoRoot: string): string {
  return path.join(repoRoot, LOCK_FILE);
}

export async function loadInstalledState(repoRoot: string): Promise<InstalledState> {
  try {
    const raw = await readFile(installedStatePath(repoRoot), "utf8");
    return JSON.parse(raw) as InstalledState;
  } catch {
    return { version: 1, skills: [] };
  }
}

export async function saveInstalledState(repoRoot: string, state: InstalledState): Promise<void> {
  const dir = path.join(repoRoot, POM_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(installedStatePath(repoRoot), JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function loadLockfile(repoRoot: string): Promise<PomLock> {
  try {
    const raw = await readFile(lockfilePath(repoRoot), "utf8");
    return JSON.parse(raw) as PomLock;
  } catch {
    return { version: 1, skills: [] };
  }
}

export async function saveLockfile(repoRoot: string, lockfile: PomLock): Promise<void> {
  await writeFile(lockfilePath(repoRoot), JSON.stringify(lockfile, null, 2) + "\n", "utf8");
}

export function buildInstalledRecord(
  skill: SkillCandidate,
  managedFiles: string[],
  targets: InstallTarget[]
): InstalledState["skills"][number] {
  return {
    canonicalSkillId: skill.canonicalSkillId,
    providerId: skill.source.providerId,
    providerSkillId: skill.providerSkillId,
    installedAtIso: new Date().toISOString(),
    installedVersion: skill.source.version ?? "unknown",
    pinnedRef: skill.metadata.pinnedRef ?? skill.source.ref ?? "unversioned",
    targets,
    managedFiles,
    securityScoreAtInstall: skill.risk.score
  };
}
