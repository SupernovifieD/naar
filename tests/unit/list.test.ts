import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliFlags, InstalledSkillRecord } from "../../src/types/index.js";

const loadInstalledStateMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/installer/state.js", () => ({
  loadInstalledState: loadInstalledStateMock
}));

import { runList } from "../../src/commands/list.js";

const baseFlags: CliFlags = {
  repo: "/tmp/repo",
  provider: [],
  target: [],
  json: false,
  compact: false,
  apply: false,
  dryRun: false,
  yes: false,
  nonInteractive: false,
  noScripts: true,
  allowRisky: false,
  minSecurityScore: 80,
  force: false,
  verbose: false,
  allCompatible: false
};

const originalWrite = process.stdout.write;
let captured = "";

beforeEach(() => {
  captured = "";
  vi.clearAllMocks();
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

describe("runList", () => {
  it("renders concise default installed-skill cards without managed file paths", async () => {
    loadInstalledStateMock.mockResolvedValue({
      version: 1,
      skills: [makeInstalledSkill()]
    });

    captureStdout();
    await runList(baseFlags);
    const output = stripAnsi(captured);

    expect(output).toContain("Installed skills: 1");
    expect(output).toContain("1. secure-skill [test]");
    expect(output).toContain("Version 1.0.0");
    expect(output).toContain("Targets codex_repo_skills");
    expect(output).toContain("Installed 2026-06-03");
    expect(output).toContain("Next: run naar list --verbose to see managed files.");
    expect(output).not.toContain("Managed files");
    expect(output).not.toContain(".agents/skills/secure-skill/SKILL.md");
  });

  it("renders verbose provenance and managed file details", async () => {
    loadInstalledStateMock.mockResolvedValue({
      version: 1,
      skills: [makeInstalledSkill()]
    });

    captureStdout();
    await runList({ ...baseFlags, verbose: true });
    const output = stripAnsi(captured);

    expect(output).toContain("Provider scoped ID: test:secure-skill");
    expect(output).toContain("Provider skill ID: secure-skill");
    expect(output).toContain("Pinned ref: 1.0.0");
    expect(output).toContain("Security score at install: 100/100");
    expect(output).toContain("Managed files: .agents/skills/secure-skill/SKILL.md");
  });

  it("renders the empty state and next step when no skills are installed", async () => {
    loadInstalledStateMock.mockResolvedValue({
      version: 1,
      skills: []
    });

    captureStdout();
    await runList(baseFlags);
    const output = stripAnsi(captured);

    expect(output).toContain("No skills installed by Naar.");
    expect(output).toContain("Next: run naar go");
  });
});

function makeInstalledSkill(): InstalledSkillRecord {
  return {
    providerScopedId: "test:secure-skill",
    canonicalSkillId: "secure-skill",
    providerId: "test",
    providerSkillId: "secure-skill",
    installedAtIso: "2026-06-03T00:00:00.000Z",
    installedVersion: "1.0.0",
    pinnedRef: "1.0.0",
    targets: ["codex_repo_skills"],
    managedFiles: [".agents/skills/secure-skill/SKILL.md"],
    securityScoreAtInstall: 100
  };
}

function captureStdout(): void {
  captured = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
