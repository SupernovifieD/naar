import { fileURLToPath } from "node:url";
import { FIXTURE_SKILLS, FIXTURE_SKILL_REFS } from "./fixtureSkills.js";
import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
import { makeCommand, makePackageManager, makeRepoFacts } from "../../../src/recommend/evaluation/fixtures.js";

export const TYPESCRIPT_CLI_PACKAGE_FIXTURE: RecommendationEvalFixture = {
  id: "typescript-cli-package",
  description: "TypeScript CLI package with provider integrations, install planning, and release workflow needs.",
  repoFacts: makeRepoFacts({
    repoRoot: fileURLToPath(new URL("./repos/typescript-cli-package", import.meta.url)),
    projectTypes: ["cli", "package"],
    languages: ["TypeScript"],
    packageManagers: [makePackageManager("npm", ["package-lock.json"])],
    buildTools: ["tsup", "tsc"],
    testTools: ["vitest"],
    ci: ["github-actions"],
    commands: [
      makeCommand("build", "build"),
      makeCommand("typecheck", "typecheck"),
      makeCommand("test", "test"),
      makeCommand("prepack", "prepack"),
      makeCommand("prepublishOnly", "prepublish")
    ]
  }),
  candidates: FIXTURE_SKILLS,
  expectations: {
    shouldRecommendNeedIds: [],
    shouldRecommendSkillRefs: [
      FIXTURE_SKILL_REFS.cliCommandDesigner,
      FIXTURE_SKILL_REFS.terminalUxReviewer,
      FIXTURE_SKILL_REFS.typeScriptRefactorSafety,
      FIXTURE_SKILL_REFS.typeScriptConfigReview,
      FIXTURE_SKILL_REFS.npmPackageReleaseAssistant,
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger,
      FIXTURE_SKILL_REFS.vitestTestGenerator,
      FIXTURE_SKILL_REFS.safeFileWritesReviewer,
      FIXTURE_SKILL_REFS.providerIntegrationHelper,
      FIXTURE_SKILL_REFS.installPlanReviewer
    ],
    topResultShouldMatchAny: [
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger,
      FIXTURE_SKILL_REFS.cliCommandDesigner,
      FIXTURE_SKILL_REFS.npmPackageReleaseAssistant,
      FIXTURE_SKILL_REFS.typeScriptRefactorSafety
    ],
    shouldNotRecommendCategories: ["crypto", "finance", "art", "spreadsheet", "internal_comms"],
    maxBadDomainInTopK: { k: 5, max: 0 },
    maxBlockedInTopK: { k: 5, max: 1 },
    minPrecisionAtK: { k: 5, min: 0.4 },
    minRecallAtK: { k: 10, min: 0.35 }
  }
};
