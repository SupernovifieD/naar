import { fileURLToPath } from "node:url";
import { FIXTURE_SKILLS, FIXTURE_SKILL_REFS } from "./fixtureSkills.js";
import type { RecommendationEvalFixture } from "../../../src/recommend/evaluation/fixtures.js";
import { makeCommand, makePackageManager, makeRepoFacts } from "../../../src/recommend/evaluation/fixtures.js";

export const PYTHON_API_FIXTURE: RecommendationEvalFixture = {
  id: "python-api",
  description: "FastAPI backend with pytest, Docker, and GitHub Actions.",
  repoFacts: makeRepoFacts({
    repoRoot: fileURLToPath(new URL("./repos/python-api", import.meta.url)),
    projectTypes: ["api"],
    languages: ["Python"],
    frameworks: ["fastapi"],
    packageManagers: [makePackageManager("pip", ["requirements.txt"])],
    testTools: ["pytest"],
    ci: ["github-actions"],
    infra: ["docker"],
    commands: [
      makeCommand("test", "test", "pytest"),
      makeCommand("start", "start", "uvicorn app:app")
    ]
  }),
  candidates: FIXTURE_SKILLS,
  expectations: {
    shouldRecommendNeedIds: [],
    shouldRecommendSkillRefs: [
      FIXTURE_SKILL_REFS.fastApiBackendHelper,
      FIXTURE_SKILL_REFS.pythonPytestAssistant,
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger,
      FIXTURE_SKILL_REFS.httpApiClientReviewer
    ],
    topResultShouldMatchAny: [
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger,
      FIXTURE_SKILL_REFS.fastApiBackendHelper,
      FIXTURE_SKILL_REFS.pythonPytestAssistant,
      FIXTURE_SKILL_REFS.gitHubActionsCiDebugger
    ],
    shouldNotRecommendCategories: ["design", "crypto", "finance", "art", "spreadsheet"],
    maxBadDomainInTopK: { k: 5, max: 0 },
    maxBlockedInTopK: { k: 5, max: 1 },
    maxHardBlockersInTopK: { k: 5, max: 0 },
    maxPoorFitInTopK: { k: 5, max: 1 },
    // TODO(recommendation-quality): raise backend precision once Python/API-specific relevance beats generic CI/package skills.
    minPrecisionAtK: { k: 5, min: 0.2 },
    minRecallAtK: { k: 10, min: 0.25 }
  }
};
