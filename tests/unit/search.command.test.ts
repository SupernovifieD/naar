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
    expect(output).toContain("BrewPage Publish [anthropic]");
    expect(output).toContain("Search match:");
    expect(output).not.toContain("Match score:");
    expect(queryProvidersMock).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      mode: "search",
      term: "brewpage",
      targets: defaultTargets,
      limit: 80
    }));
    expect(scanRepoMock).not.toHaveBeenCalled();
    expect(recommendSkillsMock).not.toHaveBeenCalled();
    expect(loadRecommendationCacheMock).not.toHaveBeenCalled();
    expect(saveRecommendationCacheMock).not.toHaveBeenCalled();
    expect(loadScanCacheMock).not.toHaveBeenCalled();
    expect(saveScanCacheMock).not.toHaveBeenCalled();
  });

  it("emits JSON output without prompts or installation behavior", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "brewpage");
    });
    const parsed = JSON.parse(output) as { query: string; results: Array<{ searchScore: number; exact: boolean; reasons: string[] }> };

    expect(parsed.query).toBe("brewpage");
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].exact).toBe(true);
    expect(parsed.results[0].searchScore).toBeGreaterThan(90);
    expect(parsed.results[0].reasons[0]).toContain("Matched search term");
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

    expect(output).toContain("BrewPage Publish [anthropic]");
  });

  it("shows provider warnings while keeping successful results", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", [], ["Anthropic failed"]),
      makeProviderResult("clawhub", [makeCandidate("brewpage", { source: { providerId: "clawhub", publisher: "clawhub" } })])
    ]);

    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).toContain("Provider notes");
    expect(output).toContain("Anthropic failed");
    expect(output).toContain("brewpage [clawhub]");
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
    source: { providerId, publisher: providerId, ...overrides.source },
    summary: "Searchable skill summary",
    tags: ["search"],
    compatibility: { assistants: ["claude", "codex", "generic"] },
    metadata: {
      publisher: providerId,
      description: "Searchable skill description",
      trustLevel: "trusted",
      license: "MIT",
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
