import { fileURLToPath } from "node:url";
import { FIXTURE_SKILLS, FIXTURE_SKILL_REFS } from "./fixtureSkills.js";
import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
import { makeCommand, makePackageManager, makeRepoFacts } from "../../../src/recommend/evaluation/fixtures.js";

export const MONOREPO_PACKAGE_FIXTURE: RecommendationEvalFixture = {
  id: "monorepo-package",
  description: "TypeScript pnpm monorepo package workspace with CI and release coordination needs.",
  repoFacts: makeRepoFacts({
    repoRoot: fileURLToPath(new URL("./repos/monorepo-package", import.meta.url)),
    projectTypes: ["monorepo", "package", "library"],
    languages: ["TypeScript"],
    packageManagers: [makePackageManager("pnpm", ["pnpm-lock.yaml"], true)],
    buildTools: ["tsc"],
    testTools: ["vitest"],
    ci: ["github-actions"],
    commands: [
      makeCommand("typecheck", "typecheck"),
      makeCommand("test", "test"),
      makeCommand("prepack", "prepack")
    ]
  }),
  candidates: FIXTURE_SKILLS,
  expectations: {
    shouldRecommendNeedIds: [],
    shouldRecommendSkillRefs: [
      FIXTURE_SKILL_REFS.monorepoNavigator,
      FIXTURE_SKILL_REFS.workspaceReleaseCoordinator,
      FIXTURE_SKILL_REFS.npmPackageReleaseAssistant,
      FIXTURE_SKILL_REFS.vitestTestGenerator,
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger
    ],
    topResultShouldMatchAny: [
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger,
      FIXTURE_SKILL_REFS.monorepoNavigator,
      FIXTURE_SKILL_REFS.workspaceReleaseCoordinator,
      FIXTURE_SKILL_REFS.npmPackageReleaseAssistant
    ],
    topFiveShouldIncludeAny: [
      FIXTURE_SKILL_REFS.workspaceReleaseCoordinator,
      FIXTURE_SKILL_REFS.vitestTestGenerator
    ],
    shouldNotRecommendCategories: ["crypto", "finance", "art", "spreadsheet", "internal_comms"],
    maxBadDomainInTopK: { k: 5, max: 0 },
    maxBlockedInTopK: { k: 5, max: 1 },
    minPrecisionAtK: { k: 5, min: 0.4 },
    minRecallAtK: { k: 10, min: 0.3 }
  }
};
