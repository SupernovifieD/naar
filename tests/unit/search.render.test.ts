import { describe, expect, it, vi } from "vitest";
import { renderSearchResults } from "../../src/search/render.js";
import type { SearchRankedCandidate } from "../../src/search/types.js";
import type { SkillCandidate } from "../../src/types/index.js";

vi.mock("picocolors", async () => {
  const actual = await vi.importActual<typeof import("picocolors")>("picocolors");
  const colors = actual.createColors(true);
  return {
    default: colors,
    ...colors
  };
});

function makeCandidate(overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    providerScopedId: "clawhub:ui-ux",
    providerSkillId: "ui-ux",
    canonicalSkillId: "ui-ux",
    name: "UI / UX",
    source: {
      providerId: "clawhub",
      publisher: "wpank",
      url: "https://clawhub.ai/wpank/ui-ux"
    },
    summary: "Searchable UI/UX design databases.",
    tags: ["design"],
    compatibility: { assistants: ["claude", "cursor", "codex", "generic"] },
    metadata: {
      publisher: "wpank",
      description: "Searchable UI/UX design databases.",
      trustLevel: "trusted",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      ...overrides.metadata
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false },
    ...overrides
  };
}

function makeResult(candidate: SkillCandidate = makeCandidate()): SearchRankedCandidate {
  return {
    candidate,
    score: 100,
    exact: true,
    reasons: ["Search query: \"ui ux\""]
  };
}

describe("renderSearchResults", () => {
  it("renders missing license in yellow", () => {
    const output = renderSearchResults({
      query: "ui ux",
      results: [makeResult()],
      totalResults: 1
    });

    expect(output).toContain("\u001b[33mNo license declared\u001b[39m");
  });
});
