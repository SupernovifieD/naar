import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import type { InstalledSkillRecord, RepoFacts } from "../types/index.js";
import { getHistoryFilePath, loadHistory, saveHistory, resetHistory, type HistoryStoreOptions } from "./historyStore.js";
import { projectIdForPath, normalizeProjectPath } from "./historyPaths.js";
import type {
  HistoryEvent,
  HistoryEventSkill,
  HistoryInstalledSkill,
  HistoryProject,
  HistorySkillSummary,
  NaarHistory
} from "./historySchema.js";

export interface HistoryRuntimeOptions extends HistoryStoreOptions {
  history?: boolean;
}

export interface RecordInstallHistoryOptions extends HistoryRuntimeOptions {
  repoPath: string;
  repoFacts?: RepoFacts;
  installedSkills: InstalledSkillRecord[];
  currentInstalledSkills?: InstalledSkillRecord[];
}

export interface RecordUninstallHistoryOptions extends HistoryRuntimeOptions {
  repoPath: string;
  remainingInstalledSkills: InstalledSkillRecord[];
  uninstalledSkills: InstalledSkillRecord[];
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

  const currentInstalledSkills = options.currentInstalledSkills ?? options.installedSkills;
  if (currentInstalledSkills.length === 0 && options.installedSkills.length === 0) {
    return { recorded: false, disabled: false };
  }

  const loaded = await loadHistory(options);
  const now = nowIso(options);
  const project = ensureProject(loaded.history, options.repoPath, now, options);
  const previousCurrentKeys = new Set(project.installedSkills.map(historySkillKey));

  project.lastSeenAt = now;
  project.lastInstallAt = now;
  project.detected = extractDetectedFacts(options.repoFacts) ?? project.detected;
  syncProjectCurrentInstalledSkills(project, currentInstalledSkills, now);
  preserveInstallCountsForNewSync(project, options.installedSkills, previousCurrentKeys);

  if (options.installedSkills.length > 0) {
    project.events.push(createHistoryEvent("install", "install_flow", options.installedSkills, now));
  }

  loaded.history.projects[project.projectId] = project;
  const next = rebuildSkillSummaries({
    ...loaded.history,
    updatedAt: now
  });
  await saveHistory(next, options);

  return { recorded: true, disabled: false, projectId: project.projectId, filePath: loaded.filePath };
}

export async function recordUninstallHistory(options: RecordUninstallHistoryOptions): Promise<RecordHistoryResult> {
  if (!isHistoryEnabled(options)) {
    return { recorded: false, disabled: true };
  }

  if (options.remainingInstalledSkills.length === 0 && options.uninstalledSkills.length === 0) {
    return { recorded: false, disabled: false };
  }

  const loaded = await loadHistory(options);
  const now = nowIso(options);
  const project = ensureProject(loaded.history, options.repoPath, now, options);

  project.lastSeenAt = now;
  project.lastUninstallAt = now;
  syncProjectCurrentInstalledSkills(project, options.remainingInstalledSkills, now);
  if (options.uninstalledSkills.length > 0) {
    project.events.push(createHistoryEvent("uninstall", "uninstall_flow", options.uninstalledSkills, now));
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
      const summary = ensureSummary(skills, installed.canonicalId, installed.installedAt);
      applySkillIdentity(summary, installed);
      summary.currentlyInstalledInProjects = mergeStrings(summary.currentlyInstalledInProjects, [project.projectId]);
      summary.everInstalledInProjects = mergeStrings(summary.everInstalledInProjects, [project.projectId]);
      summary.usedInProjects = summary.currentlyInstalledInProjects;
      summary.firstSeenAt = minIso(summary.firstSeenAt, installed.installedAt);
      summary.lastSeenAt = maxIso(summary.lastSeenAt, installed.lastSeenAt);
      summary.lastInstalledAt = maxOptionalIso(summary.lastInstalledAt, installed.installedAt);
    }

    for (const event of project.events) {
      for (const skill of event.skills) {
        const summary = ensureSummary(skills, skill.canonicalId, event.at);
        applySkillIdentity(summary, skill);
        summary.everInstalledInProjects = mergeStrings(summary.everInstalledInProjects, [project.projectId]);
        summary.firstSeenAt = minIso(summary.firstSeenAt, event.at);
        summary.lastSeenAt = maxIso(summary.lastSeenAt, event.at);
        if (event.type === "install") {
          summary.installCount += 1;
          summary.lastInstalledAt = maxOptionalIso(summary.lastInstalledAt, event.at);
        } else {
          summary.uninstallCount += 1;
          summary.uninstalledFromProjects = mergeStrings(summary.uninstalledFromProjects, [project.projectId]);
          summary.lastUninstalledAt = maxOptionalIso(summary.lastUninstalledAt, event.at);
        }
      }
    }
  }

  for (const summary of Object.values(skills)) {
    summary.usedInProjects = summary.currentlyInstalledInProjects;
  }

  return { ...history, skills };
}

export function countHistoryEvents(history: NaarHistory, type: HistoryEvent["type"]): number {
  return Object.values(history.projects)
    .reduce((count, project) => count + project.events.filter((event) => event.type === type).length, 0);
}

export function projectUninstalledSkillIds(project: HistoryProject): string[] {
  return mergeStrings([], project.events
    .filter((event) => event.type === "uninstall")
    .flatMap((event) => event.skills.map((skill) => skill.canonicalId)))
}

export function listRecentActivity(history: NaarHistory, limit = 5): Array<{ project: HistoryProject; event: HistoryEvent; skill: HistoryEventSkill }> {
  const activity: Array<{ project: HistoryProject; event: HistoryEvent; skill: HistoryEventSkill }> = [];
  for (const project of Object.values(history.projects)) {
    for (const event of project.events) {
      for (const skill of event.skills) {
        activity.push({ project, event, skill });
      }
    }
  }
  return activity
    .sort((left, right) => right.event.at.localeCompare(left.event.at))
    .slice(0, limit);
}

function ensureProject(history: NaarHistory, repoPath: string, now: string, options: HistoryRuntimeOptions): HistoryProject {
  const projectInfo = projectIdForPath(repoPath, options);
  const existing = history.projects[projectInfo.projectId];
  const project: HistoryProject = existing ?? {
    projectId: projectInfo.projectId,
    name: projectNameFromPath(projectInfo.normalizedPath),
    path: projectInfo.normalizedPath,
    pathHash: projectInfo.pathHash,
    firstSeenAt: now,
    lastSeenAt: now,
    installedSkills: [],
    events: []
  };

  project.name = projectNameFromPath(projectInfo.normalizedPath);
  project.path = projectInfo.normalizedPath;
  project.pathHash = projectInfo.pathHash;
  project.events = project.events ?? [];
  project.installedSkills = project.installedSkills ?? [];
  history.projects[project.projectId] = project;
  return project;
}

function syncProjectCurrentInstalledSkills(project: HistoryProject, currentInstalledSkills: InstalledSkillRecord[], now: string): void {
  const existingByKey = new Map(project.installedSkills.map((skill) => [historySkillKey(skill), skill]));
  project.installedSkills = currentInstalledSkills
    .map((installed) => toHistoryInstalledSkill(installed, now, existingByKey.get(installedSkillRecordKey(installed))))
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId) || left.providerId.localeCompare(right.providerId));
}

function preserveInstallCountsForNewSync(project: HistoryProject, installedSkills: InstalledSkillRecord[], previousCurrentKeys: Set<string>): void {
  for (const installed of installedSkills) {
    const key = installedSkillRecordKey(installed);
    if (!previousCurrentKeys.has(key)) continue;
    const current = project.installedSkills.find((skill) => historySkillKey(skill) === key);
    if (current) current.installCount += 1;
  }
}

function toHistoryInstalledSkill(installed: InstalledSkillRecord, now: string, existing: HistoryInstalledSkill | undefined): HistoryInstalledSkill {
  return {
    providerId: installed.providerId,
    skillId: installed.providerSkillId,
    canonicalId: installed.canonicalSkillId,
    version: installed.installedVersion,
    ref: installed.pinnedRef,
    targets: mergeStrings(existing?.targets ?? [], installed.targets),
    securityScore: installed.securityScoreAtInstall,
    installedAt: existing?.installedAt ?? (installed.installedAtIso || now),
    lastSeenAt: now,
    installCount: existing?.installCount ?? 1
  };
}

function createHistoryEvent(
  type: HistoryEvent["type"],
  source: HistoryEvent["source"],
  installedSkills: InstalledSkillRecord[],
  now: string
): HistoryEvent {
  return {
    eventId: randomUUID(),
    type,
    at: now,
    source,
    skills: installedSkills.map(toHistoryEventSkill)
  };
}

function toHistoryEventSkill(installed: InstalledSkillRecord): HistoryEventSkill {
  return {
    providerId: installed.providerId,
    skillId: installed.providerSkillId,
    canonicalId: installed.canonicalSkillId,
    version: installed.installedVersion,
    ref: installed.pinnedRef,
    targets: [...installed.targets],
    securityScore: installed.securityScoreAtInstall
  };
}

function ensureSummary(skills: Record<string, HistorySkillSummary>, canonicalId: string, seenAt: string): HistorySkillSummary {
  const existing = skills[canonicalId];
  if (existing) return existing;
  const created: HistorySkillSummary = {
    canonicalId,
    providerIds: [],
    skillIds: [],
    targets: [],
    currentlyInstalledInProjects: [],
    everInstalledInProjects: [],
    uninstalledFromProjects: [],
    usedInProjects: [],
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    installCount: 0,
    uninstallCount: 0
  };
  skills[canonicalId] = created;
  return created;
}

function applySkillIdentity(summary: HistorySkillSummary, skill: HistoryInstalledSkill | HistoryEventSkill): void {
  summary.providerIds = mergeStrings(summary.providerIds, [skill.providerId]);
  summary.skillIds = mergeStrings(summary.skillIds, [skill.skillId]);
  summary.targets = mergeStrings(summary.targets, skill.targets);
  summary.name = summary.name ?? skill.name;
}

function installedSkillRecordKey(installed: InstalledSkillRecord): string {
  return `${installed.providerId}:${installed.providerSkillId}:${installed.canonicalSkillId}`;
}

function historySkillKey(skill: HistoryInstalledSkill): string {
  return `${skill.providerId}:${skill.skillId}:${skill.canonicalId}`;
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

function maxOptionalIso(left: string | undefined, right: string): string {
  return left ? maxIso(left, right) : right;
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
