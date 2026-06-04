import { fileURLToPath } from "node:url";
import { FIXTURE_SKILLS, FIXTURE_SKILL_REFS } from "./fixtureSkills.js";
import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
import { makeCommand, makeFinding, makePackageManager, makeRepoFacts } from "../../../src/recommend/evaluation/fixtures.js";

export const NEXTJS_APP_FIXTURE: RecommendationEvalFixture = {
  id: "nextjs-app",
  description: "Next.js React Tailwind app with TypeScript and missing agent config setup.",
  repoFacts: makeRepoFacts({
    repoRoot: fileURLToPath(new URL("./repos/nextjs-app", import.meta.url)),
    projectTypes: ["web-app"],
    languages: ["TypeScript"],
    frameworks: ["nextjs", "react", "tailwind"],
    packageManagers: [makePackageManager("pnpm", ["pnpm-lock.yaml"])],
    buildTools: ["tsc"],
    testTools: ["vitest"],
    commands: [
      makeCommand("dev", "dev"),
      makeCommand("typecheck", "typecheck"),
      makeCommand("test", "test")
    ],
    findings: [
      makeFinding("missing_claude_config", "Claude config is missing.")
    ]
  }),
  candidates: FIXTURE_SKILLS,
  expectations: {
    shouldRecommendNeedIds: [],
    shouldRecommendSkillRefs: [
      FIXTURE_SKILL_REFS.nextJsAppArchitect,
      FIXTURE_SKILL_REFS.reactComponentReviewer,
      FIXTURE_SKILL_REFS.tailwindUiReviewer,
      FIXTURE_SKILL_REFS.webAppTestGenerator,
      FIXTURE_SKILL_REFS.typeScriptConfigReview,
      FIXTURE_SKILL_REFS.typeScriptRefactorSafety,
      FIXTURE_SKILL_REFS.claudeProjectSetup
    ],
    topResultShouldMatchAny: [
      FIXTURE_SKILL_REFS.webAppTestGenerator,
      FIXTURE_SKILL_REFS.nextJsAppArchitect,
      FIXTURE_SKILL_REFS.typeScriptRefactorSafety,
      FIXTURE_SKILL_REFS.typeScriptConfigReview
    ],
    topFiveShouldIncludeAny: [
      FIXTURE_SKILL_REFS.reactComponentReviewer,
      FIXTURE_SKILL_REFS.tailwindUiReviewer,
      FIXTURE_SKILL_REFS.claudeProjectSetup
    ],
    shouldNotRecommendCategories: ["crypto", "finance", "art", "spreadsheet", "mcp"],
    maxBadDomainInTopK: { k: 5, max: 0 },
    maxBlockedInTopK: { k: 5, max: 1 },
    maxHardBlockersInTopK: { k: 5, max: 0 },
    maxPoorFitInTopK: { k: 5, max: 1 },
    minPrecisionAtK: { k: 5, min: 0.4 },
    minRecallAtK: { k: 10, min: 0.3 }
  }
};
