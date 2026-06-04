import type {
  AssistantId,
  RecommendationBlocker,
  MatchedNeedDetail,
  MatchedFact,
  RecommendationStatus,
  RecommendationCapApplied,
  RecommendationScoreComponent,
  RepoFacts,
  RepoNeed,
  SkillCategory,
  SkillCandidate,
  SkillRecommendation
} from "../types/index.js";
import { analyzeSkill, evaluateInstallDecision, type SecurityPolicy } from "../security/analyzeSkill.js";
import { getNeedMatchProfile, matchNeedProfile, type NeedMatchLexicon } from "./needProfiles.js";
import {
  buildRecommendationContext,
  deriveRepoNeeds,
  detectRecommendationDomains,
  type RecommendationContext
} from "./needs.js";
import {
  classifySkillCategories,
  detectDomainSignals
} from "./specializedGates.js";
import { evaluateRecommendationBlockers } from "./blockers.js";
import { buildRecommendationFitSummary } from "./explain.js";
import {
  applyRecommendationCaps,
  clampRecommendationScore,
  computeDimensionScores,
  computeScorePartitions,
  normalizePositiveScore,
  roundDimension
} from "./scoring.js";

const ALL_ASSISTANTS: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];

const SETUP_KEYWORDS = new Set([
  "setup",
  "configuration",
  "config",
  "project-skill",
  "project-skill-setup",
  "repo-instructions",
  "workflow-setup",
  "developer-workflow",
  "onboarding",
  "instructions",
  "copilot-instructions",
  "claude-code"
]);

const PRODUCTIVITY_KEYWORDS = new Set([
  "internal-comms",
  "communication",
  "guidelines",
  "brand",
  "newsletter",
  "writing",
  "documentation-style",
  "presentation",
  "spreadsheet",
  "art",
  "algorithmic-art"
]);

type EligibilitySource =
  | "explicit-targets"
  | "config-default-targets"
  | "detected-assistants"
  | "fallback-all";

export interface RecommendOptions extends SecurityPolicy {
  eligibleAssistants?: AssistantId[];
  eligibilitySource?: EligibilitySource;
  allCompatible?: boolean;
  maxResults?: number;
  precomputedRepoNeeds?: RepoNeed[];
  referenceDateIso?: string;
}

export interface RecommendResult {
  repoNeeds: RepoNeed[];
  recommendations: SkillRecommendation[];
}

interface NormalizedCandidate {
  nameText: string;
  nameTokens: Set<string>;
  tagText: string;
  tagTokens: Set<string>;
  primaryText: string;
  primaryTokens: Set<string>;
  supportingText: string;
  supportingTokens: Set<string>;
  tokens: Set<string>;
  assistants: Set<AssistantId>;
  frameworks: Set<string>;
  languages: Set<string>;
  domains: Set<string>;
  domainSignals: string[];
  categories: SkillCategory[];
  hasAssistantKeyword: boolean;
  isSetupSkill: boolean;
  isGeneralProductivity: boolean;
}

const PROJECT_TYPE_KEYWORDS: Record<string, string[]> = {
  cli: ["cli", "terminal", "command"],
  package: ["package", "npm", "publish", "release"],
  library: ["library", "module", "sdk"],
  "web-app": ["web", "frontend", "react", "nextjs", "tailwind"],
  api: ["api", "backend", "server", "http"],
  monorepo: ["monorepo", "workspace", "pnpm-workspace", "turborepo"],
  docs: ["docs", "documentation", "readme"]
};

const TOOL_SYNONYMS: Record<string, string[]> = {
  tsup: ["tsup", "bundle", "build"],
  tsc: ["tsc", "typecheck", "typescript"],
  vitest: ["vitest", "test", "testing"],
  "github-actions": ["github-actions", "ci", "workflow"],
  docker: ["docker", "container"],
  "docker-compose": ["docker-compose", "compose"],
  zod: ["zod", "schema", "validation"],
  undici: ["undici", "http", "fetch"]
};

const FRAMEWORK_IDS = [
  "react",
  "nextjs",
  "tailwind",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "angular",
  "fastapi",
  "flask",
  "django",
  "streamlit",
  "pytest",
  "vite"
];

export function recommendSkills(
  repoFacts: RepoFacts,
  candidates: SkillCandidate[],
  options: RecommendOptions
): RecommendResult {
  const context = buildRecommendationContext(repoFacts);
  const repoNeeds = options.precomputedRepoNeeds ?? deriveRepoNeeds(repoFacts);
  const repoNeedIds = new Set(repoNeeds.map((need) => need.id));
  const eligibleAssistants = dedupeAssistants(options.eligibleAssistants ?? ALL_ASSISTANTS);
  const referenceDateIso = options.referenceDateIso ?? new Date().toISOString();
  const recommendations: SkillRecommendation[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    const risk = analyzeSkill(candidate);
    candidate.risk = risk;

    const assistantMatches = [...normalized.assistants].filter((assistant) => eligibleAssistants.has(assistant));
    if (assistantMatches.length === 0 && !options.allCompatible) {
      continue;
    }

    const reasons: string[] = [];
    const penalties: string[] = [];
    const eligibilityReasons: string[] = [];
    const matchedFacts: MatchedFact[] = [];
    const matchedNeeds: string[] = [];
    const matchedNeedDetails: MatchedNeedDetail[] = [];
    const blockers: RecommendationBlocker[] = [];
    const capsApplied: RecommendationCapApplied[] = [];
    const scoreBreakdown: RecommendationScoreComponent[] = [];
    const skillCategories = normalized.categories;
    const domainSignals = normalized.domainSignals;
    let score = 0;
    const includedByAllCompatible = assistantMatches.length === 0 && options.allCompatible === true;

    if (includedByAllCompatible) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "all_compatible_override_penalty",
        points: -10,
        detail: "Incompatible with preferred targets; included because --all-compatible is enabled"
      });
      penalties.push("Incompatible with preferred targets; included because --all-compatible is enabled");
      eligibilityReasons.push("Included by --all-compatible override");
    } else {
      if (options.eligibilitySource === "explicit-targets") {
        const label = assistantMatches.join(", ");
        eligibilityReasons.push(`Eligible for target: ${label}`);
        score = applyScoreComponent(score, scoreBreakdown, {
          kind: "assistant_tiebreak",
          points: Math.min(2, assistantMatches.length),
          detail: `Explicit target compatibility: ${label}`
        });
      }
      if (options.eligibilitySource !== "explicit-targets" && assistantMatches.length > 0 && assistantMatches.length < normalized.assistants.size) {
        eligibilityReasons.push(`Eligible for target set: ${assistantMatches.join(", ")}`);
      }
    }

    const needLexicon: NeedMatchLexicon = {
      primaryText: normalized.primaryText,
      primaryTokens: normalized.primaryTokens,
      supportingText: normalized.supportingText,
      supportingTokens: normalized.supportingTokens
    };
    for (const repoNeed of repoNeeds) {
      const profile = getNeedMatchProfile(repoNeed.id);
      if (!profile) continue;
      const match = matchNeedProfile(profile, needLexicon);

      let points = 0;
      if (match.strength === "exact") points = 35;
      if (match.strength === "strong") points = 28;
      if (match.strength === "weak") points = 6;
      if (match.strength === "negative") points = -30;

      if (match.strength === "none") {
        if (match.reason && match.matchedTerms.length > 0) {
          penalties.push(`${repoNeed.id}: ${match.reason}`);
        }
        continue;
      }

      if (match.strength === "exact" || match.strength === "strong") {
        matchedNeeds.push(repoNeed.id);
        reasons.push(`Matched repo need: ${repoNeed.id} (${match.strength})`);
        matchedFacts.push({
          factType: "repoNeed",
          id: repoNeed.id,
          source: "repoNeeds"
        });
      }
      if (match.strength === "weak") {
        penalties.push(`Weak repo-need evidence only: ${repoNeed.id}`);
      }
      if (match.strength === "negative") {
        penalties.push(`Need anti-trigger: ${repoNeed.id}`);
      }

      const breakdownKind = match.strength === "weak"
        ? "repo_need_weak_match"
        : (match.strength === "negative" ? "repo_need_negative_match" : "repo_need_match");
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: breakdownKind,
        points,
        detail: repoNeed.id,
        strength: match.strength,
        matchedTerms: match.matchedTerms,
        antiTerms: match.antiTerms,
        reason: match.reason
      });

      matchedNeedDetails.push({
        id: repoNeed.id,
        strength: match.strength,
        points,
        matchedTerms: match.matchedTerms,
        antiTerms: match.antiTerms,
        reason: match.reason
      });
    }

    const projectTypeMatches = matchPrimaryProjectTypes(context, normalized.tokens);
    let projectTypePoints = 0;
    for (const match of projectTypeMatches) {
      const limitRemaining = 36 - projectTypePoints;
      if (limitRemaining <= 0) break;
      const points = Math.min(18, limitRemaining);
      projectTypePoints += points;
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "project_type_match",
        points,
        detail: match.id
      });
      reasons.push(`Matched primary project type: ${match.id}`);
      matchedFacts.push(match);
    }

    const frameworkMatches = [...normalized.frameworks].filter((framework) => context.primaryFrameworks.has(framework));
    let frameworkPoints = 0;
    for (const frameworkId of frameworkMatches) {
      const limitRemaining = 28 - frameworkPoints;
      if (limitRemaining <= 0) break;
      const points = Math.min(14, limitRemaining);
      frameworkPoints += points;
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "framework_match",
        points,
        detail: frameworkId
      });
      reasons.push(`Matched primary framework: ${frameworkId}`);
      const baseFact = context.primaryFrameworks.get(frameworkId);
      if (baseFact) matchedFacts.push(baseFact);
    }

    const toolMatches = matchPrimaryTools(context, normalized.tokens);
    let toolPoints = 0;
    for (const toolMatch of toolMatches) {
      const limitRemaining = 36 - toolPoints;
      if (limitRemaining <= 0) break;
      const points = Math.min(12, limitRemaining);
      toolPoints += points;
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "tool_match",
        points,
        detail: toolMatch.id
      });
      reasons.push(`Matched primary tool: ${toolMatch.id}`);
      matchedFacts.push(toolMatch);
    }

    const languageMatches = matchLanguages(context, normalized);
    let languagePoints = 0;
    for (const languageId of languageMatches) {
      const limitRemaining = 14 - languagePoints;
      if (limitRemaining <= 0) break;
      const points = Math.min(7, limitRemaining);
      languagePoints += points;
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "language_match",
        points,
        detail: languageId
      });
      reasons.push(`Matched primary language: ${languageId}`);
      matchedFacts.push({ factType: "language", id: languageId, source: "primaryFacts" });
    }

    const hasDeepMatch = matchedNeeds.length > 0 || projectTypeMatches.length > 0 || frameworkMatches.length > 0 || toolMatches.length > 0;

    const recommendationBlockers = evaluateRecommendationBlockers({
      candidateText: normalized.primaryText,
      candidateTokens: normalized.primaryTokens,
      candidateNameText: normalized.nameText,
      candidateNameTokens: normalized.nameTokens,
      candidateTagText: normalized.tagText,
      candidateTagTokens: normalized.tagTokens,
      skillCategories,
      domainSignals,
      repoNeedIds,
      repoTokens: context.repoTokens,
      repoDomains: context.repoDomains,
      primaryFrameworks: new Set(context.primaryFrameworks.keys()),
      secondaryFrameworks: context.secondaryFrameworks,
      matchedNeeds,
      matchedNeedDetails,
      hasDeepMatch,
      languageMatches,
      hasProviderSourcePath: context.hasProviderSourcePath,
      hasSkillAuthoringPath: context.hasSkillAuthoringPath
    });

    for (const blocker of recommendationBlockers) {
      blockers.push(blocker);
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "recommendation_blocker",
        points: blocker.penalty,
        detail: blocker.message,
        reason: blocker.kind
      });
      penalties.push(blocker.message);
      capsApplied.push({
        kind: blocker.kind,
        cap: blocker.scoreCap,
        reason: blocker.message
      });
    }

    const missingMismatchPenalty = evaluateMissingCapabilityMismatch(context, normalized, matchedNeedDetails, penalties, scoreBreakdown);
    score += missingMismatchPenalty;

    if (candidate.metadata.trustLevel === "official") {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "publisher_trust",
        points: 8,
        detail: "Official publisher"
      });
      reasons.push("Publisher trust: official source");
    } else if (candidate.metadata.trustLevel === "trusted") {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "publisher_trust",
        points: 5,
        detail: "Trusted publisher"
      });
      reasons.push("Publisher trust: trusted community source");
    } else {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "publisher_trust_penalty",
        points: -10,
        detail: "Unknown publisher"
      });
      penalties.push("Publisher trust is unknown");
    }

    if (risk.score >= 90) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "low_risk_bonus",
        points: 5,
        detail: "Low-risk skill profile"
      });
      reasons.push("Low-risk instruction-only skill");
    }

    const popularityPoints = popularityScore(candidate.metadata.popularity);
    if (popularityPoints > 0) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "popularity_bonus",
        points: popularityPoints,
        detail: `Popularity signal: ${candidate.metadata.popularity ?? 0}`
      });
    }


    const { rawScore, relevanceRaw, qualityRaw } = computeScorePartitions(scoreBreakdown);
    const normalizedRelevance = normalizePositiveScore(relevanceRaw, 90);
    const baseQualityBonus = Math.min(8, qualityRaw * 0.4);
    let qualityBonus = baseQualityBonus;
    if (normalizedRelevance < 25 && qualityBonus > 0) {
      qualityBonus = 0;
    } else if (normalizedRelevance < 45 && qualityBonus > 3) {
      qualityBonus = 3;
    }

    scoreBreakdown.push({
      kind: "normalized_relevance",
      points: roundDimension(normalizedRelevance),
      detail: `From relevanceRaw=${roundDimension(relevanceRaw)}`
    });
    scoreBreakdown.push({
      kind: "normalized_quality_bonus",
      points: roundDimension(qualityBonus),
      detail: `From qualityRaw=${roundDimension(qualityRaw)}`
    });

    const preCapDimensions = computeDimensionScores({
      scoreBreakdown,
      capsApplied,
      penalties,
      reasons,
      matchedNeeds,
      matchedNeedDetails,
      matchedFacts,
      candidate,
      riskScore: risk.score,
      assistantMatches,
      eligibleAssistants,
      hasDeepMatch,
      skillCategories,
      domainSignals,
      includedByAllCompatible,
      noScripts: options.noScripts,
      blockers,
      referenceDateIso
    });

    scoreBreakdown.push({
      kind: "dimension_relevance",
      points: preCapDimensions.relevance,
      detail: "Dimensional relevance score"
    });
    scoreBreakdown.push({
      kind: "dimension_specificity",
      points: preCapDimensions.specificity,
      detail: "Dimensional specificity score"
    });
    scoreBreakdown.push({
      kind: "dimension_compatibility",
      points: preCapDimensions.compatibility,
      detail: "Dimensional compatibility score"
    });
    scoreBreakdown.push({
      kind: "dimension_quality",
      points: preCapDimensions.quality,
      detail: "Dimensional quality score"
    });
    scoreBreakdown.push({
      kind: "dimension_safety",
      points: preCapDimensions.safety,
      detail: "Dimensional safety score"
    });
    scoreBreakdown.push({
      kind: "dimension_final_weighted",
      points: preCapDimensions.final,
      detail: "Weighted dimensional score before caps"
    });

    const cappedScore = applyRecommendationCaps(preCapDimensions.final, capsApplied);
    let finalScore = cappedScore.score;
    if (cappedScore.appliedCap) {
      const beforeCap = preCapDimensions.final;
      finalScore = cappedScore.appliedCap.cap;
      scoreBreakdown.push({
        kind: "score_cap_applied",
        points: roundDimension(finalScore - beforeCap),
        detail: `Score capped at ${cappedScore.appliedCap.cap}`,
        reason: cappedScore.appliedCap.reason
      });
    }

    const securityDecision = evaluateInstallDecision(risk, {
      minSecurityScore: options.minSecurityScore,
      noScripts: options.noScripts,
      allowRisky: options.allowRisky
    }, !!candidate.metadata.hasScripts);

    const blockReasons: string[] = [];
    let status: RecommendationStatus = securityDecision.status;

    if (assistantMatches.length === 0) {
      status = "incompatible";
      blockReasons.push("Incompatible with preferred targets.");
    }

    if (status === "incompatible") {
      blockReasons.push(...securityDecision.hardBlockReasons);
      if (securityDecision.hardBlockReasons.length === 0) {
        blockReasons.push(...securityDecision.overrideReasons);
      }
    } else {
      blockReasons.push(...securityDecision.reasons);
    }

    const normalizedBlockReasons = dedupeStrings(blockReasons).filter(Boolean);

    const normalizedReasons = dedupeStrings(reasons).slice(0, 8);
    const normalizedPenalties = dedupeStrings(penalties);
    const normalizedEligibility = dedupeStrings(eligibilityReasons);
    const normalizedBlockers = dedupeBlockers(blockers);
    const finalRoundedScore = clampRecommendationScore(finalScore);
    const dimensionScores = {
      ...preCapDimensions,
      final: finalRoundedScore
    };
    const fitSummary = buildRecommendationFitSummary({
      recommendationScore: finalRoundedScore,
      dimensionScores,
      reasons: normalizedReasons,
      penalties: normalizedPenalties,
      matchedNeeds: dedupeStrings(matchedNeeds),
      matchedNeedDetails,
      matchedFacts: dedupeFacts(matchedFacts),
      blockers: normalizedBlockers,
      capsApplied: dedupeCaps(capsApplied)
    });

    const recommendation: SkillRecommendation = {
      candidate,
      score: finalRoundedScore,
      rawScore: roundDimension(rawScore),
      relevanceRaw: roundDimension(relevanceRaw),
      qualityRaw: roundDimension(qualityRaw),
      dimensionScores,
      blockers: normalizedBlockers,
      fitSummary,
      status,
      overrideable: securityDecision.overrideable,
      hardBlocked: securityDecision.hardBlocked,
      reasons: normalizedReasons,
      matchedNeeds: dedupeStrings(matchedNeeds),
      matchedNeedDetails,
      matchedFacts: dedupeFacts(matchedFacts),
      eligibilityReasons: normalizedEligibility,
      penalties: normalizedPenalties,
      capsApplied: dedupeCaps(capsApplied),
      skillCategories,
      domainSignals,
      scoreBreakdown,
      blocked: status !== "eligible",
      blockReasons: normalizedBlockReasons
    };

    recommendations.push(recommendation);
  }

  const sorted = recommendations.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.candidate.risk.score !== left.candidate.risk.score) return right.candidate.risk.score - left.candidate.risk.score;
    const leftTrust = trustRank(left.candidate.metadata.trustLevel);
    const rightTrust = trustRank(right.candidate.metadata.trustLevel);
    if (leftTrust !== rightTrust) return leftTrust - rightTrust;
    const byName = left.candidate.name.localeCompare(right.candidate.name);
    if (byName !== 0) return byName;
    return left.candidate.source.providerId.localeCompare(right.candidate.source.providerId);
  });

  const maxResults = options.maxResults ?? 10;
  return {
    repoNeeds,
    recommendations: sorted.slice(0, maxResults)
  };
}

function normalizeCandidate(candidate: SkillCandidate): NormalizedCandidate {
  const nameText = normalizeTextForSearch([
    candidate.name,
    candidate.canonicalSkillId,
    candidate.providerSkillId
  ].join(" "));
  const tagText = normalizeTextForSearch(candidate.tags.join(" "));
  const primaryParts = [
    nameText,
    tagText,
    candidate.summary,
    candidate.metadata.description ?? ""
  ];
  const supportingParts = [
    ...(candidate.compatibility.frameworks ?? []),
    ...(candidate.compatibility.languages ?? []),
    ...candidate.compatibility.assistants
  ];

  const primaryText = normalizeTextForSearch(primaryParts.join(" "));
  const supportingText = normalizeTextForSearch(supportingParts.join(" "));
  const primaryTokens = toTokenSet(primaryText);
  const nameTokens = toTokenSet(nameText);
  const tagTokens = toTokenSet(tagText);
  const supportingTokens = toTokenSet(supportingText);
  const tokens = new Set<string>([...primaryTokens, ...supportingTokens]);
  const assistants = new Set<AssistantId>(candidate.compatibility.assistants);
  const frameworks = new Set<string>((candidate.compatibility.frameworks ?? []).map((item) => normalizeFramework(item)));
  const languages = new Set<string>((candidate.compatibility.languages ?? []).map((item) => item.toLowerCase()));

  for (const framework of FRAMEWORK_IDS) {
    if (nameTokens.has(framework) || tagTokens.has(framework)) {
      frameworks.add(framework);
    }
  }
  for (const language of ["typescript", "javascript", "python", "go", "rust", "java", "php", "ruby"]) {
    if (tokens.has(language)) languages.add(language);
  }

  const domains = detectRecommendationDomains(tokens);
  const categories = classifySkillCategories(primaryText, primaryTokens);
  const domainSignals = detectDomainSignals(primaryText, primaryTokens);
  const hasAssistantKeyword = ["claude", "copilot", "cursor", "codex", "agent", "assistant"].some((token) => tokens.has(token));
  const isSetupSkill = [...SETUP_KEYWORDS].some((token) => tokens.has(token));
  const isGeneralProductivity = [...PRODUCTIVITY_KEYWORDS].some((token) => tokens.has(token));

  return {
    nameText,
    nameTokens,
    tagText,
    tagTokens,
    primaryText,
    primaryTokens,
    supportingText,
    supportingTokens,
    tokens,
    assistants,
    frameworks,
    languages,
    domains,
    domainSignals,
    categories,
    hasAssistantKeyword,
    isSetupSkill,
    isGeneralProductivity
  };
}

function matchPrimaryProjectTypes(context: RecommendationContext, tokens: Set<string>): MatchedFact[] {
  const matches: MatchedFact[] = [];

  for (const [projectTypeId, fact] of context.primaryProjectTypes.entries()) {
    const keywords = PROJECT_TYPE_KEYWORDS[projectTypeId] ?? [];
    if (keywords.some((keyword) => tokens.has(keyword))) {
      matches.push(fact);
    }
  }

  return matches;
}

function matchPrimaryTools(context: RecommendationContext, tokens: Set<string>): MatchedFact[] {
  const matches: MatchedFact[] = [];

  for (const [toolId, fact] of context.primaryToolFacts.entries()) {
    const synonyms = TOOL_SYNONYMS[toolId] ?? [toolId];
    if (synonyms.some((keyword) => tokens.has(keyword))) {
      matches.push(fact);
    }
  }

  return dedupeFacts(matches);
}

function matchLanguages(context: RecommendationContext, candidate: NormalizedCandidate): string[] {
  const matches: string[] = [];
  for (const language of context.primaryLanguages) {
    if (candidate.languages.has(language) || candidate.tokens.has(language)) {
      matches.push(toLanguageLabel(language));
    }
  }
  return dedupeStrings(matches);
}

function evaluateMissingCapabilityMismatch(
  context: RecommendationContext,
  candidate: NormalizedCandidate,
  needMatches: MatchedNeedDetail[],
  penalties: string[],
  scoreBreakdown: RecommendationScoreComponent[]
): number {
  const matchedNeedSet = new Set(
    needMatches
      .filter((match) => match.strength === "exact" || match.strength === "strong")
      .map((match) => match.id)
  );
  let delta = 0;

  if (context.missingSet.has("missing_claude_config") && candidate.tokens.has("claude") && !matchedNeedSet.has("claude_project_setup") && !candidate.isSetupSkill) {
    delta = applyScoreComponent(delta, scoreBreakdown, {
      kind: "missing_capability_mismatch_penalty",
      points: -22,
      detail: "Missing Claude config does not apply because skill is not setup/config oriented"
    });
    penalties.push("Missing Claude config does not apply because skill is not a setup/config skill");
  }

  if (context.missingSet.has("missing_copilot_instructions") && candidate.tokens.has("copilot") && !matchedNeedSet.has("copilot_instruction_setup") && !candidate.isSetupSkill) {
    delta = applyScoreComponent(delta, scoreBreakdown, {
      kind: "missing_capability_mismatch_penalty",
      points: -22,
      detail: "Missing Copilot instructions does not apply because skill is not setup/config oriented"
    });
    penalties.push("Missing Copilot instructions does not apply because skill is not a setup/config skill");
  }

  return delta;
}

function applyScoreComponent(
  score: number,
  scoreBreakdown: RecommendationScoreComponent[],
  component: RecommendationScoreComponent
): number {
  scoreBreakdown.push(component);
  return score + component.points;
}

function trustRank(trust: SkillCandidate["metadata"]["trustLevel"]): number {
  if (trust === "official") return 0;
  if (trust === "trusted") return 1;
  return 2;
}

function popularityScore(popularity?: number): number {
  if (typeof popularity !== "number" || !Number.isFinite(popularity) || popularity <= 0) {
    return 0;
  }
  return Math.min(5, Math.floor(popularity / 100));
}

function dedupeAssistants(values: AssistantId[]): Set<AssistantId> {
  const output = new Set<AssistantId>();
  for (const value of values) {
    if (ALL_ASSISTANTS.includes(value)) {
      output.add(value);
    }
  }
  if (output.size === 0) {
    for (const value of ALL_ASSISTANTS) output.add(value);
  }
  return output;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function dedupeCaps(values: RecommendationCapApplied[]): RecommendationCapApplied[] {
  const seen = new Set<string>();
  const output: RecommendationCapApplied[] = [];
  for (const value of values) {
    const key = `${value.kind}:${value.cap}:${value.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function dedupeBlockers(values: RecommendationBlocker[]): RecommendationBlocker[] {
  const seen = new Set<string>();
  const output: RecommendationBlocker[] = [];
  for (const value of values) {
    const key = `${value.kind}:${value.severity}:${value.message}:${value.scoreCap}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function dedupeFacts(values: MatchedFact[]): MatchedFact[] {
  const seen = new Set<string>();
  const output: MatchedFact[] = [];

  for (const value of values) {
    const key = `${value.source}:${value.factType}:${value.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

function toTokenSet(input: string): Set<string> {
  const normalized = normalizeTextForSearch(input);

  if (normalized.length === 0) return new Set<string>();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const output = new Set(tokens);

  for (const token of tokens) {
    if (token.includes("-")) {
      for (const part of token.split("-")) {
        if (part) output.add(part);
      }
    }
    if (token.includes("_")) {
      for (const part of token.split("_")) {
        if (part) output.add(part);
      }
    }
  }

  return output;
}

function normalizeTextForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFramework(input: string): string {
  const lower = input.toLowerCase();
  if (lower === "next") return "nextjs";
  if (lower === "shadcn") return "shadcn-ui";
  return lower;
}

function toLanguageLabel(language: string): string {
  if (language === "typescript") return "TypeScript";
  if (language === "javascript") return "JavaScript";
  if (language === "python") return "Python";
  if (language === "go") return "Go";
  if (language === "rust") return "Rust";
  if (language === "java") return "Java";
  if (language === "php") return "PHP";
  if (language === "ruby") return "Ruby";
  return language;
}
