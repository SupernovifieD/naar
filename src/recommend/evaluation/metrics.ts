import type { SkillRecommendation } from "../../types/index.js";
import type { RecommendationEvalCategory, RecommendationExpectations } from "./fixtures.js";

export interface RecommendationRelevantSet {
  skillRefs: Set<string>;
  needIds: Set<string>;
}

export interface RecommendationMetrics {
  precisionAtK: Record<string, number>;
  recallAtK: Record<string, number>;
  badDomainCountAtK: Record<string, number>;
  blockedCountAtK: Record<string, number>;
  riskyCountAtK: Record<string, number>;
}

export function createRelevantSet(expectations: RecommendationExpectations): RecommendationRelevantSet {
  return {
    skillRefs: new Set(expectations.shouldRecommendSkillRefs ?? []),
    needIds: new Set(expectations.shouldRecommendNeedIds)
  };
}

export function precisionAtK(
  recommendations: SkillRecommendation[],
  relevant: RecommendationRelevantSet,
  k: number
): number {
  const topK = recommendations.slice(0, Math.max(0, k));
  if (topK.length === 0) return 0;
  const matches = topK.filter((recommendation) => isRelevantRecommendation(recommendation, relevant)).length;
  return roundMetric(matches / topK.length);
}

export function recallAtK(
  recommendations: SkillRecommendation[],
  relevant: RecommendationRelevantSet,
  k: number
): number {
  const relevantUniverse = totalRelevantTargets(relevant);
  if (relevantUniverse === 0) return 1;
  const matches = matchedRelevantTargetsAtK(recommendations, relevant, k);
  return roundMetric(matches / relevantUniverse);
}

export function badDomainCountAtK(
  recommendations: SkillRecommendation[],
  badCategories: RecommendationEvalCategory[],
  k: number
): number {
  const badSet = new Set(badCategories.map(normalizeValue));
  return recommendations.slice(0, Math.max(0, k)).filter((recommendation) => {
    const categories = (recommendation.skillCategories ?? []).map(normalizeValue);
    const domains = (recommendation.domainSignals ?? []).map(normalizeValue);
    return [...categories, ...domains].some((value) => badSet.has(value));
  }).length;
}

export function blockedCountAtK(recommendations: SkillRecommendation[], k: number): number {
  return recommendations.slice(0, Math.max(0, k)).filter((recommendation) =>
    recommendation.blocked === true
    || recommendation.status === "blocked"
    || recommendation.hardBlocked === true
  ).length;
}

export function riskyCountAtK(recommendations: SkillRecommendation[], k: number): number {
  return recommendations.slice(0, Math.max(0, k)).filter((recommendation) =>
    recommendation.status === "risky"
  ).length;
}

export function topKContainsAny(
  recommendations: SkillRecommendation[],
  tokensOrRefs: string[],
  k: number
): boolean {
  const probes = tokensOrRefs.map(normalizeValue).filter(Boolean);
  if (probes.length === 0) return true;

  return recommendations.slice(0, Math.max(0, k)).some((recommendation) => {
    const haystack = [
      recommendation.candidate.providerScopedId ?? "",
      recommendation.candidate.canonicalSkillId,
      recommendation.candidate.providerSkillId,
      recommendation.candidate.name,
      ...(recommendation.matchedNeeds ?? []),
      ...((recommendation.matchedNeedDetails ?? []).map((detail) => detail.id))
    ]
      .map(normalizeValue)
      .filter(Boolean);

    return probes.some((probe) => haystack.some((item) => item.includes(probe) || probe.includes(item)));
  });
}

export function collectBadDomainRefsAtK(
  recommendations: SkillRecommendation[],
  badCategories: RecommendationEvalCategory[],
  k: number
): string[] {
  const badSet = new Set(badCategories.map(normalizeValue));
  return recommendations.slice(0, Math.max(0, k)).flatMap((recommendation) => {
    const categories = (recommendation.skillCategories ?? []).map(normalizeValue);
    const domains = (recommendation.domainSignals ?? []).map(normalizeValue);
    const hasBadDomain = [...categories, ...domains].some((value) => badSet.has(value));
    return hasBadDomain ? [recommendationRef(recommendation)] : [];
  });
}

export function isRelevantRecommendation(
  recommendation: SkillRecommendation,
  relevant: RecommendationRelevantSet
): boolean {
  if (relevant.skillRefs.size > 0) {
    const refs = recommendationRefs(recommendation);
    if (refs.some((ref) => relevant.skillRefs.has(ref))) {
      return true;
    }
  }

  if (relevant.needIds.size > 0) {
    for (const matchedNeed of recommendation.matchedNeeds ?? []) {
      if (relevant.needIds.has(matchedNeed)) return true;
    }
    for (const detail of recommendation.matchedNeedDetails ?? []) {
      if (relevant.needIds.has(detail.id)) return true;
    }
  }

  return false;
}

export function recommendationRef(recommendation: SkillRecommendation): string {
  return recommendation.candidate.providerScopedId
    ?? `${recommendation.candidate.source.providerId}:${recommendation.candidate.providerSkillId}`;
}

function recommendationRefs(recommendation: SkillRecommendation): string[] {
  return [
    recommendationRef(recommendation),
    recommendation.candidate.canonicalSkillId,
    recommendation.candidate.providerSkillId
  ];
}

function totalRelevantTargets(relevant: RecommendationRelevantSet): number {
  return relevant.skillRefs.size + relevant.needIds.size;
}

function matchedRelevantTargetsAtK(
  recommendations: SkillRecommendation[],
  relevant: RecommendationRelevantSet,
  k: number
): number {
  const matchedSkillRefs = new Set<string>();
  const matchedNeedIds = new Set<string>();

  for (const recommendation of recommendations.slice(0, Math.max(0, k))) {
    for (const ref of recommendationRefs(recommendation)) {
      if (relevant.skillRefs.has(ref)) {
        matchedSkillRefs.add(ref);
      }
    }

    for (const matchedNeed of recommendation.matchedNeeds ?? []) {
      if (relevant.needIds.has(matchedNeed)) {
        matchedNeedIds.add(matchedNeed);
      }
    }
    for (const detail of recommendation.matchedNeedDetails ?? []) {
      if (relevant.needIds.has(detail.id)) {
        matchedNeedIds.add(detail.id);
      }
    }
  }

  return matchedSkillRefs.size + matchedNeedIds.size;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
