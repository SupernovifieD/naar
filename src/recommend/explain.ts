import type {
  MatchedFact,
  MatchedNeedDetail,
  RecommendationBlocker,
  RecommendationCapApplied,
  RecommendationDimensionScores,
  RecommendationFitSummary,
  RecommendationFitLevel,
  SkillRecommendation
} from "../types/index.js";

export function buildRecommendationFitSummary(input: {
  recommendationScore: number;
  dimensionScores: RecommendationDimensionScores;
  reasons: string[];
  penalties: string[];
  matchedNeeds: string[];
  matchedNeedDetails: MatchedNeedDetail[];
  matchedFacts: MatchedFact[];
  blockers: RecommendationBlocker[];
  capsApplied: RecommendationCapApplied[];
}): RecommendationFitSummary {
  const hardBlockers = input.blockers.filter((blocker) => blocker.severity === "hard");
  const softBlockers = input.blockers.filter((blocker) => blocker.severity === "soft");
  const level = resolveFitLevel(input.dimensionScores, hardBlockers, softBlockers);
  const headline = buildHeadline(level, input, hardBlockers);
  const primaryMatches = dedupeStrings(resolvePrimaryMatches(input));
  const supportingMatches = dedupeStrings(resolveSupportingMatches(input));
  const cautions = dedupeStrings([
    ...softBlockers.map((blocker) => blocker.message),
    ...input.penalties.filter((penalty) => penalty.toLowerCase().includes("trust") || penalty.toLowerCase().includes("weak") || penalty.toLowerCase().includes("no strong"))
  ]).slice(0, 4);
  const blockers = dedupeStrings(hardBlockers.map((blocker) => blocker.message)).slice(0, 4);

  return {
    level,
    headline,
    primaryMatches,
    supportingMatches,
    cautions,
    blockers
  };
}

export function buildLegacyFitSummary(recommendation: SkillRecommendation): RecommendationFitSummary {
  const level: RecommendationFitLevel = recommendation.score >= 70
    ? "strong"
    : recommendation.score >= 50
      ? "moderate"
      : recommendation.score >= 25
        ? "weak"
        : "poor";

  return {
    level,
    headline: "Legacy cached recommendation",
    primaryMatches: recommendation.reasons?.slice(0, 2) ?? [],
    supportingMatches: [],
    cautions: recommendation.penalties?.slice(0, 2) ?? [],
    blockers: []
  };
}

function resolveFitLevel(
  dimensionScores: RecommendationDimensionScores,
  hardBlockers: RecommendationBlocker[],
  softBlockers: RecommendationBlocker[]
): RecommendationFitLevel {
  if (dimensionScores.final < 25 || hardBlockers.some((blocker) => blocker.scoreCap <= 25)) {
    return "poor";
  }

  const hasHardDomainOrFramework = hardBlockers.some((blocker) =>
    blocker.kind === "domain_mismatch"
    || blocker.kind === "framework_mismatch"
    || blocker.kind === "secondary_scope_only"
  );

  if (dimensionScores.final >= 70 && dimensionScores.relevance >= 55 && dimensionScores.specificity >= 50 && hardBlockers.length === 0) {
    return "strong";
  }

  if (dimensionScores.final >= 50 && dimensionScores.relevance >= 35 && !hasHardDomainOrFramework) {
    return "moderate";
  }

  if (dimensionScores.final >= 25 || softBlockers.length > 0) {
    return "weak";
  }

  return "poor";
}

function buildHeadline(
  level: RecommendationFitLevel,
  input: {
    matchedNeedDetails: MatchedNeedDetail[];
    matchedFacts: MatchedFact[];
    blockers: RecommendationBlocker[];
  },
  hardBlockers: RecommendationBlocker[]
): string {
  if (hardBlockers.length > 0) {
    const primaryHard = hardBlockers[0];
    if (primaryHard.kind === "domain_mismatch") return "Poor fit: domain mismatch";
    if (primaryHard.kind === "framework_mismatch" || primaryHard.kind === "secondary_scope_only") return "Poor fit: framework mismatch";
    if (primaryHard.kind === "prompting_mismatch") return "Poor fit: prompting mismatch";
    if (primaryHard.kind === "mcp_mismatch") return "Poor fit: MCP mismatch";
  }

  const strongNeeds = input.matchedNeedDetails
    .filter((detail) => detail.strength === "exact" || detail.strength === "strong")
    .map((detail) => detail.id);
  const toolFacts = input.matchedFacts.filter((fact) => fact.factType === "tool").map((fact) => fact.id);
  const projectFacts = input.matchedFacts.filter((fact) => fact.factType === "projectType").map((fact) => fact.id);

  if (level === "strong") {
    const summary = summarizePrimaryContext(strongNeeds, toolFacts, projectFacts);
    return `Strong fit for ${summary}`;
  }
  if (level === "moderate") {
    const summary = summarizePrimaryContext(strongNeeds, toolFacts, projectFacts);
    return `Moderate fit for ${summary}`;
  }
  if (strongNeeds.length === 0) {
    return level === "weak"
      ? "Weak fit: mostly language-level evidence"
      : "Poor fit: limited repo-specific evidence";
  }
  return "Weak fit with limited repo-specific evidence";
}

function resolvePrimaryMatches(input: {
  matchedNeedDetails: MatchedNeedDetail[];
  matchedFacts: MatchedFact[];
}): string[] {
  const strongNeeds = input.matchedNeedDetails
    .filter((detail) => detail.strength === "exact" || detail.strength === "strong")
    .map((detail) => `repo need: ${detail.id}`);
  const frameworks = input.matchedFacts
    .filter((fact) => fact.factType === "framework")
    .map((fact) => `framework: ${fact.id}`);
  const projectTypes = input.matchedFacts
    .filter((fact) => fact.factType === "projectType")
    .map((fact) => `project type: ${fact.id}`);
  const tools = input.matchedFacts
    .filter((fact) => fact.factType === "tool" || fact.factType === "command")
    .map((fact) => `${fact.factType === "tool" ? "tool" : "command"}: ${fact.id}`);
  return [...strongNeeds, ...frameworks, ...projectTypes, ...tools].slice(0, 4);
}

function resolveSupportingMatches(input: {
  reasons: string[];
  matchedNeedDetails: MatchedNeedDetail[];
  matchedFacts: MatchedFact[];
}): string[] {
  const weakNeeds = input.matchedNeedDetails
    .filter((detail) => detail.strength === "weak")
    .map((detail) => `weak need: ${detail.id}`);
  const languages = input.matchedFacts
    .filter((fact) => fact.factType === "language")
    .map((fact) => `language: ${fact.id}`);
  const qualityReasons = input.reasons.filter((reason) =>
    reason.toLowerCase().includes("publisher trust") || reason.toLowerCase().includes("low-risk")
  );
  return [...weakNeeds, ...languages, ...qualityReasons].slice(0, 4);
}

function summarizePrimaryContext(strongNeeds: string[], toolFacts: string[], projectFacts: string[]): string {
  if (strongNeeds.length > 0) {
    return humanizeNeedId(strongNeeds[0]);
  }
  if (projectFacts.length > 0 && toolFacts.length > 0) {
    return `${projectFacts[0]} workflow`;
  }
  if (projectFacts.length > 0) {
    return `${projectFacts[0]} project`;
  }
  if (toolFacts.length > 0) {
    return `${toolFacts[0]} workflow`;
  }
  return "the detected repo context";
}

function humanizeNeedId(value: string): string {
  return value.replace(/_/g, " ");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
