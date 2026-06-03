import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliFlags } from "../../src/types/index.js";

const loadConfigMock = vi.hoisted(() => vi.fn());
const resolveSkillRefsMock = vi.hoisted(() => vi.fn());
const installResolvedSkillsMock = vi.hoisted(() => vi.fn());
const buildRecommendationsMock = vi.hoisted(() => vi.fn());
const loadOrBuildRecommendationsMock = vi.hoisted(() => vi.fn());
const scanRepoMock = vi.hoisted(() => vi.fn());
const loadRecommendationCacheMock = vi.hoisted(() => vi.fn());
const saveRecommendationCacheMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/config/store.js", () => ({ loadConfig: loadConfigMock }));
vi.mock("../../src/installer/resolveRefs.js", () => ({ resolveSkillRefs: resolveSkillRefsMock }));
vi.mock("../../src/installer/installService.js", () => ({ installResolvedSkills: installResolvedSkillsMock }));
vi.mock("../../src/commands/pipeline.js", () => ({
  buildRecommendations: buildRecommendationsMock,
  loadOrBuildRecommendations: loadOrBuildRecommendationsMock
}));
vi.mock("../../src/scanner/scanRepo.js", () => ({ scanRepo: scanRepoMock }));
vi.mock("../../src/commands/cache.js", () => ({
  loadRecommendationCache: loadRecommendationCacheMock,
  saveRecommendationCache: saveRecommendationCacheMock
}));

import { runInstall } from "../../src/commands/install.js";

const baseFlags: CliFlags = {
  repo: "/tmp/repo",
  provider: [],
  target: [],
  json: false,
  compact: false,
  apply: false,
  dryRun: false,
  yes: true,
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
  loadConfigMock.mockResolvedValue({
    defaultProviders: ["anthropic", "clawhub"],
    defaultTargets: ["codex_repo_skills"],
    minSecurityScore: 80,
    noScripts: true
  });
  resolveSkillRefsMock.mockResolvedValue([{ bundle: { skill: { canonicalSkillId: "ui-ux" }, files: {} }, targets: ["codex_repo_skills"] }]);
  installResolvedSkillsMock.mockResolvedValue(undefined);
});

describe("runInstall", () => {
  it("prints no-write help when refs are empty", async () => {
    const output = await captureStdout(async () => {
      await runInstall(baseFlags, []);
    });

    expect(output).toContain("No skill reference provided.");
    expect(output).toContain("naar install clawhub:ui-ux");
    expect(resolveSkillRefsMock).not.toHaveBeenCalled();
    expect(installResolvedSkillsMock).not.toHaveBeenCalled();
  });

  it("resolves direct provider refs without scan, recommendation, or cache paths", async () => {
    await runInstall(baseFlags, ["clawhub:ui-ux", "anthropic:frontend-design@main"]);

    expect(resolveSkillRefsMock).toHaveBeenCalledWith([
      { providerId: "clawhub", skillId: "ui-ux", version: undefined },
      { providerId: "anthropic", skillId: "frontend-design", version: "main" }
    ], ["codex_repo_skills"]);
    expect(installResolvedSkillsMock).toHaveBeenCalledWith(expect.objectContaining({
      repoRoot: "/tmp/repo",
      flags: baseFlags,
      source: "direct"
    }));
    expect(scanRepoMock).not.toHaveBeenCalled();
    expect(buildRecommendationsMock).not.toHaveBeenCalled();
    expect(loadOrBuildRecommendationsMock).not.toHaveBeenCalled();
    expect(loadRecommendationCacheMock).not.toHaveBeenCalled();
    expect(saveRecommendationCacheMock).not.toHaveBeenCalled();
  });

  it("returns JSON no-write help when refs are empty", async () => {
    const output = await captureStdout(async () => {
      await runInstall({ ...baseFlags, json: true }, []);
    });
    const parsed = JSON.parse(output) as { installSkipped: boolean; error: string; examples: string[] };

    expect(parsed.installSkipped).toBe(true);
    expect(parsed.error).toBe("No skill reference provided.");
    expect(parsed.examples).toContain("naar install clawhub:ui-ux");
  });
});

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

  return buffer.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
