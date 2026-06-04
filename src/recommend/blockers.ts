import type {
  MatchedNeedDetail,
  RecommendationBlocker,
  RecommendationBlockerKind,
  RecommendationBlockerSeverity,
  SkillCategory
} from "../types/index.js";
import { containsAllTokens, matchesTerm, type TextMatchTerm } from "./textMatch.js";

export interface RecommendationBlockerInput {
  candidateText: string;
  candidateTokens: Set<string>;
  candidateNameText: string;
  candidateNameTokens: Set<string>;
  candidateTagText: string;
  candidateTagTokens: Set<string>;

  skillCategories: SkillCategory[];
  domainSignals: string[];

  repoNeedIds: Set<string>;
  repoTokens: Set<string>;
  repoDomains: Set<string>;

  primaryFrameworks: Set<string>;
  secondaryFrameworks: Set<string>;

  matchedNeeds: string[];
  matchedNeedDetails: MatchedNeedDetail[];
  hasDeepMatch: boolean;
  languageMatches: string[];

  hasProviderSourcePath: boolean;
  hasSkillAuthoringPath: boolean;
}

type MatchTerm = string | TextMatchTerm;

const TOKEN_MCP: TextMatchTerm = { value: "mcp", mode: "token" };

const FRAMEWORK_TOPICS: Array<{ framework: string; terms: MatchTerm[] }> = [
  { framework: "react", terms: ["react", "react component", "jsx", "tsx component", "react 19"] },
  { framework: "nextjs", terms: ["nextjs", "next js", "app router", "next auth"] },
  { framework: "tailwind", terms: ["tailwind", "tailwindcss", "shadcn", "utility classes", "ui design"] },
  { framework: "vue", terms: ["vue", "vue component", "vuex"] },
  { framework: "nuxt", terms: ["nuxt", "nuxt3", "nuxt 3"] },
  { framework: "svelte", terms: ["svelte", "svelte component", "sveltekit"] },
  { framework: "sveltekit", terms: ["sveltekit", "svelte kit"] },
  { framework: "angular", terms: ["angular", "rxjs", "ngrx"] }
];

const DOMAIN_BLOCKER_PRIORITIES: Array<{ domain: string; categories: SkillCategory[]; message: string }> = [
  { domain: "crypto", categories: ["crypto"], message: "Domain-specific crypto skill, but repo has no matching domain evidence" },
  { domain: "finance", categories: ["finance"], message: "Domain-specific finance skill, but repo has no matching domain evidence" },
  { domain: "legal", categories: [], message: "Domain-specific legal skill, but repo has no matching domain evidence" },
  { domain: "medical", categories: [], message: "Domain-specific medical skill, but repo has no matching domain evidence" },
  { domain: "marketing", categories: [], message: "Domain-specific marketing skill, but repo has no matching domain evidence" },
  { domain: "art", categories: ["art"], message: "Domain-specific art skill, but repo has no matching domain evidence" },
  { domain: "spreadsheet", categories: ["spreadsheet"], message: "Domain-specific spreadsheet skill, but repo has no matching domain evidence" },
  { domain: "internal_comms", categories: [], message: "Domain-specific internal communications skill, but repo has no matching domain evidence" }
];

const PROMPTING_TERMS: MatchTerm[] = ["prompt optimization", "prompt engineering", "prompt tuning", "crisp framework", "ai prompt", "llm prompt"];
const MCP_TERMS: MatchTerm[] = [TOKEN_MCP, "model context protocol", "modelcontextprotocol", "fastmcp", "mcp server", "@modelcontextprotocol/sdk"];
const SKILL_AUTHORING_TERMS: MatchTerm[] = ["create skills", "skill creator", "skill performance", "benchmark skill", "skill evals", "skill eval", "skill evaluation"];
const CLAUDE_API_TERMS: MatchTerm[] = ["claude api", "anthropic sdk", "@anthropic-ai/sdk", "prompt caching", "opus", "sonnet", "haiku"];
const AGENT_SETUP_TERMS: MatchTerm[] = ["claude.md", "copilot instructions", "codex", "agent config", "repo instructions", "project skills", "project memory"];
const DOCS_TERMS: MatchTerm[] = ["docs", "documentation", "readme", "vitepress", "docusaurus", "markdown"];

const GENERIC_PRODUCTIVITY_CATEGORIES = new Set<SkillCategory>([
  "general-productivity",
  "writing",
  "spreadsheet",
  "art",
  "finance",
  "design"
]);

export function evaluateRecommendationBlockers(input: RecommendationBlockerInput): RecommendationBlocker[] {
  const blockers: RecommendationBlocker[] = [];
  const strongNeedMatch = input.matchedNeedDetails.some((detail) => detail.strength === "exact" || detail.strength === "strong");
  const weakNeedMatch = input.matchedNeedDetails.some((detail) => detail.strength === "weak");
  const negativeNeedMatch = input.matchedNeedDetails.some((detail) => detail.strength === "negative");
  const hasDomainMatch = input.domainSignals.some((domain) => input.repoDomains.has(domain));
  const setupNeedPresent = input.repoNeedIds.has("agent_config_setup")
    || input.repoNeedIds.has("claude_project_setup")
    || input.repoNeedIds.has("copilot_instruction_setup");

  const domainMismatch = detectDomainMismatch(input);
  if (domainMismatch) {
    blockers.push(domainMismatch);
  }

  const frameworkMismatch = detectFrameworkMismatch(input);
  if (frameworkMismatch) {
    blockers.push(frameworkMismatch);
  }

  if (isGenericProductivityMismatch(input, strongNeedMatch, hasDomainMatch)) {
    blockers.push(createBlocker(
      "generic_productivity_mismatch",
      "hard",
      "Generic productivity skill, but repo has no strong repo-specific evidence",
      -35,
      25
    ));
  }

  if (isPromptingCandidate(input) && !hasPromptEvidence(input)) {
    blockers.push(createBlocker(
      "prompting_mismatch",
      "hard",
      "Prompt optimization skill, but repo has no prompt-engineering evidence",
      -30,
      30
    ));
  }

  if (isMcpCandidate(input) && !hasMcpEvidence(input)) {
    blockers.push(createBlocker(
      "mcp_mismatch",
      "hard",
      "MCP-specific skill, but repo has no MCP evidence",
      -30,
      35
    ));
  }

  const skillAuthoringBlocker = evaluateSkillAuthoringMismatch(input);
  if (skillAuthoringBlocker) {
    blockers.push(skillAuthoringBlocker);
  }

  const claudeApiBlocker = evaluateClaudeApiMismatch(input);
  if (claudeApiBlocker) {
    blockers.push(claudeApiBlocker);
  }

  if (isAssistantSetupCandidate(input) && !setupNeedPresent) {
    blockers.push(createBlocker(
      "assistant_setup_mismatch",
      "soft",
      "Assistant setup skill, but repo has no assistant setup need",
      -15,
      65
    ));
  }

  if (weakNeedMatch && !strongNeedMatch) {
    blockers.push(createBlocker(
      "weak_only_match",
      "soft",
      "Only weak repo-need matches were found",
      -12,
      45
    ));
  }

  if (!strongNeedMatch) {
    blockers.push(createBlocker(
      "no_strong_need_match",
      "soft",
      "No strong repo-need match was found",
      -10,
      40
    ));
  }

  if (input.languageMatches.length > 0 && !input.hasDeepMatch) {
    blockers.push(createBlocker(
      "language_only_match",
      "soft",
      "Language-only match without deeper repo evidence",
      -24,
      35,
      input.languageMatches
    ));
  }

  if (negativeNeedMatch && !strongNeedMatch) {
    const negativeNeedIds = input.matchedNeedDetails
      .filter((detail) => detail.strength === "negative")
      .map((detail) => detail.id);
    blockers.push(createBlocker(
      "negative_need_match",
      "hard",
      "Need anti-triggers were matched without strong need evidence",
      -18,
      35,
      negativeNeedIds
    ));
  }

  return dedupeBlockers(blockers);
}

function detectDomainMismatch(input: RecommendationBlockerInput): RecommendationBlocker | null {
  for (const domainEntry of DOMAIN_BLOCKER_PRIORITIES) {
    const inSignals = input.domainSignals.includes(domainEntry.domain);
    const inCategories = domainEntry.categories.some((category) => input.skillCategories.includes(category));
    if (!inSignals && !inCategories) {
      continue;
    }
    if (input.repoDomains.has(domainEntry.domain)) {
      return null;
    }
    return createBlocker(
      "domain_mismatch",
      "hard",
      domainEntry.message,
      -50,
      15,
      [domainEntry.domain]
    );
  }
  return null;
}

function detectFrameworkMismatch(input: RecommendationBlockerInput): RecommendationBlocker | null {
  for (const topic of FRAMEWORK_TOPICS) {
    const topicality = evaluatePrimaryTopic(input, topic.terms);
    if (!topicality.primary) {
      continue;
    }

    if (input.primaryFrameworks.has(topic.framework)) {
      return null;
    }

    if (input.secondaryFrameworks.has(topic.framework)) {
      return createBlocker(
        "secondary_scope_only",
        "hard",
        `${displayFramework(topic.framework)} appears only in secondary/fixture scope`,
        -25,
        40,
        [topic.framework]
      );
    }

    return createBlocker(
      "framework_mismatch",
      "hard",
      `${displayFramework(topic.framework)}-specific skill, but repo has no primary ${displayFramework(topic.framework)} evidence`,
      -30,
      35,
      [topic.framework]
    );
  }
  return null;
}

function isGenericProductivityMismatch(
  input: RecommendationBlockerInput,
  strongNeedMatch: boolean,
  hasDomainMatch: boolean
): boolean {
  const hasGenericCategory = input.skillCategories.some((category) => GENERIC_PRODUCTIVITY_CATEGORIES.has(category));
  if (!hasGenericCategory) {
    return false;
  }
  const docsRelated = hasAnyTerm(input.candidateText, input.candidateTokens, DOCS_TERMS);
  if (docsRelated && input.repoNeedIds.has("docs_project_support")) {
    return false;
  }
  return !strongNeedMatch && !hasDomainMatch;
}

function isPromptingCandidate(input: RecommendationBlockerInput): boolean {
  return input.skillCategories.includes("prompting")
    || hasAnyTerm(input.candidateText, input.candidateTokens, PROMPTING_TERMS);
}

function hasPromptEvidence(input: RecommendationBlockerInput): boolean {
  return input.repoNeedIds.has("prompt_engineering")
    || input.repoTokens.has("prompt")
    || input.repoTokens.has("prompts")
    || containsAllTokens(input.repoTokens, ["system", "prompt"])
    || containsAllTokens(input.repoTokens, ["prompt", "template"])
    || containsAllTokens(input.repoTokens, ["system-prompt"]);
}

function isMcpCandidate(input: RecommendationBlockerInput): boolean {
  return input.skillCategories.includes("mcp")
    || hasAnyTerm(input.candidateText, input.candidateTokens, MCP_TERMS);
}

function hasMcpEvidence(input: RecommendationBlockerInput): boolean {
  return input.repoNeedIds.has("mcp_server_development")
    || input.repoTokens.has("mcp")
    || input.repoTokens.has("modelcontextprotocol")
    || input.repoTokens.has("@modelcontextprotocol/sdk");
}

function evaluateSkillAuthoringMismatch(input: RecommendationBlockerInput): RecommendationBlocker | null {
  const isSkillAuthoring = input.skillCategories.includes("skill-development")
    || hasAnyTerm(input.candidateText, input.candidateTokens, SKILL_AUTHORING_TERMS);
  if (!isSkillAuthoring) {
    return null;
  }
  if (input.hasSkillAuthoringPath) {
    return null;
  }
  if (input.hasProviderSourcePath) {
    return createBlocker(
      "skill_authoring_mismatch",
      "soft",
      "Skill-authoring skill has only partial repo evidence",
      -10,
      60
    );
  }
  return createBlocker(
    "skill_authoring_mismatch",
    "hard",
    "Skill-authoring/evaluation skill, but repo is not a skill-authoring repo",
    -20,
    45
  );
}

function evaluateClaudeApiMismatch(input: RecommendationBlockerInput): RecommendationBlocker | null {
  const isClaudeApi = hasAnyTerm(input.candidateText, input.candidateTokens, CLAUDE_API_TERMS);
  if (!isClaudeApi) {
    return null;
  }

  const hasProviderEvidence = input.repoTokens.has("@anthropic-ai/sdk")
    || input.repoTokens.has("anthropic")
    || input.repoNeedIds.has("provider_integration")
    || input.repoNeedIds.has("http_api_client")
    || input.repoTokens.has("provider")
    || input.repoTokens.has("api");
  const hasSdkEvidence = input.repoTokens.has("@anthropic-ai/sdk")
    || input.repoTokens.has("anthropic-sdk")
    || containsAllTokens(input.repoTokens, ["src", "providers", "anthropic"]);

  if (!hasProviderEvidence) {
    return createBlocker(
      "claude_api_mismatch",
      "hard",
      "Claude API skill, but repo has no Anthropic/API evidence",
      -25,
      40
    );
  }

  if (!hasSdkEvidence) {
    return createBlocker(
      "claude_api_mismatch",
      "soft",
      "Claude API skill has partial provider relevance, but no SDK/import evidence was detected",
      -10,
      60
    );
  }

  return null;
}

function isAssistantSetupCandidate(input: RecommendationBlockerInput): boolean {
  return input.skillCategories.includes("agent-setup")
    || hasAnyTerm(input.candidateText, input.candidateTokens, AGENT_SETUP_TERMS);
}

function createBlocker(
  kind: RecommendationBlockerKind,
  severity: RecommendationBlockerSeverity,
  message: string,
  penalty: number,
  scoreCap: number,
  evidence: string[] = []
): RecommendationBlocker {
  return {
    kind,
    severity,
    message,
    penalty,
    scoreCap,
    evidence: evidence.length > 0 ? evidence : undefined
  };
}

function dedupeBlockers(blockers: RecommendationBlocker[]): RecommendationBlocker[] {
  const seen = new Set<string>();
  const output: RecommendationBlocker[] = [];

  for (const blocker of blockers) {
    const key = `${blocker.kind}:${blocker.severity}:${blocker.message}:${blocker.scoreCap}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(blocker);
  }

  return output;
}

function evaluatePrimaryTopic(input: RecommendationBlockerInput, terms: MatchTerm[]): { mentioned: boolean; primary: boolean } {
  const inName = hasAnyTerm(input.candidateNameText, input.candidateNameTokens, terms);
  const inTags = hasAnyTerm(input.candidateTagText, input.candidateTagTokens, terms);
  const bodyMatches = countMatchedTerms(input.candidateText, input.candidateTokens, terms);
  const mentioned = inName || inTags || bodyMatches > 0;
  const weight = bodyMatches + (inName ? 2 : 0) + (inTags ? 2 : 0);
  const primary = weight >= 3 || bodyMatches >= 2 || ((inName || inTags) && bodyMatches >= 1);
  return { mentioned, primary };
}

function hasAnyTerm(text: string, tokens: Set<string>, terms: MatchTerm[]): boolean {
  return terms.some((term) => matchesTerm(text, tokens, term));
}

function countMatchedTerms(text: string, tokens: Set<string>, terms: MatchTerm[]): number {
  let count = 0;
  for (const term of terms) {
    if (matchesTerm(text, tokens, term)) {
      count += 1;
    }
  }
  return count;
}

function displayFramework(framework: string): string {
  if (framework === "nextjs") return "Next.js";
  if (framework === "tailwind") return "Tailwind";
  if (framework === "vue") return "Vue";
  if (framework === "nuxt") return "Nuxt";
  if (framework === "svelte") return "Svelte";
  if (framework === "sveltekit") return "SvelteKit";
  if (framework === "angular") return "Angular";
  return "React";
}
