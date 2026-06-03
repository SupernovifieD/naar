import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type {
  MatchedFact,
  RepoFacts,
  RepoNeed,
  RepoPrimaryFacts,
  RepoSecondaryFacts
} from "../types/index.js";

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  crypto: ["crypto", "defi", "web3", "onchain", "airdrop", "yield", "farmdash", "perps", "trading"],
  finance: ["finance", "banking", "actuarial", "insurance", "futures", "portfolio"],
  legal: ["legal", "law", "contract"],
  medical: ["medical", "health", "clinical", "biology", "chemistry"],
  marketing: ["marketing", "brand", "newsletter", "campaign"],
  art: ["art", "algorithmic-art", "design"],
  spreadsheet: ["spreadsheet", "excel", "xlsx", "google-sheets"],
  internal_comms: ["internal-comms", "communication", "leadership-update"]
};

export interface RecommendationNeedContext {
  repoNeeds: RepoNeed[];
}

export interface RecommendationContext {
  primary: RepoPrimaryFacts;
  secondary: RepoSecondaryFacts;
  missingSet: Set<string>;
  primaryLanguages: Set<string>;
  secondaryLanguages: Set<string>;
  primaryFrameworks: Map<string, MatchedFact>;
  secondaryFrameworks: Set<string>;
  primaryProjectTypes: Map<string, MatchedFact>;
  primaryToolFacts: Map<string, MatchedFact>;
  repoTokens: Set<string>;
  repoDomains: Set<string>;
  hasProviderSourcePath: boolean;
  hasSkillAuthoringPath: boolean;
}

export function deriveRepoNeeds(repoFacts: RepoFacts): RepoNeed[] {
  const context = buildRecommendationContext(repoFacts);
  return inferRepoNeeds(repoFacts, context);
}

export function buildRecommendationContext(repoFacts: RepoFacts): RecommendationContext {
  const primary = normalizePrimaryFacts(repoFacts);
  const secondary = normalizeSecondaryFacts(repoFacts);
  const missingSet = new Set(repoFacts.findings.map((finding) => finding.code));

  const primaryLanguages = new Set(primary.languages.map((language) => language.id.toLowerCase()));
  const secondaryLanguages = new Set(secondary.languages.map((language) => language.id.toLowerCase()));

  const primaryFrameworks = new Map<string, MatchedFact>();
  for (const framework of primary.frameworks) {
    primaryFrameworks.set(framework.id.toLowerCase(), {
      factType: "framework",
      id: framework.id,
      source: "primaryFacts",
      evidence: framework.evidence
    });
  }

  const secondaryFrameworks = new Set(secondary.frameworks.map((framework) => framework.id.toLowerCase()));

  const primaryProjectTypes = new Map<string, MatchedFact>();
  for (const projectType of primary.projectTypes) {
    primaryProjectTypes.set(projectType.id.toLowerCase(), {
      factType: "projectType",
      id: projectType.id,
      source: "primaryFacts",
      evidence: projectType.evidence
    });
  }

  const primaryToolFacts = new Map<string, MatchedFact>();
  for (const tool of [
    ...primary.buildTools,
    ...primary.testTools,
    ...primary.ci,
    ...primary.infra
  ]) {
    primaryToolFacts.set(tool.id.toLowerCase(), {
      factType: "tool",
      id: tool.id,
      source: "primaryFacts",
      evidence: tool.evidence
    });
  }
  for (const command of primary.commands) {
    const roleId = command.role.toLowerCase();
    if (!primaryToolFacts.has(roleId)) {
      primaryToolFacts.set(roleId, {
        factType: "command",
        id: roleId,
        source: "primaryFacts",
        evidence: command.evidence
      });
    }
    const nameId = command.name.toLowerCase();
    if (!primaryToolFacts.has(nameId)) {
      primaryToolFacts.set(nameId, {
        factType: "command",
        id: nameId,
        source: "primaryFacts",
        evidence: command.evidence
      });
    }
  }

  const repoTokens = gatherRepoTokens(repoFacts.repoRoot, primary, secondary);
  const repoDomains = detectRecommendationDomains(repoTokens);
  const hasProviderSourcePath = existsInRepo(repoFacts.repoRoot, "src/providers");
  const hasSkillAuthoringPath = existsInRepo(repoFacts.repoRoot, ".claude/skills")
    || existsInRepo(repoFacts.repoRoot, "skills");

  return {
    primary,
    secondary,
    missingSet,
    primaryLanguages,
    secondaryLanguages,
    primaryFrameworks,
    secondaryFrameworks,
    primaryProjectTypes,
    primaryToolFacts,
    repoTokens,
    repoDomains,
    hasProviderSourcePath,
    hasSkillAuthoringPath
  };
}

export function detectRecommendationDomains(tokens: Set<string>): Set<string> {
  const domains = new Set<string>();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((keyword) => tokens.has(keyword))) {
      domains.add(domain);
    }
  }

  return domains;
}

function normalizePrimaryFacts(repoFacts: RepoFacts): RepoPrimaryFacts {
  if (repoFacts.primaryFacts) {
    return repoFacts.primaryFacts;
  }

  return {
    projectTypes: [],
    languages: repoFacts.languages.map((language) => ({ id: language, confidence: 1, evidence: [] })),
    frameworks: repoFacts.frameworks,
    packageManagers: repoFacts.packageManagers,
    buildTools: [],
    testTools: [],
    ci: [],
    infra: [],
    commands: []
  };
}

function normalizeSecondaryFacts(repoFacts: RepoFacts): RepoSecondaryFacts {
  if (repoFacts.secondaryFacts) {
    return repoFacts.secondaryFacts;
  }

  return {
    projectTypes: [],
    languages: [],
    frameworks: [],
    packageManagers: [],
    buildTools: [],
    testTools: [],
    ci: [],
    infra: [],
    commands: []
  };
}

function inferRepoNeeds(repoFacts: RepoFacts, context: RecommendationContext): RepoNeed[] {
  const needs = new Map<string, RepoNeed>();

  const addNeed = (id: string, reason: string, sourceFacts: MatchedFact[] = [], weight = 1): void => {
    const existing = needs.get(id);
    if (!existing) {
      needs.set(id, { id, weight, reason, sourceFacts: [...sourceFacts] });
      return;
    }
    existing.weight = Math.max(existing.weight, weight);
    existing.sourceFacts = dedupeFacts([...existing.sourceFacts, ...sourceFacts]);
  };

  for (const projectType of context.primary.projectTypes) {
    if (projectType.id === "cli") {
      addNeed("node_cli_development", "Primary project type is CLI", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("cli_command_design", "CLI command design is relevant", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("terminal_output_design", "CLI terminal output formatting is relevant", [{ factType: "projectType", id: "cli", source: "primaryFacts", evidence: projectType.evidence }]);
    }
    if (projectType.id === "package") {
      addNeed("npm_package_development", "Primary project type is npm package", [{ factType: "projectType", id: "package", source: "primaryFacts", evidence: projectType.evidence }]);
      addNeed("release_safety", "Package release safety is relevant", [{ factType: "projectType", id: "package", source: "primaryFacts", evidence: projectType.evidence }]);
    }
    if (projectType.id === "library") addNeed("library_development", "Primary project type is library", [{ factType: "projectType", id: "library", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "web-app") addNeed("web_app_development", "Primary project type is web app", [{ factType: "projectType", id: "web-app", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "api") addNeed("api_development", "Primary project type is API", [{ factType: "projectType", id: "api", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "monorepo") addNeed("monorepo_navigation", "Primary project type is monorepo", [{ factType: "projectType", id: "monorepo", source: "primaryFacts", evidence: projectType.evidence }]);
    if (projectType.id === "docs") addNeed("docs_project_support", "Primary project type is docs", [{ factType: "projectType", id: "docs", source: "primaryFacts", evidence: projectType.evidence }]);
  }

  for (const language of context.primary.languages) {
    const lower = language.id.toLowerCase();
    if (lower === "typescript") {
      addNeed("typescript_refactor_safety", "TypeScript primary language detected", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }]);
      addNeed("typescript_config_review", "TypeScript configuration is relevant", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }]);
      addNeed("javascript_node_development", "Node/TypeScript development is relevant", [{ factType: "language", id: "TypeScript", source: "primaryFacts", evidence: language.evidence }], 0.8);
    }
    if (lower === "javascript") addNeed("javascript_node_development", "JavaScript primary language detected", [{ factType: "language", id: "JavaScript", source: "primaryFacts", evidence: language.evidence }]);
    if (lower === "python") addNeed("python_development", "Python primary language detected", [{ factType: "language", id: "Python", source: "primaryFacts", evidence: language.evidence }]);
  }

  for (const tool of context.primary.buildTools) {
    const id = tool.id.toLowerCase();
    if (id === "tsup") addNeed("tsup_build_pipeline", "tsup build tool detected", [{ factType: "buildTool", id: "tsup", source: "primaryFacts", evidence: tool.evidence }]);
    if (id === "tsc") addNeed("typescript_typecheck", "tsc build tool detected", [{ factType: "buildTool", id: "tsc", source: "primaryFacts", evidence: tool.evidence }]);
  }

  for (const tool of context.primary.testTools) {
    const id = tool.id.toLowerCase();
    if (id === "vitest") {
      addNeed("vitest_testing", "vitest test tool detected", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }]);
      addNeed("test_generation", "test generation is relevant for vitest projects", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }], 0.9);
      addNeed("test_debugging", "test debugging is relevant for vitest projects", [{ factType: "testTool", id: "vitest", source: "primaryFacts", evidence: tool.evidence }], 0.9);
    }
  }

  for (const tool of context.primary.ci) {
    if (tool.id.toLowerCase() === "github-actions") {
      addNeed("github_actions_ci", "GitHub Actions CI detected", [{ factType: "ci", id: "github-actions", source: "primaryFacts", evidence: tool.evidence }]);
    }
  }

  for (const command of context.primary.commands) {
    const role = command.role.toLowerCase();
    const name = command.name.toLowerCase();
    if (role === "typecheck" || name === "typecheck") {
      addNeed("typescript_typecheck", "Typecheck command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }]);
    }
    if (role === "prepack" || role === "prepublish" || name === "prepack" || name === "prepublishonly") {
      addNeed("npm_publish_workflow", "Package lifecycle publish command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }]);
      addNeed("release_safety", "Package lifecycle release command detected", [{ factType: "command", id: command.name, source: "primaryFacts", evidence: command.evidence }], 0.9);
    }
  }

  if (context.repoTokens.has("@inquirer/prompts")) {
    addNeed("interactive_cli_ux", "@inquirer/prompts dependency detected", [{ factType: "dependency", id: "@inquirer/prompts", source: "repoSignals" }]);
  }
  if (context.repoTokens.has("zod")) {
    addNeed("zod_validation", "zod dependency detected", [{ factType: "dependency", id: "zod", source: "repoSignals" }]);
    addNeed("json_schema_validation", "zod dependency indicates schema validation", [{ factType: "dependency", id: "zod", source: "repoSignals" }], 0.9);
  }
  if (context.repoTokens.has("undici")) {
    addNeed("http_api_client", "undici dependency detected", [{ factType: "dependency", id: "undici", source: "repoSignals" }]);
  }

  if (existsInRepo(repoFacts.repoRoot, "src/providers")) {
    addNeed("provider_integration", "Provider integration source path detected", [{ factType: "path", id: "src/providers", source: "repoSignals" }]);
  }
  if (existsInRepo(repoFacts.repoRoot, "src/installer")) {
    addNeed("safe_file_writes", "Installer path detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }]);
    addNeed("install_plan_review", "Installer planning path detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.9);
    addNeed("package_security_review", "Installer path suggests package safety concerns", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.7);
    addNeed("provenance_tracking", "Installer and lockfile management detected", [{ factType: "path", id: "src/installer", source: "repoSignals" }], 0.7);
  }

  if (context.repoTokens.has("mcp") || context.repoTokens.has("modelcontextprotocol") || context.repoTokens.has("@modelcontextprotocol/sdk")) {
    addNeed("mcp_server_development", "MCP-related signal detected", [{ factType: "signal", id: "mcp", source: "repoSignals" }]);
  }

  if (context.missingSet.has("missing_claude_config")) {
    addNeed("agent_config_setup", "Claude configuration is missing", [{ factType: "finding", id: "missing_claude_config", source: "repoSignals" }], 0.9);
    addNeed("claude_project_setup", "Claude project setup is missing", [{ factType: "finding", id: "missing_claude_config", source: "repoSignals" }]);
  }
  if (context.missingSet.has("missing_copilot_instructions")) {
    addNeed("agent_config_setup", "Copilot instructions are missing", [{ factType: "finding", id: "missing_copilot_instructions", source: "repoSignals" }], 0.9);
    addNeed("copilot_instruction_setup", "Copilot instruction setup is missing", [{ factType: "finding", id: "missing_copilot_instructions", source: "repoSignals" }]);
  }

  return [...needs.values()].sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
}

function dedupeFacts(values: MatchedFact[]): MatchedFact[] {
  const seen = new Set<string>();
  const output: MatchedFact[] = [];

  for (const value of values) {
    const key = `${value.source}:${value.factType}:${value.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

function existsInRepo(repoRoot: string, relativePath: string): boolean {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return false;
  try {
    return existsSync(path.join(repoRoot, relativePath));
  } catch {
    return false;
  }
}

function gatherRepoTokens(repoRoot: string, primary: RepoPrimaryFacts, secondary: RepoSecondaryFacts): Set<string> {
  const tokens = new Set<string>();

  for (const language of primary.languages) {
    tokens.add(language.id.toLowerCase());
  }
  for (const framework of primary.frameworks) {
    tokens.add(framework.id.toLowerCase());
  }
  for (const tool of [...primary.buildTools, ...primary.testTools, ...primary.ci, ...primary.infra]) {
    tokens.add(tool.id.toLowerCase());
  }
  for (const command of primary.commands) {
    tokens.add(command.name.toLowerCase());
    tokens.add(command.role.toLowerCase());
  }
  for (const packageManager of primary.packageManagers) {
    tokens.add(packageManager.id.toLowerCase());
  }

  for (const framework of secondary.frameworks) {
    tokens.add(`secondary:${framework.id.toLowerCase()}`);
  }

  addTokensFromPackageJson(repoRoot, tokens);
  addTokensFromReadme(repoRoot, tokens);
  if (existsInRepo(repoRoot, "src/providers")) {
    tokens.add("src/providers");
    tokens.add("provider-source-path");
  }
  if (existsInRepo(repoRoot, "src/providers/anthropic.ts")) {
    tokens.add("src/providers/anthropic.ts");
    tokens.add("anthropic-sdk");
  }
  if (existsInRepo(repoRoot, ".claude/skills")) {
    tokens.add(".claude/skills");
    tokens.add("skill-authoring-path");
  }
  if (existsInRepo(repoRoot, "skills")) {
    tokens.add("skills");
    tokens.add("skill-authoring-path");
  }
  return tokens;
}

function addTokensFromPackageJson(repoRoot: string, tokens: Set<string>): void {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return;
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!existsSync(packageJsonPath)) return;

  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      name?: string;
      description?: string;
      keywords?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const token of toTokenSet(parsed.name ?? "")) tokens.add(token);
    for (const token of toTokenSet(parsed.description ?? "")) tokens.add(token);
    for (const keyword of parsed.keywords ?? []) {
      for (const token of toTokenSet(keyword)) tokens.add(token);
    }
    for (const dep of Object.keys(parsed.dependencies ?? {})) {
      for (const token of toTokenSet(dep)) tokens.add(token);
      tokens.add(dep.toLowerCase());
    }
    for (const dep of Object.keys(parsed.devDependencies ?? {})) {
      for (const token of toTokenSet(dep)) tokens.add(token);
      tokens.add(dep.toLowerCase());
    }
  } catch {
    // best-effort parsing only
  }
}

function addTokensFromReadme(repoRoot: string, tokens: Set<string>): void {
  if (!repoRoot || !path.isAbsolute(repoRoot)) return;
  const readmeCandidates = ["README.md", "README", "readme.md", "readme"];

  for (const candidate of readmeCandidates) {
    const filePath = path.join(repoRoot, candidate);
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf8");
      for (const token of toTokenSet(raw.slice(0, 3000))) {
        tokens.add(token);
      }
      break;
    } catch {
      // best-effort parsing only
    }
  }
}

function toTokenSet(input: string): Set<string> {
  const normalized = normalizeTextForSearch(input);

  if (normalized.length === 0) return new Set<string>();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const output = new Set(tokens);

  for (const token of tokens) {
    if (token.includes("-")) {
      for (const part of token.split("-")) {
        if (part) output.add(part);
      }
    }
    if (token.includes("_")) {
      for (const part of token.split("_")) {
        if (part) output.add(part);
      }
    }
  }

  return output;
}

function normalizeTextForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
