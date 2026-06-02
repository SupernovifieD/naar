import { access } from "node:fs/promises";
import type { CliFlags, InstalledSkillRecord, RepoFacts } from "../types/index.js";
import { getHistoryFilePath, loadHistory, saveHistory, resetHistory, type HistoryStoreOptions } from "./historyStore.js";
import { projectIdForPath, normalizeProjectPath } from "./historyPaths.js";
import type { HistoryInstalledSkill, HistoryProject, HistorySkillSummary, NaarHistory } from "./historySchema.js";

export interface HistoryRuntimeOptions extends HistoryStoreOptions {
  history?: boolean;
}

export interface RecordInstallHistoryOptions extends HistoryRuntimeOptions {
  repoPath: string;
  repoFacts?: RepoFacts;
  installedSkills: InstalledSkillRecord[];
}

export interface HistoryCommandResult<T> {
  history: NaarHistory;
  filePath: string;
  warning?: string;
  result: T;
}

export interface PruneResult {
  pruned: number;
  remaining: number;
  removedProjects: HistoryProject[];
}

export interface ForgetResult {
  removed: boolean;
  project?: HistoryProject;
}

export interface RecordHistoryResult {
  recorded: boolean;
  disabled: boolean;
  projectId?: string;
  filePath?: string;
}

export function isHistoryEnabled(options: Pick<HistoryRuntimeOptions, "history" | "env"> = {}): boolean {
  if (options.history === false) return false;
  if (options.history === true) return true;
  const value = options.env?.NAAR_HISTORY ?? process.env.NAAR_HISTORY;
  return !(value === "0" || value?.toLowerCase() === "false");
}

export async function recordInstallHistory(options: RecordInstallHistoryOptions): Promise<RecordHistoryResult> {
  if (!isHistoryEnabled(options)) {
    return { recorded: false, disabled: true };
  }

  if (options.installedSkills.length === 0) {
    return { recorded: false, disabled: false };
  }

  const loaded = await loadHistory(options);
  const now = nowIso(options);
  const projectInfo = projectIdForPath(options.repoPath, options);
  const existing = loaded.history.projects[projectInfo.projectId];
  const project: HistoryProject = existing ?? {
    projectId: projectInfo.projectId,
    name: projectNameFromPath(projectInfo.normalizedPath),
    path: projectInfo.normalizedPath,
    pathHash: projectInfo.pathHash,
    firstSeenAt: now,
    lastSeenAt: now,
    installedSkills: []
  };

  project.name = projectNameFromPath(projectInfo.normalizedPath);
  project.path = projectInfo.normalizedPath;
  project.pathHash = projectInfo.pathHash;
  project.lastSeenAt = now;
  project.lastInstallAt = now;
  project.detected = extractDetectedFacts(options.repoFacts);

  for (const installed of options.installedSkills) {
    mergeInstalledSkill(project, installed, now);
  }

  loaded.history.projects[project.projectId] = project;
  const next = rebuildSkillSummaries({
    ...loaded.history,
    updatedAt: now
  });
  await saveHistory(next, options);

  return { recorded: true, disabled: false, projectId: project.projectId, filePath: loaded.filePath };
}

export async function loadHistoryForDisplay(options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<undefined>> {
  const loaded = await loadHistory(options);
  return { history: loaded.history, filePath: loaded.filePath, warning: loaded.warning, result: undefined };
}

export async function findProjectByPath(projectPath: string, options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<HistoryProject | undefined>> {
  const loaded = await loadHistory(options);
  const normalizedPath = normalizeProjectPath(projectPath, options);
  const project = Object.values(loaded.history.projects)
    .find((entry) => entry.path === normalizedPath);
  return { history: loaded.history, filePath: loaded.filePath, warning: loaded.warning, result: project };
}

export async function pruneMissingProjects(options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<PruneResult>> {
  const loaded = await loadHistory(options);
  const removedProjects: HistoryProject[] = [];
  const projects: NaarHistory["projects"] = {};

  for (const project of Object.values(loaded.history.projects)) {
    if (await exists(project.path)) {
      projects[project.projectId] = project;
    } else {
      removedProjects.push(project);
    }
  }

  const now = nowIso(options);
  const next = rebuildSkillSummaries({
    ...loaded.history,
    projects,
    updatedAt: now
  });
  await saveHistory(next, options);

  return {
    history: next,
    filePath: loaded.filePath,
    warning: loaded.warning,
    result: {
      pruned: removedProjects.length,
      remaining: Object.keys(next.projects).length,
      removedProjects
    }
  };
}

export async function forgetProject(projectPath: string, options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<ForgetResult>> {
  const loaded = await loadHistory(options);
  const normalizedPath = normalizeProjectPath(projectPath, options);
  const projects = { ...loaded.history.projects };
  const project = Object.values(projects).find((entry) => entry.path === normalizedPath);
  if (!project) {
    return {
      history: loaded.history,
      filePath: loaded.filePath,
      warning: loaded.warning,
      result: { removed: false }
    };
  }

  delete projects[project.projectId];
  const next = rebuildSkillSummaries({
    ...loaded.history,
    projects,
    updatedAt: nowIso(options)
  });
  await saveHistory(next, options);

  return {
    history: next,
    filePath: loaded.filePath,
    warning: loaded.warning,
    result: { removed: true, project }
  };
}

export async function clearHistory(options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<{ cleared: true }>> {
  const history = await resetHistory(options);
  return {
    history,
    filePath: getHistoryFilePath(options),
    result: { cleared: true }
  };
}

export async function findMissingProjects(options: HistoryRuntimeOptions = {}): Promise<HistoryCommandResult<HistoryProject[]>> {
  const loaded = await loadHistory(options);
  const missing: HistoryProject[] = [];
  for (const project of Object.values(loaded.history.projects)) {
    if (!(await exists(project.path))) {
      missing.push(project);
    }
  }
  return { history: loaded.history, filePath: loaded.filePath, warning: loaded.warning, result: missing };
}

export function listProjects(history: NaarHistory): HistoryProject[] {
  return Object.values(history.projects)
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export function listSkillSummaries(history: NaarHistory): HistorySkillSummary[] {
  return Object.values(history.skills)
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export function rebuildSkillSummaries(history: NaarHistory): NaarHistory {
  const skills: Record<string, HistorySkillSummary> = {};
  for (const project of Object.values(history.projects)) {
    for (const installed of project.installedSkills) {
      const existing = skills[installed.canonicalId];
      if (!existing) {
        skills[installed.canonicalId] = {
          canonicalId: installed.canonicalId,
          providerIds: [installed.providerId],
          skillIds: [installed.skillId],
          name: installed.name,
          targets: [...installed.targets],
          usedInProjects: [project.projectId],
          firstSeenAt: installed.installedAt,
          lastSeenAt: installed.lastSeenAt,
          installCount: installed.installCount
        };
        continue;
      }

      existing.providerIds = mergeStrings(existing.providerIds, [installed.providerId]);
      existing.skillIds = mergeStrings(existing.skillIds, [installed.skillId]);
      existing.targets = mergeStrings(existing.targets, installed.targets);
      existing.usedInProjects = mergeStrings(existing.usedInProjects, [project.projectId]);
      existing.firstSeenAt = minIso(existing.firstSeenAt, installed.installedAt);
      existing.lastSeenAt = maxIso(existing.lastSeenAt, installed.lastSeenAt);
      existing.installCount += installed.installCount;
      existing.name = existing.name ?? installed.name;
    }
  }
  return { ...history, skills };
}

function mergeInstalledSkill(project: HistoryProject, installed: InstalledSkillRecord, now: string): void {
  const existing = project.installedSkills.find((entry) =>
    entry.providerId === installed.providerId
    && entry.skillId === installed.providerSkillId
    && entry.canonicalId === installed.canonicalSkillId
  );

  if (!existing) {
    project.installedSkills.push({
      providerId: installed.providerId,
      skillId: installed.providerSkillId,
      canonicalId: installed.canonicalSkillId,
      version: installed.installedVersion,
      ref: installed.pinnedRef,
      targets: [...installed.targets],
      securityScore: installed.securityScoreAtInstall,
      installedAt: installed.installedAtIso || now,
      lastSeenAt: now,
      installCount: 1
    });
    return;
  }

  existing.version = installed.installedVersion;
  existing.ref = installed.pinnedRef;
  existing.targets = mergeStrings(existing.targets, installed.targets);
  existing.securityScore = installed.securityScoreAtInstall;
  existing.lastSeenAt = now;
  existing.installCount += 1;
}

function extractDetectedFacts(repoFacts: RepoFacts | undefined): HistoryProject["detected"] {
  if (!repoFacts) return undefined;
  return {
    languages: nonEmpty(repoFacts.primaryFacts?.languages.map((entry) => entry.id) ?? repoFacts.languages),
    frameworks: nonEmpty(repoFacts.primaryFacts?.frameworks.map((entry) => entry.id) ?? repoFacts.frameworks.map((entry) => entry.id)),
    packageManagers: nonEmpty(repoFacts.primaryFacts?.packageManagers.map((entry) => entry.id) ?? repoFacts.packageManagers.map((entry) => entry.id)),
    assistants: nonEmpty(repoFacts.aiAssistants.map((entry) => entry.id))
  };
}

function nonEmpty(values: string[] | undefined): string[] | undefined {
  const cleaned = mergeStrings([], values ?? []);
  return cleaned.length > 0 ? cleaned : undefined;
}

function projectNameFromPath(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts.at(-1) ?? projectPath;
}

function mergeStrings(left: string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right].filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b));
}

function minIso(left: string, right: string): string {
  return left <= right ? left : right;
}

function maxIso(left: string, right: string): string {
  return left >= right ? left : right;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function nowIso(options: HistoryRuntimeOptions): string {
  return (options.now?.() ?? new Date()).toISOString();
}
