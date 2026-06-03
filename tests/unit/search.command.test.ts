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
const oraStartMock = vi.hoisted(() => vi.fn());
const oraSucceedMock = vi.hoisted(() => vi.fn());
const oraFailMock = vi.hoisted(() => vi.fn());
const oraMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/config/store.js", () => ({ loadConfig: loadConfigMock }));
vi.mock("../../src/providers/orchestrator.js", () => ({ buildProviders: buildProvidersMock, queryProviders: queryProvidersMock }));
vi.mock("../../src/installer/state.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/installer/state.js")>("../../src/installer/state.js");
  return { ...actual, loadInstalledState: loadInstalledStateMock };
});
vi.mock("../../src/scanner/scanRepo.js", () => ({ scanRepo: scanRepoMock }));
vi.mock("../../src/recommend/recommend.js", () => ({ recommendSkills: recommendSkillsMock }));
vi.mock("../../src/commands/cache.js", () => ({
  loadRecommendationCache: loadRecommendationCacheMock,
  saveRecommendationCache: saveRecommendationCacheMock,
  loadScanCache: loadScanCacheMock,
  saveScanCache: saveScanCacheMock
}));
vi.mock("ora", () => ({ default: oraMock }));

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
  loadConfigMock.mockResolvedValue(config);
  buildProvidersMock.mockReturnValue([{ id: "anthropic" }, { id: "clawhub" }]);
  loadInstalledStateMock.mockResolvedValue({ version: 1, skills: [] });
  queryProvidersMock.mockResolvedValue([
    makeProviderResult("anthropic", [makeCandidate("brewpage", { name: "BrewPage Publish" })])
  ]);
});

describe("runSearch", () => {
  it("searches providers without scan, recommendation, cache, or install behavior", async () => {
    const output = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });

    expect(output).toContain("Search results for \"brewpage\"");
    expect(output).toContain("brewpage  [anthropic]");
    expect(output).toContain("Publisher: anthropic");
    expect(output).toContain("License: MIT");
    expect(output).toContain("Page: https://example.com/anthropic/brewpage");
    expect(output).toContain("Install: naar install anthropic:brewpage");
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
  });

  it("emits discovery-only JSON with direct install hints", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "brewpage");
    });
    const parsed = JSON.parse(output) as {
      query: string;
      limit: number;
      totalResults: number;
      results: Array<{ install: { from: string; command: string }; exact: boolean; searchScore: number }>;
    };

    expect(parsed.query).toBe("brewpage");
    expect(parsed.limit).toBe(20);
    expect(parsed.totalResults).toBe(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].exact).toBe(true);
    expect(parsed.results[0].searchScore).toBeGreaterThan(90);
    expect(parsed.results[0].install.from).toBe("anthropic:brewpage");
    expect(parsed.results[0].install.command).toBe("naar install anthropic:brewpage");
    expect(oraMock).not.toHaveBeenCalled();
  });

  it("filters already-installed skills by default and can include them on request", async () => {
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

    const filteredOutput = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage");
    });
    expect(filteredOutput).toContain("No skills found for \"brewpage\".");

    const includedOutput = await captureStdout(async () => {
      await runSearch(baseFlags, "brewpage", { includeInstalled: true });
    });
    expect(includedOutput).toContain("brewpage  [anthropic]");
  });

  it("honors limit and all output controls", async () => {
    queryProvidersMock.mockResolvedValue([
      makeProviderResult("anthropic", Array.from({ length: 25 }, (_, index) =>
        makeCandidate(`design-${String(index + 1).padStart(2, "0")}`, {
          name: `Design ${index + 1}`,
          summary: "Design system guidance",
          tags: ["design"]
        })
      ))
    ]);

    const limitedOutput = await captureStdout(async () => {
      await runSearch(baseFlags, "design", { limit: 5 });
    });
    expect(limitedOutput).toContain("Showing 5 of 25 matches");
    expect((limitedOutput.match(/Install: naar install/g) ?? []).length).toBe(5);

    const allJsonOutput = await captureStdout(async () => {
      await runSearch({ ...baseFlags, json: true }, "design", { all: true });
    });
    const parsed = JSON.parse(allJsonOutput) as { limit: null; all: boolean; totalResults: number; results: unknown[] };
    expect(parsed.limit).toBeNull();
    expect(parsed.all).toBe(true);
    expect(parsed.totalResults).toBe(25);
    expect(parsed.results).toHaveLength(25);
  });

  it("uses compact search result blocks with direct install command", async () => {
    const output = await captureStdout(async () => {
      await runSearch({ ...baseFlags, compact: true }, "brewpage");
    });

    expect(output).toContain("brewpage [anthropic] - Searchable skill description");
    expect(output).toContain("anthropic · MIT");
    expect(output).toContain("install: naar install anthropic:brewpage");
    expect(output).not.toContain("Targets:");
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
