import { describe, expect, it } from "vitest";
import { deriveRepoNeeds } from "../../src/recommend/needs.js";
import { buildRecommendationQueryPlan } from "../../src/recommend/queryPlan.js";
import {
  DOCS_SITE_FIXTURE,
  MONOREPO_PACKAGE_FIXTURE,
  NEXTJS_APP_FIXTURE,
  PYTHON_API_FIXTURE,
  TYPESCRIPT_CLI_PACKAGE_FIXTURE
} from "../fixtures/recommendation/index.js";

describe("buildRecommendationQueryPlan", () => {
  it("builds deterministic high-signal queries for the TypeScript CLI package fixture", () => {
    const repoNeeds = deriveRepoNeeds(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts);
    const firstPlan = buildRecommendationQueryPlan(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts, repoNeeds);
    const secondPlan = buildRecommendationQueryPlan(TYPESCRIPT_CLI_PACKAGE_FIXTURE.repoFacts, repoNeeds);

    expect(firstPlan.providerQueries).toEqual(secondPlan.providerQueries);
    expect(firstPlan.providerQueries).toEqual(expect.arrayContaining([
      "typescript cli",
      "npm package",
      "github actions ci",
      "vitest testing",
      "safe file writes",
      "provider integration",
      "terminal ux"
    ]));
    expect(firstPlan.providerQueries).not.toContain("typescript");
    expect(firstPlan.providerQueries).not.toContain("javascript");
    expect(new Set(firstPlan.providerQueries).size).toBe(firstPlan.providerQueries.length);
    expect(firstPlan.providerQueries.some((query) => query.trim().length === 0)).toBe(false);
    expect(firstPlan.providerQueries.length).toBeLessThanOrEqual(12);
  });

  it("builds Next.js app queries with framework and composite breadth", () => {
    const plan = buildRecommendationQueryPlan(
      NEXTJS_APP_FIXTURE.repoFacts,
      deriveRepoNeeds(NEXTJS_APP_FIXTURE.repoFacts)
    );

    expect(plan.providerQueries).toEqual(expect.arrayContaining([
      "nextjs",
      "react",
      "tailwind",
      "web app development",
      "nextjs tailwind",
      "react tailwind"
    ]));
    expect(plan.providerQueries).not.toContain("typescript");
  });

  it("builds Python API queries with backend, test, ci, and infra coverage", () => {
    const plan = buildRecommendationQueryPlan(
      PYTHON_API_FIXTURE.repoFacts,
      deriveRepoNeeds(PYTHON_API_FIXTURE.repoFacts)
    );

    expect(plan.providerQueries).toEqual(expect.arrayContaining([
      "python api",
      "fastapi",
      "pytest testing",
      "github actions ci",
      "docker"
    ]));
  });

  it("builds docs-site queries with documentation-first breadth", () => {
    const plan = buildRecommendationQueryPlan(
      DOCS_SITE_FIXTURE.repoFacts,
      deriveRepoNeeds(DOCS_SITE_FIXTURE.repoFacts)
    );

    expect(plan.providerQueries).toEqual(expect.arrayContaining([
      "documentation",
      "docs site",
      "vitepress"
    ]));
  });

  it("builds monorepo queries with workspace and release composites", () => {
    const plan = buildRecommendationQueryPlan(
      MONOREPO_PACKAGE_FIXTURE.repoFacts,
      deriveRepoNeeds(MONOREPO_PACKAGE_FIXTURE.repoFacts)
    );

    expect(plan.providerQueries).toEqual(expect.arrayContaining([
      "monorepo",
      "pnpm workspace",
      "typescript npm package",
      "github actions ci",
      "vitest testing"
    ]));
  });
});
