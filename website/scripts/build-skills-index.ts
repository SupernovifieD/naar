import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProviders, queryProviders } from "../../src/providers/orchestrator.ts";
import type { SkillCandidate } from "../../src/types/index.ts";
import type { IndexedSkillRecord, SkillsIndexPayload } from "../src/data/skillsIndex.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_PATH = path.join(WEBSITE_ROOT, "public", "data", "skills-index.json");
const OUTPUT_DIR = path.dirname(OUTPUT_PATH);

async function main(): Promise<void> {
  const providers = buildProviders([]);
  const providerIds = providers.map((provider) => provider.id);
  const warnings: string[] = [];

  try {
    const results = await queryProviders(providers, {
      mode: "search",
      limit: 120
    });

    const skills = dedupeCandidates(results.flatMap((result) => {
      warnings.push(...(result.warnings ?? []));
      return result.candidates;
    })).map(toIndexRecord).sort(compareIndexedSkills);

    if (skills.length === 0) {
      warnings.push("No provider skills were indexed during this build.");
      await preserveOrWriteEmpty(providerIds, warnings);
      return;
    }

    await writePayload({
      generatedAt: new Date().toISOString(),
      providers: providerIds,
      warnings,
      skills
    });

    console.log(`[website] Built skills index with ${skills.length} records from ${providerIds.join(", ")}.`);
    for (const warning of warnings) {
      console.warn(`[website] Warning: ${warning}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Skill index build failed: ${message}`);
    await preserveOrWriteEmpty(providerIds, warnings);
  }
}

function dedupeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const seen = new Map<string, SkillCandidate>();
  for (const candidate of candidates) {
    const key = candidate.providerScopedId ?? `${candidate.source.providerId}:${candidate.providerSkillId}`;
    if (!seen.has(key)) {
      seen.set(key, candidate);
    }
  }
  return [...seen.values()];
}

function toIndexRecord(candidate: SkillCandidate): IndexedSkillRecord {
  const installRef = `${candidate.source.providerId}:${candidate.providerSkillId}`;
  const risk = candidate.risk?.score ?? 0;
  return {
    id: candidate.providerScopedId ?? installRef,
    name: candidate.name,
    provider: candidate.source.providerId,
    publisher: candidate.metadata.publisher ?? candidate.source.publisher,
    license: candidate.metadata.license ?? undefined,
    updatedAt: candidate.metadata.lastUpdatedIso ?? undefined,
    description: candidate.metadata.description ?? candidate.summary,
    url: candidate.source.url,
    installRef,
    installCommand: `naar install ${installRef}`,
    npxCommand: `npx -y naar-cli@latest install ${installRef}`,
    status: risk > 40 ? "blocked" : risk > 0 ? "risky" : "eligible",
    risk,
    tags: candidate.tags
  };
}

function compareIndexedSkills(left: IndexedSkillRecord, right: IndexedSkillRecord): number {
  const riskDelta = (left.risk ?? 0) - (right.risk ?? 0);
  if (riskDelta !== 0) return riskDelta;

  const updatedDelta = compareDateDesc(left.updatedAt, right.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  return left.name.localeCompare(right.name);
}

function compareDateDesc(left?: string, right?: string): number {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return rightTime - leftTime;
}

async function preserveOrWriteEmpty(providerIds: string[], warnings: string[]): Promise<void> {
  const existing = await readExistingIndex();
  if (existing !== null) {
    console.warn("[website] Warning: provider index refresh failed. Keeping the previously generated skills-index.json.");
    for (const warning of warnings) {
      console.warn(`[website] Warning: ${warning}`);
    }
    return;
  }

  const payload: SkillsIndexPayload = {
    generatedAt: new Date().toISOString(),
    providers: providerIds,
    warnings,
    skills: []
  };
  await writePayload(payload);

  console.warn("[website] Warning: provider index refresh failed. Wrote an empty skills-index.json instead.");
  for (const warning of warnings) {
    console.warn(`[website] Warning: ${warning}`);
  }
}

async function readExistingIndex(): Promise<SkillsIndexPayload | null> {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SkillsIndexPayload>;
    if (!Array.isArray(parsed.skills)) {
      return null;
    }
    return {
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date().toISOString(),
      providers: Array.isArray(parsed.providers) ? parsed.providers.filter((value): value is string => typeof value === "string") : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((value): value is string => typeof value === "string") : [],
      skills: parsed.skills as IndexedSkillRecord[]
    };
  } catch {
    return null;
  }
}

async function writePayload(payload: SkillsIndexPayload): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

await main();
