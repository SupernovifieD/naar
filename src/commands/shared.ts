import path from "node:path";
import type { CliFlags, InstallTarget } from "../types/index.js";
import { resolveTargetAlias } from "../targets/index.js";

export function parseTargets(input: string[] | undefined): InstallTarget[] {
  if (!input || input.length === 0) return [];
  const targets: InstallTarget[] = [];
  for (const raw of input) {
    const mapped = resolveTargetAlias(raw);
    if (mapped) targets.push(mapped);
  }
  return [...new Set(targets)];
}

export function normalizeProviders(input: string[] | undefined): string[] {
  if (!input || input.length === 0) return [];
  return [...new Set(input.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function resolveRepoRoot(repo: string): string {
  return path.resolve(repo || process.cwd());
}

export function coerceFlags(raw: Record<string, unknown>): CliFlags {
  const allowScripts = Boolean(raw.allowScripts);
  const noScripts = !allowScripts;

  return {
    repo: String(raw.repo ?? process.cwd()),
    provider: normalizeProviders(raw.provider as string[] | undefined),
    target: parseTargets(raw.target as string[] | undefined),
    json: Boolean(raw.json),
    compact: Boolean(raw.compact),
    apply: Boolean(raw.apply),
    dryRun: Boolean(raw.dryRun),
    yes: Boolean(raw.yes),
    nonInteractive: Boolean(raw.nonInteractive),
    noScripts,
    allowRisky: Boolean(raw.allowRisky),
    minSecurityScore: Number(raw.minSecurityScore ?? 80),
    force: Boolean(raw.force),
    verbose: Boolean(raw.verbose),
    allCompatible: Boolean(raw.allCompatible),
    from: typeof raw.from === "string" ? raw.from : undefined,
    fromPlan: typeof raw.fromPlan === "string" ? raw.fromPlan : undefined
  };
}
