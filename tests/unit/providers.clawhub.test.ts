import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { ClawHubProvider } from "../../src/providers/clawhub.js";
import type { RepoFacts } from "../../src/types/index.js";

const repoFacts: RepoFacts = {
  repoRoot: "/tmp/repo",
  scanTimeIso: "2026-05-29T00:00:00.000Z",
  languages: ["TypeScript"],
  packageManagers: [],
  frameworks: [{ id: "nextjs", category: "frontend", confidence: 0.95, evidence: ["next.config.mjs"] }],
  aiAssistants: [],
  findings: [],
  topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
  readiness: { score: 80, grade: "Good", missingCapabilities: [] }
};

let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;
let previousToken: string | undefined;

beforeEach(() => {
  previousDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  previousToken = process.env.CLAWHUB_API_TOKEN;
  delete process.env.CLAWHUB_API_TOKEN;
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(previousDispatcher);

  if (typeof previousToken === "string") {
    process.env.CLAWHUB_API_TOKEN = previousToken;
  } else {
    delete process.env.CLAWHUB_API_TOKEN;
  }
});

describe("ClawHubProvider", () => {
  it("uses public mode and maps skill metadata", async () => {
    const pool = mockAgent.get("https://clawhub.ai");

    pool
      .intercept({ method: "GET", path: "/api/v1/skills?limit=10&nonSuspiciousOnly=true" })
      .reply(200, {
        items: [{ slug: "kiln", displayName: "Kiln" }],
        nextCursor: "cursor-1"
      });

    pool
      .intercept({ method: "GET", path: "/api/v1/search?q=nextjs&limit=10&nonSuspiciousOnly=true" })
      .reply(200, {
        results: []
      });

    pool
      .intercept({ method: "GET", path: "/api/v1/skills/kiln" })
      .reply(200, {
        skill: {
          slug: "kiln",
          displayName: "Kiln",
          summary: "Frontend rules for Next.js and Tailwind",
          tags: {
            nextjs: "nextjs",
            tailwind: "tailwind"
          },
          stats: {
            downloads: 120,
            stars: 7
          },
          updatedAt: 1748000000000
        },
        latestVersion: {
          version: "1.1.6",
          createdAt: 1747900000000,
          license: "MIT"
        },
        owner: {
          handle: "openclaw"
        },
        moderation: {
          isSuspicious: false,
          isMalwareBlocked: false
        }
      });

    pool
      .intercept({ method: "GET", path: "/api/v1/skills/kiln/scan?version=1.1.6" })
      .reply(200, {
        security: {
          status: "ok"
        }
      });

    const provider = new ClawHubProvider();
    const result = await provider.search({ repoFacts, limit: 10 });

    expect(result.mode).toBe("public");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].providerScopedId).toBe("clawhub:kiln");
    expect(result.candidates[0].source.version).toBe("1.1.6");
    expect(result.candidates[0].metadata.license).toBe("MIT");
    expect(result.candidates[0].metadata.trustLevel).toBe("trusted");
  });

  it("switches to token mode when CLAWHUB_API_TOKEN is set", async () => {
    process.env.CLAWHUB_API_TOKEN = "clawhub-token";

    const pool = mockAgent.get("https://clawhub.ai");
    pool
      .intercept({ method: "GET", path: "/api/v1/skills?limit=5&nonSuspiciousOnly=true" })
      .reply(200, { items: [], nextCursor: null });

    pool
      .intercept({ method: "GET", path: "/api/v1/search?q=nextjs&limit=5&nonSuspiciousOnly=true" })
      .reply(200, { results: [] });

    const provider = new ClawHubProvider();
    const result = await provider.search({ repoFacts, limit: 5 });

    expect(result.mode).toBe("token");
    expect(result.candidates).toHaveLength(0);
  });

  it("fetches ZIP bundles and extracts security-relevant metadata", async () => {
    const pool = mockAgent.get("https://clawhub.ai");

    pool
      .intercept({ method: "GET", path: "/api/v1/skills/kiln" })
      .reply(200, {
        skill: {
          slug: "kiln",
          displayName: "Kiln",
          summary: "Skill summary",
          tags: {},
          stats: {
            downloads: 1,
            stars: 1
          },
          updatedAt: 1748000000000
        },
        latestVersion: {
          version: "1.1.6",
          createdAt: 1747900000000,
          license: "MIT"
        },
        owner: {
          handle: "openclaw"
        },
        moderation: {
          isSuspicious: false,
          isMalwareBlocked: false
        }
      });

    pool
      .intercept({ method: "GET", path: "/api/v1/skills/kiln/scan?version=1.1.6" })
      .reply(200, {
        security: { status: "ok" }
      });

    const zip = new JSZip();
    zip.file("SKILL.md", "# Kiln\n\nUse with care.");
    zip.file("scripts/install.sh", "#!/usr/bin/env bash\necho install");
    zip.file("package.json", "{\"name\":\"kiln\"}");
    zip.file("bin/tool.bin", Uint8Array.from([0, 255, 10, 0]));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    pool
      .intercept({ method: "GET", path: "/api/v1/download?slug=kiln&version=1.1.6" })
      .reply(200, bytes, {
        headers: {
          "content-type": "application/zip"
        }
      });

    const provider = new ClawHubProvider();
    const bundle = await provider.fetchFiles({ providerId: "clawhub", skillId: "kiln", version: "1.1.6" });

    expect(bundle.files["SKILL.md"]).toContain("Kiln");
    expect(bundle.skill.metadata.hasScripts).toBe(true);
    expect(bundle.skill.metadata.hasPackageManifests).toBe(true);
    expect(bundle.skill.metadata.hasBinaries).toBe(true);
  });
});
