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
  frameworks: [{ id: "react", category: "frontend", confidence: 1, evidence: ["package.json"] }],
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
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        trustLevel: "official",
        pinnedRef: "1.0.0"
      },
      risk: { score: 100, level: "low", signals: [], requiresOverride: false }
    },
    score: 91,
    reasons: ["Matched stack: React"],
    blocked: false
  };
}

function makePipelineResult(recommendations: SkillRecommendation[]) {
  return {
    repoFacts,
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

  return buffer;
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
  it("prints skill description in recommend output", async () => {
    const result = makePipelineResult([makeRecommendation("API skill description from provider")]);
    buildRecommendationsMock.mockResolvedValue(result);

    const output = await captureStdout(async () => {
      await runRecommend(baseFlags);
    });

    expect(output).toContain("Frontend Design");
    expect(output).toContain("description: API skill description from provider");
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

    expect(output).toContain("Frontend Design");
    expect(output).not.toContain("description:");
  });

  it("prints skill description in go ranking section", async () => {
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
    expect(output).toContain("description: Go output description");
  });
});
