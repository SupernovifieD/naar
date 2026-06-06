import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher, type Headers as UndiciHeaders } from "undici";
import { AwesomeAgentSkillsProvider } from "../../src/providers/awesome.js";

let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;
let previousEnv: Record<string, string | undefined>;

const ENV_KEYS = ["GITHUB_TOKEN", "GITHUB_API_BASE_URL"] as const;

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

describe("AwesomeAgentSkillsProvider", () => {
  it("parses Awesome README entries during search", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Skills by Stripe Team
- **[stripe/stripe-best-practices](https://officialskills.sh/stripe/skills/stripe-best-practices)** - Best practices for building Stripe integrations

### Skills by Angular
- **[angular/angular-developer](https://github.com/angular/skills)** - Generate Angular code and architectural guidance

### Community Skills
- **[community/example-skill](https://github.com/example/example-skill)** - Helpful community skill
`);

    const provider = new AwesomeAgentSkillsProvider();
    const result = await provider.search({ limit: 10 });

    expect(result.mode).toBe("awesome-index");
    expect(result.providerId).toBe("awesome");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].providerScopedId).toBe("awesome:stripe/stripe-best-practices");
    expect(result.candidates.find((candidate) => candidate.providerSkillId === "stripe/stripe-best-practices")?.metadata.trustLevel).toBe("official");
    expect(result.candidates.find((candidate) => candidate.providerSkillId === "angular/angular-developer")?.metadata.trustLevel).toBe("official");
    expect(result.candidates.find((candidate) => candidate.providerSkillId === "community/example-skill")?.metadata.trustLevel).toBe("unknown");
    mockAgent.assertNoPendingInterceptors();
  });

  it("filters all parsed entries before applying the search limit", async () => {
    const readme = [
      "# Awesome Agent Skills",
      "",
      "### Skills by Builders",
      ...Array.from({ length: 12 }, (_, index) =>
        `- **[builder/skill-${index + 1}](https://github.com/example/skill-${index + 1})** - Ordinary builder skill ${index + 1}`
      ),
      "- **[deep/deep-match](https://github.com/example/deep-match)** - Precise deep-match support for tough repositories"
    ].join("\n");

    mockAwesomeIndex(readme);

    const provider = new AwesomeAgentSkillsProvider();
    const result = await provider.search({ mode: "search", term: "deep-match", limit: 5 });

    expect(result.candidates.map((candidate) => candidate.providerSkillId)).toContain("deep/deep-match");
    mockAgent.assertNoPendingInterceptors();
  });

  it("does not fetch officialskills pages during search", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Skills by Stripe Team
- **[stripe/stripe-best-practices](https://officialskills.sh/stripe/skills/stripe-best-practices)** - Best practices for building Stripe integrations
`);

    const provider = new AwesomeAgentSkillsProvider();
    const result = await provider.search({ mode: "search", term: "stripe", limit: 5 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerSkillId).toBe("stripe/stripe-best-practices");
    mockAgent.assertNoPendingInterceptors();
  });

  it("fetches files from a direct GitHub repo root", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Official
- **[example/root-skill](https://github.com/example/root-skill)** - Root skill
`);
    mockGitHubRepo({
      owner: "example",
      repo: "root-skill",
      tree: [
        { path: "SKILL.md", sha: "root-skill-md" },
        { path: "README.md", sha: "root-readme" }
      ],
      rawFiles: {
        "SKILL.md": "---\nname: Root Skill\ndescription: Root repo skill\nlicense: MIT\n---\n\n# Root Skill",
        "README.md": "# Root Skill\n\nMore details."
      }
    });

    const provider = new AwesomeAgentSkillsProvider();
    const bundle = await provider.fetchFiles({ providerId: "awesome", skillId: "example/root-skill" });

    expect(bundle.files["SKILL.md"]).toContain("Root Skill");
    expect(bundle.files["README.md"]).toContain("More details.");
    expect(bundle.skill.source.url).toBe("https://github.com/example/root-skill");
    expect(bundle.skill.providerScopedId).toBe("awesome:example/root-skill");
    mockAgent.assertNoPendingInterceptors();
  });

  it("fetches files from a GitHub tree URL and returns relative paths", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Official
- **[example/tree-skill](https://github.com/example/skills/tree/main/skills/tree-skill)** - Tree skill
`);
    mockGitHubRepo({
      owner: "example",
      repo: "skills",
      tree: [
        { path: "skills/tree-skill/SKILL.md", sha: "tree-skill-md" },
        { path: "skills/tree-skill/README.md", sha: "tree-readme" }
      ],
      rawFiles: {
        "skills/tree-skill/SKILL.md": "---\nname: Tree Skill\ndescription: Tree repo skill\n---\n\n# Tree Skill",
        "skills/tree-skill/README.md": "# Tree Skill\n\nTree details."
      }
    });

    const provider = new AwesomeAgentSkillsProvider();
    const bundle = await provider.fetchFiles({ providerId: "awesome", skillId: "example/tree-skill" });

    expect(Object.keys(bundle.files)).toEqual(["SKILL.md", "README.md"]);
    expect(bundle.skill.source.url).toBe("https://github.com/example/skills/tree/main/skills/tree-skill");
    mockAgent.assertNoPendingInterceptors();
  });

  it("resolves officialskills pages to GitHub before fetching files", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Skills by Anthropics Team
- **[anthropics/docx](https://officialskills.sh/anthropics/skills/docx)** - Create, edit, and analyze Word documents
`);

    const officialPool = mockAgent.get("https://officialskills.sh");
    officialPool
      .intercept({ method: "GET", path: "/anthropics/skills/docx" })
      .reply(200, `
        npx skills add https://github.com/anthropics/skills --skill docx
        https://github.com/anthropics/skills/tree/main/skills/docx
      `);

    mockGitHubRepo({
      owner: "anthropics",
      repo: "skills",
      tree: [
        { path: "skills/docx/SKILL.md", sha: "docx-md" },
        { path: "skills/docx/README.md", sha: "docx-readme" }
      ],
      rawFiles: {
        "skills/docx/SKILL.md": "---\nname: DOCX\ndescription: Work with Word documents\n---\n\n# DOCX",
        "skills/docx/README.md": "# DOCX\n\nDocs."
      }
    });

    const provider = new AwesomeAgentSkillsProvider();
    const bundle = await provider.fetchFiles({ providerId: "awesome", skillId: "anthropics/docx" });

    expect(bundle.files["SKILL.md"]).toContain("DOCX");
    expect(bundle.skill.source.url).toBe("https://github.com/anthropics/skills/tree/main/skills/docx");
    expect(bundle.skill.providerScopedId).toBe("awesome:anthropics/docx");
    mockAgent.assertNoPendingInterceptors();
  });

  it("fails clearly for unsupported public sources", async () => {
    mockAwesomeIndex(`# Awesome Agent Skills

### Community Skills
- **[example/site-skill](https://example.com/skill)** - Site skill
`);

    const provider = new AwesomeAgentSkillsProvider();

    await expect(provider.fetchFiles({ providerId: "awesome", skillId: "example/site-skill" }))
      .rejects.toThrow('Awesome Agent Skills entry "example/site-skill" does not expose a supported public GitHub skill source.');
    mockAgent.assertNoPendingInterceptors();
  });

  it("uses GITHUB_TOKEN only for GitHub API requests", async () => {
    process.env.GITHUB_TOKEN = "github-token";

    let awesomeRepoAuthHeader: string | undefined;
    let targetRepoAuthHeader: string | undefined;
    let targetTreeAuthHeader: string | undefined;
    let rawAuthHeader: string | undefined;

    const githubPool = mockAgent.get("https://api.github.com");
    const rawPool = mockAgent.get("https://raw.githubusercontent.com");

    githubPool
      .intercept({ method: "GET", path: "/repos/VoltAgent/awesome-agent-skills" })
      .reply((opts) => {
        awesomeRepoAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            default_branch: "main",
            stargazers_count: 1234,
            pushed_at: "2026-06-01T00:00:00.000Z"
          }
        };
      });

    rawPool
      .intercept({ method: "GET", path: "/VoltAgent/awesome-agent-skills/main/README.md" })
      .reply((opts) => {
        rawAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: `# Awesome Agent Skills

### Official
- **[example/root-skill](https://github.com/example/root-skill)** - Root skill
`
        };
      });

    githubPool
      .intercept({ method: "GET", path: "/repos/example/root-skill" })
      .reply((opts) => {
        targetRepoAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            default_branch: "main",
            stargazers_count: 99,
            pushed_at: "2026-06-02T00:00:00.000Z"
          }
        };
      });

    githubPool
      .intercept({ method: "GET", path: "/repos/example/root-skill/git/trees/main?recursive=1" })
      .reply((opts) => {
        targetTreeAuthHeader = readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            tree: [
              { path: "SKILL.md", type: "blob", sha: "root-skill-md" }
            ]
          }
        };
      });

    rawPool
      .intercept({ method: "GET", path: "/example/root-skill/main/SKILL.md" })
      .reply((opts) => {
        rawAuthHeader = rawAuthHeader ?? readHeader(opts.headers, "authorization");
        return {
          statusCode: 200,
          data: "---\nname: Root Skill\ndescription: Root repo skill\n---\n\n# Root Skill"
        };
      });

    const provider = new AwesomeAgentSkillsProvider();
    const bundle = await provider.fetchFiles({ providerId: "awesome", skillId: "example/root-skill" });

    expect(bundle.files["SKILL.md"]).toContain("Root Skill");
    expect(awesomeRepoAuthHeader).toBe("Bearer github-token");
    expect(targetRepoAuthHeader).toBe("Bearer github-token");
    expect(targetTreeAuthHeader).toBe("Bearer github-token");
    expect(rawAuthHeader).toBeUndefined();
    mockAgent.assertNoPendingInterceptors();
  });
});

function mockAwesomeIndex(readme: string): void {
  const githubPool = mockAgent.get("https://api.github.com");
  const rawPool = mockAgent.get("https://raw.githubusercontent.com");

  githubPool
    .intercept({ method: "GET", path: "/repos/VoltAgent/awesome-agent-skills" })
    .reply(200, {
      default_branch: "main",
      stargazers_count: 1234,
      pushed_at: "2026-06-01T00:00:00.000Z"
    });

  rawPool
    .intercept({ method: "GET", path: "/VoltAgent/awesome-agent-skills/main/README.md" })
    .reply(200, readme);
}

function mockGitHubRepo(input: {
  owner: string;
  repo: string;
  tree: Array<{ path: string; sha: string }>;
  rawFiles: Record<string, string>;
}): void {
  const githubPool = mockAgent.get("https://api.github.com");
  const rawPool = mockAgent.get("https://raw.githubusercontent.com");

  githubPool
    .intercept({ method: "GET", path: `/repos/${input.owner}/${input.repo}` })
    .reply(200, {
      default_branch: "main",
      stargazers_count: 77,
      pushed_at: "2026-06-02T00:00:00.000Z",
      license: {
        spdx_id: "MIT"
      }
    });

  githubPool
    .intercept({ method: "GET", path: `/repos/${input.owner}/${input.repo}/git/trees/main?recursive=1` })
    .reply(200, {
      tree: input.tree.map((entry) => ({
        ...entry,
        type: "blob"
      }))
    });

  for (const [filePath, content] of Object.entries(input.rawFiles)) {
    rawPool
      .intercept({ method: "GET", path: `/${input.owner}/${input.repo}/main/${filePath}` })
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
