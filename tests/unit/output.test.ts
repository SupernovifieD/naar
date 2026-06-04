import { describe, expect, it } from "vitest";
import type { SkillRecommendation } from "../../src/types/index.js";
import {
  formatRecommendationChoiceDescription,
  renderRecommendationCard,
  resolveRecommendationCardWidth,
  resolveSkillDescription,
  wrapForTerminal
} from "../../src/utils/output.js";

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function makeRecommendation(overrides: Partial<SkillRecommendation> = {}): SkillRecommendation {
  const base: SkillRecommendation = {
    candidate: {
      providerSkillId: "frontend-design",
      canonicalSkillId: "frontend-design",
      name: "Frontend Design Pro",
      source: {
        providerId: "anthropic",
        publisher: "anthropic",
        version: "1.0.0",
        ref: "frontend-design@1.0.0",
        url: "https://example.com/skills/frontend-design"
      },
      summary: "Summary fallback",
      tags: ["nextjs"],
      compatibility: {
        assistants: ["claude", "cursor", "copilot"]
      },
      metadata: {
        description: "API description",
        publisher: "anthropic",
        trustLevel: "official",
        license: "MIT",
        lastUpdatedIso: "2026-05-30T00:00:00.000Z",
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        pinnedRef: "1.0.0"
      },
      risk: {
        score: 95,
        level: "low",
        signals: [],
        requiresOverride: false
      }
    },
    score: 88,
    reasons: ["Matched stack: Next.js", "Assistant compatibility: claude"],
    blockers: [],
    fitSummary: {
      level: "strong",
      headline: "Strong fit for CLI/package workflow",
      primaryMatches: ["repo need: node_cli_development"],
      supportingMatches: ["language: TypeScript"],
      cautions: [],
      blockers: []
    },
    dimensionScores: {
      relevance: 82,
      specificity: 68,
      compatibility: 100,
      quality: 72,
      safety: 95,
      final: 88
    },
    matchedNeeds: [],
    matchedFacts: [],
    eligibilityReasons: [],
    penalties: [],
    scoreBreakdown: [],
    blocked: false,
    blockReasons: []
  };

  return {
    ...base,
    ...overrides,
    matchedNeeds: overrides.matchedNeeds ?? base.matchedNeeds,
    matchedFacts: overrides.matchedFacts ?? base.matchedFacts,
    eligibilityReasons: overrides.eligibilityReasons ?? base.eligibilityReasons,
    penalties: overrides.penalties ?? base.penalties,
    scoreBreakdown: overrides.scoreBreakdown ?? base.scoreBreakdown
  };
}

describe("resolveSkillDescription", () => {
  it("uses metadata.description when present", () => {
    const value = resolveSkillDescription({
      summary: "Summary fallback",
      metadata: { description: "API description" }
    });

    expect(value).toBe("API description");
  });

  it("falls back to summary when description is missing", () => {
    const value = resolveSkillDescription({
      summary: "Summary fallback",
      metadata: {}
    });

    expect(value).toBe("Summary fallback");
  });

  it("normalizes whitespace and multiline content", () => {
    const value = resolveSkillDescription({
      summary: "ignored",
      metadata: { description: "First line\n\tSecond    line\r\nThird line" }
    });

    expect(value).toBe("First line Second line Third line");
  });

  it("returns null when both description and summary are empty", () => {
    const value = resolveSkillDescription({
      summary: " \n\t ",
      metadata: { description: "  " }
    });

    expect(value).toBeNull();
  });
});

describe("recommendation card helpers", () => {
  it("clamps card width based on terminal columns", () => {
    expect(resolveRecommendationCardWidth(undefined)).toBe(78);
    expect(resolveRecommendationCardWidth(30)).toBe(68);
    expect(resolveRecommendationCardWidth(200)).toBe(96);
  });

  it("wraps text at word boundaries", () => {
    const wrapped = wrapForTerminal("alpha beta gamma delta", 10);
    expect(wrapped).toEqual(["alpha beta", "gamma", "delta"]);
  });

  it("renders concise default card with eligible status", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation(), 1, { indent: "  ", columns: 80 }));
    expect(output).toContain("1. frontend-design [anthropic]");
    expect(output).toContain("Match 88%");
    expect(output).toContain("Risk 5%");
    expect(output).toContain("Status PRELIMINARILY ELIGIBLE");
    expect(output).toContain("API description");
    expect(output).toContain("Why: Matched stack: Next.js; Assistant compatibility: claude");
    expect(output).toContain("Install: naar install anthropic:frontend-design");
    expect(output).not.toContain("Targets:");
    expect(output).not.toContain("Meta:");
    expect(output).not.toContain("Page:");
    expect(output).not.toContain("Publisher:");
  });

  it("renders verbose meta with fallback missing-license text", () => {
    const recommendation = makeRecommendation();
    recommendation.candidate.metadata.publisher = undefined;
    recommendation.candidate.metadata.trustLevel = undefined;
    recommendation.candidate.metadata.license = undefined;
    recommendation.candidate.metadata.lastUpdatedIso = undefined;

    const output = stripAnsi(renderRecommendationCard(recommendation, 1, { columns: 80, verbose: true }));
    expect(output).toContain("Meta:");
    expect(output).toContain("License: No license declared");
  });

  it("renders blocked status and blocked reason line", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      blocked: true,
      blockReasons: ["Risk 80% exceeds threshold"]
    }), 1, { columns: 80 }));

    expect(output).toContain("Status PRELIMINARILY BLOCKED");
    expect(output).toContain("Blocked:");
    expect(output).toContain("Risk 80% exceeds threshold");
  });

  it("renders compact card without description/targets/meta", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation(), 1, {
      columns: 80,
      compact: true
    }));

    expect(output).toContain("1. frontend-design [anthropic]");
    expect(output).toContain("Match 88%");
    expect(output).toContain("Risk 5%");
    expect(output).toContain("Status PRELIMINARILY ELIGIBLE");
    expect(output).toContain("Why: Matched stack: Next.js");
    expect(output).not.toContain("API description");
    expect(output).not.toContain("Page:");
    expect(output).not.toContain("Targets:");
    expect(output).not.toContain("Meta:");
  });

  it("does not render local source paths as skill web pages", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      candidate: {
        ...makeRecommendation().candidate,
        source: {
          providerId: "local",
          publisher: "local",
          url: "/tmp/local-skill/SKILL.md"
        }
      }
    }), 1, { columns: 80, verbose: true }));

    expect(output).not.toContain("Page:");
  });

  it("renders eligibility section and hides penalties from card output", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      eligibilityReasons: ["Eligible for target: claude"],
      penalties: ["Language-only match; no deeper project need match"]
    }), 1, { columns: 80 }));

    expect(output).toContain("Eligibility:");
    expect(output).toContain("  Eligible for target: claude");
    expect(output).not.toContain("Penalties:");
    expect(output).not.toContain("Language-only match; no deeper project need match");
  });

  it("renders verbose recommendation explainability sections", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      blockers: [{ kind: "weak_only_match", severity: "soft", message: "Only weak repo-need matches were found", penalty: -12, scoreCap: 45 }],
      fitSummary: {
        level: "weak",
        headline: "Weak fit: mostly language-level evidence",
        primaryMatches: ["repo need: node_cli_development"],
        supportingMatches: ["language: TypeScript"],
        cautions: ["Only weak repo-need matches were found"],
        blockers: []
      },
      matchedNeeds: ["node_cli_development", "vitest_testing"],
      matchedNeedDetails: [
        {
          id: "node_cli_development",
          strength: "strong",
          points: 28,
          matchedTerms: ["cli", "terminal"],
          antiTerms: []
        }
      ],
      matchedFacts: [{ factType: "tool", id: "vitest", source: "primaryFacts" }],
      skillCategories: ["cli", "testing"],
      domainSignals: ["internal_comms"],
      capsApplied: [{ kind: "weak_only_cap", cap: 45, reason: "Only weak repo-need matches were found" }],
      scoreBreakdown: [
        {
          kind: "repo_need_match",
          points: 30,
          detail: "node_cli_development",
          strength: "strong",
          matchedTerms: ["cli", "terminal"]
        },
        { kind: "tool_match", points: 12, detail: "vitest" }
      ]
    }), 1, { columns: 80, verbose: true }));

    expect(output).toContain("Skill Categories:");
    expect(output).toContain("Domain Signals:");
    expect(output).toContain("Fit Summary:");
    expect(output).toContain("Headline: Weak fit: mostly language-level evidence");
    expect(output).toContain("Match Score Model:");
    expect(output).toContain("relevanceRaw=");
    expect(output).toContain("Score:");
    expect(output).toContain("Relevance: 82");
    expect(output).toContain("Specificity: 68");
    expect(output).toContain("Compatibility: 100");
    expect(output).toContain("Quality: 72");
    expect(output).toContain("Safety: 95");
    expect(output).toContain("Final: 88");
    expect(output).toContain("Matched Needs:");
    expect(output).toContain("node_cli_development, vitest_testing");
    expect(output).toContain("Matched Need Details:");
    expect(output).toContain("node_cli_development [strong] +28");
    expect(output).toContain("Matched Facts:");
    expect(output).toContain("primaryFacts: tool:vitest");
    expect(output).toContain("Score Breakdown:");
    expect(output).toContain("+30 repo_need_match [strong]: node_cli_development");
    expect(output).toContain("Caps Applied:");
    expect(output).toContain("weak_only_cap: cap=45");
    expect(output).toContain("Blockers:");
    expect(output).toContain("weak_only_match [soft] cap=45 penalty=-12");
    expect(output).toContain("Cap Summary:");
  });

  it("builds focused install choice description", () => {
    const text = formatRecommendationChoiceDescription(makeRecommendation());
    expect(text).toContain("- Preliminary status: PRELIMINARILY ELIGIBLE");
    expect(text).toContain("- Fit: Strong fit for CLI/package workflow");
    expect(text).toContain("- Why: Matched stack: Next.js; Assistant compatibility: claude");
    expect(text).toContain("- Targets: claude, cursor, copilot");
    expect(text).toContain("- Publisher: anthropic");
    expect(text).toContain("- Trust: official");
    expect(text).not.toContain("desc:");
  });

  it("renders risky status and security details", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      status: "risky",
      blocked: true,
      blockReasons: ["missing_license [medium]: License is not declared."]
    }), 1, { columns: 80 }));

    expect(output).toContain("Status PRELIMINARILY RISKY");
    expect(output).toContain("Risky:");
    expect(output).toContain("missing_license [medium]");
  });

  it("renders match and pre-fetch values from recommendation.score and candidate.risk.score", () => {
    const recommendation = makeRecommendation({
      score: 64
    });
    recommendation.candidate.risk.score = 81;
    const output = stripAnsi(renderRecommendationCard(recommendation, 1, { columns: 80 }));
    expect(output).toContain("Match 64%");
    expect(output).toContain("Risk 19%");
  });
});
