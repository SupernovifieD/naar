import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const GITIGNORE_FILE = ".gitignore";
const NAAR_RUNTIME_HEADER = "# Naar local/runtime artifacts (do not commit)";
const NAAR_RUNTIME_ENTRIES = [
  "/.naar/cache/",
  "/.naar/tmp/",
  "/.naar/logs/",
  "/.naar/installed.json"
] as const;

export async function ensureNaarRuntimeGitignore(repoRoot: string): Promise<void> {
  const gitignorePath = path.join(repoRoot, GITIGNORE_FILE);

  let existingContent = "";
  try {
    existingContent = await readFile(gitignorePath, "utf8");
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }

  const existingLines = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const missingEntries = NAAR_RUNTIME_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (missingEntries.length === 0) {
    return;
  }

  const linesToAppend: string[] = [];
  if (!existingLines.has(NAAR_RUNTIME_HEADER)) {
    linesToAppend.push(NAAR_RUNTIME_HEADER);
  }
  linesToAppend.push(...missingEntries);

  const separator = buildSeparator(existingContent);
  const nextContent = `${existingContent}${separator}${linesToAppend.join("\n")}\n`;
  await writeFile(gitignorePath, nextContent, "utf8");
}

function buildSeparator(content: string): string {
  if (content.length === 0) {
    return "";
  }

  if (content.endsWith("\n\n")) {
    return "";
  }

  if (content.endsWith("\n")) {
    return "\n";
  }

  return "\n\n";
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
