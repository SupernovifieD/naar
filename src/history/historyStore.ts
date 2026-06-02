import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { createEmptyHistory, parseHistory, type NaarHistory } from "./historySchema.js";
import { resolveHistoryFilePath, type HistoryPathOptions } from "./historyPaths.js";

export interface HistoryStoreOptions extends HistoryPathOptions {
  historyFilePath?: string;
  now?: () => Date;
}

export interface HistoryLoadResult {
  history: NaarHistory;
  filePath: string;
  warning?: string;
  corruptBackupPath?: string;
}

export function getHistoryFilePath(options: HistoryStoreOptions = {}): string {
  return options.historyFilePath ?? resolveHistoryFilePath(options);
}

export async function loadHistory(options: HistoryStoreOptions = {}): Promise<HistoryLoadResult> {
  const filePath = getHistoryFilePath(options);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = parseHistory(JSON.parse(raw));
    if (parsed) {
      return { history: parsed, filePath };
    }
    return await recoverCorruptHistory(filePath, options, "History file schema is invalid.");
  } catch (error) {
    if (isMissingFileError(error)) {
      return { history: createEmptyHistory(nowIso(options)), filePath };
    }
    if (error instanceof SyntaxError) {
      return await recoverCorruptHistory(filePath, options, "History file contains invalid JSON.");
    }
    return await recoverCorruptHistory(filePath, options, "History file could not be loaded safely.");
  }
}

export async function saveHistory(history: NaarHistory, options: HistoryStoreOptions = {}): Promise<string> {
  const filePath = getHistoryFilePath(options);
  const dir = path.dirname(filePath);
  await ensureSafeHistoryPath(filePath);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmodBestEffort(dir, 0o700);

  const tempPath = path.join(dir, `.history.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  const handle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(history, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tempPath, filePath);
  await chmodBestEffort(filePath, 0o600);
  await fsyncDirectoryBestEffort(dir);
  return filePath;
}

export async function resetHistory(options: HistoryStoreOptions = {}): Promise<NaarHistory> {
  const history = createEmptyHistory(nowIso(options));
  await saveHistory(history, options);
  return history;
}

async function recoverCorruptHistory(filePath: string, options: HistoryStoreOptions, reason: string): Promise<HistoryLoadResult> {
  const backupPath = path.join(path.dirname(filePath), `history.corrupt.${timestampForFile(options)}.json`);
  try {
    await rename(filePath, backupPath);
  } catch {
    // If backup fails, still return a fresh in-memory history instead of crashing callers.
  }
  return {
    history: createEmptyHistory(nowIso(options)),
    filePath,
    corruptBackupPath: backupPath,
    warning: `${reason} Moved corrupt history aside and started fresh.`
  };
}

async function ensureSafeHistoryPath(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    const dirStat = await lstat(dir);
    if (dirStat.isSymbolicLink()) {
      throw new Error(`Refusing to write history through symlinked directory: ${dir}`);
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  try {
    const fileStat = await lstat(filePath);
    if (fileStat.isSymbolicLink()) {
      throw new Error(`Refusing to write history through symlinked file: ${filePath}`);
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

async function chmodBestEffort(filePath: string, mode: number): Promise<void> {
  try {
    await chmod(filePath, mode);
  } catch {
    // Some platforms/filesystems do not support POSIX modes.
  }
}

async function fsyncDirectoryBestEffort(dir: string): Promise<void> {
  try {
    const handle = await open(dir, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is not portable.
  }
}

function nowIso(options: HistoryStoreOptions): string {
  return (options.now?.() ?? new Date()).toISOString();
}

function timestampForFile(options: HistoryStoreOptions): string {
  return nowIso(options).replace(/[^0-9]/g, "");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeHistoryFile(options: HistoryStoreOptions = {}): Promise<void> {
  await rm(getHistoryFilePath(options), { force: true });
}
