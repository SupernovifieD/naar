import { describe, expect, it } from "vitest";
import { evaluateRecommendationFixture } from "../../src/recommend/evaluation/evaluate.js";
import { renderRecommendationEvaluationReport } from "../../src/recommend/evaluation/report.js";
import { RECOMMENDATION_EVAL_FIXTURES } from "../fixtures/recommendation/index.js";

describe("recommendation evaluation", () => {
  it("meets baseline quality thresholds across offline fixtures", () => {
    const results = RECOMMENDATION_EVAL_FIXTURES.map((fixture) =>
      evaluateRecommendationFixture(fixture)
    );
    const report = renderRecommendationEvaluationReport(results);

    const failures = results.flatMap((result) => result.failures);

    if (failures.length > 0) {
      console.error(report);
    }

    expect(failures.map((failure) => failure.message)).toEqual([]);
    expect(report).toContain("hard-blockers@5:");
    expect(report).toContain("poor-fit@5:");
    for (const result of results) {
      for (const recommendation of result.recommendations) {
        expect(recommendation.dimensionScores).toBeDefined();
        expect(recommendation.dimensionScores?.final).toBe(recommendation.score);
        expect(Array.isArray(recommendation.blockers)).toBe(true);
        expect(recommendation.fitSummary).toBeDefined();
      }

      const topRecommendation = result.recommendations[0];
      expect((topRecommendation?.dimensionScores?.relevance ?? 0)).toBeGreaterThan(0);
    }
  });
});
