import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type {
  AssistantId,
  MatchedNeedDetail,
  MatchedFact,
  RecommendationCapApplied,
  RecommendationScoreComponent,
  RepoFacts,
  RepoNeed,
  RepoPrimaryFacts,
  RepoSecondaryFacts,
  SkillCategory,
  SkillCandidate,
  SkillRecommendation,
  ToolDetection
} from "../types/index.js";
import { analyzeSkill, isInstallAllowed, type SecurityPolicy } from "../security/analyzeSkill.js";
import { getNeedMatchProfile, matchNeedProfile, type NeedMatchLexicon } from "./needProfiles.js";
import {
  classifySkillCategories,
  detectDomainSignals,
  evaluateSpecializedGates
} from "./specializedGates.js";

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
}

export interface RecommendResult {
  repoNeeds: RepoNeed[];
  recommendations: SkillRecommendation[];
}

interface RecommendationContext {
  primary: RepoPrimaryFacts;
  secondary: RepoSecondaryFacts;
  missingSet: Set<string>;
  primaryLanguages: Set<string>;
  secondaryLanguages: Set<string>;
  primaryFrameworks: Map<string, MatchedFact>;
  secondaryFrameworks: Set<string>;
  primaryProjectTypes: Map<string, MatchedFact>;
  primaryToolFacts: Map<string, MatchedFact>;
  repoTokens: Set<string>;
  repoDomains: Set<string>;
  hasProviderSourcePath: boolean;
  hasSkillAuthoringPath: boolean;
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

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  crypto: ["crypto", "defi", "web3", "onchain", "airdrop", "yield", "farmdash", "perps", "trading"],
  finance: ["finance", "banking", "actuarial", "insurance", "futures", "portfolio"],
  legal: ["legal", "law", "contract"],
  medical: ["medical", "health", "clinical", "biology", "chemistry"],
  marketing: ["marketing", "brand", "newsletter", "campaign"],
  art: ["art", "algorithmic-art", "design"],
  spreadsheet: ["spreadsheet", "excel", "xlsx", "google-sheets"],
  internal_comms: ["internal-comms", "communication", "leadership-update"]
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
  const repoNeeds = inferRepoNeeds(repoFacts, context);
  const repoNeedIds = new Set(repoNeeds.map((need) => need.id));
  const eligibleAssistants = dedupeAssistants(options.eligibleAssistants ?? ALL_ASSISTANTS);
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
    const capsApplied: RecommendationCapApplied[] = [];
    const scoreBreakdown: RecommendationScoreComponent[] = [];
    const skillCategories = normalized.categories;
    const domainSignals = normalized.domainSignals;
    let score = 0;
    let sawStrongNeedMatch = false;
    let sawWeakNeedMatch = false;
    let sawNeedNegativeMatch = false;

    if (assistantMatches.length === 0 && options.allCompatible) {
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
        sawStrongNeedMatch = true;
        matchedNeeds.push(repoNeed.id);
        reasons.push(`Matched repo need: ${repoNeed.id} (${match.strength})`);
        matchedFacts.push({
          factType: "repoNeed",
          id: repoNeed.id,
          source: "repoNeeds"
        });
      }
      if (match.strength === "weak") {
        sawWeakNeedMatch = true;
        penalties.push(`Weak repo-need evidence only: ${repoNeed.id}`);
      }
      if (match.strength === "negative") {
        sawNeedNegativeMatch = true;
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
    const secondaryOnlyFrameworkMatches = [...normalized.frameworks].filter((framework) => !context.primaryFrameworks.has(framework) && context.secondaryFrameworks.has(framework));

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

    if (secondaryOnlyFrameworkMatches.length > 0) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "secondary_only_framework_penalty",
        points: -18,
        detail: `Secondary-only framework matches: ${secondaryOnlyFrameworkMatches.slice(0, 3).join(", ")}`
      });
      penalties.push(`Skill targets ${secondaryOnlyFrameworkMatches.slice(0, 3).join(", ")}, but those frameworks are only in fixture/secondary scope`);
      capsApplied.push({
        kind: "secondary_only_framework_cap",
        cap: 40,
        reason: "Framework relevance is secondary/fixture-only"
      });
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
    if (languageMatches.length > 0 && !hasDeepMatch) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "language_only_penalty",
        points: -24,
        detail: "Language-only match without project-type/tool/framework/need support"
      });
      penalties.push("Language-only match; no deeper project need match");
    }

    const missingMismatchPenalty = evaluateMissingCapabilityMismatch(context, normalized, matchedNeedDetails, penalties, scoreBreakdown);
    score += missingMismatchPenalty;

    const domainPenalty = applyDomainPenalty(context, normalized, penalties, scoreBreakdown);
    score += domainPenalty;
    if (domainPenalty < 0) {
      capsApplied.push({
        kind: "domain_mismatch_cap",
        cap: 15,
        reason: "Domain mismatch penalty applied"
      });
    }

    if (normalized.isGeneralProductivity && !hasDeepMatch) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "generic_productivity_penalty",
        points: -15,
        detail: "General productivity skill has no repo-specific evidence"
      });
      penalties.push("General productivity skill with no repo-specific evidence");
      capsApplied.push({
        kind: "general_productivity_cap",
        cap: 35,
        reason: "General productivity skill with no repo-specific evidence"
      });
    }

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

    const specializedGateResults = evaluateSpecializedGates({
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
      hasProviderSourcePath: context.hasProviderSourcePath,
      hasSkillAuthoringPath: context.hasSkillAuthoringPath
    });

    for (const gate of specializedGateResults) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: gate.kind,
        points: gate.penalty,
        detail: gate.message,
        reason: gate.message
      });
      penalties.push(gate.message);
      if (gate.scoreCap < 100) {
        capsApplied.push({
          kind: "specialized_gate_cap",
          cap: gate.scoreCap,
          reason: gate.message
        });
      }
    }

    if (sawWeakNeedMatch && !sawStrongNeedMatch) {
      capsApplied.push({
        kind: "weak_only_cap",
        cap: 45,
        reason: "Only weak repo-need matches were found"
      });
    }
    if (!sawStrongNeedMatch) {
      capsApplied.push({
        kind: "no_strong_need_cap",
        cap: 40,
        reason: "No strong repo-need match was found"
      });
    }
    if (languageMatches.length > 0 && !hasDeepMatch) {
      capsApplied.push({
        kind: "language_only_cap",
        cap: 35,
        reason: "Language-only relevance"
      });
    }
    if (sawNeedNegativeMatch && !sawStrongNeedMatch) {
      capsApplied.push({
        kind: "negative_need_cap",
        cap: 35,
        reason: "Need anti-triggers were matched without strong need evidence"
      });
    }

    const { rawScore, relevanceRaw, qualityRaw } = computeScorePartitions(scoreBreakdown);
    const normalizedRelevance = 100 * (1 - Math.exp(-(Math.max(0, relevanceRaw) / 90)));
    const baseQualityBonus = Math.min(8, qualityRaw * 0.4);
    let qualityBonus = baseQualityBonus;
    if (normalizedRelevance < 25 && qualityBonus > 0) {
      qualityBonus = 0;
    } else if (normalizedRelevance < 45 && qualityBonus > 3) {
      qualityBonus = 3;
    }

    scoreBreakdown.push({
      kind: "normalized_relevance",
      points: roundScore(normalizedRelevance),
      detail: `From relevanceRaw=${roundScore(relevanceRaw)}`
    });
    scoreBreakdown.push({
      kind: "normalized_quality_bonus",
      points: roundScore(qualityBonus),
      detail: `From qualityRaw=${roundScore(qualityRaw)}`
    });

    const effectiveCap = capsApplied.length > 0
      ? Math.min(...capsApplied.map((cap) => cap.cap))
      : null;
    let finalScore = normalizedRelevance + qualityBonus;
    if (effectiveCap !== null && finalScore > effectiveCap) {
      const beforeCap = finalScore;
      finalScore = effectiveCap;
      scoreBreakdown.push({
        kind: "score_cap_applied",
        points: roundScore(finalScore - beforeCap),
        detail: `Score capped at ${effectiveCap}`,
        reason: capsApplied.find((cap) => cap.cap === effectiveCap)?.reason
      });
    }

    const allowance = isInstallAllowed(risk, options, !!candidate.metadata.hasScripts);

    const normalizedReasons = dedupeStrings(reasons).slice(0, 8);
    const normalizedPenalties = dedupeStrings(penalties);
    const normalizedEligibility = dedupeStrings(eligibilityReasons);

    const recommendation: SkillRecommendation = {
      candidate,
      score: clampScore(finalScore),
      rawScore: roundScore(rawScore),
      relevanceRaw: roundScore(relevanceRaw),
      qualityRaw: roundScore(qualityRaw),
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
      blocked: !allowance.allowed,
      blockReasons: allowance.reasons
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

function buildRecommendationContext(repoFacts: RepoFacts): RecommendationContext {
  const primary = normalizePrimaryFacts(repoFacts);
  const secondary = normalizeSecondaryFacts(repoFacts);
  const missingSet = new Set(repoFacts.findings.map((finding) => finding.code));

  const primaryLanguages = new Set(primary.languages.map((language) => language.id.toLowerCase()));
  const secondaryLanguages = new Set(secondary.languages.map((language) => language.id.toLowerCase()));

  const primaryFrameworks = new Map<string, MatchedFact>();
  for (const framework of primary.frameworks) {
    primaryFrameworks.set(framework.id.toLowerCase(), {
      factType: "framework",
      id: framework.id,
      source: "primaryFacts",
      evidence: framework.evidence
    });
  }

  const secondaryFrameworks = new Set(secondary.frameworks.map((framework) => framework.id.toLowerCase()));

  const primaryProjectTypes = new Map<string, MatchedFact>();
  for (const projectType of primary.projectTypes) {
    primaryProjectTypes.set(projectType.id.toLowerCase(), {
      factType: "projectType",
      id: projectType.id,
      source: "primaryFacts",
      evidence: projectType.evidence
    });
  }

  const primaryToolFacts = new Map<string, MatchedFact>();
  for (const tool of [
    ...primary.buildTools,
    ...primary.testTools,
    ...primary.ci,
    ...primary.infra
  ]) {
    primaryToolFacts.set(tool.id.toLowerCase(), {
      factType: "tool",
      id: tool.id,
      source: "primaryFacts",
      evidence: tool.evidence
    });
  }
  for (const command of primary.commands) {
    const id = command.role.toLowerCase();
    if (!primaryToolFacts.has(id)) {
      primaryToolFacts.set(id, {
        factType: "command",
        id,
        source: "primaryFacts",
        evidence: command.evidence
      });
    }
    const byName = command.name.toLowerCase();
    if (!primaryToolFacts.has(byName)) {
      primaryToolFacts.set(byName, {
        factType: "command",
        id: byName,
        source: "primaryFacts",
        evidence: command.evidence
      });
    }
  }

  const repoTokens = gatherRepoTokens(repoFacts.repoRoot, primary, secondary);
  const repoDomains = detectDomains(repoTokens);
  const hasProviderSourcePath = existsInRepo(repoFacts.repoRoot, "src/providers");
  const hasSkillAuthoringPath = existsInRepo(repoFacts.repoRoot, ".claude/skills")
    || existsInRepo(repoFacts.repoRoot, "skills");

  return {
    primary,
    secondary,
    missingSet,
    primaryLanguages,
    secondaryLanguages,
    primaryFrameworks,
    secondaryFrameworks,
    primaryProjectTypes,
    primaryToolFacts,
    repoTokens,
    repoDomains,
    hasProviderSourcePath,
    hasSkillAuthoringPath
  };
}

function normalizePrimaryFacts(repoFacts: RepoFacts): RepoPrimaryFacts {
  if (repoFacts.primaryFacts) {
    return repoFacts.primaryFacts;
  }

  return {
    projectTypes: [],
    languages: repoFacts.languages.map((language) => ({ id: language, confidence: 1, evidence: [] })),
    frameworks: repoFacts.frameworks,
    packageManagers: repoFacts.packageManagers,
    buildTools: [],
    testTools: [],
    ci: [],
    infra: [],
    commands: []
  };
}

function normalizeSecondaryFacts(repoFacts: RepoFacts): RepoSecondaryFacts {
  if (repoFacts.secondaryFacts) {
    return repoFacts.secondaryFacts;
  }

  return {
    projectTypes: [],
    languages: [],
    frameworks: [],
    packageManagers: [],
    buildTools: [],
    testTools: [],
    ci: [],
    infra: [],
    commands: []
  };
}

function inferRepoNeeds(repoFacts: RepoFacts, context: RecommendationContext): RepoNeed[] {
  const needs = new Map<string, RepoNeed>();

  const addNeed = (id: string, reason: string, sourceFacts: MatchedFact[] = [], weight = 1): void => {
    const existing = needs.get(id);
    if (!existing) {
      needs.set(id, { id, weight, reason, sourceFacts: [...sourceFacts] });
      return;
    }
    existing.weight = Math.max(existing.weight, weight);
    existing.sourceFacts = dedupeFacts([...existing.sourceFacts, ...sourceFacts]);
  };

  for (const projectType of context.primary.projectTypes) {
    if (projectType.id === "cli") {
      addNeed("node_cli_development", "Primary project type is CLI", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("cli_command_design", "CLI command design is relevant", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("terminal_output_design", "CLI terminal output formatting is relevant", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
    }
    if (projectType.id === "package") {
      addNeed("npm_package_development", "Primary project type is npm package", [{ factType: "projectType", id: "package", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("release_safety", "Package release safety is relevant", [{ factType: "projectType", id: "package", source: "primaryFacts", evidence: projectType.evidence }]);
    }
    if (projectType.id === "library") addNeed("library_development", "Primary project type is library", [{ factType: "projectType", id: "library", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "web-app") addNeed("web_app_development", "Primary project type is web app", [{ factType: "projectType", id: "web-app", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "api") addNeed("api_development", "Primary project type is API", [{ factType: "projectType", id: "api", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "monorepo") addNeed("monorepo_navigation", "Primary project type is monorepo", [{ factType: "projectType", id: "monorepo", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "docs") addNeed("docs_project_support", "Primary project type is docs", [{ factType: "projectType", id: "docs", source: "primaryFacts", evidence: projectType.evidence }]);
  }

  for (const language of context.primary.languages) {
    const lower = language.id.toLowerCase();
    if (lower === "typescript") {
      addNeed("typescript_refactor_safety", "TypeScript primary language detected", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }]);
      addNeed("typescript_config_review", "TypeScript configuration is relevant", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }]);
      addNeed("javascript_node_development", "Node/TypeScript development is relevant", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }], 0.8);
    }
    if (lower === "javascript") addNeed("javascript_node_development", "JavaScript primary language detected", [{ factType: "language", id: "JavaScript", source: "primaryFacts", evidence: language.evidence }]);
    if (lower === "python") addNeed("python_development", "Python primary language detected", [{ factType: "language", id: "Python", source: "primaryFacts", evidence: language.evidence }]);
  }

  for (const tool of context.primary.buildTools) {
    const id = tool.id.toLowerCase();
    if (id === "tsup") addNeed("tsup_build_pipeline", "tsup build tool detected", [{ factType: "buildTool", id: "tsup", source: "primaryFacts", evidence: tool.evidence }]);
    if (id === "tsc") addNeed("typescript_typecheck", "tsc build tool detected", [{ factType: "buildTool", id: "tsc", source: "primaryFacts", evidence: tool.evidence }]);
  }

  for (const tool of context.primary.testTools) {
    const id = tool.id.toLowerCase();
    if (id === "vitest") {
      addNeed("vitest_testing", "vitest test tool detected", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }]);
      addNeed("test_generation", "test generation is relevant for vitest projects", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }], 0.9);
      addNeed("test_debugging", "test debugging is relevant for vitest projects", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }], 0.9);
    }
  }

  for (const tool of context.primary.ci) {
    if (tool.id.toLowerCase() === "github-actions") {
      addNeed("github_actions_ci", "GitHub Actions CI detected", [{ factType: "ci", id: "github-actions", source: "primaryFacts", evidence: tool.evidence }]);
    }
  }

  for (const command of context.primary.commands) {
    const role = command.role.toLowerCase();
    const name = command.name.toLowerCase();
    if (role === "typecheck" || name === "typecheck") {
      addNeed("typescript_typecheck", "Typecheck command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }]);
    }
    if (role === "prepack" || role === "prepublish" || name === "prepack" || name === "prepublishonly") {
      addNeed("npm_publish_workflow", "Package lifecycle publish command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }]);
      addNeed("release_safety", "Package lifecycle release command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }], 0.9);
    }
  }

  if (context.repoTokens.has("@inquirer/prompts")) {
    addNeed("interactive_cli_ux", "@inquirer/prompts dependency detected", [{ factType: "dependency", id: "@inquirer/prompts", source: "repoSignals" }]);
  }
  if (context.repoTokens.has("zod")) {
    addNeed("zod_validation", "zod dependency detected", [{ factType: "dependency", id: "zod", source: "repoSignals" }]);
    addNeed("json_schema_validation", "zod dependency indicates schema validation", [{ factType: "dependency", id: "zod", source: "repoSignals" }], 0.9);
  }
  if (context.repoTokens.has("undici")) {
    addNeed("http_api_client", "undici dependency detected", [{ factType: "dependency", id: "undici", source: "repoSignals" }]);
  }

  if (existsInRepo(repoFacts.repoRoot, "src/providers")) {
    addNeed("provider_integration", "Provider integration source path detected", [{ factType: "path", id: "src/providers", source: "repoSignals" }]);
  }
  if (existsInRepo(repoFacts.repoRoot, "src/installer")) {
    addNeed("safe_file_writes", "Installer path detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }]);
    addNeed("install_plan_review", "Installer planning path detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.9);
    addNeed("package_security_review", "Installer path suggests package safety concerns", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.7);
    addNeed("provenance_tracking", "Installer and lockfile management detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.7);
  }

  if (context.repoTokens.has("mcp") || context.repoTokens.has("modelcontextprotocol") || context.repoTokens.has("@modelcontextprotocol/sdk")) {
    addNeed("mcp_server_development", "MCP-related signal detected", [{ factType: "signal", id: "mcp", source: "repoSignals" }]);
  }

  if (context.missingSet.has("missing_claude_config")) {
    addNeed("agent_config_setup", "Claude configuration is missing", [{ factType: "finding", id: "missing_claude_config", source: "repoSignals" }], 0.9);
    addNeed("claude_project_setup", "Claude project setup is missing", [{ factType: "finding", id: "missing_claude_config", source: "repoSignals" }]);
  }
  if (context.missingSet.has("missing_copilot_instructions")) {
    addNeed("agent_config_setup", "Copilot instructions are missing", [{ factType: "finding", id: "missing_copilot_instructions", source: "repoSignals" }], 0.9);
    addNeed("copilot_instruction_setup", "Copilot instruction setup is missing", [{ factType: "finding", id: "missing_copilot_instructions", source: "repoSignals" }]);
  }

  return [...needs.values()].sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
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

  const domains = detectDomains(tokens);
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

function applyDomainPenalty(
  context: RecommendationContext,
  candidate: NormalizedCandidate,
  penalties: string[],
  scoreBreakdown: RecommendationScoreComponent[]
): number {
  if (candidate.domains.size === 0) return 0;

  const overlapping = [...candidate.domains].filter((domain) => context.repoDomains.has(domain));
  if (overlapping.length > 0) return 0;

  const label = [...candidate.domains].slice(0, 3).join("/");
  penalties.push(`Domain-specific skill: ${label}, but repo has no matching domain evidence`);
  return applyScoreComponent(0, scoreBreakdown, {
    kind: "domain_mismatch_penalty",
    points: -40,
    detail: `Domain mismatch: ${label}`
  });
}

function applyScoreComponent(
  score: number,
  scoreBreakdown: RecommendationScoreComponent[],
  component: RecommendationScoreComponent
): number {
  scoreBreakdown.push(component);
  return score + component.points;
}

function computeScorePartitions(scoreBreakdown: RecommendationScoreComponent[]): {
  rawScore: number;
  relevanceRaw: number;
  qualityRaw: number;
} {
  let rawScore = 0;
  let relevanceRaw = 0;
  let qualityRaw = 0;

  for (const component of scoreBreakdown) {
    rawScore += component.points;
    if (isQualityComponent(component.kind)) {
      qualityRaw += component.points;
    } else {
      relevanceRaw += component.points;
    }
  }

  return { rawScore, relevanceRaw, qualityRaw };
}

function isQualityComponent(kind: string): boolean {
  return kind === "assistant_tiebreak"
    || kind === "publisher_trust"
    || kind === "publisher_trust_penalty"
    || kind === "low_risk_bonus"
    || kind === "popularity_bonus";
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
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

function existsInRepo(repoRoot: string, relativePath: string): boolean {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return false;
  try {
    return existsSync(path.join(repoRoot, relativePath));
  } catch {
    return false;
  }
}

function gatherRepoTokens(repoRoot: string, primary: RepoPrimaryFacts, secondary: RepoSecondaryFacts): Set<string> {
  const tokens = new Set<string>();

  for (const language of primary.languages) {
    tokens.add(language.id.toLowerCase());
  }
  for (const framework of primary.frameworks) {
    tokens.add(framework.id.toLowerCase());
  }
  for (const tool of [...primary.buildTools, ...primary.testTools, ...primary.ci, ...primary.infra]) {
    tokens.add(tool.id.toLowerCase());
  }
  for (const command of primary.commands) {
    tokens.add(command.name.toLowerCase());
    tokens.add(command.role.toLowerCase());
  }
  for (const packageManager of primary.packageManagers) {
    tokens.add(packageManager.id.toLowerCase());
  }

  for (const framework of secondary.frameworks) {
    tokens.add(`secondary:${framework.id.toLowerCase()}`);
  }

  addTokensFromPackageJson(repoRoot, tokens);
  addTokensFromReadme(repoRoot, tokens);
  if (existsInRepo(repoRoot, "src/providers")) {
    tokens.add("src/providers");
    tokens.add("provider-source-path");
  }
  if (existsInRepo(repoRoot, "src/providers/anthropic.ts")) {
    tokens.add("src/providers/anthropic.ts");
    tokens.add("anthropic-sdk");
  }
  if (existsInRepo(repoRoot, ".claude/skills")) {
    tokens.add(".claude/skills");
    tokens.add("skill-authoring-path");
  }
  if (existsInRepo(repoRoot, "skills")) {
    tokens.add("skills");
    tokens.add("skill-authoring-path");
  }
  return tokens;
}

function addTokensFromPackageJson(repoRoot: string, tokens: Set<string>): void {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return;
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!existsSync(packageJsonPath)) return;

  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      name?: string;
      description?: string;
      keywords?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const token of toTokenSet(parsed.name ?? "")) tokens.add(token);
    for (const token of toTokenSet(parsed.description ?? "")) tokens.add(token);
    for (const keyword of parsed.keywords ?? []) {
      for (const token of toTokenSet(keyword)) tokens.add(token);
    }
    for (const dep of Object.keys(parsed.dependencies ?? {})) {
      for (const token of toTokenSet(dep)) tokens.add(token);
      tokens.add(dep.toLowerCase());
    }
    for (const dep of Object.keys(parsed.devDependencies ?? {})) {
      for (const token of toTokenSet(dep)) tokens.add(token);
      tokens.add(dep.toLowerCase());
    }
  } catch {
    // best-effort parsing only
  }
}

function addTokensFromReadme(repoRoot: string, tokens: Set<string>): void {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return;
  const readmeCandidates = ["README.md", "README", "readme.md", "readme"];

  for (const candidate of readmeCandidates) {
    const filePath = path.join(repoRoot, candidate);
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf8");
      for (const token of toTokenSet(raw.slice(0, 3000))) {
        tokens.add(token);
      }
      break;
    } catch {
      // best-effort parsing only
    }
  }
}

function detectDomains(tokens: Set<string>): Set<string> {
  const domains = new Set<string>();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((keyword) => tokens.has(keyword))) {
      domains.add(domain);
    }
  }

  return domains;
}
