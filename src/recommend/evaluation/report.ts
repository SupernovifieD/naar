import type { RecommendationEvaluationResult } from "./evaluate.js";

export function renderRecommendationEvaluationReport(results: RecommendationEvaluationResult[]): string {
  const lines: string[] = ["Recommendation Evaluation Report", ""];

  for (const result of results) {
    const precisionK = firstMetricKey(result.metrics.precisionAtK, 5);
    const recallK = firstMetricKey(result.metrics.recallAtK, 10);
    const badDomainK = firstMetricKey(result.metrics.badDomainCountAtK, 5);
    const blockedK = firstMetricKey(result.metrics.blockedCountAtK, 5);
    const hardBlockerK = firstMetricKey(result.metrics.hardBlockerCountAtK ?? {}, 5);
    const poorFitK = firstMetricKey(result.metrics.poorFitCountAtK ?? {}, 5);

    lines.push(result.fixtureId);
    lines.push(`  precision@${precisionK}: ${formatMetric(result.metrics.precisionAtK[precisionK] ?? 0)}`);
    lines.push(`  recall@${recallK}: ${formatMetric(result.metrics.recallAtK[recallK] ?? 0)}`);
    lines.push(`  bad-domain@${badDomainK}: ${result.metrics.badDomainCountAtK[badDomainK] ?? 0}`);
    lines.push(`  blocked@${blockedK}: ${result.metrics.blockedCountAtK[blockedK] ?? 0}`);
    lines.push(`  hard-blockers@${hardBlockerK}: ${result.metrics.hardBlockerCountAtK?.[hardBlockerK] ?? 0}`);
    lines.push(`  poor-fit@${poorFitK}: ${result.metrics.poorFitCountAtK?.[poorFitK] ?? 0}`);
    const averageDimensions = result.metrics.averageDimensionsAtK ?? {};
    const averageDimensionK = firstMetricKey(averageDimensions, 5);
    const dimensionValues = averageDimensions[averageDimensionK];
    if (dimensionValues) {
      lines.push(`  avg dimensions@${averageDimensionK}:`);
      lines.push(`    relevance: ${formatMetric(dimensionValues.relevance)}`);
      lines.push(`    specificity: ${formatMetric(dimensionValues.specificity)}`);
      lines.push(`    compatibility: ${formatMetric(dimensionValues.compatibility)}`);
      lines.push(`    quality: ${formatMetric(dimensionValues.quality)}`);
      lines.push(`    safety: ${formatMetric(dimensionValues.safety)}`);
      lines.push(`    final: ${formatMetric(dimensionValues.final)}`);
    }
    lines.push("  top 5:");

    for (const [index, recommendation] of result.recommendations.slice(0, 5).entries()) {
      const needs = recommendation.matchedNeeds.length > 0
        ? recommendation.matchedNeeds.join(",")
        : "-";
      const providerLabel = recommendation.candidate.source.providerId;
      const status = recommendation.status ? ` status=${recommendation.status}` : "";
      lines.push(
        `    ${index + 1}. ${recommendation.candidate.name} [${providerLabel}]`
        + ` score=${recommendation.score} needs=${needs}${status}`
      );
    }

    if (result.failures.length > 0) {
      lines.push("  failures:");
      for (const failure of result.failures) {
        lines.push(`    - ${failure.message}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function firstMetricKey(record: Record<string, unknown>, fallback: number): number {
  const keys = Object.keys(record);
  if (keys.length === 0) return fallback;
  return Number.parseInt(keys[0] ?? String(fallback), 10);
}

function formatMetric(value: number): string {
  return value.toFixed(2);
}
