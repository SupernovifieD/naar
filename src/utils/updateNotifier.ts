import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stderr as processStderr, stdin as processStdin, stdout as processStdout } from "node:process";
import { fetch as undiciFetch } from "undici";

const UPDATE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const UPDATE_CHECK_TIMEOUT_MS = 2_500;
const DEFAULT_PACKAGE_NAME = "naar-cli";

interface UpdateCacheRecord {
  lastCheckedAt: number;
  latestVersion: string;
}

interface UpdateFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface OutputWriter {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

interface InputReader {
  isTTY?: boolean;
}

export interface UpdateNotifierOptions {
  currentVersion: string;
  packageName?: string;
  commandArgs?: string[];
  jsonMode?: boolean;
  nonInteractive?: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  now?: () => number;
  cacheFilePath?: string;
  fetchImpl?: (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<UpdateFetchResponse>;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
  stdin?: InputReader;
  prompt?: () => Promise<boolean>;
  runInstallCommand?: (command: string, args: string[]) => Promise<void>;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

export async function maybeNotifyUpdate(options: UpdateNotifierOptions): Promise<void> {
  try {
    await maybeNotifyUpdateInner(options);
  } catch {
    // Update checks must never break normal command execution.
  }
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (!leftVersion || !rightVersion) return 0;

  if (leftVersion.major !== rightVersion.major) {
    return compareNumeric(leftVersion.major, rightVersion.major);
  }
  if (leftVersion.minor !== rightVersion.minor) {
    return compareNumeric(leftVersion.minor, rightVersion.minor);
  }
  if (leftVersion.patch !== rightVersion.patch) {
    return compareNumeric(leftVersion.patch, rightVersion.patch);
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

export function resolveUpdateCacheFilePath(options: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
} = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Caches", "naar", "update-check.json");
  }

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA && env.LOCALAPPDATA.trim().length > 0
      ? env.LOCALAPPDATA
      : path.join(home, "AppData", "Local");
    return path.join(localAppData, "naar", "update-check.json");
  }

  if (env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.trim().length > 0) {
    return path.join(env.XDG_CACHE_HOME, "naar", "update-check.json");
  }

  return path.join(home, ".cache", "naar", "update-check.json");
}

async function maybeNotifyUpdateInner(options: UpdateNotifierOptions): Promise<void> {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? processStdout;
  const stderr = options.stderr ?? processStderr;
  const stdin = options.stdin ?? processStdin;
  const commandArgs = options.commandArgs ?? [];
  const currentVersion = options.currentVersion.trim();
  const packageName = options.packageName ?? DEFAULT_PACKAGE_NAME;

  if (shouldSkipUpdateNotification({
    currentVersion,
    commandArgs,
    jsonMode: options.jsonMode ?? commandArgs.includes("--json"),
    env,
    stdoutIsTTY: stdout.isTTY === true
  })) {
    return;
  }

  const nowMs = options.now?.() ?? Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const cacheFilePath = options.cacheFilePath ?? resolveUpdateCacheFilePath({
    env,
    platform: options.platform,
    homedir: options.homedir
  });
  const cached = await readUpdateCache(cacheFilePath);

  let latestVersion: string | undefined;
  if (cached && isFreshCache(cached, nowSeconds)) {
    latestVersion = cached.latestVersion;
  } else {
    const fetchedVersion = await fetchLatestVersion(packageName, options.fetchImpl);
    if (fetchedVersion) {
      latestVersion = fetchedVersion;
      await writeUpdateCache(cacheFilePath, {
        lastCheckedAt: nowSeconds,
        latestVersion: fetchedVersion
      });
    } else {
      await writeUpdateCache(cacheFilePath, {
        lastCheckedAt: nowSeconds,
        latestVersion: cached?.latestVersion ?? currentVersion
      });
      return;
    }
  }

  if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
    return;
  }

  const updateCommand = `npm install -g ${packageName}@latest`;
  stdout.write(
    `A new version of Naar is available:\n`
    + `${currentVersion} → ${latestVersion}\n\n`
    + `Update with:\n`
    + `${updateCommand}\n`
  );

  const shouldPrompt = stdin.isTTY === true && !(options.nonInteractive ?? false);
  if (!shouldPrompt) {
    return;
  }

  const prompt = options.prompt ?? (() => promptForUpdate(stdout, stdin));
  const confirmed = await prompt().catch(() => false);
  if (!confirmed) {
    return;
  }

  const runInstallCommand = options.runInstallCommand ?? ((command: string, args: string[]) =>
    installLatest(command, args)
  );

  try {
    await runInstallCommand(resolveNpmCommand(options.platform), ["install", "-g", `${packageName}@latest`]);
  } catch {
    stderr.write(`Update failed. You can run ${updateCommand} manually.\n`);
  }
}

function shouldSkipUpdateNotification(options: {
  currentVersion: string;
  commandArgs: string[];
  jsonMode: boolean;
  env: NodeJS.ProcessEnv;
  stdoutIsTTY: boolean;
}): boolean {
  if (!options.stdoutIsTTY) return true;
  if (options.jsonMode) return true;
  if (options.commandArgs.length === 0) return true;
  if (options.commandArgs[0] === "help") return true;
  if (hasHelpOrVersionFlag(options.commandArgs)) return true;
  if (isTruthyEnvFlag(options.env.CI)) return true;
  if (isTruthyEnvFlag(options.env.NAAR_NO_UPDATE_NOTIFIER)) return true;
  if (isTruthyEnvFlag(options.env.NO_UPDATE_NOTIFIER)) return true;
  if (!parseSemver(options.currentVersion)) return true;
  return false;
}

function hasHelpOrVersionFlag(commandArgs: string[]): boolean {
  return commandArgs.includes("--help")
    || commandArgs.includes("-h")
    || commandArgs.includes("--version")
    || commandArgs.includes("-V");
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function readUpdateCache(cacheFilePath: string): Promise<UpdateCacheRecord | null> {
  try {
    const raw = await readFile(cacheFilePath, "utf8");
    return parseUpdateCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeUpdateCache(cacheFilePath: string, record: UpdateCacheRecord): Promise<void> {
  try {
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch {
    // Cache writes are best effort only.
  }
}

function parseUpdateCache(value: unknown): UpdateCacheRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<UpdateCacheRecord>;
  if (typeof record.lastCheckedAt !== "number" || !Number.isFinite(record.lastCheckedAt)) return null;
  if (typeof record.latestVersion !== "string" || record.latestVersion.trim().length === 0) return null;
  return {
    lastCheckedAt: Math.floor(record.lastCheckedAt),
    latestVersion: record.latestVersion.trim()
  };
}

function isFreshCache(record: UpdateCacheRecord, nowSeconds: number): boolean {
  return nowSeconds - record.lastCheckedAt < UPDATE_CACHE_TTL_SECONDS;
}

async function fetchLatestVersion(
  packageName: string,
  fetchImpl: UpdateNotifierOptions["fetchImpl"]
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await (fetchImpl ?? undiciFetch)(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      {
        signal: controller.signal,
        headers: {
          accept: "application/json"
        }
      }
    );
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { version?: unknown };
    return typeof data.version === "string" && parseSemver(data.version)
      ? data.version
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function promptForUpdate(stdout: OutputWriter, stdin: InputReader): Promise<boolean> {
  stdout.write("\nWould you like to update now? (y/N)\n");
  const readline = createInterface({
    input: stdin as NodeJS.ReadStream,
    output: stdout as NodeJS.WriteStream
  });

  try {
    const answer = await readline.question("");
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

async function installLatest(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function resolveNpmCommand(platform: NodeJS.Platform | undefined): string {
  return (platform ?? process.platform) === "win32" ? "npm.cmd" : "npm";
}

function parseSemver(value: string): Semver | null {
  const match = value.trim().match(
    /^v?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match?.groups) return null;

  const prerelease = match.groups.prerelease
    ? match.groups.prerelease.split(".").map((identifier) =>
      /^\d+$/.test(identifier) ? Number.parseInt(identifier, 10) : identifier
    )
    : [];

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease
  };
}

function compareNumeric(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function comparePrerelease(left: Array<number | string>, right: Array<number | string>): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;

    if (typeof leftIdentifier === "number" && typeof rightIdentifier === "number") {
      const result = compareNumeric(leftIdentifier, rightIdentifier);
      if (result !== 0) return result;
      continue;
    }

    if (typeof leftIdentifier === "number") return -1;
    if (typeof rightIdentifier === "number") return 1;

    if (leftIdentifier === rightIdentifier) continue;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }

  return 0;
}
