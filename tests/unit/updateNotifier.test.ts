import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareVersions, maybeNotifyUpdate } from "../../src/utils/updateNotifier.js";

type MaybeNotifyUpdateTestOptions = Parameters<typeof maybeNotifyUpdate>[0];

const NOW = 1_000_000;

let cacheFilePath: string;
let stdout: ReturnType<typeof createOutputCapture>;
let stderr: ReturnType<typeof createOutputCapture>;
let fetchImpl: ReturnType<typeof vi.fn>;
let runInstallCommand: ReturnType<typeof vi.fn>;
let prompt: ReturnType<typeof vi.fn>;
let stdin: { isTTY: boolean };
const tempDirs: string[] = [];

beforeEach(async () => {
  cacheFilePath = await createCacheFilePath();
  stdout = createOutputCapture(true);
  stderr = createOutputCapture(true);
  fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({ version: "0.4.0" }));
  runInstallCommand = vi.fn().mockResolvedValue(undefined);
  prompt = vi.fn().mockResolvedValue(false);
  stdin = { isTTY: false };
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function runMaybeNotifyUpdate(
  overrides: Partial<MaybeNotifyUpdateTestOptions> = {}
) {
  return maybeNotifyUpdate({
    currentVersion: "0.4.0",
    nonInteractive: true,
    commandArgs: ["scan"],
    cacheFilePath,
    stdout,
    stderr,
    fetchImpl,
    runInstallCommand,
    prompt,
    stdin,
    env: {},
    now: () => NOW,
    ...overrides
  });
}

describe("maybeNotifyUpdate", () => {
  it("prints nothing when the latest version equals the current version", async () => {
    fetchImpl.mockResolvedValue(makeFetchResponse({ version: "0.4.0" }));

    await runMaybeNotifyUpdate();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(stdout.output).toBe("");
  });

  it("prints the update message when a newer version exists", async () => {
    fetchImpl.mockResolvedValue(makeFetchResponse({ version: "0.5.0" }));

    await runMaybeNotifyUpdate();

    expect(stdout.output).toBe(
      "A new version of Naar is available:\n"
      + "0.4.0 → 0.5.0\n\n"
      + "Update with:\n"
      + "npm install -g naar-cli@latest\n"
    );
  });

  it("does not print or fetch in json mode", async () => {
    await runMaybeNotifyUpdate({
      jsonMode: true,
      commandArgs: ["scan", "--json"],
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch in CI", async () => {
    await runMaybeNotifyUpdate({
      env: { CI: "1" },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch when disabled by environment variables", async () => {
    await runMaybeNotifyUpdate({
      env: { NAAR_NO_UPDATE_NOTIFIER: "1" },
    });

    await runMaybeNotifyUpdate({
      env: { NO_UPDATE_NOTIFIER: "1" },
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch for help/version or non-tty output", async () => {
    const helpStdout = createOutputCapture(true);
    await runMaybeNotifyUpdate({
      commandArgs: ["--help"],
      stdout: helpStdout,
    });

    const versionStdout = createOutputCapture(true);
    await runMaybeNotifyUpdate({
      commandArgs: ["--version"],
      stdout: versionStdout,
    });

    const nonTtyStdout = createOutputCapture(false);
    await runMaybeNotifyUpdate({
      stdout: nonTtyStdout,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(helpStdout.output).toBe("");
    expect(versionStdout.output).toBe("");
    expect(nonTtyStdout.output).toBe("");
  });

  it("uses a fresh cache without making a network request", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "naar-update-cache-"));
    tempDirs.push(dir);
    const cacheFilePath = path.join(dir, "update-check.json");
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, JSON.stringify({
      lastCheckedAt: 1_000,
      latestVersion: "0.5.0"
    }), "utf8");

    await runMaybeNotifyUpdate({
      cacheFilePath,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toContain("0.4.0 → 0.5.0");
  });

  it("swallows network and cache failures", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "naar-update-error-"));
    tempDirs.push(dir);
    fetchImpl.mockRejectedValue(new Error("network down"));

    await expect(runMaybeNotifyUpdate({
      cacheFilePath: dir,
      fetchImpl
    })).resolves.toBeUndefined();

    expect(stdout.output).toBe("");
  });

  it("runs the explicit npm install command only when the user confirms", async () => {
    fetchImpl.mockResolvedValue(makeFetchResponse({ version: "0.5.0" }));

    await runMaybeNotifyUpdate({
      nonInteractive: false,
      stdin: { isTTY: true },
      prompt: vi.fn().mockResolvedValue(true),
      runInstallCommand
    });

    expect(runInstallCommand).toHaveBeenCalledWith("npm", ["install", "-g", "naar-cli@latest"]);

    runInstallCommand.mockReset();
    stdout.output = "";

    await runMaybeNotifyUpdate({
      nonInteractive: false,
      stdout,
      stdin: { isTTY: true },
      fetchImpl,
      prompt: vi.fn().mockResolvedValue(false),
      runInstallCommand
    });

    expect(runInstallCommand).not.toHaveBeenCalled();
  });
});

describe("compareVersions", () => {
  it("compares patch, minor, major, and prerelease versions safely", () => {
    expect(compareVersions("0.4.1", "0.4.0")).toBeGreaterThan(0);
    expect(compareVersions("0.5.0", "0.4.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0-beta.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0-beta.1")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
  });
});

function createOutputCapture(isTTY: boolean): { isTTY: boolean; output: string; write(chunk: string): true } {
  return {
    isTTY,
    output: "",
    write(chunk: string) {
      this.output += chunk;
      return true;
    }
  };
}

function makeFetchResponse(value: unknown): { ok: true; status: number; json(): Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    async json() {
      return value;
    }
  };
}

async function createCacheFilePath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "naar-update-cache-"));
  tempDirs.push(dir);
  return path.join(dir, "update-check.json");
}
