import { describe, expect, it } from "vitest";
import { rankSearchCandidates } from "../../src/search/rank.js";
import type { SkillCandidate } from "../../src/types/index.js";

function makeCandidate(id: string, overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    providerScopedId: `test:${id}`,
    providerSkillId: id,
    canonicalSkillId: id,
    name: id,
    source: { providerId: "test", publisher: "test" },
    summary: "Generic skill summary",
    tags: [],
    compatibility: { assistants: ["claude", "codex", "generic"] },
    metadata: {
      publisher: "test",
      description: "Generic skill description",
      trustLevel: "trusted",
      license: "MIT",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false },
    ...overrides
  };
}

describe("rankSearchCandidates", () => {
  it("returns one exact canonical id match", () => {
    const results = rankSearchCandidates([
      makeCandidate("brewpage"),
      makeCandidate("brewpage-helper", { name: "BrewPage Helper" })
    ], "brewpage");

    expect(results).toHaveLength(1);
    expect(results[0].exact).toBe(true);
    expect(results[0].candidate.canonicalSkillId).toBe("brewpage");
  });

  it("returns one exact provider skill id match", () => {
    const results = rankSearchCandidates([
      makeCandidate("brewpage-publish", { canonicalSkillId: "publish-helper", providerSkillId: "brewpage" })
    ], "brewpage");

    expect(results).toHaveLength(1);
    expect(results[0].exact).toBe(true);
    expect(results[0].candidate.providerSkillId).toBe("brewpage");
  });

  it("returns one exact name match", () => {
    const results = rankSearchCandidates([
      makeCandidate("brewpage-publish", { name: "BrewPage Publish" })
    ], "BrewPage Publish");

    expect(results).toHaveLength(1);
    expect(results[0].exact).toBe(true);
    expect(results[0].candidate.name).toBe("BrewPage Publish");
  });

  it("returns at most three fuzzy matches", () => {
    const results = rankSearchCandidates([
      makeCandidate("github-actions-one", { name: "GitHub Actions One" }),
      makeCandidate("github-actions-two", { name: "GitHub Actions Two" }),
      makeCandidate("github-actions-three", { name: "GitHub Actions Three" }),
      makeCandidate("github-actions-four", { name: "GitHub Actions Four" })
    ], "github actions");

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.score > 0)).toBe(true);
  });

  it("returns no results for irrelevant queries", () => {
    const results = rankSearchCandidates([
      makeCandidate("frontend-design", { name: "Frontend Design", summary: "React UI guidance" })
    ], "zzzzzz");

    expect(results).toEqual([]);
  });

  it("ranks name/id matches above tag and summary matches", () => {
    const results = rankSearchCandidates([
      makeCandidate("summary-match", { name: "General Helper", summary: "Helps with kubernetes workflows" }),
      makeCandidate("tag-match", { name: "Cluster Helper", tags: ["kubernetes"] }),
      makeCandidate("kubernetes-helper", { name: "Kubernetes Helper" })
    ], "kubernetes");

    expect(results[0].candidate.canonicalSkillId).toBe("kubernetes-helper");
    expect(results.map((result) => result.candidate.canonicalSkillId)).toContain("tag-match");
    expect(results.map((result) => result.candidate.canonicalSkillId)).toContain("summary-match");
  });

  it("deduplicates by provider-scoped id", () => {
    const results = rankSearchCandidates([
      makeCandidate("brewpage", { providerScopedId: "test:brewpage", name: "BrewPage" }),
      makeCandidate("brewpage-copy", { providerScopedId: "test:brewpage", name: "BrewPage Copy" })
    ], "brewpage");

    expect(results).toHaveLength(1);
    expect(results[0].candidate.name).toBe("BrewPage");
  });
});
