import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compareVersions, maybeNotifyUpdate } from "../../src/utils/updateNotifier.js";

describe("maybeNotifyUpdate", () => {
  it("prints nothing when the latest version equals the current version", async () => {
    const cacheFilePath = await createCacheFilePath();
    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({ version: "0.4.0" }));

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      nonInteractive: true,
      commandArgs: ["scan"],
      cacheFilePath,
      stdout,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(stdout.output).toBe("");
  });

  it("prints the update message when a newer version exists", async () => {
    const cacheFilePath = await createCacheFilePath();
    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({ version: "0.5.0" }));

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      nonInteractive: true,
      commandArgs: ["scan"],
      cacheFilePath,
      stdout,
      fetchImpl
    });

    expect(stdout.output).toBe(
      "A new version of Naar is available:\n"
      + "0.4.0 → 0.5.0\n\n"
      + "Update with:\n"
      + "npm install -g naar-cli@latest\n"
    );
  });

  it("does not print or fetch in json mode", async () => {
    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn();

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      jsonMode: true,
      commandArgs: ["scan", "--json"],
      stdout,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch in CI", async () => {
    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn();

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      env: { CI: "1" },
      stdout,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch when disabled by environment variables", async () => {
    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn();

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      env: { NAAR_NO_UPDATE_NOTIFIER: "1" },
      stdout,
      fetchImpl
    });

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      env: { NO_UPDATE_NOTIFIER: "1" },
      stdout,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toBe("");
  });

  it("does not print or fetch for help/version or non-tty output", async () => {
    const fetchImpl = vi.fn();

    const helpStdout = createOutputCapture(true);
    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["--help"],
      stdout: helpStdout,
      fetchImpl
    });

    const versionStdout = createOutputCapture(true);
    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["--version"],
      stdout: versionStdout,
      fetchImpl
    });

    const nonTtyStdout = createOutputCapture(false);
    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      stdout: nonTtyStdout,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(helpStdout.output).toBe("");
    expect(versionStdout.output).toBe("");
    expect(nonTtyStdout.output).toBe("");
  });

  it("uses a fresh cache without making a network request", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "naar-update-cache-"));
    const cacheFilePath = path.join(dir, "update-check.json");
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, JSON.stringify({
      lastCheckedAt: 1_000,
      latestVersion: "0.5.0"
    }), "utf8");

    const stdout = createOutputCapture(true);
    const fetchImpl = vi.fn();

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      nonInteractive: true,
      commandArgs: ["scan"],
      cacheFilePath,
      now: () => 1_000_000,
      stdout,
      fetchImpl
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.output).toContain("0.4.0 → 0.5.0");
  });

  it("swallows network and cache failures", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "naar-update-error-"));
    const stdout = createOutputCapture(true);

    await expect(maybeNotifyUpdate({
      currentVersion: "0.4.0",
      nonInteractive: true,
      commandArgs: ["scan"],
      cacheFilePath: dir,
      stdout,
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down"))
    })).resolves.toBeUndefined();

    expect(stdout.output).toBe("");
  });

  it("runs the explicit npm install command only when the user confirms", async () => {
    const cacheFilePath = await createCacheFilePath();
    const stdout = createOutputCapture(true);
    const runInstallCommand = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(makeFetchResponse({ version: "0.5.0" }));

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      nonInteractive: false,
      cacheFilePath,
      stdout,
      stdin: { isTTY: true },
      fetchImpl,
      prompt: vi.fn().mockResolvedValue(true),
      runInstallCommand
    });

    expect(runInstallCommand).toHaveBeenCalledWith("npm", ["install", "-g", "naar-cli@latest"]);

    runInstallCommand.mockReset();
    stdout.output = "";

    await maybeNotifyUpdate({
      currentVersion: "0.4.0",
      commandArgs: ["scan"],
      nonInteractive: false,
      cacheFilePath: await createCacheFilePath(),
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
  return path.join(dir, "update-check.json");
}
