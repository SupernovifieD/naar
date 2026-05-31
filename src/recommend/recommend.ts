import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type {
  AssistantId,
  CommandFact,
  MatchedFact,
  RecommendationScoreComponent,
  RepoFacts,
  RepoNeed,
  RepoPrimaryFacts,
  RepoSecondaryFacts,
  SkillCandidate,
  SkillRecommendation,
  ToolDetection
} from "../types/index.js";
import { analyzeSkill, isInstallAllowed, type SecurityPolicy } from "../security/analyzeSkill.js";

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
}

interface NormalizedCandidate {
  tokens: Set<string>;
  assistants: Set<AssistantId>;
  frameworks: Set<string>;
  languages: Set<string>;
  domains: Set<string>;
  hasAssistantKeyword: boolean;
  isSetupSkill: boolean;
  isGeneralProductivity: boolean;
}

type NeedDefinition = {
  id: string;
  keywords: string[];
};

const NEED_DEFINITIONS: NeedDefinition[] = [
  { id: "node_cli_development", keywords: ["cli", "terminal", "command"] },
  { id: "npm_package_development", keywords: ["npm", "package", "publish"] },
  { id: "library_development", keywords: ["library", "module", "sdk"] },
  { id: "web_app_development", keywords: ["web", "frontend", "react", "nextjs", "tailwind"] },
  { id: "api_development", keywords: ["api", "http", "server", "backend", "fastapi", "flask"] },
  { id: "monorepo_navigation", keywords: ["monorepo", "workspace", "turborepo"] },
  { id: "docs_project_support", keywords: ["docs", "documentation", "readme"] },
  { id: "typescript_refactor_safety", keywords: ["typescript", "refactor", "type-safety", "typecheck"] },
  { id: "typescript_config_review", keywords: ["tsconfig", "typescript", "compiler"] },
  { id: "javascript_node_development", keywords: ["javascript", "node", "npm"] },
  { id: "python_development", keywords: ["python", "pytest", "fastapi", "django", "flask"] },
  { id: "tsup_build_pipeline", keywords: ["tsup", "build", "bundle"] },
  { id: "typescript_typecheck", keywords: ["tsc", "typecheck", "typescript"] },
  { id: "vitest_testing", keywords: ["vitest", "testing", "unit-test", "test"] },
  { id: "test_generation", keywords: ["test", "testing", "qa", "coverage"] },
  { id: "test_debugging", keywords: ["debug", "failing-tests", "test"] },
  { id: "github_actions_ci", keywords: ["github-actions", "ci", "workflow"] },
  { id: "npm_publish_workflow", keywords: ["publish", "prepack", "prepublish", "release"] },
  { id: "release_safety", keywords: ["release", "publish", "versioning"] },
  { id: "cli_command_design", keywords: ["cli", "command", "ux"] },
  { id: "interactive_cli_ux", keywords: ["interactive", "prompt", "terminal", "inquirer"] },
  { id: "terminal_output_design", keywords: ["terminal", "output", "console", "cli"] },
  { id: "safe_file_writes", keywords: ["safe-write", "install", "file", "conflict", "atomic"] },
  { id: "install_plan_review", keywords: ["install-plan", "plan", "installer", "review"] },
  { id: "package_security_review", keywords: ["security", "risk", "policy", "review"] },
  { id: "provenance_tracking", keywords: ["provenance", "pinned", "version", "lockfile"] },
  { id: "http_api_client", keywords: ["http", "api", "client", "undici", "fetch"] },
  { id: "provider_integration", keywords: ["provider", "integration", "connector", "orchestrator"] },
  { id: "json_schema_validation", keywords: ["json", "schema", "validation"] },
  { id: "zod_validation", keywords: ["zod", "validation", "schema"] },
  { id: "agent_config_setup", keywords: ["agent", "config", "setup", "instructions"] },
  { id: "claude_project_setup", keywords: ["claude-code", "claude-md", "claude-config", "project-skill", "project-skill-setup", "claude-project-setup"] },
  { id: "copilot_instruction_setup", keywords: ["copilot-instructions", "repo-instructions", "copilot-config", "copilot-setup", "copilot-repo-instructions"] },
  { id: "codex_project_skills", keywords: ["codex", "agents", "skills", "setup"] },
  { id: "mcp_server_development", keywords: ["mcp", "modelcontextprotocol", "server", "protocol"] }
];

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
    const scoreBreakdown: RecommendationScoreComponent[] = [];
    let score = 0;

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

    const needMatches = matchNeeds(normalized.tokens, repoNeeds);
    let needPoints = 0;
    for (const needId of needMatches) {
      matchedNeeds.push(needId);
      const limitRemaining = 60 - needPoints;
      if (limitRemaining <= 0) continue;
      const points = Math.min(30, limitRemaining);
      needPoints += points;
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "repo_need_match",
        points,
        detail: needId
      });
      reasons.push(`Matched repo need: ${needId}`);
      matchedFacts.push({
        factType: "repoNeed",
        id: needId,
        source: "repoNeeds"
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

    const hasDeepMatch = needMatches.length > 0 || projectTypeMatches.length > 0 || frameworkMatches.length > 0 || toolMatches.length > 0;
    if (languageMatches.length > 0 && !hasDeepMatch) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "language_only_penalty",
        points: -24,
        detail: "Language-only match without project-type/tool/framework/need support"
      });
      penalties.push("Language-only match; no deeper project need match");
    }

    const missingMismatchPenalty = evaluateMissingCapabilityMismatch(context, normalized, needMatches, penalties, scoreBreakdown);
    score += missingMismatchPenalty;

    const domainPenalty = applyDomainPenalty(context, normalized, penalties, scoreBreakdown);
    score += domainPenalty;

    if (normalized.isGeneralProductivity && !hasDeepMatch) {
      score = applyScoreComponent(score, scoreBreakdown, {
        kind: "generic_productivity_penalty",
        points: -15,
        detail: "General productivity skill has no repo-specific evidence"
      });
      penalties.push("General productivity skill with no repo-specific evidence");
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

    const allowance = isInstallAllowed(risk, options, !!candidate.metadata.hasScripts);

    const normalizedReasons = dedupeStrings(reasons).slice(0, 8);
    const normalizedPenalties = dedupeStrings(penalties);
    const normalizedEligibility = dedupeStrings(eligibilityReasons);

    const recommendation: SkillRecommendation = {
      candidate,
      score: clampScore(score),
      reasons: normalizedReasons,
      matchedNeeds: dedupeStrings(matchedNeeds),
      matchedFacts: dedupeFacts(matchedFacts),
      eligibilityReasons: normalizedEligibility,
      penalties: normalizedPenalties,
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
    repoDomains
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
  const textParts = [
    candidate.name,
    candidate.canonicalSkillId,
    candidate.providerSkillId,
    candidate.summary,
    candidate.metadata.description ?? "",
    ...candidate.tags,
    ...(candidate.compatibility.frameworks ?? []),
    ...(candidate.compatibility.languages ?? []),
    ...candidate.compatibility.assistants
  ];

  const tokens = toTokenSet(textParts.join(" "));
  const assistants = new Set<AssistantId>(candidate.compatibility.assistants);
  const frameworks = new Set<string>((candidate.compatibility.frameworks ?? []).map((item) => normalizeFramework(item)));
  const languages = new Set<string>((candidate.compatibility.languages ?? []).map((item) => item.toLowerCase()));

  for (const framework of FRAMEWORK_IDS) {
    if (tokens.has(framework)) frameworks.add(framework);
  }
  for (const language of ["typescript", "javascript", "python", "go", "rust", "java", "php", "ruby"]) {
    if (tokens.has(language)) languages.add(language);
  }

  const domains = detectDomains(tokens);
  const hasAssistantKeyword = ["claude", "copilot", "cursor", "codex", "agent", "assistant"].some((token) => tokens.has(token));
  const isSetupSkill = [...SETUP_KEYWORDS].some((token) => tokens.has(token));
  const isGeneralProductivity = [...PRODUCTIVITY_KEYWORDS].some((token) => tokens.has(token));

  return {
    tokens,
    assistants,
    frameworks,
    languages,
    domains,
    hasAssistantKeyword,
    isSetupSkill,
    isGeneralProductivity
  };
}

function matchNeeds(tokens: Set<string>, repoNeeds: RepoNeed[]): string[] {
  const matches: string[] = [];

  for (const need of repoNeeds) {
    const definition = NEED_DEFINITIONS.find((item) => item.id === need.id);
    if (!definition) continue;
    if (definition.keywords.some((keyword) => tokens.has(keyword))) {
      matches.push(need.id);
    }
  }

  return matches;
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
  needMatches: string[],
  penalties: string[],
  scoreBreakdown: RecommendationScoreComponent[]
): number {
  const matchedNeedSet = new Set(needMatches);
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
  const normalized = input
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .trim();

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
