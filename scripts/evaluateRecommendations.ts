import { evaluateRecommendationFixture } from "../src/recommend/evaluation/evaluate.js";
import { renderRecommendationEvaluationReport } from "../src/recommend/evaluation/report.js";
import { RECOMMENDATION_EVAL_FIXTURES } from "../tests/fixtures/recommendation/index.js";

const results = RECOMMENDATION_EVAL_FIXTURES.map((fixture) => evaluateRecommendationFixture(fixture));
const output = renderRecommendationEvaluationReport(results);
process.stdout.write(`${output}\n`);

const failureCount = results.reduce((sum, result) => sum + result.failures.length, 0);
process.exitCode = failureCount > 0 ? 1 : 0;
