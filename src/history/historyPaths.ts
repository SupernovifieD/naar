import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export interface HistoryPathOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
}

export function resolveHistoryDataDir(options: HistoryPathOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? os.homedir();

  if (env.NAAR_HOME && env.NAAR_HOME.trim().length > 0) {
    return path.resolve(env.NAAR_HOME);
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "naar");
  }

  if (platform === "win32") {
    return path.join(env.APPDATA && env.APPDATA.trim().length > 0 ? env.APPDATA : path.join(home, "AppData", "Roaming"), "naar");
  }

  if (env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim().length > 0) {
    return path.join(env.XDG_DATA_HOME, "naar");
  }

  return path.join(home, ".local", "share", "naar");
}

export function resolveHistoryFilePath(options: HistoryPathOptions = {}): string {
  return path.join(resolveHistoryDataDir(options), "history.json");
}

export function normalizeProjectPath(projectPath: string, options: HistoryPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    return path.win32.normalize(path.win32.resolve(projectPath)).replace(/\\/g, "/");
  }
  return path.normalize(path.resolve(projectPath)).replace(/\\/g, "/");
}

export function hashProjectPath(normalizedPath: string): string {
  return crypto.createHash("sha256").update(normalizedPath).digest("hex");
}

export function projectIdForPath(projectPath: string, options: HistoryPathOptions = {}): { projectId: string; pathHash: string; normalizedPath: string } {
  const normalizedPath = normalizeProjectPath(projectPath, options);
  const pathHash = hashProjectPath(normalizedPath);
  return { projectId: pathHash, pathHash, normalizedPath };
}
