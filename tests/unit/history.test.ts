import { mkdtemp, readFile, stat, symlink, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InstalledSkillRecord, RepoFacts } from "../../src/types/index.js";
import { resolveHistoryFilePath } from "../../src/history/historyPaths.js";
import { createEmptyHistory, HISTORY_VERSION } from "../../src/history/historySchema.js";
import { loadHistory, saveHistory } from "../../src/history/historyStore.js";
import {
  clearHistory,
  findMissingProjects,
  forgetProject,
  loadHistoryForDisplay,
  pruneMissingProjects,
  recordInstallHistory,
  recordUninstallHistory
} from "../../src/history/historyService.js";
import {
  runHistoryClear,
  runHistoryList,
  runHistoryShow,
  runHistorySkills,
  runHistorySummary
} from "../../src/history/historyCommands.js";

const NOW = new Date("2026-06-03T00:00:00.000Z");
const LATER = new Date("2026-06-04T00:00:00.000Z");
const LATEST = new Date("2026-06-05T00:00:00.000Z");

let captured = "";
const originalWrite = process.stdout.write;

afterEach(() => {
  process.stdout.write = originalWrite;
  captured = "";
});

describe("history path resolution", () => {
  it("resolves OS-specific history paths and NAAR_HOME override", () => {
    expect(resolveHistoryFilePath({ platform: "darwin", homedir: "/Users/alice", env: {} })).toBe("/Users/alice/Library/Application Support/naar/history.json");
    expect(resolveHistoryFilePath({ platform: "linux", homedir: "/home/alice", env: { XDG_DATA_HOME: "/data" } })).toBe("/data/naar/history.json");
    expect(resolveHistoryFilePath({ platform: "linux", homedir: "/home/alice", env: {} })).toBe("/home/alice/.local/share/naar/history.json");
    expect(resolveHistoryFilePath({ platform: "win32", homedir: "C:/Users/Alice", env: { APPDATA: "C:/Users/Alice/AppData/Roaming" } })).toBe("C:/Users/Alice/AppData/Roaming/naar/history.json");
    expect(resolveHistoryFilePath({ platform: "linux", homedir: "/home/alice", env: { NAAR_HOME: "/custom/naar" } })).toBe("/custom/naar/history.json");
  });
});

describe("history store", () => {
  it("creates empty history when no file exists and saves with restrictive permissions", async () => {
    const dir = await tempDir();
    const historyFilePath = path.join(dir, "history.json");
    const loaded = await loadHistory({ historyFilePath, now: () => NOW });
    expect(loaded.history.projects).toEqual({});
    expect(loaded.history.version).toBe(HISTORY_VERSION);

    await saveHistory(loaded.history, { historyFilePath });
    const fileMode = (await stat(historyFilePath)).mode & 0o777;
    const dirMode = (await stat(dir)).mode & 0o777;
    if (process.platform !== "win32") {
      expect(fileMode).toBe(0o600);
      expect(dirMode).toBe(0o700);
    }
  });

  it("backs up corrupt history and starts fresh", async () => {
    const dir = await tempDir();
    const historyFilePath = path.join(dir, "history.json");
    await writeFile(historyFilePath, "not json", "utf8");

    const loaded = await loadHistory({ historyFilePath, now: () => NOW });

    expect(loaded.warning).toContain("invalid JSON");
    expect(loaded.corruptBackupPath).toBeTruthy();
    expect(await readFile(loaded.corruptBackupPath!, "utf8")).toBe("not json");
    expect(loaded.history.projects).toEqual({});
  });

  it("migrates v1 history to lifecycle v2 with synthetic install events", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    const historyFilePath = path.join(dir, "history.json");
    const installed = makeInstalledSkill();
    await writeFile(historyFilePath, JSON.stringify({
      version: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      projects: {
        project1: {
          projectId: "project1",
          name: "repo",
          path: repoPath,
          pathHash: "hash",
          firstSeenAt: NOW.toISOString(),
          lastSeenAt: NOW.toISOString(),
          lastInstallAt: NOW.toISOString(),
          installedSkills: [{
            providerId: installed.providerId,
            skillId: installed.providerSkillId,
            canonicalId: installed.canonicalSkillId,
            version: installed.installedVersion,
            ref: installed.pinnedRef,
            targets: installed.targets,
            securityScore: installed.securityScoreAtInstall,
            installedAt: installed.installedAtIso,
            lastSeenAt: NOW.toISOString(),
            installCount: 2
          }]
        }
      },
      skills: {}
    }), "utf8");

    const loaded = await loadHistory({ historyFilePath });
    const project = loaded.history.projects.project1;

    expect(loaded.history.version).toBe(HISTORY_VERSION);
    expect(project.installedSkills).toHaveLength(1);
    expect(project.events).toHaveLength(2);
    expect(project.events[0]).toMatchObject({ type: "install", source: "migration" });
    expect(loaded.history.skills["secure-skill"]).toMatchObject({
      currentlyInstalledInProjects: ["project1"],
      everInstalledInProjects: ["project1"],
      installCount: 2,
      uninstallCount: 0
    });
  });

  it("refuses unsafe symlinked history file without overwriting the target", async () => {
    if (process.platform === "win32") return;
    const dir = await tempDir();
    const target = path.join(dir, "target.json");
    const historyFilePath = path.join(dir, "history.json");
    await writeFile(target, "original", "utf8");
    await symlink(target, historyFilePath);

    await expect(saveHistory(createEmptyHistory(NOW.toISOString()), { historyFilePath })).rejects.toThrow("symlinked file");
    expect(await readFile(target, "utf8")).toBe("original");
  });
});

describe("history service", () => {
  it("records installs, updates existing projects, and rebuilds skill summaries", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");

    await recordInstallHistory({
      repoPath,
      repoFacts: makeRepoFacts(repoPath),
      installedSkills: [makeInstalledSkill()],
      historyFilePath,
      now: () => NOW
    });
    await recordInstallHistory({
      repoPath,
      repoFacts: makeRepoFacts(repoPath),
      installedSkills: [makeInstalledSkill({ targets: ["claude_project_skills"] })],
      historyFilePath,
      now: () => LATER
    });

    const loaded = await loadHistoryForDisplay({ historyFilePath });
    const project = Object.values(loaded.history.projects)[0];
    const skill = project.installedSkills[0];

    expect(project.name).toBe("repo");
    expect(project.path).toBe(repoPath);
    expect(project.pathHash).not.toContain(repoPath);
    expect(project.detected?.languages).toEqual(["TypeScript"]);
    expect(project.events.map((event) => event.type)).toEqual(["install", "install"]);
    expect(project.events.map((event) => event.source)).toEqual(["install_flow", "install_flow"]);
    expect(skill.installCount).toBe(2);
    expect(skill.targets).toEqual(["claude_project_skills", "codex_repo_skills"]);
    expect(loaded.history.skills["secure-skill"].installCount).toBe(2);
    expect(loaded.history.skills["secure-skill"].currentlyInstalledInProjects).toEqual([project.projectId]);
    expect(loaded.history.skills["secure-skill"].usedInProjects).toEqual([project.projectId]);
  });

  it("records uninstall lifecycle events and keeps projects after all skills are removed", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");
    const installed = makeInstalledSkill();

    await recordInstallHistory({ repoPath, currentInstalledSkills: [installed], installedSkills: [installed], historyFilePath, now: () => NOW });
    await recordUninstallHistory({ repoPath, remainingInstalledSkills: [], uninstalledSkills: [installed], historyFilePath, now: () => LATER });

    let loaded = await loadHistoryForDisplay({ historyFilePath });
    const project = Object.values(loaded.history.projects)[0];
    expect(project.installedSkills).toEqual([]);
    expect(project.lastUninstallAt).toBe(LATER.toISOString());
    expect(project.events.map((event) => event.type)).toEqual(["install", "uninstall"]);
    expect(project.events.map((event) => event.source)).toEqual(["install_flow", "uninstall_flow"]);
    expect(loaded.history.skills["secure-skill"]).toMatchObject({
      currentlyInstalledInProjects: [],
      everInstalledInProjects: [project.projectId],
      uninstalledFromProjects: [project.projectId],
      usedInProjects: [],
      installCount: 1,
      uninstallCount: 1
    });

    await recordInstallHistory({ repoPath, currentInstalledSkills: [installed], installedSkills: [installed], historyFilePath, now: () => LATEST });
    loaded = await loadHistoryForDisplay({ historyFilePath });
    expect(loaded.history.skills["secure-skill"]).toMatchObject({
      currentlyInstalledInProjects: [project.projectId],
      everInstalledInProjects: [project.projectId],
      uninstalledFromProjects: [project.projectId],
      installCount: 2,
      uninstallCount: 1
    });
  });

  it("does not write history when disabled by env", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");

    const result = await recordInstallHistory({
      repoPath,
      installedSkills: [makeInstalledSkill()],
      historyFilePath,
      env: { NAAR_HISTORY: "0" }
    });

    expect(result.disabled).toBe(true);
    await expect(readFile(historyFilePath, "utf8")).rejects.toThrow();
  });

  it("prunes, forgets, and clears project history", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    const missingPath = path.join(dir, "missing");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");

    await recordInstallHistory({ repoPath, installedSkills: [makeInstalledSkill()], historyFilePath, now: () => NOW });
    await recordInstallHistory({ repoPath: missingPath, installedSkills: [makeInstalledSkill({ canonicalSkillId: "other" })], historyFilePath, now: () => NOW });

    const missing = await findMissingProjects({ historyFilePath });
    expect(missing.result.map((project) => project.path)).toEqual([missingPath]);

    const pruned = await pruneMissingProjects({ historyFilePath, now: () => LATER });
    expect(pruned.result.pruned).toBe(1);
    expect(Object.keys(pruned.history.projects)).toHaveLength(1);

    const forgotten = await forgetProject(repoPath, { historyFilePath, now: () => LATER });
    expect(forgotten.result.removed).toBe(true);
    expect(Object.keys(forgotten.history.projects)).toHaveLength(0);

    const cleared = await clearHistory({ historyFilePath, now: () => LATER });
    expect(cleared.history.version).toBe(HISTORY_VERSION);
    expect(cleared.history.projects).toEqual({});
    expect(cleared.history.skills).toEqual({});
  });
});

describe("history commands", () => {
  it("renders summary, lists, skills, show, and JSON without formatted text", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");
    await recordInstallHistory({ repoPath, repoFacts: makeRepoFacts(repoPath), installedSkills: [makeInstalledSkill()], historyFilePath, now: () => NOW });

    captureStdout();
    await runHistorySummary({ historyFilePath, history: false });
    expect(stripAnsi(captured)).toContain("History is disabled");
    expect(stripAnsi(captured)).toContain("Remembered projects: 1");
    expect(stripAnsi(captured)).toContain("Current skills: 1");
    expect(stripAnsi(captured)).toContain("Skills ever used: 1");
    expect(stripAnsi(captured)).toContain("Install events: 1");
    expect(stripAnsi(captured)).toContain("Last updated:");
    expect(stripAnsi(captured)).not.toContain(NOW.toISOString());
    expect(stripAnsi(captured)).toContain("Recent projects");
    expect(stripAnsi(captured)).toContain("Recent activity");

    captureStdout();
    await runHistoryList({ historyFilePath, verbose: true });
    expect(stripAnsi(captured)).toContain("Remembered projects");
    expect(stripAnsi(captured)).toContain("repo");
    expect(stripAnsi(captured)).toContain("1 current");
    expect(stripAnsi(captured)).toContain("Path:");
    expect(stripAnsi(captured)).toContain(repoPath);

    captureStdout();
    await runHistorySkills({ historyFilePath });
    expect(stripAnsi(captured)).toContain("Remembered skills");
    expect(stripAnsi(captured)).toContain("secure-skill");
    expect(stripAnsi(captured)).toContain("1 current projects");
    expect(stripAnsi(captured)).toContain("1 installs");

    captureStdout();
    await runHistoryShow(repoPath, { historyFilePath, verbose: true });
    expect(stripAnsi(captured)).toContain("Current installed skills");
    expect(stripAnsi(captured)).toContain("Recent activity");
    expect(stripAnsi(captured)).toContain("Security score: 100/100");

    captureStdout();
    await runHistorySummary({ historyFilePath, json: true });
    const summary = JSON.parse(captured) as { updatedAt: string; currentSkillCount: number; installEventCount: number };
    expect(summary.updatedAt).toBe(NOW.toISOString());
    expect(summary.currentSkillCount).toBe(1);
    expect(summary.installEventCount).toBe(1);

    captureStdout();
    await runHistoryList({ historyFilePath, json: true });
    const parsed = JSON.parse(captured) as { projects: Array<{ path: string }> };
    expect(parsed.projects[0].path).toBe(repoPath);
  });

  it("requires JSON confirmation for destructive commands unless --yes is passed", async () => {
    const dir = await tempDir();
    const repoPath = path.join(dir, "repo");
    await mkdir(repoPath);
    const historyFilePath = path.join(dir, "history.json");
    await recordInstallHistory({ repoPath, installedSkills: [makeInstalledSkill()], historyFilePath, now: () => NOW });

    captureStdout();
    await runHistoryClear({ historyFilePath, json: true });
    expect(JSON.parse(captured)).toMatchObject({ confirmationRequired: true });

    captureStdout();
    await runHistoryClear({ historyFilePath, json: true, yes: true });
    expect(JSON.parse(captured)).toMatchObject({ cleared: true, projectCount: 0, skillCount: 0, currentSkillCount: 0, installEventCount: 0, uninstallEventCount: 0 });
  });
});

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "naar-history-test-"));
}

function captureStdout(): void {
  captured = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function makeInstalledSkill(overrides: Partial<InstalledSkillRecord> = {}): InstalledSkillRecord {
  return {
    providerScopedId: "test:secure-skill",
    canonicalSkillId: "secure-skill",
    providerId: "test",
    providerSkillId: "secure-skill",
    installedAtIso: NOW.toISOString(),
    installedVersion: "1.0.0",
    pinnedRef: "secure-skill@1.0.0",
    targets: ["codex_repo_skills"],
    managedFiles: [".agents/skills/secure-skill/SKILL.md"],
    securityScoreAtInstall: 100,
    ...overrides
  };
}

function makeRepoFacts(repoRoot: string): RepoFacts {
  return {
    repoRoot,
    scanTimeIso: NOW.toISOString(),
    languages: ["TypeScript"],
    packageManagers: [{ id: "npm", confidence: 1, lockfiles: ["package-lock.json"] }],
    frameworks: [],
    aiAssistants: [{ id: "codex", status: "found", configPathsFound: [".agents/skills"], recommendedInstallTargets: ["codex_repo_skills"] }],
    findings: [],
    topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
    readiness: { score: 90, grade: "Excellent", missingCapabilities: [] }
  };
}
