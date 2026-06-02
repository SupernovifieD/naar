import { z } from "zod";

export const HISTORY_VERSION = 1;

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

export const historyProjectSchema = z.object({
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
  installedSkills: z.array(historyInstalledSkillSchema).default([])
});

export const historySkillSummarySchema = z.object({
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

export const naarHistorySchema = z.object({
  version: z.literal(HISTORY_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  projects: z.record(historyProjectSchema),
  skills: z.record(historySkillSummarySchema)
});

export type NaarHistory = z.infer<typeof naarHistorySchema>;
export type HistoryProject = z.infer<typeof historyProjectSchema>;
export type HistoryInstalledSkill = z.infer<typeof historyInstalledSkillSchema>;
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
  const parsed = naarHistorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
