import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { buildInstalledRecord, loadInstalledState } from "../../src/installer/state.js";
import type { SkillCandidate } from "../../src/types/index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("installed state", () => {
  it("migrates records to providerScopedId on load", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-state-"));
    tempRoots.push(repoRoot);

    const dir = path.join(repoRoot, ".naar");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "installed.json"), JSON.stringify({
      version: 1,
      skills: [
        {
          canonicalSkillId: "frontend-design",
          providerId: "anthropic",
          providerSkillId: "frontend-design",
          installedAtIso: "2026-05-20T00:00:00.000Z",
          installedVersion: "1.0.0",
          pinnedRef: "abc123",
          targets: ["claude_project_skills"],
          managedFiles: [".claude/skills/frontend-design/SKILL.md"],
          securityScoreAtInstall: 96
        }
      ]
    }), "utf8");

    const state = await loadInstalledState(repoRoot);
    expect(state.skills).toHaveLength(1);
    expect(state.skills[0].providerScopedId).toBe("anthropic:frontend-design");
  });

  it("buildInstalledRecord writes providerScopedId", () => {
    const candidate: SkillCandidate = {
      providerSkillId: "frontend-design",
      canonicalSkillId: "frontend-design",
      name: "Frontend Design",
      source: {
        providerId: "anthropic",
        version: "1.2.0",
        ref: "frontend-design@1.2.0",
        publisher: "Anthropic"
      },
      summary: "Frontend guidance",
      tags: ["nextjs"],
      compatibility: {
        assistants: ["claude"]
      },
      metadata: {
        hasScripts: false,
        hasBinaries: false,
        hasPackageManifests: false,
        pinnedRef: "1.2.0",
        trustLevel: "official"
      },
      risk: {
        score: 96,
        level: "low",
        signals: [],
        requiresOverride: false
      }
    };

    const record = buildInstalledRecord(candidate, [".claude/skills/frontend-design/SKILL.md"], ["claude_project_skills"]);
    expect(record.providerScopedId).toBe("anthropic:frontend-design");
  });
});
