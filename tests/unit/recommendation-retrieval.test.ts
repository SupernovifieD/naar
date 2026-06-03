import { describe, expect, it, vi } from "vitest";

const scanRepoMock = vi.hoisted(() => vi.fn());
const recommendSkillsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/scanner/scanRepo.js", () => ({ scanRepo: scanRepoMock }));
vi.mock("../../src/recommend/recommend.js", () => ({ recommendSkills: recommendSkillsMock }));

import { deriveRepoNeeds } from "../../src/recommend/needs.js";
import { buildRecommendationQueryPlan } from "../../src/recommend/queryPlan.js";
import {
  retrieveRecommendationCandidates,
  type RecommendationRetrievalOptions
} from "../../src/recommend/retrieval.js";
import type { ProviderSearchQuery, SkillCandidate, SkillProvider, SkillProviderResult } from "../../src/types/index.js";
import { TYPESCRIPT_CLI_PACKAGE_FIXTURE } from "../fixtures/recommendation/typescript-cli-package.js";

const retrievalOptions: RecommendationRetrievalOptions = {
  targets: [],
  baseLimit: 200,
  queryLimit: 40,
  maxProviderQueries: 4
};

describe("retrieveRecommendationCandidates", () => {
  it("queries base recommend mode plus planned search terms and dedupes merged results", async () => {
    const calls: Array<{ providerId: string; query: ProviderSearchQuery }> = [];
    const duplicateCandidate = makeCandidate("shared-skill", "fixture-a");
    const provider = makeFakeProvider("fixture-a", calls, (query) => {
      if (query.mode === "recommend") {
        return makeResult("fixture-a", [duplicateCandidate], ["catalog warning"]);
      }
      return makeResult("fixture-a", [duplicateCandidate, makeCandidate(`search-${query.term}`, "fixture-a")]);
    });

    const repoNeeds = deriveRepoNeeds(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts);
    const plan = buildRecommendationQueryPlan(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts, repoNeeds);
    const result = await retrieveRecommendationCandidates(
      [provider],
      TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts,
      repoNeeds,
      plan,
      retrievalOptions
    );

    expect(calls.filter((call) => call.query.mode === "recommend")).toHaveLength(1);
    expect(calls.filter((call) => call.query.mode === "search")).toHaveLength(plan.providerQueries.slice(0, retrievalOptions.maxProviderQueries).length);
    expect(result.candidates.map((candidate) => candidate.providerScopedId)).toContain("fixture-a:shared-skill");
    expect(new Set(result.candidates.map((candidate) => candidate.providerScopedId)).size).toBe(result.candidates.length);
    expect(result.warnings).toContain("catalog warning");
    expect(scanRepoMock).not.toHaveBeenCalled();
    expect(recommendSkillsMock).not.toHaveBeenCalled();
  });

  it("survives one provider failure and returns results from successful providers", async () => {
    const calls: Array<{ providerId: string; query: ProviderSearchQuery }> = [];
    const workingProvider = makeFakeProvider("fixture-ok", calls, (query) =>
      makeResult("fixture-ok", query.mode === "recommend" ? [makeCandidate("working", "fixture-ok")] : [])
    );
    const failingProvider = makeFakeProvider("fixture-fail", calls, () => {
      throw new Error("provider unavailable");
    });

    const repoNeeds = deriveRepoNeeds(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts);
    const plan = buildRecommendationQueryPlan(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts, repoNeeds);
    const result = await retrieveRecommendationCandidates(
      [workingProvider, failingProvider],
      TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts,
      repoNeeds,
      plan,
      retrievalOptions
    );

    expect(result.candidates.map((candidate) => candidate.providerScopedId)).toContain("fixture-ok:working");
    expect(result.warnings.some((warning) => warning.includes("fixture-fail"))).toBe(true);
  });

  it("throws when every provider call fails and no candidates are available", async () => {
    const calls: Array<{ providerId: string; query: ProviderSearchQuery }> = [];
    const failingProvider = makeFakeProvider("fixture-fail", calls, () => {
      throw new Error("provider unavailable");
    });
    const repoNeeds = deriveRepoNeeds(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts);
    const plan = buildRecommendationQueryPlan(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts, repoNeeds);

    await expect(retrieveRecommendationCandidates(
      [failingProvider],
      TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts,
      repoNeeds,
      plan,
      retrievalOptions
    )).rejects.toThrow("All providers failed during recommendation retrieval.");
  });
});

function makeFakeProvider(
  providerId: string,
  calls: Array<{ providerId: string; query: ProviderSearchQuery }>,
  searchImpl: (query: ProviderSearchQuery) => SkillProviderResult
): SkillProvider {
  return {
    id: providerId,
    displayName: providerId,
    capabilities: {
      search: true,
      fetchFiles: true
    },
    async search(query) {
      calls.push({ providerId, query });
      return searchImpl(query);
    },
    async fetchFiles() {
      throw new Error("not used in retrieval tests");
    }
  };
}

function makeResult(providerId: string, candidates: SkillCandidate[], warnings: string[] = []): SkillProviderResult {
  return {
    providerId,
    fetchedAtIso: "2026-06-04T00:00:00.000Z",
    mode: "test",
    candidates,
    warnings
  };
}

function makeCandidate(id: string, providerId: string): SkillCandidate {
  return {
    providerScopedId: `${providerId}:${id}`,
    providerSkillId: id,
    canonicalSkillId: id,
    name: id,
    source: {
      providerId,
      publisher: "fixture"
    },
    summary: "fixture skill",
    tags: ["cli"],
    compatibility: { assistants: ["claude", "generic"], languages: ["TypeScript"] },
    metadata: {
      publisher: "fixture",
      trustLevel: "trusted",
      license: "MIT",
      pinnedRef: "v1.0.0",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false }
  };
}
