import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { OfficialAnthropicSkillsProvider } from "../../src/providers/anthropic.js";
import type { RepoFacts } from "../../src/types/index.js";

const repoFacts: RepoFacts = {
  repoRoot: "/tmp/repo",
  scanTimeIso: "2026-05-29T00:00:00.000Z",
  languages: ["TypeScript"],
  packageManagers: [],
  frameworks: [],
  aiAssistants: [],
  findings: [],
  topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
  readiness: { score: 70, grade: "Good", missingCapabilities: [] }
};

let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_BASE_URL",
  "ANTHROPIC_API_VERSION",
  "ANTHROPIC_BETA_HEADERS",
  "GITHUB_TOKEN",
  "GITHUB_API_BASE_URL"
] as const;

let previousEnv: Record<string, string | undefined>;

beforeEach(() => {
  previousDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(previousDispatcher);

  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("OfficialAnthropicSkillsProvider", () => {
  it("uses Anthropic API mode when API key is present", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const anthropicPool = mockAgent.get("https://api.anthropic.com");
    anthropicPool
      .intercept({ method: "GET", path: "/v1/skills?limit=3" })
      .reply(200, {
        data: [
          {
            id: "official/frontend-design",
            name: "Frontend Design",
            description: "Guidance for React + Next.js + Tailwind",
            tags: ["react", "nextjs", "tailwind"],
            latest_version: {
              version: "1.2.3",
              license: "MIT",
              updated_at: "2026-05-20T00:00:00.000Z"
            }
          }
        ]
      });

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 3 });

    expect(result.mode).toBe("api");
    expect(result.warnings ?? []).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerScopedId).toBe("anthropic:official/frontend-design");
    expect(result.candidates[0].metadata.pinnedRef).toBe("1.2.3");
  });

  it("falls back to GitHub catalog when API key is missing", async () => {
    const githubPool = mockAgent.get("https://api.github.com");
    const rawPool = mockAgent.get("https://raw.githubusercontent.com");

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills" })
      .reply(200, {
        default_branch: "main",
        stargazers_count: 999,
        pushed_at: "2026-05-25T00:00:00.000Z"
      });

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills/git/trees/main?recursive=1" })
      .reply(200, {
        tree: [
          {
            path: "skills/frontend-design/SKILL.md",
            type: "blob",
            sha: "abc123"
          }
        ]
      });

    rawPool
      .intercept({
        method: "GET",
        path: "/anthropics/skills/main/skills/frontend-design/SKILL.md"
      })
      .reply(200, "---\nname: Frontend Design\ndescription: Polished frontend guidance\n---\n\n# Frontend Design");

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 10 });

    expect(result.mode).toBe("github_fallback");
    expect(result.warnings?.some((warning) => warning.includes("ANTHROPIC_API_KEY not set"))).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerSkillId).toBe("frontend-design");
    expect(result.candidates[0].metadata.pinnedRef).toBe("abc123");
  });

  it("falls back to GitHub when Anthropic API fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const anthropicPool = mockAgent.get("https://api.anthropic.com");
    const githubPool = mockAgent.get("https://api.github.com");
    const rawPool = mockAgent.get("https://raw.githubusercontent.com");

    anthropicPool
      .intercept({ method: "GET", path: "/v1/skills?limit=5" })
      .reply(503, { error: "unavailable" });

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills" })
      .reply(200, {
        default_branch: "main",
        stargazers_count: 1000,
        pushed_at: "2026-05-25T00:00:00.000Z"
      });

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills/git/trees/main?recursive=1" })
      .reply(200, {
        tree: [
          {
            path: "skills/copilot-instructions/SKILL.md",
            type: "blob",
            sha: "def456"
          }
        ]
      });

    rawPool
      .intercept({
        method: "GET",
        path: "/anthropics/skills/main/skills/copilot-instructions/SKILL.md"
      })
      .reply(200, "# Copilot Instructions\n\nRepository instructions guidance.");

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 5 });

    expect(result.mode).toBe("github_fallback");
    expect(result.candidates).toHaveLength(1);
    expect(result.warnings?.some((warning) => warning.includes("falling back to GitHub catalog"))).toBe(true);
  });
});
