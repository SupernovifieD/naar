import type { SkillCategory } from "../types/index.js";
import { containsAllTokens, matchesTerm, type TextMatchTerm } from "./textMatch.js";

type MatchTerm = string | TextMatchTerm;

export type SpecializedGateResult = {
  kind: string;
  penalty: number;
  scoreCap: number;
  message: string;
};

export type SpecializedGateContext = {
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
  hasProviderSourcePath: boolean;
  hasSkillAuthoringPath: boolean;
};

const TOKEN_CI: TextMatchTerm = { value: "ci", mode: "token" };
const TOKEN_MCP: TextMatchTerm = { value: "mcp", mode: "token" };
const TOKEN_CLI: TextMatchTerm = { value: "cli", mode: "token" };

const MCP_TERMS: MatchTerm[] = [
  TOKEN_MCP,
  "model context protocol",
  "modelcontextprotocol",
  "fastmcp",
  "mcp server",
  "@modelcontextprotocol/sdk"
];
const REACT_TERMS: MatchTerm[] = ["react", "react component", "jsx", "tsx component", "react 19"];
const TAILWIND_TERMS: MatchTerm[] = ["tailwind", "tailwindcss", "shadcn", "css utility", "utility classes"];
const CLAUDE_API_TERMS: MatchTerm[] = ["claude api", "anthropic sdk", "@anthropic-ai/sdk", "prompt caching", "opus", "sonnet", "haiku"];
const CRYPTO_TERMS: MatchTerm[] = ["crypto", "defi", "web3", "onchain", "trading", "futures", "yield", "wallet", "swap", "hyperliquid", "farmdash"];
const PROMPTING_TERMS: MatchTerm[] = ["prompt optimization", "prompt engineering", "prompt tuning", "crisp framework", "ai prompt", "llm prompt"];
const SKILL_CREATOR_TERMS: MatchTerm[] = ["create skills", "skill creator", "skill performance", "benchmark skill", "skill evals", "skill eval", "skill evaluation"];

const TESTING_TERMS: MatchTerm[] = ["vitest", "unit test", "jest", "playwright", "test suite", "test coverage", "mocking"];
const DEBUGGING_TERMS: MatchTerm[] = ["debug tests", "flaky tests", "test failures", "stack trace", "debugging"];
const REFACTORING_TERMS: MatchTerm[] = ["refactor", "refactoring", "type safety", "strict types", "type guards", "narrowing"];
const CONFIG_TERMS: MatchTerm[] = ["tsconfig", "configuration", "config file", "compiler options", "repo instructions", "setup"];
const CI_TERMS: MatchTerm[] = ["github actions", ".github/workflows", "continuous integration", "workflow yaml", "workflow yml", "release workflow", "publish workflow", TOKEN_CI];
const RELEASE_TERMS: MatchTerm[] = ["release", "publish", "prepublish", "prepack", "semantic release", "versioning", "changelog"];
const CLI_TERMS: MatchTerm[] = [TOKEN_CLI, "command-line", "command line", "terminal", "subcommands", "argument parsing", "commander", "yargs", "oclif", "cli flags", "command-line flags"];
const API_TERMS: MatchTerm[] = ["api", "http client", "sdk", "provider", "integration", "rest api", "fetch"];
const SECURITY_TERMS: MatchTerm[] = ["security", "vulnerability", "vulnerabilities", "threat model", "secrets", "secret scanning", "token leakage", "injection", "xss", "csrf", "supply chain", "dependency confusion", "rce"];
const AGENT_SETUP_TERMS: MatchTerm[] = ["claude.md", "copilot instructions", "agent config", "repo instructions", "project skills"];
const PRODUCTIVITY_TERMS: MatchTerm[] = ["internal-comms", "productivity", "communication", "presentation", "leadership update"];
const WRITING_TERMS: MatchTerm[] = ["writing", "documentation style", "editorial", "style guide"];
const DESIGN_TERMS: MatchTerm[] = ["design system", "frontend design", "ui design", "visual design"];
const FINANCE_TERMS: MatchTerm[] = ["finance", "banking", "portfolio", "insurance"];
const ART_TERMS: MatchTerm[] = ["algorithmic art", "creative coding", "procedural art"];
const SPREADSHEET_TERMS: MatchTerm[] = ["spreadsheet", "excel", "xlsx", "google sheets"];

export function evaluateSpecializedGates(context: SpecializedGateContext): SpecializedGateResult[] {
  const results: SpecializedGateResult[] = [];
  const repoNeedIds = context.repoNeedIds;
  const repoTokens = context.repoTokens;

  if (hasAnyTerm(context.candidateText, context.candidateTokens, MCP_TERMS)) {
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

  const reactTopic = evaluatePrimaryTopic(context, REACT_TERMS);
  if (reactTopic.mentioned) {
    const hasPrimaryReact = context.primaryFrameworks.has("react");
    const secondaryReactOnly = !hasPrimaryReact && context.secondaryFrameworks.has("react");

    if (reactTopic.primary) {
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
    } else if (!hasPrimaryReact) {
      results.push({
        kind: "react_incidental_caution",
        penalty: secondaryReactOnly ? -6 : -4,
        scoreCap: 100,
        message: "React is only mentioned incidentally and repo lacks primary React evidence"
      });
    }
  }

  const tailwindTopic = evaluatePrimaryTopic(context, TAILWIND_TERMS);
  if (tailwindTopic.mentioned) {
    const hasPrimaryTailwind = context.primaryFrameworks.has("tailwind");
    const secondaryTailwindOnly = !hasPrimaryTailwind && context.secondaryFrameworks.has("tailwind");

    if (tailwindTopic.primary) {
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
    } else if (!hasPrimaryTailwind) {
      results.push({
        kind: "tailwind_incidental_caution",
        penalty: secondaryTailwindOnly ? -6 : -4,
        scoreCap: 100,
        message: "Tailwind is only mentioned incidentally and repo lacks primary Tailwind evidence"
      });
    }
  }

  if (hasAnyTerm(context.candidateText, context.candidateTokens, CLAUDE_API_TERMS)) {
    const hasAnthropicEvidence = repoTokens.has("@anthropic-ai/sdk")
      || repoTokens.has("anthropic")
      || repoNeedIds.has("provider_integration")
      || repoNeedIds.has("http_api_client");
    const hasSdkOrImportEvidence = repoTokens.has("@anthropic-ai/sdk")
      || repoTokens.has("anthropic-sdk")
      || repoTokens.has("provider-source-path")
      || containsAllTokens(repoTokens, ["src", "providers", "anthropic"]);
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

  if (hasAnyTerm(context.candidateText, context.candidateTokens, CRYPTO_TERMS) || context.skillCategories.includes("crypto")) {
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

  if (hasAnyTerm(context.candidateText, context.candidateTokens, PROMPTING_TERMS) || context.skillCategories.includes("prompting")) {
    const hasPromptEvidence = repoNeedIds.has("prompt_engineering")
      || containsAllTokens(repoTokens, ["prompt", "template"])
      || containsAllTokens(repoTokens, ["system", "prompt"])
      || containsAllTokens(repoTokens, ["prompt", "engineering"]);
    if (!hasPromptEvidence) {
      results.push({
        kind: "prompt_optimization_gate",
        penalty: -30,
        scoreCap: 35,
        message: "Prompt optimization skill, but repo has no prompt-engineering evidence"
      });
    }
  }

  if (hasAnyTerm(context.candidateText, context.candidateTokens, SKILL_CREATOR_TERMS) || context.skillCategories.includes("skill-development")) {
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

  if (hasAnyTerm(candidateText, tokens, TESTING_TERMS)) add("testing");
  if (hasAnyTerm(candidateText, tokens, DEBUGGING_TERMS)) add("debugging");
  if (hasAnyTerm(candidateText, tokens, REFACTORING_TERMS)) add("refactoring");
  if (hasAnyTerm(candidateText, tokens, CONFIG_TERMS)) add("config");
  if (hasAnyTerm(candidateText, tokens, CI_TERMS)) add("ci");
  if (hasAnyTerm(candidateText, tokens, RELEASE_TERMS)) add("release");
  if (hasAnyTerm(candidateText, tokens, CLI_TERMS)) add("cli");
  if (hasAnyTerm(candidateText, tokens, API_TERMS)) add("api");
  if (hasAnyTerm(candidateText, tokens, SECURITY_TERMS)) add("security");
  if (hasAnyTerm(candidateText, tokens, AGENT_SETUP_TERMS)) add("agent-setup");
  if (hasAnyTerm(candidateText, tokens, MCP_TERMS)) add("mcp");
  if (hasAnyTerm(candidateText, tokens, PROMPTING_TERMS)) add("prompting");
  if (hasAnyTerm(candidateText, tokens, SKILL_CREATOR_TERMS)) add("skill-development");
  if (hasAnyTerm(candidateText, tokens, PRODUCTIVITY_TERMS)) add("general-productivity");
  if (hasAnyTerm(candidateText, tokens, WRITING_TERMS)) add("writing");
  if (hasAnyTerm(candidateText, tokens, DESIGN_TERMS)) add("design");
  if (hasAnyTerm(candidateText, tokens, FINANCE_TERMS)) add("finance");
  if (hasAnyTerm(candidateText, tokens, CRYPTO_TERMS)) add("crypto");
  if (hasAnyTerm(candidateText, tokens, ART_TERMS)) add("art");
  if (hasAnyTerm(candidateText, tokens, SPREADSHEET_TERMS)) add("spreadsheet");

  if (categories.size === 0) add("unknown");
  return [...categories];
}

export function detectDomainSignals(candidateText: string, tokens: Set<string>): string[] {
  const signals = new Set<string>();
  if (hasAnyTerm(candidateText, tokens, CRYPTO_TERMS)) signals.add("crypto");
  if (hasAnyTerm(candidateText, tokens, ["finance", "portfolio", "banking", "futures"])) signals.add("finance");
  if (hasAnyTerm(candidateText, tokens, ["legal", "law", "contract"])) signals.add("legal");
  if (hasAnyTerm(candidateText, tokens, ["medical", "health", "clinical", "biology", "chemistry"])) signals.add("medical");
  if (hasAnyTerm(candidateText, tokens, ["marketing", "brand", "newsletter", "campaign"])) signals.add("marketing");
  if (hasAnyTerm(candidateText, tokens, ART_TERMS)) signals.add("art");
  if (hasAnyTerm(candidateText, tokens, SPREADSHEET_TERMS)) signals.add("spreadsheet");
  if (hasAnyTerm(candidateText, tokens, ["internal-comms", "communication", "leadership update"])) signals.add("internal_comms");
  return [...signals];
}

function evaluatePrimaryTopic(context: SpecializedGateContext, terms: MatchTerm[]): { mentioned: boolean; primary: boolean } {
  const inName = hasAnyTerm(context.candidateNameText, context.candidateNameTokens, terms);
  const inTags = hasAnyTerm(context.candidateTagText, context.candidateTagTokens, terms);
  const bodyMatches = countMatchedTerms(context.candidateText, context.candidateTokens, terms);
  const mentioned = inName || inTags || bodyMatches > 0;
  const weight = bodyMatches + (inName ? 2 : 0) + (inTags ? 2 : 0);
  const primary = weight >= 3 || (bodyMatches >= 2) || ((inName || inTags) && bodyMatches >= 1);
  return { mentioned, primary };
}

function hasAnyTerm(text: string, tokens: Set<string>, terms: MatchTerm[]): boolean {
  return terms.some((term) => matchesTerm(text, tokens, term));
}

function countMatchedTerms(text: string, tokens: Set<string>, terms: MatchTerm[]): number {
  let count = 0;
  for (const term of terms) {
    if (matchesTerm(text, tokens, term)) count += 1;
  }
  return count;
}
