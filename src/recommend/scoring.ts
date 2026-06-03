import type {
  AssistantId,
  MatchedFact,
  MatchedNeedDetail,
  RecommendationCapApplied,
  RecommendationDimensionScores,
  RecommendationScoreComponent,
  SkillCandidate,
  SkillCategory
} from "../types/index.js";

export interface ScoreDimensionInputs {
  scoreBreakdown: RecommendationScoreComponent[];
  capsApplied: RecommendationCapApplied[];
  penalties: string[];
  reasons: string[];
  matchedNeeds: string[];
  matchedNeedDetails: MatchedNeedDetail[];
  matchedFacts: MatchedFact[];
  candidate: SkillCandidate;
  riskScore: number;
  assistantMatches: AssistantId[];
  eligibleAssistants: Set<AssistantId>;
  hasDeepMatch: boolean;
  skillCategories: SkillCategory[];
  domainSignals: string[];
  includedByAllCompatible?: boolean;
  noScripts?: boolean;
}

interface ScorePartitions {
  rawScore: number;
  relevanceRaw: number;
  qualityRaw: number;
}

const SPECIFICITY_NEGATIVE_KINDS = new Map<string, number>([
  ["generic_productivity_penalty", 20],
  ["language_only_penalty", 20],
  ["domain_mismatch_penalty", 30],
  ["secondary_only_framework_penalty", 20]
]);

export function computeDimensionScores(input: ScoreDimensionInputs): RecommendationDimensionScores {
  const relevancePartitions = computeScorePartitions(input.scoreBreakdown);
  const relevance = roundDimension(normalizePositiveScore(relevancePartitions.relevanceRaw, 90));
  const specificity = roundDimension(computeSpecificity(input));
  const compatibility = roundDimension(computeCompatibility(input));
  const quality = roundDimension(computeQuality(input.candidate));
  const safety = roundDimension(computeSafety(input));
  const final = roundDimension(
    (relevance * 0.45)
    + (specificity * 0.20)
    + (compatibility * 0.10)
    + (quality * 0.15)
    + (safety * 0.10)
  );

  return {
    relevance,
    specificity,
    compatibility,
    quality,
    safety,
    final
  };
}

export function applyRecommendationCaps(
  score: number,
  caps: RecommendationCapApplied[]
): { score: number; appliedCap?: RecommendationCapApplied } {
  if (caps.length === 0) {
    return { score };
  }

  const effectiveCap = caps.reduce<RecommendationCapApplied | undefined>((lowest, current) => {
    if (!lowest) return current;
    return current.cap < lowest.cap ? current : lowest;
  }, undefined);

  if (!effectiveCap || score <= effectiveCap.cap) {
    return { score };
  }

  return {
    score: effectiveCap.cap,
    appliedCap: effectiveCap
  };
}

export function computeScorePartitions(scoreBreakdown: RecommendationScoreComponent[]): ScorePartitions {
  let rawScore = 0;
  let relevanceRaw = 0;
  let qualityRaw = 0;

  for (const component of scoreBreakdown) {
    if (isDerivedComponent(component.kind)) {
      continue;
    }
    rawScore += component.points;
    if (isQualityComponent(component.kind)) {
      qualityRaw += component.points;
    } else {
      relevanceRaw += component.points;
    }
  }

  return { rawScore, relevanceRaw, qualityRaw };
}

export function normalizePositiveScore(raw: number, scale: number): number {
  return 100 * (1 - Math.exp(-(Math.max(0, raw) / scale)));
}

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function clampRecommendationScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function roundDimension(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function computeSpecificity(input: ScoreDimensionInputs): number {
  let specificity = input.hasDeepMatch ? 50 : 15;

  const hasStrongNeed = input.matchedNeedDetails.some((detail) =>
    detail.strength === "exact" || detail.strength === "strong"
  );
  const hasFrameworkMatch = hasBreakdownKind(input.scoreBreakdown, "framework_match");
  const hasToolMatch = hasBreakdownKind(input.scoreBreakdown, "tool_match");
  const hasProjectTypeMatch = hasBreakdownKind(input.scoreBreakdown, "project_type_match");
  const independentFactMatches = new Set(input.matchedFacts.map((fact) => `${fact.source}:${fact.factType}:${fact.id}`)).size;

  if (hasStrongNeed) specificity += 15;
  if (hasFrameworkMatch) specificity += 10;
  if (hasToolMatch) specificity += 10;
  if (hasProjectTypeMatch) specificity += 8;
  if (independentFactMatches >= 3) specificity += 7;

  for (const [kind, penalty] of SPECIFICITY_NEGATIVE_KINDS.entries()) {
    if (hasBreakdownKind(input.scoreBreakdown, kind)) {
      specificity -= penalty;
    }
  }

  if (input.capsApplied.some((cap) => cap.kind === "weak_only_cap")) {
    specificity -= 10;
  }
  if (input.capsApplied.some((cap) => cap.kind === "no_strong_need_cap")) {
    specificity -= 8;
  }
  if (input.capsApplied.some((cap) => cap.kind === "negative_need_cap")) {
    specificity -= 10;
  }
  if (input.capsApplied.some((cap) => cap.kind === "specialized_gate_cap")) {
    specificity -= 15;
  }

  specificity = clampDimension(specificity);

  const capped = applyRecommendationCaps(specificity, input.capsApplied);
  return clampDimension(capped.score);
}

function computeCompatibility(input: ScoreDimensionInputs): number {
  if (input.includedByAllCompatible === true) {
    return 40;
  }

  const selectedAssistants = [...input.eligibleAssistants];
  if (selectedAssistants.length === 0) {
    return input.assistantMatches.length > 0 ? 75 : 0;
  }

  const candidateAssistants = new Set(input.candidate.compatibility.assistants);
  if (candidateAssistants.has("generic")) {
    return 100;
  }
  const supportsAllSelected = selectedAssistants.every((assistant) => candidateAssistants.has(assistant));
  if (supportsAllSelected) {
    return 100;
  }

  if (input.assistantMatches.length > 0) {
    return 75;
  }

  return 0;
}

function computeQuality(candidate: SkillCandidate): number {
  const metadata = candidate.metadata;
  let quality = 0;

  if (metadata.trustLevel === "official") {
    quality += 35;
  } else if (metadata.trustLevel === "trusted") {
    quality += 25;
  } else {
    quality += 5;
  }

  if (metadata.license) {
    quality += 10;
  }

  if (isRecentlyUpdated(metadata.lastUpdatedIso)) {
    quality += 10;
  }

  quality += popularityDimension(metadata.popularity);

  const description = (metadata.description ?? candidate.summary).trim();
  if (description.length > 0) {
    quality += 5;
  }

  return clampDimension(quality);
}

function computeSafety(input: ScoreDimensionInputs): number {
  let safety = clampDimension(input.riskScore);

  if (input.noScripts && input.candidate.metadata.hasScripts) {
    safety = Math.min(safety, 35);
  }

  return clampDimension(safety);
}

function isQualityComponent(kind: string): boolean {
  return kind === "assistant_tiebreak"
    || kind === "publisher_trust"
    || kind === "publisher_trust_penalty"
    || kind === "low_risk_bonus"
    || kind === "popularity_bonus";
}

function isDerivedComponent(kind: string): boolean {
  return kind === "normalized_relevance"
    || kind === "normalized_quality_bonus"
    || kind === "score_cap_applied"
    || kind.startsWith("dimension_");
}

function hasBreakdownKind(scoreBreakdown: RecommendationScoreComponent[], kind: string): boolean {
  return scoreBreakdown.some((component) => component.kind === kind && component.points !== 0);
}

function isRecentlyUpdated(lastUpdatedIso?: string): boolean {
  if (!lastUpdatedIso) return false;
  const updatedAt = new Date(lastUpdatedIso);
  if (Number.isNaN(updatedAt.getTime())) return false;
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= 365;
}

function popularityDimension(popularity?: number): number {
  if (typeof popularity !== "number" || !Number.isFinite(popularity) || popularity <= 0) {
    return 0;
  }
  if (popularity >= 10_000) return 20;
  if (popularity >= 5_000) return 16;
  if (popularity >= 1_000) return 12;
  if (popularity >= 500) return 8;
  if (popularity >= 100) return 4;
  return 2;
}
