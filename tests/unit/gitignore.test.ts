import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ensureNaarRuntimeGitignore } from "../../src/utils/gitignore.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("ensureNaarRuntimeGitignore", () => {
  it("creates runtime ignore entries when .gitignore is missing", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-gitignore-"));
    tempRoots.push(repoRoot);

    await ensureNaarRuntimeGitignore(repoRoot);

    const content = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
    expect(content).toContain("# Naar local/runtime artifacts (do not commit)");
    expect(content).toContain("/.naar/cache/");
    expect(content).toContain("/.naar/tmp/");
    expect(content).toContain("/.naar/logs/");
    expect(content).toContain("/.naar/installed.json");
  });

  it("appends only missing entries and stays idempotent", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-gitignore-"));
    tempRoots.push(repoRoot);

    const initial = [
      "node_modules",
      "# Naar local/runtime artifacts (do not commit)",
      "/.naar/cache/",
      ""
    ].join("\n");
    await writeFile(path.join(repoRoot, ".gitignore"), initial, "utf8");

    await ensureNaarRuntimeGitignore(repoRoot);
    await ensureNaarRuntimeGitignore(repoRoot);

    const content = await readFile(path.join(repoRoot, ".gitignore"), "utf8");
    const lines = content.split(/\r?\n/);
    const count = (needle: string) => lines.filter((line) => line.trim() === needle).length;

    expect(count("# Naar local/runtime artifacts (do not commit)")).toBe(1);
    expect(count("/.naar/cache/")).toBe(1);
    expect(count("/.naar/tmp/")).toBe(1);
    expect(count("/.naar/logs/")).toBe(1);
    expect(count("/.naar/installed.json")).toBe(1);
  });
});
