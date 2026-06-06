import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCandidate } from "../../src/types/index.js";

const buildProvidersMock = vi.hoisted(() => vi.fn());
const availableProviderIdsMock = vi.hoisted(() => vi.fn());
const fetchFilesMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/providers/orchestrator.js", () => ({
  buildProviders: buildProvidersMock,
  availableProviderIds: availableProviderIdsMock
}));

import { resolveSkillRefs } from "../../src/installer/resolveRefs.js";

beforeEach(() => {
  vi.clearAllMocks();
  availableProviderIdsMock.mockReturnValue(["anthropic", "clawhub", "awesome"]);
  buildProvidersMock.mockImplementation((ids: string[]) => {
    const registry = [{ id: "clawhub", fetchFiles: fetchFilesMock, search: searchMock }];
    return ids.length > 0 ? registry.filter((provider) => ids.includes(provider.id)) : registry;
  });
  fetchFilesMock.mockResolvedValue({
    skill: makeCandidate(),
    files: { "SKILL.md": "# UI UX\n" }
  });
});

describe("resolveSkillRefs", () => {
  it("fetches only referenced providers and filters targets by compatibility", async () => {
    const resolved = await resolveSkillRefs(
      [{ providerId: "clawhub", skillId: "ui-ux", version: "1.0.0" }],
      ["claude_project_skills", "cursor_project_rules", "copilot_repo_instructions"]
    );

    expect(buildProvidersMock).toHaveBeenCalledWith(["clawhub"]);
    expect(fetchFilesMock).toHaveBeenCalledWith({ providerId: "clawhub", skillId: "ui-ux", version: "1.0.0" });
    expect(searchMock).not.toHaveBeenCalled();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].targets).toEqual(["claude_project_skills", "cursor_project_rules"]);
  });

  it("reports unknown providers with available provider ids", async () => {
    await expect(resolveSkillRefs([{ providerId: "unknown", skillId: "ui-ux" }], ["codex_repo_skills"]))
      .rejects.toThrow('Unknown provider "unknown". Available providers: anthropic, clawhub, awesome.');
  });
});

function makeCandidate(overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    providerScopedId: "clawhub:ui-ux",
    providerSkillId: "ui-ux",
    canonicalSkillId: "ui-ux",
    name: "UI UX",
    source: { providerId: "clawhub", publisher: "clawhub", version: "1.0.0" },
    summary: "Design guidance",
    tags: ["design"],
    compatibility: { assistants: ["claude", "cursor"] },
    metadata: {
      publisher: "clawhub",
      description: "Design guidance",
      trustLevel: "trusted",
      license: "MIT",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false },
    ...overrides
  };
}
