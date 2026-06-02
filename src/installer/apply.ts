import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { exists } from "../utils/fs.js";
import type { InstallPlan, InstalledState } from "../types/index.js";

export async function applyInstallPlan(repoRoot: string, plan: InstallPlan): Promise<void> {
  for (const action of plan.actions) {
    const fullPath = path.join(repoRoot, action.path);
    await mkdir(path.dirname(fullPath), { recursive: true });

    if (action.type === "write") {
      const fileExists = await exists(fullPath);
      if (fileExists && !action.overwrite) {
        throw new Error(`Refusing to overwrite existing file: ${action.path}`);
      }
      await writeFile(fullPath, action.content ?? "", "utf8");
      continue;
    }

    if (action.type === "append") {
      const existing = (await exists(fullPath)) ? await readFile(fullPath, "utf8") : "";
      const append = action.content ?? "";
      if (action.managedMarker) {
        const next = upsertManagedBlock(existing, append, action.managedMarker);
        await writeFile(fullPath, next, "utf8");
        continue;
      }
      if (!existing.includes(append)) {
        await writeFile(fullPath, existing + append, "utf8");
      }
      continue;
    }

    if (action.type === "mkdir") {
      await mkdir(fullPath, { recursive: true });
    }
  }
}

export async function uninstallManagedFiles(repoRoot: string, state: InstalledState, skillIds: string[]): Promise<string[]> {
  const removed: string[] = [];
  const selected = state.skills.filter((skill) => skillIds.length === 0 || skillIds.includes(skill.canonicalSkillId));

  for (const skill of selected) {
    for (const managed of skill.managedFiles) {
      const markerIndex = managed.indexOf("#naar:");
      if (markerIndex >= 0) {
        const filePath = managed.slice(0, markerIndex);
        const marker = managed.slice(markerIndex + 1);
        const fullPath = path.join(repoRoot, filePath);
        if (!(await exists(fullPath))) {
          continue;
        }

        const content = await readFile(fullPath, "utf8");
        const blockRegex = managedBlockRegex(marker);
        const next = content.replace(blockRegex, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
        await writeFile(fullPath, next, "utf8");
        removed.push(managed);
        continue;
      }

      const fullPath = path.join(repoRoot, managed);
      if (await exists(fullPath)) {
        await rm(fullPath, { force: true });
        removed.push(managed);
      }
    }
  }

  return removed;
}

function upsertManagedBlock(existing: string, block: string, marker: string): string {
  const blockRegex = managedBlockRegex(marker);
  if (blockRegex.test(existing)) {
    return existing.replace(blockRegex, block);
  }
  return existing + block;
}

function managedBlockRegex(marker: string): RegExp {
  return new RegExp(
    `\\n?<!-- ${escapeRegExp(marker)}:start -->[\\s\\S]*?<!-- ${escapeRegExp(marker)}:end -->\\n?`,
    "g"
  );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
