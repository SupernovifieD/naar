import { recommendSkills, type RecommendOptions } from "../recommend.js";
import type { RepoNeed, SkillRecommendation } from "../../types/index.js";
import type { RecommendationEvalFixture } from "./fixtures.js";
import { DEFAULT_RECOMMEND_EVAL_OPTIONS } from "./fixtures.js";
import {
  badDomainCountAtK,
  blockedCountAtK,
  collectBadDomainRefsAtK,
  createRelevantSet,
  precisionAtK,
  recallAtK,
  recommendationRef,
  riskyCountAtK,
  topKContainsAny,
  type RecommendationMetrics
} from "./metrics.js";

export interface RecommendationEvaluationFailure {
  fixtureId: string;
  message: string;
}

export interface RecommendationEvaluationResult {
  fixtureId: string;
  description: string;
  repoNeeds: RepoNeed[];
  recommendations: SkillRecommendation[];
  metrics: RecommendationMetrics;
  failures: RecommendationEvaluationFailure[];
}

export function evaluateRecommendationFixture(
  fixture: RecommendationEvalFixture,
  options: Partial<RecommendOptions> = {}
): RecommendationEvaluationResult {
  const recommendOptions: RecommendOptions = {
    ...DEFAULT_RECOMMEND_EVAL_OPTIONS,
    ...options
  };
  const { repoNeeds, recommendations } = recommendSkills(fixture.repoFacts, fixture.candidates, recommendOptions);
  const relevant = createRelevantSet(fixture.expectations);
  const metrics = computeMetrics(recommendations, fixture, relevant);
  const failures = evaluateExpectations(fixture, recommendations, metrics, relevant);

  return {
    fixtureId: fixture.id,
    description: fixture.description,
    repoNeeds,
    recommendations,
    metrics,
    failures
  };
}

function computeMetrics(
  recommendations: SkillRecommendation[],
  fixture: RecommendationEvalFixture,
  relevant: ReturnType<typeof createRelevantSet>
): RecommendationMetrics {
  const precisionK = fixture.expectations.minPrecisionAtK?.k ?? 5;
  const recallK = fixture.expectations.minRecallAtK?.k ?? 10;
  const badDomainK = fixture.expectations.maxBadDomainInTopK?.k ?? 5;
  const blockedK = fixture.expectations.maxBlockedInTopK?.k ?? 5;
  const riskyK = Math.max(5, blockedK);

  return {
    precisionAtK: {
      [precisionK]: precisionAtK(recommendations, relevant, precisionK)
    },
    recallAtK: {
      [recallK]: recallAtK(recommendations, relevant, recallK)
    },
    badDomainCountAtK: {
      [badDomainK]: badDomainCountAtK(recommendations, fixture.expectations.shouldNotRecommendCategories, badDomainK)
    },
    blockedCountAtK: {
      [blockedK]: blockedCountAtK(recommendations, blockedK)
    },
    riskyCountAtK: {
      [riskyK]: riskyCountAtK(recommendations, riskyK)
    }
  };
}

function evaluateExpectations(
  fixture: RecommendationEvalFixture,
  recommendations: SkillRecommendation[],
  metrics: RecommendationMetrics,
  relevant: ReturnType<typeof createRelevantSet>
): RecommendationEvaluationFailure[] {
  const failures: RecommendationEvaluationFailure[] = [];

  if (fixture.expectations.minPrecisionAtK) {
    const { k, min } = fixture.expectations.minPrecisionAtK;
    const actual = metrics.precisionAtK[k] ?? precisionAtK(recommendations, relevant, k);
    if (actual < min) {
      failures.push({
        fixtureId: fixture.id,
        message: `${fixture.id}: precision@${k} expected >= ${formatMetric(min)}, got ${formatMetric(actual)}`
      });
    }
  }

  if (fixture.expectations.minRecallAtK) {
    const { k, min } = fixture.expectations.minRecallAtK;
    const actual = metrics.recallAtK[k] ?? recallAtK(recommendations, relevant, k);
    if (actual < min) {
      failures.push({
        fixtureId: fixture.id,
        message: `${fixture.id}: recall@${k} expected >= ${formatMetric(min)}, got ${formatMetric(actual)}`
      });
    }
  }

  if (fixture.expectations.maxBadDomainInTopK) {
    const { k, max } = fixture.expectations.maxBadDomainInTopK;
    const actual = metrics.badDomainCountAtK[k]
      ?? badDomainCountAtK(recommendations, fixture.expectations.shouldNotRecommendCategories, k);
    if (actual > max) {
      const badRefs = collectBadDomainRefsAtK(recommendations, fixture.expectations.shouldNotRecommendCategories, k);
      failures.push({
        fixtureId: fixture.id,
        message: `${fixture.id}: bad domain categories in top ${k} expected <= ${max}, got ${actual}: ${badRefs.join(", ")}`
      });
    }
  }

  if (fixture.expectations.maxBlockedInTopK) {
    const { k, max } = fixture.expectations.maxBlockedInTopK;
    const actual = metrics.blockedCountAtK[k] ?? blockedCountAtK(recommendations, k);
    if (actual > max) {
      const blockedRefs = recommendations
        .slice(0, k)
        .filter((recommendation) => recommendation.blocked === true || recommendation.status === "blocked" || recommendation.hardBlocked === true)
        .map((recommendation) => recommendationRef(recommendation));
      failures.push({
        fixtureId: fixture.id,
        message: `${fixture.id}: blocked results in top ${k} expected <= ${max}, got ${actual}: ${blockedRefs.join(", ")}`
      });
    }
  }

  if (fixture.expectations.topResultShouldMatchAny && !topKContainsAny(recommendations, fixture.expectations.topResultShouldMatchAny, 1)) {
    failures.push({
      fixtureId: fixture.id,
      message: `${fixture.id}: top result expected to match one of [${fixture.expectations.topResultShouldMatchAny.join(", ")}], got [${topRefs(recommendations, 1)}]`
    });
  }

  if (fixture.expectations.topFiveShouldIncludeAny && !topKContainsAny(recommendations, fixture.expectations.topFiveShouldIncludeAny, 5)) {
    failures.push({
      fixtureId: fixture.id,
      message: `${fixture.id}: top 5 expected to include one of [${fixture.expectations.topFiveShouldIncludeAny.join(", ")}], got [${topRefs(recommendations, 5)}]`
    });
  }

  if (fixture.expectations.shouldNotRecommendSkillRefs && fixture.expectations.shouldNotRecommendSkillRefs.length > 0) {
    const banned = new Set(fixture.expectations.shouldNotRecommendSkillRefs);
    const offenders = recommendations
      .filter((recommendation) => banned.has(recommendationRef(recommendation)))
      .map((recommendation) => recommendationRef(recommendation));
    if (offenders.length > 0) {
      failures.push({
        fixtureId: fixture.id,
        message: `${fixture.id}: expected not to recommend [${fixture.expectations.shouldNotRecommendSkillRefs.join(", ")}], but got [${offenders.join(", ")}]`
      });
    }
  }

  return failures;
}

function topRefs(recommendations: SkillRecommendation[], k: number): string {
  return recommendations.slice(0, k).map((recommendation) => recommendationRef(recommendation)).join(", ");
}

function formatMetric(value: number): string {
  return value.toFixed(2);
}
