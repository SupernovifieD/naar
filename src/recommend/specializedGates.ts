import type { SkillCategory } from "../types/index.js";

export type SpecializedGateResult = {
  kind: string;
  penalty: number;
  scoreCap: number;
  message: string;
};

export type SpecializedGateContext = {
  candidateText: string;
  candidateTokens: Set<string>;
  skillCategories: SkillCategory[];
  domainSignals: string[];
  repoNeedIds: Set<string>;
  repoTokens: Set<string>;
  repoDomains: Set<string>;
  primaryFrameworks: Set<string>;
  secondaryFrameworks: Set<string>;
  hasProviderSourcePath: boolean;
  hasSkillAuthoringPath: boolean;
};

const MCP_TERMS = ["mcp", "model context protocol", "modelcontextprotocol", "fastmcp", "mcp server", "@modelcontextprotocol/sdk"];
const REACT_TERMS = ["react", "jsx", "tsx component", "react 19"];
const TAILWIND_TERMS = ["tailwind", "shadcn", "css utility"];
const CLAUDE_API_TERMS = ["claude api", "anthropic sdk", "@anthropic-ai/sdk", "prompt caching", "opus", "sonnet", "haiku"];
const CRYPTO_TERMS = ["crypto", "defi", "web3", "onchain", "trading", "futures", "yield", "wallet", "swap", "hyperliquid", "farmdash"];
const PROMPTING_TERMS = ["prompt optimization", "prompt engineering", "crisp framework", "ai prompt"];
const SKILL_CREATOR_TERMS = ["create skills", "skill creator", "skill performance", "benchmark skill", "skill evals", "skill eval", "skill evaluation"];

export function evaluateSpecializedGates(context: SpecializedGateContext): SpecializedGateResult[] {
  const results: SpecializedGateResult[] = [];
  const repoNeedIds = context.repoNeedIds;
  const repoTokens = context.repoTokens;
  const repoHasAny = (...terms: string[]): boolean => terms.some((term) => termMatch(term, repoTokens, context.candidateText));

  if (hasAnyTrigger(context, MCP_TERMS)) {
    const hasMcpEvidence = repoNeedIds.has("mcp_server_development")
      || repoTokens.has("mcp")
      || repoTokens.has("modelcontextprotocol")
      || repoTokens.has("@modelcontextprotocol/sdk");
    if (!hasMcpEvidence) {
      results.push({
        kind: "mcp_gate",
        penalty: -30,
        scoreCap: 35,
        message: "MCP-specific skill, but repo has no MCP evidence"
      });
    }
  }

  if (hasAnyTrigger(context, REACT_TERMS)) {
    const hasPrimaryReact = context.primaryFrameworks.has("react");
    const secondaryReactOnly = !hasPrimaryReact && context.secondaryFrameworks.has("react");
    if (secondaryReactOnly) {
      results.push({
        kind: "react_secondary_only_gate",
        penalty: -25,
        scoreCap: 45,
        message: "React appears only in secondary/fixture scope"
      });
    } else if (!hasPrimaryReact) {
      results.push({
        kind: "react_missing_primary_gate",
        penalty: -25,
        scoreCap: 45,
        message: "React-specific skill, but repo has no primary React evidence"
      });
    }
  }

  if (hasAnyTrigger(context, TAILWIND_TERMS)) {
    const hasPrimaryTailwind = context.primaryFrameworks.has("tailwind");
    const secondaryTailwindOnly = !hasPrimaryTailwind && context.secondaryFrameworks.has("tailwind");
    if (secondaryTailwindOnly) {
      results.push({
        kind: "tailwind_secondary_only_gate",
        penalty: -25,
        scoreCap: 45,
        message: "Tailwind appears only in secondary/fixture scope"
      });
    } else if (!hasPrimaryTailwind) {
      results.push({
        kind: "tailwind_missing_primary_gate",
        penalty: -25,
        scoreCap: 45,
        message: "Tailwind-specific skill, but repo has no primary Tailwind evidence"
      });
    }
  }

  if (hasAnyTrigger(context, CLAUDE_API_TERMS)) {
    const hasAnthropicEvidence = repoTokens.has("@anthropic-ai/sdk")
      || repoTokens.has("anthropic")
      || repoNeedIds.has("provider_integration");
    const hasSdkOrImportEvidence = repoTokens.has("@anthropic-ai/sdk")
      || repoTokens.has("src/providers/anthropic.ts")
      || repoTokens.has("anthropic-sdk");
    if (!hasAnthropicEvidence) {
      results.push({
        kind: "claude_api_missing_evidence_gate",
        penalty: -25,
        scoreCap: 45,
        message: "Claude API skill, but repo has no Anthropic/Claude evidence"
      });
    } else if (!hasSdkOrImportEvidence) {
      results.push({
        kind: "claude_api_partial_evidence_gate",
        penalty: -10,
        scoreCap: 60,
        message: "Claude API skill has partial provider relevance, but no SDK/import evidence was detected"
      });
    }
  }

  if (hasAnyTrigger(context, CRYPTO_TERMS) || context.skillCategories.includes("crypto")) {
    const hasDomainEvidence = context.domainSignals.some((signal) => context.repoDomains.has(signal))
      || [...context.repoDomains].some((domain) => domain === "crypto" || domain === "finance");
    if (!hasDomainEvidence) {
      results.push({
        kind: "crypto_domain_gate",
        penalty: -50,
        scoreCap: 15,
        message: "Domain-specific crypto/DeFi/trading skill, but repo has no matching domain evidence"
      });
    }
  }

  if (hasAnyTrigger(context, PROMPTING_TERMS) || context.skillCategories.includes("prompting")) {
    const hasPromptEvidence = repoNeedIds.has("prompt_engineering")
      || repoTokens.has("prompt-template")
      || repoTokens.has("prompt engineering")
      || repoTokens.has("system prompt");
    if (!hasPromptEvidence) {
      results.push({
        kind: "prompt_optimization_gate",
        penalty: -30,
        scoreCap: 35,
        message: "Prompt optimization skill, but repo has no prompt-engineering evidence"
      });
    }
  }

  if (hasAnyTrigger(context, SKILL_CREATOR_TERMS) || context.skillCategories.includes("skill-development")) {
    const hasSkillAuthoringEvidence = context.hasSkillAuthoringPath;
    if (!hasSkillAuthoringEvidence) {
      const partialCatalogEvidence = repoNeedIds.has("provider_integration") || context.hasProviderSourcePath;
      results.push({
        kind: "skill_creator_gate",
        penalty: partialCatalogEvidence ? -10 : -20,
        scoreCap: 45,
        message: "Skill-creation/eval skill does not match software testing needs"
      });
    }
  }

  return results;
}

export function classifySkillCategories(candidateText: string, tokens: Set<string>): SkillCategory[] {
  const categories = new Set<SkillCategory>();
  const add = (category: SkillCategory): void => {
    categories.add(category);
  };

  if (hasAnyTerm(tokens, candidateText, ["vitest", "unit test", "jest", "playwright", "test suite"])) add("testing");
  if (hasAnyTerm(tokens, candidateText, ["debug tests", "flaky tests", "test failures", "debugging"])) add("debugging");
  if (hasAnyTerm(tokens, candidateText, ["refactor", "refactoring", "type safety", "strict types"])) add("refactoring");
  if (hasAnyTerm(tokens, candidateText, ["tsconfig", "config", "configuration", "setup"])) add("config");
  if (hasAnyTerm(tokens, candidateText, ["github actions", "ci", "workflow"])) add("ci");
  if (hasAnyTerm(tokens, candidateText, ["release", "publish", "prepublish", "prepack"])) add("release");
  if (hasAnyTerm(tokens, candidateText, ["cli", "command-line", "terminal", "commander", "yargs"])) add("cli");
  if (hasAnyTerm(tokens, candidateText, ["api", "http client", "sdk", "provider", "integration"])) add("api");
  if (hasAnyTerm(tokens, candidateText, ["security", "risk", "policy", "safe write"])) add("security");
  if (hasAnyTerm(tokens, candidateText, ["claude.md", "copilot instructions", "agent config", "repo instructions"])) add("agent-setup");
  if (hasAnyTerm(tokens, candidateText, MCP_TERMS)) add("mcp");
  if (hasAnyTerm(tokens, candidateText, PROMPTING_TERMS)) add("prompting");
  if (hasAnyTerm(tokens, candidateText, SKILL_CREATOR_TERMS)) add("skill-development");
  if (hasAnyTerm(tokens, candidateText, ["internal-comms", "productivity", "communication", "presentation"])) add("general-productivity");
  if (hasAnyTerm(tokens, candidateText, ["writing", "documentation style", "editorial"])) add("writing");
  if (hasAnyTerm(tokens, candidateText, ["design", "frontend design", "ui design"])) add("design");
  if (hasAnyTerm(tokens, candidateText, ["finance", "banking", "portfolio", "insurance"])) add("finance");
  if (hasAnyTerm(tokens, candidateText, CRYPTO_TERMS)) add("crypto");
  if (hasAnyTerm(tokens, candidateText, ["algorithmic art", "creative coding", "art"])) add("art");
  if (hasAnyTerm(tokens, candidateText, ["spreadsheet", "excel", "xlsx", "google sheets"])) add("spreadsheet");

  if (categories.size === 0) add("unknown");
  return [...categories];
}

export function detectDomainSignals(candidateText: string, tokens: Set<string>): string[] {
  const signals = new Set<string>();
  if (hasAnyTerm(tokens, candidateText, CRYPTO_TERMS)) signals.add("crypto");
  if (hasAnyTerm(tokens, candidateText, ["finance", "portfolio", "banking", "futures"])) signals.add("finance");
  if (hasAnyTerm(tokens, candidateText, ["legal", "law", "contract"])) signals.add("legal");
  if (hasAnyTerm(tokens, candidateText, ["medical", "health", "clinical", "biology", "chemistry"])) signals.add("medical");
  if (hasAnyTerm(tokens, candidateText, ["marketing", "brand", "newsletter", "campaign"])) signals.add("marketing");
  if (hasAnyTerm(tokens, candidateText, ["art", "algorithmic art"])) signals.add("art");
  if (hasAnyTerm(tokens, candidateText, ["spreadsheet", "excel", "xlsx", "google sheets"])) signals.add("spreadsheet");
  if (hasAnyTerm(tokens, candidateText, ["internal-comms", "communication", "leadership update"])) signals.add("internal_comms");
  return [...signals];
}

function hasAnyTrigger(context: SpecializedGateContext, terms: string[]): boolean {
  return hasAnyTerm(context.candidateTokens, context.candidateText, terms);
}

function hasAnyTerm(tokens: Set<string>, text: string, terms: string[]): boolean {
  return terms.some((term) => termMatch(term, tokens, text));
}

function termMatch(rawTerm: string, tokens: Set<string>, text: string): boolean {
  const term = normalizeText(rawTerm);
  if (!term) return false;
  if (term.includes(" ")) {
    if (text.includes(term)) return true;
    const parts = term.split(" ").filter(Boolean);
    return parts.length > 0 && parts.every((part) => tokens.has(part));
  }
  return tokens.has(term);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
