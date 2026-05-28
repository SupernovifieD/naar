import path from "node:path";
import type { CliFlags, InstallTarget } from "../types/index.js";

export const TARGET_ALIAS: Record<string, InstallTarget> = {
  claude: "claude_project_skills",
  cursor: "cursor_project_rules",
  copilot: "copilot_repo_instructions",
  codex: "codex_repo_skills",
  generic: "generic_agent_skills",
  claude_project_skills: "claude_project_skills",
  cursor_project_rules: "cursor_project_rules",
  copilot_repo_instructions: "copilot_repo_instructions",
  codex_repo_skills: "codex_repo_skills",
  generic_agent_skills: "generic_agent_skills"
};

export function parseTargets(input: string[] | undefined): InstallTarget[] {
  if (!input || input.length === 0) return [];
  const targets: InstallTarget[] = [];
  for (const raw of input) {
    const mapped = TARGET_ALIAS[raw];
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
    apply: Boolean(raw.apply),
    dryRun: Boolean(raw.dryRun),
    yes: Boolean(raw.yes),
    nonInteractive: Boolean(raw.nonInteractive),
    noScripts,
    minSecurityScore: Number(raw.minSecurityScore ?? 80),
    force: Boolean(raw.force),
    verbose: Boolean(raw.verbose),
    allCompatible: Boolean(raw.allCompatible),
    from: typeof raw.from === "string" ? raw.from : undefined,
    fromPlan: typeof raw.fromPlan === "string" ? raw.fromPlan : undefined
  };
}
