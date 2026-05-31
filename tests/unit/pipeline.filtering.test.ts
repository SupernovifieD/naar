import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadOrBuildRecommendations } from "../../src/commands/pipeline.js";
import type { CliFlags, SkillRecommendation } from "../../src/types/index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("pipeline installed filtering", () => {
  it("filters already-installed skills using provider-scoped identity", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-pipeline-"));
    tempRoots.push(repoRoot);

    const cacheDir = path.join(repoRoot, ".naar", "cache");
    await mkdir(cacheDir, { recursive: true });

    const recommendations: SkillRecommendation[] = [
      {
        candidate: {
          providerSkillId: "frontend-design",
          canonicalSkillId: "frontend-design",
          name: "Frontend Design (Anthropic)",
          source: { providerId: "anthropic", version: "1.0.0", ref: "anthropic:1.0.0", publisher: "Anthropic" },
          summary: "A",
          tags: ["nextjs"],
          compatibility: { assistants: ["claude"] },
          metadata: {
            hasScripts: false,
            hasBinaries: false,
            hasPackageManifests: false,
            trustLevel: "official",
            pinnedRef: "1.0.0"
          },
          risk: { score: 95, level: "low", signals: [], requiresOverride: false }
        },
        score: 90,
        reasons: ["Matched stack"],
        matchedNeeds: [],
        matchedFacts: [],
        eligibilityReasons: [],
        penalties: [],
        scoreBreakdown: [],
        blocked: false
      },
      {
        candidate: {
          providerSkillId: "frontend-design",
          canonicalSkillId: "frontend-design",
          name: "Frontend Design (ClawHub)",
          source: { providerId: "clawhub", version: "1.0.0", ref: "clawhub:1.0.0", publisher: "openclaw" },
          summary: "B",
          tags: ["nextjs"],
          compatibility: { assistants: ["claude"] },
          metadata: {
            hasScripts: false,
            hasBinaries: false,
            hasPackageManifests: false,
            trustLevel: "trusted",
            pinnedRef: "1.0.0"
          },
          risk: { score: 93, level: "low", signals: [], requiresOverride: false }
        },
        score: 88,
        reasons: ["Matched stack"],
        matchedNeeds: [],
        matchedFacts: [],
        eligibilityReasons: [],
        penalties: [],
        scoreBreakdown: [],
        blocked: false
      }
    ];

    const cache = {
      repoFacts: {
        scanSchemaVersion: 2,
        repoRoot,
        scanTimeIso: "2026-05-29T00:00:00.000Z",
        languages: ["TypeScript"],
        packageManagers: [],
        frameworks: [],
        aiAssistants: [],
        findings: [],
        topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
        readiness: { score: 70, grade: "Good", missingCapabilities: [] }
      },
      repoNeeds: [],
      recommendations,
      generatedAtIso: "2026-05-29T00:00:00.000Z"
    };

    await writeFile(path.join(cacheDir, "recommendations.json"), JSON.stringify(cache, null, 2), "utf8");

    await mkdir(path.join(repoRoot, ".naar"), { recursive: true });
    await writeFile(path.join(repoRoot, ".naar", "installed.json"), JSON.stringify({
      version: 1,
      skills: [
        {
          canonicalSkillId: "frontend-design",
          providerId: "anthropic",
          providerSkillId: "frontend-design",
          installedAtIso: "2026-05-20T00:00:00.000Z",
          installedVersion: "1.0.0",
          pinnedRef: "anthropic:1.0.0",
          targets: ["claude_project_skills"],
          managedFiles: [".claude/skills/frontend-design/SKILL.md"],
          securityScoreAtInstall: 95
        }
      ]
    }), "utf8");

    const flags: CliFlags = {
      repo: repoRoot,
      provider: [],
      target: [],
      json: false,
      compact: false,
      apply: false,
      dryRun: false,
      yes: false,
      nonInteractive: false,
      noScripts: true,
      allowRisky: false,
      minSecurityScore: 80,
      force: false,
      verbose: false,
      allCompatible: false
    };

    const result = await loadOrBuildRecommendations(repoRoot, flags);

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].candidate.source.providerId).toBe("clawhub");
  });
});
