import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliFlags, NaarConfig, RepoFacts, RepoNeed, SkillCandidate } from "../../src/types/index.js";

const loadConfigMock = vi.hoisted(() => vi.fn());
const buildProvidersMock = vi.hoisted(() => vi.fn());
const deriveRepoNeedsMock = vi.hoisted(() => vi.fn());
const buildRecommendationQueryPlanMock = vi.hoisted(() => vi.fn());
const retrieveRecommendationCandidatesMock = vi.hoisted(() => vi.fn());
const recommendSkillsMock = vi.hoisted(() => vi.fn());
const loadInstalledStateMock = vi.hoisted(() => vi.fn());
const scanRepoMock = vi.hoisted(() => vi.fn());
const loadRecommendationCacheMock = vi.hoisted(() => vi.fn());
const saveRecommendationCacheMock = vi.hoisted(() => vi.fn());
const loadScanCacheMock = vi.hoisted(() => vi.fn());
const saveScanCacheMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/config/store.js", () => ({ loadConfig: loadConfigMock }));
vi.mock("../../src/providers/orchestrator.js", () => ({ buildProviders: buildProvidersMock }));
vi.mock("../../src/recommend/needs.js", () => ({ deriveRepoNeeds: deriveRepoNeedsMock }));
vi.mock("../../src/recommend/queryPlan.js", () => ({ buildRecommendationQueryPlan: buildRecommendationQueryPlanMock }));
vi.mock("../../src/recommend/retrieval.js", () => ({ retrieveRecommendationCandidates: retrieveRecommendationCandidatesMock }));
vi.mock("../../src/recommend/recommend.js", () => ({ recommendSkills: recommendSkillsMock }));
vi.mock("../../src/installer/state.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/installer/state.js")>("../../src/installer/state.js");
  return { ...actual, loadInstalledState: loadInstalledStateMock };
});
vi.mock("../../src/scanner/scanRepo.js", () => ({ scanRepo: scanRepoMock }));
vi.mock("../../src/commands/cache.js", () => ({
  loadRecommendationCache: loadRecommendationCacheMock,
  saveRecommendationCache: saveRecommendationCacheMock,
  loadScanCache: loadScanCacheMock,
  saveScanCache: saveScanCacheMock
}));

import { buildRecommendations } from "../../src/commands/pipeline.js";

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

const config: NaarConfig = {
  defaultProviders: ["anthropic"],
  defaultTargets: ["claude_project_skills"],
  minSecurityScore: 80,
  noScripts: true
};

const repoFacts: RepoFacts = {
  scanSchemaVersion: 2,
  repoRoot: "/tmp/repo",
  scanTimeIso: "2026-06-04T00:00:00.000Z",
  languages: ["TypeScript"],
  packageManagers: [],
  frameworks: [],
  aiAssistants: [],
  findings: [],
  topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
  readiness: { score: 80, grade: "Good", missingCapabilities: [] }
};

const repoNeeds: RepoNeed[] = [
  { id: "cli_command_design", weight: 1, reason: "CLI project", sourceFacts: [] }
];

const queryPlan = {
  terms: [],
  primaryTerms: ["typescript cli"],
  providerQueries: ["typescript cli", "github actions ci"],
  needIds: ["cli_command_design"],
  frameworkIds: [],
  toolIds: [],
  projectTypeIds: ["cli"]
};

const candidate: SkillCandidate = {
  providerScopedId: "anthropic:test-skill",
  providerSkillId: "test-skill",
  canonicalSkillId: "test-skill",
  name: "Test Skill",
  source: { providerId: "anthropic", publisher: "anthropic" },
  summary: "test",
  tags: ["cli"],
  compatibility: { assistants: ["claude"] },
  metadata: {
    publisher: "anthropic",
    trustLevel: "official",
    license: "MIT",
    pinnedRef: "v1.0.0",
    hasScripts: false,
    hasBinaries: false,
    hasPackageManifests: false
  },
  risk: { score: 100, level: "low", signals: [], requiresOverride: false }
};

beforeEach(() => {
  vi.clearAllMocks();
  loadConfigMock.mockResolvedValue(config);
  loadInstalledStateMock.mockResolvedValue({ version: 1, skills: [] });
  loadRecommendationCacheMock.mockResolvedValue(null);
  loadScanCacheMock.mockResolvedValue(repoFacts);
  saveScanCacheMock.mockResolvedValue(undefined);
  saveRecommendationCacheMock.mockResolvedValue(undefined);
  buildProvidersMock.mockReturnValue([{ id: "anthropic" }]);
  deriveRepoNeedsMock.mockReturnValue(repoNeeds);
  buildRecommendationQueryPlanMock.mockReturnValue(queryPlan);
  retrieveRecommendationCandidatesMock.mockResolvedValue({
    providerResults: [],
    candidates: [candidate],
    warnings: []
  });
  recommendSkillsMock.mockReturnValue({
    repoNeeds,
    recommendations: [{
      candidate,
      score: 90,
      reasons: ["Matched repo need: cli_command_design (strong)"],
      matchedNeeds: ["cli_command_design"],
      matchedFacts: [],
      eligibilityReasons: [],
      penalties: [],
      scoreBreakdown: [],
      blocked: false
    }]
  });
});

describe("buildRecommendations", () => {
  it("uses shared repo-need inference, query planning, and retrieval before ranking", async () => {
    const result = await buildRecommendations("/tmp/repo", baseFlags);

    expect(deriveRepoNeedsMock).toHaveBeenCalledWith(repoFacts);
    expect(buildRecommendationQueryPlanMock).toHaveBeenCalledWith(repoFacts, repoNeeds);
    expect(retrieveRecommendationCandidatesMock).toHaveBeenCalledWith(
      [{ id: "anthropic" }],
      repoFacts,
      repoNeeds,
      queryPlan,
      expect.objectContaining({
        targets: ["claude_project_skills"],
        baseLimit: 200,
        queryLimit: 40,
        maxProviderQueries: 12
      })
    );
    expect(recommendSkillsMock).toHaveBeenCalledWith(repoFacts, [candidate], expect.objectContaining({
      precomputedRepoNeeds: repoNeeds
    }));
    expect(result.queryPlan).toEqual(queryPlan);
    expect(result.repoNeeds).toEqual(repoNeeds);
  });
});
