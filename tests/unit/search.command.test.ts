import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliFlags, InstallTarget, NaarConfig, SkillCandidate, SkillProviderResult } from "../../src/types/index.js";

const loadConfigMock = vi.hoisted(() => vi.fn());
const buildProvidersMock = vi.hoisted(() => vi.fn());
const queryProvidersMock = vi.hoisted(() => vi.fn());
const loadInstalledStateMock = vi.hoisted(() => vi.fn());
const scanRepoMock = vi.hoisted(() => vi.fn());
const recommendSkillsMock = vi.hoisted(() => vi.fn());
const loadRecommendationCacheMock = vi.hoisted(() => vi.fn());
const saveRecommendationCacheMock = vi.hoisted(() => vi.fn());
const loadScanCacheMock = vi.hoisted(() => vi.fn());
const saveScanCacheMock = vi.hoisted(() => vi.fn());
const runInstallFlowFromRecommendationsMock = vi.hoisted(() => vi.fn());
const checkboxMock = vi.hoisted(() => vi.fn());
const oraStartMock = vi.hoisted(() => vi.fn());
const oraSucceedMock = vi.hoisted(() => vi.fn());
const oraFailMock = vi.hoisted(() => vi.fn());
const oraMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/config/store.js", () => ({
  loadConfig: loadConfigMock
}));

vi.mock("../../src/providers/orchestrator.js", () => ({
  buildProviders: buildProvidersMock,
  queryProviders: queryProvidersMock
}));

vi.mock("../../src/installer/state.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/installer/state.js")>("../../src/installer/state.js");
  return {
    ...actual,
    loadInstalledState: loadInstalledStateMock
  };
});

vi.mock("../../src/scanner/scanRepo.js", () => ({
  scanRepo: scanRepoMock
}));

vi.mock("../../src/recommend/recommend.js", () => ({
  recommendSkills: recommendSkillsMock
}));

vi.mock("../../src/commands/cache.js", () => ({
  loadRecommendationCache: loadRecommendationCacheMock,
  saveRecommendationCache: saveRecommendationCacheMock,
  loadScanCache: loadScanCacheMock,
  saveScanCache: saveScanCacheMock
}));

vi.mock("../../src/commands/installFlow.js", () => ({
  runInstallFlowFromRecommendations: runInstallFlowFromRecommendationsMock
}));

vi.mock("@inquirer/prompts", () => ({
  checkbox: checkboxMock
}));

vi.mock("ora", () => ({
  default: oraMock
}));

import { runSearch } from "../../src/commands/search.js";

const defaultTargets: InstallTarget[] = ["claude_project_skills", "codex_repo_skills"];
const config: NaarConfig = {
  defaultProviders: ["anthropic", "clawhub"],
  defaultTargets,
  minSecurityScore: 80,
  noScripts: true
};

const baseFlags: CliFlags = {
  repo: "/tmp/repo",
  provider: [],
  target: [],
  json: false,
  compact: false,
  apply: false,
  dryRun: false,
  yes: false,
  nonInteractive: true,
  noScripts: true,
  allowRisky: false,
  minSecurityScore: 80,
  force: false,
  verbose: false,
  allCompatible: false
};

beforeEach(() => {
  vi.clearAllMocks();
  oraMock.mockReturnValue({
    start: oraStartMock.mockReturnThis(),
    succeed: oraSucceedMock.mockReturnThis(),
    fail: oraFailMock.mockReturnThis()
  });
  runInstallFlowFromRecommendationsMock.mockResolvedValue(undefined);
  loadConfigMock.mockResolvedValue(config);
  buildProvidersMock.mockReturnValue([{ id: "anthropic" }, { id: "clawhub" }]);
  loadInstalledStateMock.mockResolvedValue({ version: 1, skills: [] });
  queryProvidersMock.mockResolvedValue([
    makeProviderResult("anthropic", [makeCandidate("brewpage", { name: "BrewPage Publish" })])
  ]);
});

describe("runSearch", () => {
  it("searches providers without scanning, recommending, or touching recommendation cache", async () => {
    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).toContain("Search results for \"brewpage\"");
    expect(output).toContain("brewpage  [anthropic]");
    expect(output).toContain("Publisher: anthropic");
    expect(output).toContain("License: MIT");
    expect(output).toContain("Page: https://example.com/anthropic/brewpage");
    expect(output).toContain("Install: naar search brewpage --install --from anthropic:brewpage");
    expect(output).not.toContain("Search match:");
    expect(output).not.toContain("Match score:");
    expect(output).not.toContain("Pre-fetch risk estimate:");
    expect(output).not.toContain("Status:");
    expect(output).not.toContain("Eligibility:");
    expect(output).not.toContain("Providers:");
    expect(output).not.toContain("--------------------------------------------------------------------------------");
    expect(queryProvidersMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      mode: "search",
      term: "brewpage",
      targets: defaultTargets,
      limit: 200
    }));
    expect(oraMock).toHaveBeenCalledWith("Searching providers for \"brewpage\"");
    expect(oraStartMock).toHaveBeenCalledTimes(1);
    expect(oraSucceedMock).toHaveBeenCalledWith("Search complete");
    expect(scanRepoMock).not.toHaveBeenCalled();
    expect(recommendSkillsMock).not.toHaveBeenCalled();
    expect(loadRecommendationCacheMock).not.toHaveBeenCalled();
    expect(saveRecommendationCacheMock).not.toHaveBeenCalled();
    expect(loadScanCacheMock).not.toHaveBeenCalled();
    expect(saveScanCacheMock).not.toHaveBeenCalled();
    expect(runInstallFlowFromRecommendationsMock).not.toHaveBeenCalled();
  });

  it("emits JSON output without prompts or installation behavior", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "brewpage");
    });
    const parsed = JSON.parse(output) as {
      query: string;
      limit: number;
      totalResults: number;
      results: Array<{
        searchScore: number;
        exact: boolean;
        reasons: string[];
        install: { from: string; command: string };
      }>;
    };

    expect(parsed.query).toBe("brewpage");
    expect(parsed.limit).toBe(20);
    expect(parsed.totalResults).toBe(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].exact).toBe(true);
    expect(parsed.results[0].searchScore).toBeGreaterThan(90);
    expect(parsed.results[0].reasons[0]).toContain("Search query");
    expect(parsed.results[0].install.from).toBe("anthropic:brewpage");
    expect(parsed.results[0].install.command).toBe("naar search brewpage --install --from anthropic:brewpage");
    expect(oraMock).not.toHaveBeenCalled();
  });

  it("filters already-installed skills by default", async () => {
    loadInstalledStateMock.mockResolvedValue({
      version: 1,
      skills: [{
        providerScopedId: "anthropic:brewpage",
        canonicalSkillId: "brewpage",
        providerId: "anthropic",
        providerSkillId: "brewpage",
        installedAtIso: "2026-06-03T00:00:00.000Z",
        installedVersion: "1.0.0",
        pinnedRef: "1.0.0",
        targets: ["codex_repo_skills"],
        managedFiles: [],
        securityScoreAtInstall: 100
      }]
    });

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).toContain("No skills found for \"brewpage\".");
  });

  it("includes installed skills when requested", async () => {
    loadInstalledStateMock.mockResolvedValue({
      version: 1,
      skills: [{
        providerScopedId: "anthropic:brewpage",
        canonicalSkillId: "brewpage",
        providerId: "anthropic",
        providerSkillId: "brewpage",
        installedAtIso: "2026-06-03T00:00:00.000Z",
        installedVersion: "1.0.0",
        pinnedRef: "1.0.0",
        targets: ["codex_repo_skills"],
        managedFiles: [],
        securityScoreAtInstall: 100
      }]
    });

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage", { includeInstalled: true });
    });

    expect(output).toContain("brewpage  [anthropic]");
  });

  it("hides provider warnings and summaries by default when results are available", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", [], ["Anthropic failed"]),
      makeProviderResult("clawhub", [makeCandidate("brewpage", { source: { providerId: "clawhub", publisher: "clawhub" } })])
    ]);

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).not.toContain("Provider notes");
    expect(output).not.toContain("Anthropic failed");
    expect(output).not.toContain("Providers:");
    expect(output).toContain("brewpage  [clawhub]");
  });

  it("shows provider summaries and notes in verbose mode", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", [], ["Anthropic failed"]),
      makeProviderResult("clawhub", [makeCandidate("brewpage", { source: { providerId: "clawhub", publisher: "clawhub" } })])
    ]);

    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, verbose: true }, "brewpage");
    });

    expect(output).toContain("Providers:");
    expect(output).toContain("- anthropic mode=test candidates=0");
    expect(output).toContain("Provider notes:");
    expect(output).toContain("Anthropic failed");
    expect(output).toContain("Search match: 100%");
    expect(output).toContain("Reasons:");
  });

  it("shows a clear no-result message when all providers fail", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", [], ["Provider anthropic failed: network"]),
      makeProviderResult("clawhub", [], ["Provider clawhub failed: timeout"])
    ]);

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).toContain("Provider anthropic failed: network");
    expect(output).toContain("Provider clawhub failed: timeout");
    expect(output).toContain("No skills found for \"brewpage\".");
    expect(output).toContain("Try a broader term");
  });

  it("uses explicit providers and targets when supplied", async () => {
    await captureStdout(async () => {
      await runSearch({ ...baseFlags, provider: ["clawhub"], target: ["claude_project_skills"] }, "brewpage");
    });

    expect(buildProvidersMock).toHaveBeenCalledWith(["clawhub"]);
    expect(queryProvidersMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      targets: ["claude_project_skills"]
    }));
  });

  it("uses the default display limit of 20 results", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", Array.from({ length: 25 }, (_, index) =>
        makeCandidate(`design-${String(index + 1).padStart(2, "0")}`, {
          name: `Design ${index + 1}`,
          summary: "Design system guidance",
          tags: ["design"]
        })
      ))
    ]);

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "design");
    });

    expect(output).toContain("Showing 20 of 25 matches");
    expect((output.match(/Install: /g) ?? []).length).toBe(20);
  });

  it("honors --limit for display and JSON output", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", Array.from({ length: 8 }, (_, index) =>
        makeCandidate(`publish-${index + 1}`, {
          name: `Publish ${index + 1}`,
          summary: "Publish workflow helper",
          tags: ["publish"]
        })
      ))
    ]);

    const textOutput = await captureStdout(async () => {
      await runSearch(baseFlags, "publish", { limit: 5 });
    });
    expect(textOutput).toContain("Showing 5 of 8 matches");
    expect(textOutput).toContain("publish-5");
    expect(textOutput).not.toContain("publish-6");

    const jsonOutput = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "publish", { limit: 5 });
    });
    const parsed = JSON.parse(jsonOutput) as { limit: number; totalResults: number; results: unknown[] };
    expect(parsed.limit).toBe(5);
    expect(parsed.totalResults).toBe(8);
    expect(parsed.results).toHaveLength(5);
  });

  it("honors --all for display and JSON output", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", Array.from({ length: 22 }, (_, index) =>
        makeCandidate(`actions-${index + 1}`, {
          name: `GitHub Actions ${index + 1}`,
          summary: "GitHub Actions workflow helper",
          tags: ["github", "actions"]
        })
      ))
    ]);

    const textOutput = await captureStdout(async () => {
      await runSearch(baseFlags, "github actions", { all: true });
    });
    expect(textOutput).not.toContain("Showing 20 of");
    expect(textOutput).toContain("actions-22");

    const jsonOutput = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "github actions", { all: true });
    });
    const parsed = JSON.parse(jsonOutput) as { limit: null; all: boolean; totalResults: number; results: unknown[] };
    expect(parsed.limit).toBeNull();
    expect(parsed.all).toBe(true);
    expect(parsed.totalResults).toBe(22);
    expect(parsed.results).toHaveLength(22);
  });

  it("uses compact search result blocks", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, compact: true }, "brewpage");
    });

    expect(output).toContain("brewpage [anthropic] - Searchable skill description");
    expect(output).toContain("anthropic · MIT");
    expect(output).toContain("install: naar search brewpage --install --from anthropic:brewpage");
    expect(output).not.toContain("Targets:");
  });

  it("skips JSON search installation without explicit apply and yes confirmation", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true, apply: false, yes: false }, "brewpage", { install: true });
    });
    const parsed = JSON.parse(output) as {
      installSkipped: boolean;
      installSkippedDueToMissingConfirmation: boolean;
      error: string;
      results: unknown[];
    };

    expect(parsed.installSkipped).toBe(true);
    expect(parsed.installSkippedDueToMissingConfirmation).toBe(true);
    expect(parsed.error).toContain("--apply and --yes");
    expect(parsed.results).toHaveLength(1);
    expect(runInstallFlowFromRecommendationsMock).not.toHaveBeenCalled();
  });

  it("installs one exact search match through install flow without scanning or recommendation cache", async () => {
    await captureStdout(async () => {
      await runSearch({ ...baseFlags, apply: true, yes: true }, "brewpage", { install: true });
    });

    expect(runInstallFlowFromRecommendationsMock).toHaveBeenCalledTimes(1);
    const [passedFlags, recommendations, options] = runInstallFlowFromRecommendationsMock.mock.calls[0];
    expect(passedFlags.apply).toBe(true);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].candidate.canonicalSkillId).toBe("brewpage");
    expect(options).toMatchObject({ source: "search", printHeader: false });
    expect(scanRepoMock).not.toHaveBeenCalled();
    expect(recommendSkillsMock).not.toHaveBeenCalled();
    expect(loadRecommendationCacheMock).not.toHaveBeenCalled();
    expect(saveRecommendationCacheMock).not.toHaveBeenCalled();
  });

  it("does not auto-install ambiguous fuzzy search results", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", [
        makeCandidate("github-actions-one", { name: "GitHub Actions One" }),
        makeCandidate("github-actions-two", { name: "GitHub Actions Two" })
      ])
    ]);

    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, apply: true, yes: true }, "github actions", { install: true });
    });

    expect(output).toContain("Search returned multiple possible matches");
    expect(runInstallFlowFromRecommendationsMock).not.toHaveBeenCalled();
  });

  it("uses --from to select one result from ambiguous search output", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("clawhub", [
        makeCandidate("github-actions-one", {
          name: "GitHub Actions One",
          source: { providerId: "clawhub", publisher: "clawhub", version: "1.0.0" }
        }),
        makeCandidate("github-actions-two", {
          name: "GitHub Actions Two",
          source: { providerId: "clawhub", publisher: "clawhub", version: "2.0.0" }
        })
      ])
    ]);

    await captureStdout(async () => {
      await runSearch({
        ...baseFlags,
        apply: true,
        yes: true,
        from: "clawhub:github-actions-two@2.0.0"
      }, "github actions", { install: true });
    });

    expect(runInstallFlowFromRecommendationsMock).toHaveBeenCalledTimes(1);
    const recommendations = runInstallFlowFromRecommendationsMock.mock.calls[0][1];
    expect(recommendations[0].candidate.canonicalSkillId).toBe("github-actions-two");
  });

  it("prompts interactively before installing search results", async () => {
    checkboxMock.mockResolvedValue(["anthropic:brewpage"]);

    await captureStdout(async () => {
      await runSearch({
        ...baseFlags,
        nonInteractive: false,
        apply: false,
        yes: false
      }, "brewpage", { install: true });
    });

    expect(checkboxMock).toHaveBeenCalledTimes(1);
    const choices = checkboxMock.mock.calls[0][0].choices as Array<{ checked?: boolean; value: string }>;
    expect(choices[0]).toMatchObject({ value: "anthropic:brewpage", checked: true });
    expect(runInstallFlowFromRecommendationsMock).toHaveBeenCalledTimes(1);
  });
});

function makeProviderResult(providerId: string, candidates: SkillCandidate[], warnings: string[] = []): SkillProviderResult {
  return {
    providerId,
    fetchedAtIso: "2026-06-03T00:00:00.000Z",
    mode: "test",
    candidates,
    warnings
  };
}

function makeCandidate(id: string, overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  const providerId = overrides.source?.providerId ?? "anthropic";
  return {
    providerScopedId: `${providerId}:${id}`,
    providerSkillId: id,
    canonicalSkillId: id,
    name: id,
    source: {
      providerId,
      publisher: providerId,
      url: `https://example.com/${providerId}/${id}`,
      ...overrides.source
    },
    summary: "Searchable skill summary",
    tags: ["search"],
    compatibility: { assistants: ["claude", "codex", "generic"] },
    metadata: {
      publisher: providerId,
      description: "Searchable skill description",
      trustLevel: "trusted",
      license: "MIT",
      lastUpdatedIso: "2026-06-03T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      ...overrides.metadata
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false },
    ...overrides
  };
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
