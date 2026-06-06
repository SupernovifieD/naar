import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher, type Headers as UndiciHeaders } from "undici";
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
  it("always uses the public GitHub catalog for search even when Anthropic env vars are set", async () => {
    process.env.ANTHROPIC_API_KEY = "fake-key";

    mockAnthropicGitHubSearch({
      skills: [{
        slug: "frontend-design",
        sha: "abc123",
        markdown: "---\nname: Frontend Design\ndescription: Polished frontend guidance\nlicense: MIT\n---\n\n# Frontend Design"
      }]
    });

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 3 });

    expect(result.mode).toBe("github");
    expect(result.warnings ?? []).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerScopedId).toBe("anthropic:frontend-design");
    expect(result.candidates[0].metadata.pinnedRef).toBe("abc123");
    mockAgent.assertNoPendingInterceptors();
  });

  it("does not warn when Anthropic API env vars are missing", async () => {
    mockAnthropicGitHubSearch({
      skills: [{
        slug: "copilot-instructions",
        sha: "def456",
        markdown: "# Copilot Instructions\n\nRepository instructions guidance."
      }]
    });

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 10 });

    expect(result.mode).toBe("github");
    expect(result.warnings?.some((warning) => warning.includes("ANTHROPIC_API_KEY"))).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerSkillId).toBe("copilot-instructions");
    mockAgent.assertNoPendingInterceptors();
  });

  it("always fetches files from the public GitHub repository even when Anthropic env vars are set", async () => {
    process.env.ANTHROPIC_API_KEY = "fake-key";

    mockAnthropicGitHubFiles({
      slug: "frontend-design",
      sha: "ghi789",
      files: {
        "SKILL.md": "---\nname: Frontend Design\ndescription: Build polished frontends\nlicense: MIT\n---\n\n# Frontend Design",
        "README.md": "# Notes\n\nExtra context."
      }
    });

    const provider = new OfficialAnthropicSkillsProvider();
    const bundle = await provider.fetchFiles({ providerId: "anthropic", skillId: "frontend-design", version: "1.2.3" });

    expect(bundle.files["SKILL.md"]).toContain("Frontend Design");
    expect(bundle.files["README.md"]).toContain("Extra context");
    expect(bundle.skill.providerScopedId).toBe("anthropic:frontend-design");
    expect(bundle.skill.metadata.license).toBe("MIT");
    mockAgent.assertNoPendingInterceptors();
  });

  it("uses GITHUB_TOKEN only for GitHub API requests", async () => {
    process.env.GITHUB_TOKEN = "github-token";

    let repoAuthHeader: string | undefined;
    let treeAuthHeader: string | undefined;

    const githubPool = mockAgent.get("https://api.github.com");
    const rawPool = mockAgent.get("https://raw.githubusercontent.com");

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills" })
      .reply((opts) => {
        repoAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            default_branch: "main",
            stargazers_count: 999,
            pushed_at: "2026-05-25T00:00:00.000Z"
          }
        };
      });

    githubPool
      .intercept({ method: "GET", path: "/repos/anthropics/skills/git/trees/main?recursive=1" })
      .reply((opts) => {
        treeAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            tree: [
              {
                path: "skills/frontend-design/SKILL.md",
                type: "blob",
                sha: "abc123"
              }
            ]
          }
        };
      });

    rawPool
      .intercept({
        method: "GET",
        path: "/anthropics/skills/main/skills/frontend-design/SKILL.md"
      })
      .reply(200, "# Frontend Design\n\nPolished frontend guidance.");

    const provider = new OfficialAnthropicSkillsProvider();
    const result = await provider.search({ repoFacts, limit: 10 });

    expect(result.candidates).toHaveLength(1);
    expect(repoAuthHeader).toBe("Bearer github-token");
    expect(treeAuthHeader).toBe("Bearer github-token");
    mockAgent.assertNoPendingInterceptors();
  });
});

function mockAnthropicGitHubSearch(input: {
  skills: Array<{
    slug: string;
    sha: string;
    markdown: string;
  }>;
}): void {
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
      tree: input.skills.map((skill) => ({
        path: `skills/${skill.slug}/SKILL.md`,
        type: "blob",
        sha: skill.sha
      }))
    });

  for (const skill of input.skills) {
    rawPool
      .intercept({
        method: "GET",
        path: `/anthropics/skills/main/skills/${skill.slug}/SKILL.md`
      })
      .reply(200, skill.markdown);
  }
}

function mockAnthropicGitHubFiles(input: {
  slug: string;
  sha: string;
  files: Record<string, string>;
}): void {
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
      tree: Object.keys(input.files).map((relativePath, index) => ({
        path: `skills/${input.slug}/${relativePath}`,
        type: "blob",
        sha: `${input.sha}-${index}`
      }))
    });

  for (const [relativePath, content] of Object.entries(input.files)) {
    rawPool
      .intercept({
        method: "GET",
        path: `/anthropics/skills/main/skills/${input.slug}/${relativePath}`
      })
      .reply(200, content);
  }
}

function readHeader(
  headers: UndiciHeaders | Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}
