import type { RepoFacts, RepoNeed } from "../types/index.js";

export type RecommendationQueryTermKind =
  | "project-type"
  | "framework"
  | "language"
  | "tool"
  | "ci"
  | "infra"
  | "command"
  | "repo-need"
  | "domain"
  | "assistant-setup"
  | "composite";

export interface RecommendationQueryTerm {
  term: string;
  kind: RecommendationQueryTermKind;
  weight: number;
  reason: string;
  sourceNeedIds?: string[];
  sourceFactIds?: string[];
}

export interface RecommendationQueryPlan {
  terms: RecommendationQueryTerm[];
  primaryTerms: string[];
  providerQueries: string[];
  needIds: string[];
  frameworkIds: string[];
  toolIds: string[];
  projectTypeIds: string[];
}

const MAX_PROVIDER_QUERIES = 12;
const PRIMARY_TERM_COUNT = 6;

const KIND_PRIORITY: RecommendationQueryTermKind[] = [
  "composite",
  "repo-need",
  "framework",
  "project-type",
  "tool",
  "ci",
  "infra",
  "assistant-setup",
  "command",
  "domain",
  "language"
];

const PROJECT_TYPE_QUERY_TERMS: Record<string, Array<{ term: string; weight: number; kind?: RecommendationQueryTermKind }>> = {
  cli: [
    { term: "cli", weight: 76 },
    { term: "command line", weight: 72 },
    { term: "terminal ux", weight: 70 }
  ],
  package: [
    { term: "npm package", weight: 86 },
    { term: "package release", weight: 78 },
    { term: "npm publish", weight: 74 }
  ],
  library: [
    { term: "library development", weight: 72 },
    { term: "api design", weight: 64 }
  ],
  "web-app": [
    { term: "web app development", weight: 82 },
    { term: "frontend architecture", weight: 70 }
  ],
  api: [
    { term: "api development", weight: 84 },
    { term: "backend api", weight: 78 }
  ],
  monorepo: [
    { term: "monorepo", weight: 88 },
    { term: "workspace", weight: 80 }
  ],
  docs: [
    { term: "documentation", weight: 82 },
    { term: "docs site", weight: 78 }
  ]
};

const FRAMEWORK_QUERY_TERMS: Record<string, Array<{ term: string; weight: number }>> = {
  nextjs: [
    { term: "nextjs", weight: 92 },
    { term: "next.js", weight: 79 },
    { term: "react nextjs", weight: 74 }
  ],
  react: [
    { term: "react", weight: 83 },
    { term: "react component", weight: 78 }
  ],
  tailwind: [
    { term: "tailwind", weight: 83 },
    { term: "tailwind ui", weight: 78 }
  ],
  vue: [
    { term: "vue", weight: 82 }
  ],
  nuxt: [
    { term: "nuxt", weight: 84 }
  ],
  fastapi: [
    { term: "fastapi", weight: 92 },
    { term: "python api", weight: 88 }
  ],
  django: [
    { term: "django", weight: 90 },
    { term: "python api", weight: 84 }
  ],
  flask: [
    { term: "flask", weight: 90 },
    { term: "python api", weight: 82 }
  ],
  vitepress: [
    { term: "vitepress", weight: 84 },
    { term: "docs site", weight: 78 }
  ],
  docusaurus: [
    { term: "docusaurus", weight: 84 },
    { term: "docs site", weight: 78 }
  ]
};

const TOOL_QUERY_TERMS: Record<string, Array<{ term: string; weight: number; kind?: RecommendationQueryTermKind }>> = {
  tsup: [{ term: "tsup build", weight: 82 }],
  tsc: [{ term: "typescript typecheck", weight: 86 }],
  vitest: [{ term: "vitest testing", weight: 88 }],
  jest: [{ term: "jest testing", weight: 86 }],
  playwright: [{ term: "playwright testing", weight: 88 }],
  pytest: [{ term: "pytest testing", weight: 88 }],
  "github-actions": [{ term: "github actions ci", weight: 90, kind: "ci" }],
  docker: [{ term: "docker", weight: 74, kind: "infra" }],
  turbo: [{ term: "turborepo", weight: 84 }],
  turborepo: [{ term: "turborepo", weight: 84 }],
  nx: [{ term: "nx workspace", weight: 82 }]
};

const NEED_QUERY_TERMS: Record<string, Array<{ term: string; weight: number }>> = {
  node_cli_development: [{ term: "cli development", weight: 78 }],
  cli_command_design: [{ term: "cli command design", weight: 92 }],
  terminal_output_design: [{ term: "terminal ux", weight: 89 }],
  interactive_cli_ux: [{ term: "interactive cli", weight: 81 }],
  npm_package_development: [{ term: "npm package", weight: 90 }],
  npm_publish_workflow: [{ term: "npm publish workflow", weight: 79 }],
  release_safety: [{ term: "release safety", weight: 78 }],
  typescript_typecheck: [{ term: "typescript typecheck", weight: 83 }],
  typescript_config_review: [{ term: "tsconfig review", weight: 84 }],
  typescript_refactor_safety: [{ term: "typescript refactor safety", weight: 82 }],
  vitest_testing: [{ term: "vitest testing", weight: 88 }],
  test_generation: [{ term: "test generation", weight: 77 }],
  test_debugging: [{ term: "test debugging", weight: 80 }],
  github_actions_ci: [{ term: "github actions ci", weight: 90 }],
  provider_integration: [{ term: "provider integration", weight: 86 }],
  safe_file_writes: [{ term: "safe file writes", weight: 85 }],
  install_plan_review: [{ term: "install plan", weight: 81 }],
  provenance_tracking: [{ term: "provenance tracking", weight: 72 }],
  agent_config_setup: [{ term: "agent config setup", weight: 74 }],
  claude_project_setup: [{ term: "claude project setup", weight: 78 }],
  copilot_instruction_setup: [{ term: "copilot instructions", weight: 78 }],
  mcp_server_development: [{ term: "mcp server", weight: 76 }],
  web_app_development: [{ term: "web app development", weight: 87 }],
  api_development: [{ term: "api development", weight: 84 }],
  python_development: [{ term: "python development", weight: 74 }],
  docs_project_support: [{ term: "documentation", weight: 82 }],
  monorepo_navigation: [{ term: "monorepo navigation", weight: 84 }]
};

const STANDALONE_LANGUAGE_ALLOWLIST = new Set(["go", "rust", "php", "ruby"]);
const GENERIC_QUERY_BLACKLIST = new Set(["app", "code", "project", "development", "javascript", "typescript"]);

export function buildRecommendationQueryPlan(
  repoFacts: RepoFacts,
  repoNeeds: RepoNeed[]
): RecommendationQueryPlan {
  const termMap = new Map<string, RecommendationQueryTerm>();
  const primaryFacts = repoFacts.primaryFacts;
  const projectTypeIds = dedupeStrings(primaryFacts?.projectTypes.map((fact) => fact.id) ?? []);
  const frameworkIds = dedupeStrings((primaryFacts?.frameworks ?? repoFacts.frameworks).map((fact) => fact.id));
  const toolIds = dedupeStrings([
    ...(primaryFacts?.buildTools.map((tool) => tool.id) ?? []),
    ...(primaryFacts?.testTools.map((tool) => tool.id) ?? []),
    ...(primaryFacts?.ci.map((tool) => tool.id) ?? []),
    ...(primaryFacts?.infra.map((tool) => tool.id) ?? [])
  ]);
  const needIds = dedupeStrings(repoNeeds.map((need) => need.id));
  const languageIds = dedupeStrings((primaryFacts?.languages ?? []).map((language) => language.id));
  const commandRoles = dedupeStrings((primaryFacts?.commands ?? []).map((command) => command.role));
  const packageManagerIds = dedupeStrings((primaryFacts?.packageManagers ?? repoFacts.packageManagers).map((manager) => manager.id));

  const addTerm = (input: RecommendationQueryTerm): void => {
    const normalizedTerm = normalizeQueryTerm(input.term);
    if (!normalizedTerm || GENERIC_QUERY_BLACKLIST.has(normalizedTerm)) {
      return;
    }

    const existing = termMap.get(normalizedTerm);
    if (!existing) {
      termMap.set(normalizedTerm, {
        ...input,
        term: normalizedTerm,
        sourceNeedIds: dedupeStrings(input.sourceNeedIds ?? []),
        sourceFactIds: dedupeStrings(input.sourceFactIds ?? [])
      });
      return;
    }

    existing.weight = Math.max(existing.weight, input.weight);
    existing.reason = existing.reason === input.reason ? existing.reason : `${existing.reason}; ${input.reason}`;
    existing.sourceNeedIds = dedupeStrings([...(existing.sourceNeedIds ?? []), ...(input.sourceNeedIds ?? [])]);
    existing.sourceFactIds = dedupeStrings([...(existing.sourceFactIds ?? []), ...(input.sourceFactIds ?? [])]);
    if (kindPriority(input.kind) < kindPriority(existing.kind)) {
      existing.kind = input.kind;
    }
  };

  for (const projectTypeId of projectTypeIds) {
    for (const entry of PROJECT_TYPE_QUERY_TERMS[projectTypeId] ?? []) {
      addTerm({
        term: entry.term,
        kind: entry.kind ?? "project-type",
        weight: entry.weight,
        reason: `Project type: ${projectTypeId}`,
        sourceFactIds: [projectTypeId]
      });
    }
  }

  for (const frameworkId of frameworkIds) {
    for (const entry of FRAMEWORK_QUERY_TERMS[normalizeKey(frameworkId)] ?? []) {
      addTerm({
        term: entry.term,
        kind: "framework",
        weight: entry.weight,
        reason: `Framework: ${frameworkId}`,
        sourceFactIds: [frameworkId]
      });
    }
  }

  for (const toolId of toolIds) {
    for (const entry of TOOL_QUERY_TERMS[normalizeKey(toolId)] ?? []) {
      addTerm({
        term: entry.term,
        kind: entry.kind ?? "tool",
        weight: entry.weight,
        reason: `Tool: ${toolId}`,
        sourceFactIds: [toolId]
      });
    }
  }

  for (const need of repoNeeds) {
    for (const entry of NEED_QUERY_TERMS[need.id] ?? []) {
      addTerm({
        term: entry.term,
        kind: need.id.includes("setup") || need.id.includes("instruction") ? "assistant-setup" : "repo-need",
        weight: entry.weight,
        reason: need.reason,
        sourceNeedIds: [need.id],
        sourceFactIds: need.sourceFacts.map((fact) => fact.id)
      });
    }
  }

  for (const composite of buildCompositeTerms({
    languageIds,
    projectTypeIds,
    frameworkIds,
    toolIds,
    packageManagerIds,
    commandRoles
  })) {
    addTerm(composite);
  }

  if (termMap.size < 4) {
    for (const languageId of languageIds) {
      const normalizedLanguage = normalizeKey(languageId);
      if (STANDALONE_LANGUAGE_ALLOWLIST.has(normalizedLanguage)) {
        addTerm({
          term: normalizedLanguage,
          kind: "language",
          weight: 52,
          reason: `Fallback standalone language query for ${languageId}`,
          sourceFactIds: [languageId]
        });
      }
    }
  }

  const terms = [...termMap.values()].sort(sortTerms);
  const providerQueries = terms.slice(0, MAX_PROVIDER_QUERIES).map((term) => term.term);
  const primaryTerms = providerQueries.slice(0, PRIMARY_TERM_COUNT);

  return {
    terms,
    primaryTerms,
    providerQueries,
    needIds,
    frameworkIds,
    toolIds,
    projectTypeIds
  };
}

export function renderRecommendationQueryPlan(plan: RecommendationQueryPlan): string {
  const lines: string[] = [
    "Recommendation query plan",
    "",
    "Provider queries:"
  ];

  for (const [index, term] of plan.terms
    .filter((entry) => plan.providerQueries.includes(entry.term))
    .slice(0, plan.providerQueries.length)
    .entries()) {
    lines.push(
      `  ${index + 1}. ${term.term.padEnd(30)} ${term.kind.padEnd(15)} weight=${term.weight}`
    );
  }

  lines.push("");
  lines.push(`Signals:`);
  lines.push(`  needs: ${formatList(plan.needIds)}`);
  lines.push(`  project types: ${formatList(plan.projectTypeIds)}`);
  lines.push(`  frameworks: ${formatList(plan.frameworkIds)}`);
  lines.push(`  tools: ${formatList(plan.toolIds)}`);

  return lines.join("\n");
}

function buildCompositeTerms(input: {
  languageIds: string[];
  projectTypeIds: string[];
  frameworkIds: string[];
  toolIds: string[];
  packageManagerIds: string[];
  commandRoles: string[];
}): RecommendationQueryTerm[] {
  const composites: RecommendationQueryTerm[] = [];
  const hasLanguage = (id: string): boolean => input.languageIds.some((value) => normalizeKey(value) === id);
  const hasProjectType = (id: string): boolean => input.projectTypeIds.some((value) => normalizeKey(value) === id);
  const hasFramework = (id: string): boolean => input.frameworkIds.some((value) => normalizeKey(value) === id);
  const hasTool = (id: string): boolean => input.toolIds.some((value) => normalizeKey(value) === id);
  const hasPackageManager = (id: string): boolean => input.packageManagerIds.some((value) => normalizeKey(value) === id);

  if (hasLanguage("typescript") && hasProjectType("cli")) {
    composites.push(makeComposite("typescript cli", 95, ["TypeScript", "cli"]));
  }
  if (hasLanguage("typescript") && hasProjectType("package")) {
    composites.push(makeComposite("typescript npm package", 93, ["TypeScript", "package"]));
  }
  if (hasLanguage("typescript") && hasTool("vitest")) {
    composites.push(makeComposite("typescript vitest", 80, ["TypeScript", "vitest"]));
  }
  if (hasLanguage("typescript") && hasTool("github-actions")) {
    composites.push(makeComposite("typescript github actions", 76, ["TypeScript", "github-actions"]));
  }
  if (hasLanguage("python") && hasProjectType("api")) {
    composites.push(makeComposite("python api", 95, ["Python", "api"]));
  }
  if (hasLanguage("python") && hasTool("pytest")) {
    composites.push(makeComposite("python pytest", 88, ["Python", "pytest"]));
  }
  if (hasFramework("nextjs") && hasFramework("tailwind")) {
    composites.push(makeComposite("nextjs tailwind", 94, ["nextjs", "tailwind"]));
  }
  if (hasFramework("react") && hasFramework("tailwind")) {
    composites.push(makeComposite("react tailwind", 90, ["react", "tailwind"]));
  }
  if (hasProjectType("monorepo") && hasProjectType("package")) {
    composites.push(makeComposite("monorepo package", 92, ["monorepo", "package"]));
  }
  if (hasProjectType("monorepo") && hasPackageManager("pnpm")) {
    composites.push(makeComposite("pnpm workspace", 89, ["pnpm", "workspace"]));
  }

  return composites;
}

function makeComposite(term: string, weight: number, sourceFactIds: string[]): RecommendationQueryTerm {
  return {
    term,
    kind: "composite",
    weight,
    reason: `Composite query from ${sourceFactIds.join(" + ")}`,
    sourceFactIds
  };
}

function normalizeQueryTerm(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function sortTerms(left: RecommendationQueryTerm, right: RecommendationQueryTerm): number {
  if (right.weight !== left.weight) {
    return right.weight - left.weight;
  }

  const kindDelta = kindPriority(left.kind) - kindPriority(right.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }

  return left.term.localeCompare(right.term);
}

function kindPriority(kind: RecommendationQueryTermKind): number {
  const index = KIND_PRIORITY.indexOf(kind);
  return index === -1 ? KIND_PRIORITY.length : index;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
