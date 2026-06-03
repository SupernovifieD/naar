import { fileURLToPath } from "node:url";
import { FIXTURE_SKILLS, FIXTURE_SKILL_REFS } from "./fixtureSkills.js";
import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
import { makeFinding, makePackageManager, makeRepoFacts } from "../../../src/recommend/evaluation/fixtures.js";

export const DOCS_SITE_FIXTURE: RecommendationEvalFixture = {
  id: "docs-site",
  description: "Documentation-focused static site with missing agent configuration.",
  repoFacts: makeRepoFacts({
    repoRoot: fileURLToPath(new URL("./repos/docs-site", import.meta.url)),
    projectTypes: ["docs"],
    languages: ["TypeScript"],
    frameworks: ["vitepress"],
    packageManagers: [makePackageManager("npm", ["package-lock.json"])],
    findings: [
      makeFinding("missing_claude_config", "Claude config is missing.")
    ]
  }),
  candidates: FIXTURE_SKILLS,
  expectations: {
    shouldRecommendNeedIds: [],
    shouldRecommendSkillRefs: [
      FIXTURE_SKILL_REFS.docsSiteMaintainer,
      FIXTURE_SKILL_REFS.claudeProjectSetup,
      FIXTURE_SKILL_REFS.typeScriptConfigReview
    ],
    topResultShouldMatchAny: [
      FIXTURE_SKILL_REFS.docsSiteMaintainer,
      FIXTURE_SKILL_REFS.claudeProjectSetup
    ],
    topFiveShouldIncludeAny: [FIXTURE_SKILL_REFS.docsSiteMaintainer],
    shouldNotRecommendCategories: ["crypto", "finance", "spreadsheet", "mcp"],
    maxBadDomainInTopK: { k: 5, max: 0 },
    maxBlockedInTopK: { k: 5, max: 1 },
    // TODO(recommendation-quality): raise docs precision after docs-specific relevance consistently beats generic setup/type-safety skills.
    minPrecisionAtK: { k: 5, min: 0.2 },
    minRecallAtK: { k: 10, min: 0.2 }
  }
};
