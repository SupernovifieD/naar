import { createHash } from "node:crypto";
import { z } from "zod";

export const HISTORY_VERSION = 2;

const stringArraySchema = z.array(z.string()).default([]);

export const historyInstalledSkillSchema = z.object({
  providerId: z.string(),
  skillId: z.string(),
  canonicalId: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  ref: z.string().optional(),
  targets: stringArraySchema,
  securityScore: z.number().optional(),
  installedAt: z.string(),
  lastSeenAt: z.string(),
  installCount: z.number().int().nonnegative()
});

export const historyEventTypeSchema = z.enum(["install", "uninstall"]);
export const historyEventSourceSchema = z.enum(["install_flow", "uninstall_flow", "migration"]);

export const historyEventSkillSchema = z.object({
  providerId: z.string(),
  skillId: z.string(),
  canonicalId: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  ref: z.string().optional(),
  targets: stringArraySchema,
  securityScore: z.number().optional()
});

export const historyEventSchema = z.object({
  eventId: z.string(),
  type: historyEventTypeSchema,
  at: z.string(),
  source: historyEventSourceSchema,
  skills: z.array(historyEventSkillSchema).default([])
});

export const historyProjectSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  path: z.string(),
  pathHash: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lastInstallAt: z.string().optional(),
  lastUninstallAt: z.string().optional(),
  detected: z.object({
    languages: stringArraySchema.optional(),
    frameworks: stringArraySchema.optional(),
    packageManagers: stringArraySchema.optional(),
    assistants: stringArraySchema.optional()
  }).optional(),
  installedSkills: z.array(historyInstalledSkillSchema).default([]),
  events: z.array(historyEventSchema).default([])
});

export const historySkillSummarySchema = z.object({
  canonicalId: z.string(),
  providerIds: stringArraySchema,
  skillIds: stringArraySchema,
  name: z.string().optional(),
  targets: stringArraySchema,
  currentlyInstalledInProjects: stringArraySchema,
  everInstalledInProjects: stringArraySchema,
  uninstalledFromProjects: stringArraySchema,
  usedInProjects: stringArraySchema,
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lastInstalledAt: z.string().optional(),
  lastUninstalledAt: z.string().optional(),
  installCount: z.number().int().nonnegative(),
  uninstallCount: z.number().int().nonnegative()
});

export const naarHistorySchema = z.object({
  version: z.literal(HISTORY_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  projects: z.record(historyProjectSchema),
  skills: z.record(historySkillSummarySchema)
});

const historyInstalledSkillV1Schema = historyInstalledSkillSchema;
const historyProjectV1Schema = z.object({
  projectId: z.string(),
  name: z.string(),
  path: z.string(),
  pathHash: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lastInstallAt: z.string().optional(),
  detected: z.object({
    languages: stringArraySchema.optional(),
    frameworks: stringArraySchema.optional(),
    packageManagers: stringArraySchema.optional(),
    assistants: stringArraySchema.optional()
  }).optional(),
  installedSkills: z.array(historyInstalledSkillV1Schema).default([])
});
const historySkillSummaryV1Schema = z.object({
  canonicalId: z.string(),
  providerIds: stringArraySchema,
  skillIds: stringArraySchema,
  name: z.string().optional(),
  targets: stringArraySchema,
  usedInProjects: stringArraySchema,
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  installCount: z.number().int().nonnegative()
});
const naarHistoryV1Schema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  projects: z.record(historyProjectV1Schema),
  skills: z.record(historySkillSummaryV1Schema).default({})
});

type NaarHistoryV1 = z.infer<typeof naarHistoryV1Schema>;

export type NaarHistory = z.infer<typeof naarHistorySchema>;
export type HistoryProject = z.infer<typeof historyProjectSchema>;
export type HistoryInstalledSkill = z.infer<typeof historyInstalledSkillSchema>;
export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type HistoryEventType = z.infer<typeof historyEventTypeSchema>;
export type HistoryEventSource = z.infer<typeof historyEventSourceSchema>;
export type HistoryEventSkill = z.infer<typeof historyEventSkillSchema>;
export type HistorySkillSummary = z.infer<typeof historySkillSummarySchema>;

export function createEmptyHistory(nowIso = new Date().toISOString()): NaarHistory {
  return {
    version: HISTORY_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    projects: {},
    skills: {}
  };
}

export function parseHistory(value: unknown): NaarHistory | undefined {
  const parsedV2 = naarHistorySchema.safeParse(value);
  if (parsedV2.success) return parsedV2.data;

  const parsedV1 = naarHistoryV1Schema.safeParse(value);
  if (parsedV1.success) return migrateHistoryV1ToV2(parsedV1.data);

  return undefined;
}

export function migrateHistoryV1ToV2(history: NaarHistoryV1): NaarHistory {
  const projects: NaarHistory["projects"] = {};

  for (const project of Object.values(history.projects)) {
    const migratedProject: HistoryProject = {
      ...project,
      events: project.installedSkills.flatMap((skill) => createMigrationInstallEvents(project.projectId, skill))
    };
    projects[migratedProject.projectId] = migratedProject;
  }

  return rebuildMigratedSummaries({
    version: HISTORY_VERSION,
    createdAt: history.createdAt,
    updatedAt: history.updatedAt,
    projects,
    skills: {}
  });
}

function rebuildMigratedSummaries(history: NaarHistory): NaarHistory {
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

  return { ...history, skills };
}

function toEventSkill(skill: HistoryInstalledSkill): HistoryEventSkill {
  return {
    providerId: skill.providerId,
    skillId: skill.skillId,
    canonicalId: skill.canonicalId,
    name: skill.name,
    version: skill.version,
    ref: skill.ref,
    targets: [...skill.targets],
    securityScore: skill.securityScore
  };
}

function createMigrationInstallEvents(projectId: string, skill: HistoryInstalledSkill): HistoryEvent[] {
  const count = Math.max(skill.installCount, 1);
  return Array.from({ length: count }, (_, index) => ({
    eventId: migrationEventId(projectId, skill, index),
    type: "install",
    at: skill.installedAt,
    source: "migration",
    skills: [toEventSkill(skill)]
  }));
}

function migrationEventId(projectId: string, skill: HistoryInstalledSkill, index: number): string {
  const key = `${projectId}:${skill.providerId}:${skill.skillId}:${skill.canonicalId}:${skill.installedAt}:${index}`;
  return `migration-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
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
