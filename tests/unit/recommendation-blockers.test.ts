import { describe, expect, it } from "vitest";
import type { MatchedNeedDetail, SkillCategory } from "../../src/types/index.js";
import { evaluateRecommendationBlockers, type RecommendationBlockerInput } from "../../src/recommend/blockers.js";
import { normalizeText, tokenize } from "../../src/recommend/textMatch.js";

function makeInput(options: {
  name?: string;
  summary?: string;
  tags?: string[];
  skillCategories?: SkillCategory[];
  domainSignals?: string[];
  repoNeedIds?: string[];
  repoText?: string;
  repoDomains?: string[];
  primaryFrameworks?: string[];
  secondaryFrameworks?: string[];
  matchedNeeds?: string[];
  matchedNeedDetails?: MatchedNeedDetail[];
  hasDeepMatch?: boolean;
  languageMatches?: string[];
  hasProviderSourcePath?: boolean;
  hasSkillAuthoringPath?: boolean;
} = {}): RecommendationBlockerInput {
  const name = options.name ?? "Test Skill";
  const tags = options.tags ?? [];
  const candidateBody = [name, options.summary ?? "", ...tags].join(" ");
  const repoText = options.repoText ?? "";

  return {
    candidateText: normalizeText(candidateBody),
    candidateTokens: tokenize(candidateBody),
    candidateNameText: normalizeText(name),
    candidateNameTokens: tokenize(name),
    candidateTagText: normalizeText(tags.join(" ")),
    candidateTagTokens: tokenize(tags.join(" ")),
    skillCategories: options.skillCategories ?? [],
    domainSignals: options.domainSignals ?? [],
    repoNeedIds: new Set(options.repoNeedIds ?? []),
    repoTokens: tokenize(repoText),
    repoDomains: new Set(options.repoDomains ?? []),
    primaryFrameworks: new Set(options.primaryFrameworks ?? []),
    secondaryFrameworks: new Set(options.secondaryFrameworks ?? []),
    matchedNeeds: options.matchedNeeds ?? [],
    matchedNeedDetails: options.matchedNeedDetails ?? [],
    hasDeepMatch: options.hasDeepMatch ?? false,
    languageMatches: options.languageMatches ?? [],
    hasProviderSourcePath: options.hasProviderSourcePath ?? false,
    hasSkillAuthoringPath: options.hasSkillAuthoringPath ?? false
  };
}

describe("evaluateRecommendationBlockers", () => {
  it("adds a hard crypto domain mismatch blocker for a TypeScript CLI repo", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Crypto Trading Bot",
      summary: "Automate onchain trading strategies",
      tags: ["crypto", "trading", "web3"],
      skillCategories: ["crypto"],
      domainSignals: ["crypto"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "domain_mismatch",
      severity: "hard",
      scoreCap: 15
    }));
  });

  it("adds a hard finance domain mismatch blocker in a Next.js repo without finance evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Finance Portfolio Analyst",
      summary: "Analyze finance portfolios and banking flows",
      tags: ["finance", "portfolio", "banking"],
      skillCategories: ["finance"],
      domainSignals: ["finance"],
      primaryFrameworks: ["nextjs"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "domain_mismatch",
      severity: "hard",
      scoreCap: 15
    }));
  });

  it("adds a hard framework mismatch blocker for React in a Python API repo", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "React Component Reviewer",
      summary: "Review React component architecture and JSX composition",
      tags: ["react", "react component", "jsx"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "framework_mismatch",
      severity: "hard",
      scoreCap: 35
    }));
  });

  it("adds a hard secondary scope blocker when React only appears in secondary facts", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "React Component Reviewer",
      summary: "Review React component architecture and JSX composition",
      tags: ["react", "react component", "jsx"],
      secondaryFrameworks: ["react"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "secondary_scope_only",
      severity: "hard",
      scoreCap: 40
    }));
  });

  it("adds an MCP mismatch blocker when the repo has no MCP evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "MCP Server Builder",
      summary: "Build Model Context Protocol servers",
      tags: ["mcp", "@modelcontextprotocol/sdk"],
      skillCategories: ["mcp"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "mcp_mismatch",
      severity: "hard",
      scoreCap: 35
    }));
  });

  it("does not add an MCP mismatch blocker when the repo has MCP evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "MCP Server Builder",
      summary: "Build Model Context Protocol servers",
      tags: ["mcp", "@modelcontextprotocol/sdk"],
      skillCategories: ["mcp"],
      repoText: "@modelcontextprotocol/sdk mcp server"
    }));

    expect(blockers.some((blocker) => blocker.kind === "mcp_mismatch")).toBe(false);
  });

  it("adds a prompting mismatch blocker for prompt optimization in a normal package repo", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Prompt Optimization Guru",
      summary: "Prompt optimization and CRISP framework guidance",
      tags: ["prompt optimization", "prompt engineering"],
      skillCategories: ["prompting"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "prompting_mismatch",
      severity: "hard",
      scoreCap: 30
    }));
  });

  it("does not add a prompting mismatch blocker when the repo has prompt-template evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Prompt Optimization Guru",
      summary: "Prompt optimization and CRISP framework guidance",
      tags: ["prompt optimization", "prompt engineering"],
      skillCategories: ["prompting"],
      repoText: "prompts system prompt prompt-template"
    }));

    expect(blockers.some((blocker) => blocker.kind === "prompting_mismatch")).toBe(false);
  });

  it("adds a skill authoring mismatch blocker for normal repos", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Skill Creator",
      summary: "Create skills and benchmark skill performance",
      tags: ["skill creator", "skill evals"],
      skillCategories: ["skill-development"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "skill_authoring_mismatch",
      severity: "hard",
      scoreCap: 45
    }));
  });

  it("does not add a hard skill authoring blocker when the repo has skill-authoring paths", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Skill Creator",
      summary: "Create skills and benchmark skill performance",
      tags: ["skill creator", "skill evals"],
      skillCategories: ["skill-development"],
      hasSkillAuthoringPath: true
    }));

    expect(blockers.some((blocker) =>
      blocker.kind === "skill_authoring_mismatch" && blocker.severity === "hard"
    )).toBe(false);
  });

  it("adds a Claude API mismatch blocker without Anthropic or provider evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Claude API Prompt Caching Expert",
      summary: "Optimize Claude API prompt caching and Anthropic SDK usage",
      tags: ["claude api", "anthropic sdk", "prompt caching"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "claude_api_mismatch",
      severity: "hard",
      scoreCap: 40
    }));
  });

  it("does not add a hard Claude API blocker when the repo has Anthropic SDK evidence", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      name: "Claude API Prompt Caching Expert",
      summary: "Optimize Claude API prompt caching and Anthropic SDK usage",
      tags: ["claude api", "anthropic sdk", "prompt caching"],
      repoText: "@anthropic-ai/sdk src providers anthropic"
    }));

    expect(blockers.some((blocker) =>
      blocker.kind === "claude_api_mismatch" && blocker.severity === "hard"
    )).toBe(false);
  });

  it("adds a language-only match blocker when no deep match exists", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      languageMatches: ["TypeScript"]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "language_only_match",
      severity: "soft",
      scoreCap: 35
    }));
  });

  it("adds a weak-only match blocker when only weak need evidence exists", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      matchedNeedDetails: [{
        id: "cli_command_design",
        strength: "weak",
        points: 6,
        matchedTerms: ["cli"],
        antiTerms: []
      }]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "weak_only_match",
      severity: "soft",
      scoreCap: 45
    }));
  });

  it("adds a hard negative-need blocker when anti-triggers exist without strong matches", () => {
    const blockers = evaluateRecommendationBlockers(makeInput({
      matchedNeedDetails: [{
        id: "interactive_cli_ux",
        strength: "negative",
        points: -30,
        matchedTerms: [],
        antiTerms: ["prompt optimization"]
      }]
    }));

    expect(blockers).toContainEqual(expect.objectContaining({
      kind: "negative_need_match",
      severity: "hard",
      scoreCap: 35
    }));
  });
});
