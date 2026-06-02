import type { CliFlags, RepoFacts, SkillRecommendation, SkillProviderResult } from "../../src/types/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildRecommendationsMock = vi.hoisted(() => vi.fn());
const runInstallFlowMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/commands/pipeline.js", () => ({
  buildRecommendations: buildRecommendationsMock
}));

vi.mock("../../src/commands/installFlow.js", () => ({
  runInstallFlow: runInstallFlowMock
}));

vi.mock("ora", () => ({
  default: () => ({
    start() {
      return this;
    },
    succeed() {
      return this;
    },
    stop() {
      return this;
    }
  })
}));

import { runGo } from "../../src/commands/go.js";
import { runRecommend } from "../../src/commands/recommend.js";

const baseFlags: CliFlags = {
  repo: "/tmp/repo",
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

const repoFacts: RepoFacts = {
  repoRoot: "/tmp/repo",
  scanTimeIso: "2026-05-30T00:00:00.000Z",
  languages: ["TypeScript"],
  packageManagers: [{ id: "npm", confidence: 1, lockfiles: ["package-lock.json"] }],
  frameworks: [{
    id: "react",
    category: "frontend",
    confidence: 1,
    evidence: [{ path: "package.json", scope: "root", reason: "dependencies.react is present", confidence: 1 }]
  }],
  aiAssistants: [{
    id: "claude",
    status: "found",
    configPathsFound: [".claude"],
    recommendedInstallTargets: ["claude_project_skills"]
  }],
  findings: [],
  topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
  readiness: { score: 85, grade: "Excellent", missingCapabilities: [] }
};

function makeRecommendation(description?: string, summary = "Summary fallback"): SkillRecommendation {
  return {
    candidate: {
      providerSkillId: "frontend-design",
      canonicalSkillId: "frontend-design",
      name: "Frontend Design",
      source: {
        providerId: "anthropic",
        publisher: "anthropic",
        version: "1.0.0",
        ref: "frontend-design@1.0.0"
      },
      summary,
      tags: ["react"],
      compatibility: { assistants: ["claude"], frameworks: ["react"], languages: ["TypeScript"] },
      metadata: {
        description,
        publisher: "anthropic",
        trustLevel: "official",
        license: "MIT",
        lastUpdatedIso: "2026-05-30T00:00:00.000Z",
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        pinnedRef: "1.0.0"
      },
      risk: { score: 100, level: "low", signals: [], requiresOverride: false }
    },
    score: 91,
    reasons: ["Matched stack: React"],
    matchedNeeds: [],
    matchedFacts: [],
    eligibilityReasons: [],
    penalties: [],
    scoreBreakdown: [],
    blocked: false
  };
}

function makePipelineResult(recommendations: SkillRecommendation[]) {
  return {
    repoFacts,
    repoNeeds: [],
    recommendations,
    providerWarnings: [],
    providerSummaries: [
      {
        providerId: "anthropic",
        mode: "api",
        candidateCount: recommendations.length
      }
    ]
  };
}

function makeProviderResults(recommendations: SkillRecommendation[]): SkillProviderResult[] {
  return [
    {
      providerId: "anthropic",
      fetchedAtIso: "2026-05-30T00:00:00.000Z",
      mode: "api",
      candidates: recommendations.map((recommendation) => recommendation.candidate)
    }
  ];
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout.write as any) = (chunk: unknown) => {
    buffer += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  };

  try {
    await run();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout.write as any) = originalWrite;
  }

  return stripAnsi(buffer);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

beforeEach(() => {
  buildRecommendationsMock.mockReset();
  runInstallFlowMock.mockReset();
  runInstallFlowMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recommend/go output descriptions", () => {
  it("renders card-style recommendations in recommend output", async () => {
    const result = makePipelineResult([makeRecommendation("API skill description from provider")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    const cardStart = output.indexOf("1) Frontend Design [anthropic]");
    expect(cardStart).toBeGreaterThanOrEqual(0);
    expect(output.indexOf("Publisher:", cardStart)).toBeGreaterThan(cardStart);
    expect(output.indexOf("Match score:", cardStart)).toBeGreaterThan(output.indexOf("Publisher:", cardStart));
    expect(output.indexOf("Description:", cardStart)).toBeGreaterThan(output.indexOf("Match score:", cardStart));
    expect(output.indexOf("Why:", cardStart)).toBeGreaterThan(output.indexOf("Description:", cardStart));
    expect(output.indexOf("Targets:", cardStart)).toBeGreaterThan(output.indexOf("Why:", cardStart));
    expect(output).toContain("Match score:");
    expect(output).toContain("Pre-fetch risk estimate:");
    expect(output).toContain("Status: PRELIMINARILY ELIGIBLE");
    expect(output).not.toContain("Score: 91%");
    expect(output).not.toContain("Status: ELIGIBLE");
    expect(output).toContain("Description: API skill description from provider");
    expect(output).toContain("Why:");
    expect(output).toContain("Targets:");
    expect(output).toContain("Meta:");
    expect(output.match(/Publisher: anthropic/g)?.length ?? 0).toBe(1);
    expect(output).toContain("License: MIT");
  });

  it("shows at most three reasons in card why block", async () => {
    const recommendation = makeRecommendation("API skill description from provider");
    recommendation.reasons = [
      "Matched stack: React",
      "Matched language: TypeScript",
      "Addresses missing capability: Testing guidance",
      "Compatible with detected assistants: claude"
    ];
    const result = makePipelineResult([recommendation]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("Why:");
    expect(output).toContain("Matched stack: React");
    expect(output).toContain("Matched language: TypeScript");
    expect(output).toContain("Addresses missing capability: Testing guidance");
    expect(output).not.toContain("Compatible with detected assistants: claude");
  });

  it("prints fallback summary when description is missing", async () => {
    const result = makePipelineResult([makeRecommendation(undefined, "Fallback summary text")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("Description: Fallback summary text");
  });

  it("prints no description line when both description and summary are empty", async () => {
    const result = makePipelineResult([makeRecommendation(undefined, "   \n\t  ")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).not.toContain("Description:");
  });

  it("renders the same card layout in go ranking section", async () => {
    const recommendations = [makeRecommendation("Go output description")];
    const result = makePipelineResult(recommendations);

    buildRecommendationsMock.mockImplementation(async (_repoRoot: string, _flags: CliFlags, hooks?: { onPhase?: (event: unknown) => void | Promise<void> }) => {
      await hooks?.onPhase?.({ phase: "scan:start" });
      await hooks?.onPhase?.({ phase: "scan:done", repoFacts });
      await hooks?.onPhase?.({ phase: "providers:start", providerIds: ["anthropic"] });
      await hooks?.onPhase?.({ phase: "providers:done", providerIds: ["anthropic"], providerResults: makeProviderResults(recommendations) });
      await hooks?.onPhase?.({ phase: "rank:start" });
      await hooks?.onPhase?.({ phase: "rank:done", result });
      return result;
    });

    const output = await captureStdout(async () => {
      await runGo(baseFlags);
    });

    expect(output).toMatch(/Naar v\d+\.\d+\.\d+/);
    expect(output).not.toContain("Naar vunknown");
    expect(output).toContain("[3/5] Ranking recommendations...");
    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).toContain("Status: PRELIMINARILY ELIGIBLE");
    expect(output).toContain("Description: Go output description");
  });

  it("shows blocked status and blocked reason in recommend output", async () => {
    const blocked = makeRecommendation("Blocked skill");
    blocked.blocked = true;
    blocked.blockReasons = ["Risk 90% exceeds required threshold"];

    const result = makePipelineResult([blocked]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("Status: PRELIMINARILY BLOCKED");
    expect(output).toContain("Blocked:");
    expect(output).toContain("Risk 90% exceeds required threshold");
  });

  it("renders compact recommendation cards without description/targets/meta", async () => {
    const result = makePipelineResult([makeRecommendation("Compact description from API")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend({ ...baseFlags, compact: true });
    });

    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).toContain("Match score:");
    expect(output).toContain("Pre-fetch risk estimate:");
    expect(output).toContain("Status: PRELIMINARILY ELIGIBLE");
    expect(output).not.toContain("Score: 91%");
    expect(output).toContain("Why:");
    expect(output).not.toContain("Description:");
    expect(output).not.toContain("Targets:");
    expect(output).not.toContain("Meta:");
  });

  it("renders compact cards in go ranking section", async () => {
    const recommendations = [makeRecommendation("Go compact description")];
    const result = makePipelineResult(recommendations);

    buildRecommendationsMock.mockImplementation(async (_repoRoot: string, _flags: CliFlags, hooks?: { onPhase?: (event: unknown) => void | Promise<void> }) => {
      await hooks?.onPhase?.({ phase: "scan:start" });
      await hooks?.onPhase?.({ phase: "scan:done", repoFacts });
      await hooks?.onPhase?.({ phase: "providers:start", providerIds: ["anthropic"] });
      await hooks?.onPhase?.({ phase: "providers:done", providerIds: ["anthropic"], providerResults: makeProviderResults(recommendations) });
      await hooks?.onPhase?.({ phase: "rank:start" });
      await hooks?.onPhase?.({ phase: "rank:done", result });
      return result;
    });

    const output = await captureStdout(async () => {
      await runGo({ ...baseFlags, compact: true });
    });

    expect(output).toContain("[3/5] Ranking recommendations...");
    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).toContain("Why:");
    expect(output).not.toContain("Description:");
    expect(output).not.toContain("Targets:");
    expect(output).not.toContain("Meta:");
  });

  it("renders verbose explainability fields in recommend output when enabled", async () => {
    const recommendation = makeRecommendation("Verbose description");
    recommendation.eligibilityReasons = ["Eligible for target: claude"];
    recommendation.penalties = ["Language-only match; no deeper project need match"];
    recommendation.matchedNeeds = ["node_cli_development"];
    recommendation.matchedNeedDetails = [
      {
        id: "node_cli_development",
        strength: "strong",
        points: 28,
        matchedTerms: ["cli"],
        antiTerms: []
      }
    ];
    recommendation.matchedFacts = [{ factType: "tool", id: "vitest", source: "primaryFacts" }];
    recommendation.capsApplied = [{ kind: "weak_only_cap", cap: 45, reason: "Only weak repo-need matches were found" }];
    recommendation.skillCategories = ["cli", "testing"];
    recommendation.domainSignals = ["internal_comms"];
    recommendation.scoreBreakdown = [{ kind: "repo_need_match", points: 30, detail: "node_cli_development" }];

    const result = makePipelineResult([recommendation]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend({ ...baseFlags, verbose: true });
    });

    expect(output).toContain("Eligibility:");
    expect(output).not.toContain("Penalties:");
    expect(output).toContain("Matched Needs:");
    expect(output).toContain("Matched Need Details:");
    expect(output).toContain("Matched Facts:");
    expect(output).toContain("Score Breakdown:");
    expect(output).toContain("Caps Applied:");
    expect(output).toContain("Match Score Model:");
    expect(output).toContain("Cap Summary:");
  });
});
