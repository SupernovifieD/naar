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
        ref: "frontend-design@1.0.0"
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

  it("renders card with meta line and eligible status", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation(), 1, { indent: "  ", columns: 80 }));
    expect(output).toContain("1) Frontend Design Pro [anthropic]");
    expect(output).toContain("score: 88%");
    expect(output).toContain("status: ELIGIBLE");
    expect(output).toContain("meta:");
    expect(output).toContain("publisher: anthropic");
    expect(output).toContain("trust: official");
    expect(output).toContain("license: MIT");
    expect(output).toContain("updated: 2026-05-30");
  });

  it("omits meta when metadata fields are not available", () => {
    const recommendation = makeRecommendation();
    recommendation.candidate.metadata.publisher = undefined;
    recommendation.candidate.metadata.trustLevel = undefined;
    recommendation.candidate.metadata.license = undefined;
    recommendation.candidate.metadata.lastUpdatedIso = undefined;

    const output = stripAnsi(renderRecommendationCard(recommendation, 1, { columns: 80 }));
    expect(output).not.toContain("meta:");
  });

  it("renders blocked status and blocked reason line", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      blocked: true,
      blockReasons: ["Risk 80% exceeds threshold"]
    }), 1, { columns: 80 }));

    expect(output).toContain("status: BLOCKED");
    expect(output).toContain("blocked: Risk 80% exceeds threshold");
  });

  it("renders compact card without description/targets/meta", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation(), 1, {
      columns: 80,
      compact: true
    }));

    expect(output).toContain("1) Frontend Design Pro [anthropic]");
    expect(output).toContain("score: 88%");
    expect(output).toContain("status: ELIGIBLE");
    expect(output).toContain("why:");
    expect(output).toContain("  Matched stack: Next.js");
    expect(output).not.toContain("description:");
    expect(output).not.toContain("targets:");
    expect(output).not.toContain("meta:");
  });

  it("renders eligibility and penalties sections as multi-line reason lists", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
      eligibilityReasons: ["Eligible for target: claude"],
      penalties: ["Language-only match; no deeper project need match"]
    }), 1, { columns: 80 }));

    expect(output).toContain("eligibility:");
    expect(output).toContain("  Eligible for target: claude");
    expect(output).toContain("penalties:");
    expect(output).toContain("  Language-only match; no deeper project need match");
  });

  it("renders verbose recommendation explainability sections", () => {
    const output = stripAnsi(renderRecommendationCard(makeRecommendation({
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

    expect(output).toContain("skillCategories:");
    expect(output).toContain("domainSignals:");
    expect(output).toContain("matchedNeeds:");
    expect(output).toContain("node_cli_development, vitest_testing");
    expect(output).toContain("matchedNeedDetails:");
    expect(output).toContain("node_cli_development [strong] +28");
    expect(output).toContain("matchedFacts:");
    expect(output).toContain("primaryFacts: tool:vitest");
    expect(output).toContain("scoreBreakdown:");
    expect(output).toContain("+30 repo_need_match [strong]: node_cli_development");
    expect(output).toContain("capsApplied:");
    expect(output).toContain("weak_only_cap: cap=45");
  });

  it("builds focused install choice description", () => {
    const text = formatRecommendationChoiceDescription(makeRecommendation());
    expect(text).toContain("- status: ELIGIBLE");
    expect(text).toContain("- why: Matched stack: Next.js; Assistant compatibility: claude");
    expect(text).toContain("- targets: claude, cursor, copilot");
    expect(text).toContain("- publisher: anthropic");
    expect(text).toContain("- trust: official");
    expect(text).not.toContain("desc:");
  });
});
