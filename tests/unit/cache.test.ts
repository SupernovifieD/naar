import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadRecommendationCache } from "../../src/commands/cache.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("loadRecommendationCache", () => {
  it("backfills missing dimension scores for legacy cached recommendations", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-cache-"));
    tempRoots.push(repoRoot);

    const cacheDir = path.join(repoRoot, ".naar", "cache");
    await mkdir(cacheDir, { recursive: true });

    const cache = {
      repoFacts: {
        scanSchemaVersion: 2,
        repoRoot,
        scanTimeIso: "2026-06-04T00:00:00.000Z",
        languages: ["TypeScript"],
        packageManagers: [],
        frameworks: [],
        aiAssistants: [],
        findings: [],
        topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
        readiness: { score: 80, grade: "Good", missingCapabilities: [] }
      },
      recommendations: [
        {
          candidate: {
            providerSkillId: "legacy-skill",
            canonicalSkillId: "legacy-skill",
            name: "Legacy Skill",
            source: { providerId: "anthropic", publisher: "anthropic" },
            summary: "legacy",
            tags: [],
            compatibility: { assistants: ["claude"] },
            metadata: {
              hasScripts: false,
              hasBinaries: false,
              hasPackageManifests: false,
              trustLevel: "official",
              pinnedRef: "v1.0.0"
            },
            risk: { score: 91, level: "low", signals: [], requiresOverride: false }
          },
          score: 77,
          rawScore: 70,
          relevanceRaw: 64,
          qualityRaw: 12,
          reasons: ["Matched stack"],
          matchedNeeds: [],
          matchedFacts: [],
          eligibilityReasons: [],
          penalties: [],
          scoreBreakdown: [],
          blocked: false
        }
      ],
      generatedAtIso: "2026-06-04T00:00:00.000Z"
    };

    await writeFile(path.join(cacheDir, "recommendations.json"), JSON.stringify(cache, null, 2), "utf8");

    const loaded = await loadRecommendationCache(repoRoot);

    expect(loaded).not.toBeNull();
    expect(loaded?.recommendations[0].dimensionScores).toEqual({
      relevance: 64,
      specificity: 0,
      compatibility: 0,
      quality: 12,
      safety: 91,
      final: 77
    });
    expect(loaded?.recommendations[0].blockers).toEqual([]);
    expect(loaded?.recommendations[0].fitSummary).toEqual({
      level: "strong",
      headline: "Legacy cached recommendation",
      primaryMatches: ["Matched stack"],
      supportingMatches: [],
      cautions: [],
      blockers: []
    });
  });
});
