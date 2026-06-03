import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliFlags, InstalledSkillRecord, NaarLock } from "../../src/types/index.js";

const loadInstalledStateMock = vi.hoisted(() => vi.fn());
const loadLockfileMock = vi.hoisted(() => vi.fn());
const saveInstalledStateMock = vi.hoisted(() => vi.fn());
const saveLockfileMock = vi.hoisted(() => vi.fn());
const uninstallManagedFilesMock = vi.hoisted(() => vi.fn());
const recordUninstallHistoryMock = vi.hoisted(() => vi.fn());
const printJsonMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const checkboxMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/installer/state.js", () => ({
  loadInstalledState: loadInstalledStateMock,
  loadLockfile: loadLockfileMock,
  saveInstalledState: saveInstalledStateMock,
  saveLockfile: saveLockfileMock
}));

vi.mock("../../src/installer/apply.js", () => ({
  uninstallManagedFiles: uninstallManagedFilesMock
}));

vi.mock("../../src/history/historyService.js", () => ({
  recordUninstallHistory: recordUninstallHistoryMock
}));

vi.mock("../../src/utils/json.js", () => ({
  printJson: printJsonMock
}));

vi.mock("@inquirer/prompts", () => ({
  checkbox: checkboxMock,
  confirm: confirmMock
}));

import { runUninstall } from "../../src/commands/uninstall.js";

const baseFlags: CliFlags = {
  repo: "/tmp/repo",
  provider: [],
  target: [],
  json: false,
  compact: false,
  apply: false,
  dryRun: false,
  yes: true,
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

afterEach(() => {
  process.stdout.write = originalWrite;
});

beforeEach(() => {
  captured = "";
  vi.clearAllMocks();
  loadInstalledStateMock.mockResolvedValue({ version: 1, skills: [skillOne(), skillTwo()] });
  loadLockfileMock.mockResolvedValue({ version: 1, skills: [lockSkill("skill-one"), lockSkill("skill-two")] });
  saveInstalledStateMock.mockResolvedValue(undefined);
  saveLockfileMock.mockResolvedValue(undefined);
  uninstallManagedFilesMock.mockResolvedValue([".agents/skills/skill-one/SKILL.md"]);
  recordUninstallHistoryMock.mockResolvedValue({ recorded: true, disabled: false });
  printJsonMock.mockImplementation(() => undefined);
  confirmMock.mockResolvedValue(true);
  checkboxMock.mockResolvedValue(["skill-one"]);
});

describe("runUninstall history lifecycle", () => {
  it("records uninstall history after successful project-local state updates", async () => {
    await runUninstall(baseFlags, ["skill-one"]);

    expect(uninstallManagedFilesMock).toHaveBeenCalledWith("/tmp/repo", expect.any(Object), ["skill-one"]);
    expect(saveInstalledStateMock).toHaveBeenCalledWith("/tmp/repo", {
      version: 1,
      skills: [skillTwo()]
    });
    expect(saveLockfileMock).toHaveBeenCalledWith("/tmp/repo", {
      version: 1,
      skills: [lockSkill("skill-two")]
    });
    expect(recordUninstallHistoryMock).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      remainingInstalledSkills: [skillTwo()],
      uninstalledSkills: [skillOne()],
      history: undefined
    });
  });

  it("does not record history for dry-run uninstalls", async () => {
    await runUninstall({ ...baseFlags, dryRun: true }, ["skill-one"]);

    expect(uninstallManagedFilesMock).not.toHaveBeenCalled();
    expect(saveInstalledStateMock).not.toHaveBeenCalled();
    expect(recordUninstallHistoryMock).not.toHaveBeenCalled();
  });

  it("does not record history for JSON previews without apply", async () => {
    await runUninstall({ ...baseFlags, json: true, apply: false }, ["skill-one"]);

    expect(printJsonMock).toHaveBeenCalledWith(expect.objectContaining({ selected: ["skill-one"] }));
    expect(uninstallManagedFilesMock).not.toHaveBeenCalled();
    expect(recordUninstallHistoryMock).not.toHaveBeenCalled();
  });

  it("keeps uninstall successful when history recording fails", async () => {
    recordUninstallHistoryMock.mockRejectedValueOnce(new Error("history failed"));
    captureStdout();

    await runUninstall(baseFlags, ["skill-one"]);

    expect(saveInstalledStateMock).toHaveBeenCalledTimes(1);
    expect(stripAnsi(captured)).toContain("Uninstall complete");
    expect(stripAnsi(captured)).toContain("Uninstall succeeded, but Naar could not update local history.");
  });
});

function skillOne(): InstalledSkillRecord {
  return makeInstalledSkill("skill-one");
}

function skillTwo(): InstalledSkillRecord {
  return makeInstalledSkill("skill-two");
}

function makeInstalledSkill(canonicalSkillId: string): InstalledSkillRecord {
  return {
    providerScopedId: `test:${canonicalSkillId}`,
    canonicalSkillId,
    providerId: "test",
    providerSkillId: canonicalSkillId,
    installedAtIso: "2026-06-03T00:00:00.000Z",
    installedVersion: "1.0.0",
    pinnedRef: "1.0.0",
    targets: ["codex_repo_skills"],
    managedFiles: [`.agents/skills/${canonicalSkillId}/SKILL.md`],
    securityScoreAtInstall: 100
  };
}

function lockSkill(canonicalSkillId: string): NaarLock["skills"][number] {
  return {
    canonicalSkillId,
    providerId: "test",
    providerSkillId: canonicalSkillId,
    pinnedRef: "1.0.0",
    installedVersion: "1.0.0",
    installedAtIso: "2026-06-03T00:00:00.000Z"
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
