import { describe, expect, it } from "vitest";
import { evaluateRecommendationFixture } from "../../src/recommend/evaluation/evaluate.js";
import { renderRecommendationEvaluationReport } from "../../src/recommend/evaluation/report.js";
import { RECOMMENDATION_EVAL_FIXTURES } from "../fixtures/recommendation/index.js";

describe("recommendation evaluation", () => {
  it("meets baseline quality thresholds across offline fixtures", () => {
    const results = RECOMMENDATION_EVAL_FIXTURES.map((fixture) =>
      evaluateRecommendationFixture(fixture)
    );

    const failures = results.flatMap((result) => result.failures);

    if (failures.length > 0) {
      console.error(renderRecommendationEvaluationReport(results));
    }

    expect(failures.map((failure) => failure.message)).toEqual([]);
    for (const result of results) {
      for (const recommendation of result.recommendations) {
        expect(recommendation.dimensionScores).toBeDefined();
        expect(recommendation.dimensionScores?.final).toBe(recommendation.score);
      }

      const topRecommendation = result.recommendations[0];
      expect((topRecommendation?.dimensionScores?.relevance ?? 0)).toBeGreaterThan(0);
    }
  });
});
