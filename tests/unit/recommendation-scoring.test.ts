import { describe, expect, it } from "vitest";
import type {
  AssistantId,
  RecommendationCapApplied,
  RecommendationScoreComponent,
  SkillCandidate
} from "../../src/types/index.js";
import { applyRecommendationCaps, computeDimensionScores } from "../../src/recommend/scoring.js";

function makeCandidate(overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  const base: SkillCandidate = {
    providerScopedId: "anthropic:test-skill",
    providerSkillId: "test-skill",
    canonicalSkillId: "test-skill",
    name: "Test Skill",
    source: { providerId: "anthropic", publisher: "anthropic" },
    summary: "Targeted repo workflow skill",
    tags: ["cli", "vitest"],
    compatibility: { assistants: ["claude", "cursor"] },
    metadata: {
      publisher: "anthropic",
      description: "Repo-specific guidance",
      popularity: 5000,
      license: "MIT",
      lastUpdatedIso: "2026-06-01T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "official",
      pinnedRef: "v1.0.0"
    },
    risk: { score: 92, level: "low", signals: [], requiresOverride: false }
  };

  return {
    ...base,
    ...overrides,
    compatibility: {
      assistants: [...base.compatibility.assistants],
      ...(overrides.compatibility ?? {})
    },
    metadata: {
      ...base.metadata,
      ...(overrides.metadata ?? {})
    },
    risk: {
      ...base.risk,
      ...(overrides.risk ?? {})
    }
  };
}

function makeInput(options: {
  scoreBreakdown?: RecommendationScoreComponent[];
  capsApplied?: RecommendationCapApplied[];
  assistantMatches?: AssistantId[];
  eligibleAssistants?: AssistantId[];
  hasDeepMatch?: boolean;
  candidate?: SkillCandidate;
  includedByAllCompatible?: boolean;
} = {}) {
  return {
    scoreBreakdown: options.scoreBreakdown ?? [],
    capsApplied: options.capsApplied ?? [],
    penalties: [],
    reasons: [],
    matchedNeeds: [],
    matchedNeedDetails: [],
    matchedFacts: [],
    candidate: options.candidate ?? makeCandidate(),
    riskScore: options.candidate?.risk.score ?? 92,
    assistantMatches: options.assistantMatches ?? (["claude"] satisfies AssistantId[]),
    eligibleAssistants: new Set<AssistantId>(options.eligibleAssistants ?? (["claude"] satisfies AssistantId[])),
    hasDeepMatch: options.hasDeepMatch ?? true,
    skillCategories: [],
    domainSignals: [],
    includedByAllCompatible: options.includedByAllCompatible ?? false,
    noScripts: true
  };
}

describe("computeDimensionScores", () => {
  it("gives strong relevance when core repo matches are present", () => {
    const dimensions = computeDimensionScores(makeInput({
      scoreBreakdown: [
        { kind: "repo_need_match", points: 35, detail: "cli_command_design", strength: "exact" },
        { kind: "project_type_match", points: 18, detail: "cli" },
        { kind: "tool_match", points: 12, detail: "vitest" },
        { kind: "framework_match", points: 14, detail: "react" }
      ],
      hasDeepMatch: true
    }));

    expect(dimensions.relevance).toBeGreaterThan(55);
    expect(dimensions.specificity).toBeGreaterThan(70);
  });

  it("keeps language-only matches low in relevance and specificity", () => {
    const dimensions = computeDimensionScores(makeInput({
      scoreBreakdown: [
        { kind: "language_match", points: 7, detail: "TypeScript" },
        { kind: "language_only_penalty", points: -24, detail: "Language-only" }
      ],
      hasDeepMatch: false
    }));

    expect(dimensions.relevance).toBeLessThan(10);
    expect(dimensions.specificity).toBeLessThan(20);
  });

  it("rewards official publishers more than unknown publishers", () => {
    const official = computeDimensionScores(makeInput({
      candidate: makeCandidate({ metadata: { trustLevel: "official" } as SkillCandidate["metadata"] })
    }));
    const unknown = computeDimensionScores(makeInput({
      candidate: makeCandidate({ metadata: { trustLevel: "unknown", license: "", description: "", popularity: 0 } as SkillCandidate["metadata"] })
    }));

    expect(official.quality).toBeGreaterThan(unknown.quality);
  });

  it("maps preliminary risk score directly into safety", () => {
    const safe = computeDimensionScores(makeInput({
      candidate: makeCandidate({ risk: { score: 95, level: "low", signals: [], requiresOverride: false } })
    }));
    const risky = computeDimensionScores(makeInput({
      candidate: makeCandidate({ risk: { score: 35, level: "critical", signals: [], requiresOverride: true } })
    }));

    expect(safe.safety).toBe(95);
    expect(risky.safety).toBe(35);
  });

  it("returns compatibility 100 when all selected assistants are supported", () => {
    const dimensions = computeDimensionScores(makeInput({
      candidate: makeCandidate({ compatibility: { assistants: ["claude", "cursor"] } }),
      assistantMatches: ["claude", "cursor"],
      eligibleAssistants: ["claude", "cursor"]
    }));

    expect(dimensions.compatibility).toBe(100);
  });

  it("returns compatibility 75 when at least one selected assistant matches", () => {
    const dimensions = computeDimensionScores(makeInput({
      candidate: makeCandidate({ compatibility: { assistants: ["claude"] } }),
      assistantMatches: ["claude"],
      eligibleAssistants: ["claude", "cursor"]
    }));

    expect(dimensions.compatibility).toBe(75);
  });

  it("returns compatibility 40 when included only through --all-compatible", () => {
    const dimensions = computeDimensionScores(makeInput({
      candidate: makeCandidate({ compatibility: { assistants: ["codex"] } }),
      assistantMatches: [],
      eligibleAssistants: ["claude"],
      includedByAllCompatible: true
    }));

    expect(dimensions.compatibility).toBe(40);
  });

  it("applies caps to the weighted final score", () => {
    const dimensions = computeDimensionScores(makeInput({
      scoreBreakdown: [
        { kind: "repo_need_match", points: 35, detail: "cli_command_design", strength: "exact" },
        { kind: "tool_match", points: 12, detail: "vitest" },
        { kind: "framework_match", points: 14, detail: "react" }
      ],
      capsApplied: [{ kind: "domain_mismatch_cap", cap: 15, reason: "Domain mismatch" }],
      hasDeepMatch: true
    }));

    const capped = applyRecommendationCaps(dimensions.final, [{ kind: "domain_mismatch_cap", cap: 15, reason: "Domain mismatch" }]);
    expect(capped.score).toBe(15);
    expect(capped.appliedCap?.kind).toBe("domain_mismatch_cap");
  });

  it("uses the exact weighted dimensional formula", () => {
    const dimensions = computeDimensionScores(makeInput({
      scoreBreakdown: [
        { kind: "repo_need_match", points: 35, detail: "cli_command_design", strength: "exact" },
        { kind: "project_type_match", points: 18, detail: "cli" },
        { kind: "tool_match", points: 12, detail: "vitest" }
      ],
      assistantMatches: ["claude"],
      eligibleAssistants: ["claude"]
    }));

    const expected = Number((
      (dimensions.relevance * 0.45)
      + (dimensions.specificity * 0.20)
      + (dimensions.compatibility * 0.10)
      + (dimensions.quality * 0.15)
      + (dimensions.safety * 0.10)
    ).toFixed(2));

    expect(dimensions.final).toBeCloseTo(expected, 2);
  });
});
