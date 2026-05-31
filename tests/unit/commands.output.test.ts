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
    expect(output.indexOf("score:", cardStart)).toBeGreaterThan(cardStart);
    expect(output.indexOf("description:", cardStart)).toBeGreaterThan(output.indexOf("score:", cardStart));
    expect(output.indexOf("why:", cardStart)).toBeGreaterThan(output.indexOf("description:", cardStart));
    expect(output.indexOf("targets:", cardStart)).toBeGreaterThan(output.indexOf("why:", cardStart));
    expect(output).toContain("score:");
    expect(output).toContain("risk:");
    expect(output).toContain("status: ELIGIBLE");
    expect(output).toContain("description: API skill description from provider");
    expect(output).toContain("why:");
    expect(output).toContain("targets:");
    expect(output).toContain("meta:");
    expect(output).toContain("publisher: anthropic");
    expect(output).toContain("license: MIT");
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

    expect(output).toContain("why:");
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

    expect(output).toContain("description: Fallback summary text");
  });

  it("prints no description line when both description and summary are empty", async () => {
    const result = makePipelineResult([makeRecommendation(undefined, "   \n\t  ")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).not.toContain("description:");
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

    expect(output).toContain("[3/5] Ranking recommendations...");
    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).toContain("status: ELIGIBLE");
    expect(output).toContain("description: Go output description");
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

    expect(output).toContain("status: BLOCKED");
    expect(output).toContain("blocked: Risk 90% exceeds required threshold");
  });

  it("renders compact recommendation cards without description/targets/meta", async () => {
    const result = makePipelineResult([makeRecommendation("Compact description from API")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend({ ...baseFlags, compact: true });
    });

    expect(output).toContain("1) Frontend Design [anthropic]");
    expect(output).toContain("score:");
    expect(output).toContain("risk:");
    expect(output).toContain("status: ELIGIBLE");
    expect(output).toContain("why:");
    expect(output).not.toContain("description:");
    expect(output).not.toContain("targets:");
    expect(output).not.toContain("meta:");
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
    expect(output).toContain("why:");
    expect(output).not.toContain("description:");
    expect(output).not.toContain("targets:");
    expect(output).not.toContain("meta:");
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

    expect(output).toContain("eligibility:");
    expect(output).toContain("penalties:");
    expect(output).toContain("matchedNeeds:");
    expect(output).toContain("matchedNeedDetails:");
    expect(output).toContain("matchedFacts:");
    expect(output).toContain("scoreBreakdown:");
    expect(output).toContain("capsApplied:");
    expect(output).toContain("scoreModel:");
    expect(output).toContain("capSummary:");
  });
});
