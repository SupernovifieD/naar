import type { CommandFact, LanguageDetection, PackageManagerDetection, ProjectTypeDetection, ToolDetection } from "../../types/index.js";
import type { DetectorContext, FrameworkSignal, ProjectTypeSignal } from "./common.js";
import { makeEvidence } from "./common.js";

type ProjectTypeInputs = {
  frameworks: FrameworkSignal[];
  languages: LanguageDetection[];
  packageManagers: PackageManagerDetection[];
  commands: CommandFact[];
  buildTools: ToolDetection[];
  testTools: ToolDetection[];
};

const FRONTEND_FRAMEWORKS = new Set([
  "react", "vue", "angular", "svelte", "solid", "preact", "qwik", "lit", "alpine",
  "nextjs", "nuxt", "sveltekit", "astro", "remix", "gatsby", "redwoodjs", "blitzjs", "tanstack-start", "vitepress", "docusaurus"
]);

const FULLSTACK_FRAMEWORKS = new Set(["nextjs", "nuxt", "sveltekit", "redwoodjs", "blitzjs", "remix"]);
const STATIC_SITE_FRAMEWORKS = new Set(["astro", "vitepress", "docusaurus", "gatsby"]);
const API_FRAMEWORKS = new Set([
  "express", "fastify", "nestjs", "koa", "hono", "elysia", "adonisjs", "feathers", "loopback", "trpc", "apollo-server", "graphql-yoga",
  "fastapi", "flask", "django", "starlette", "litestar", "sanic", "tornado", "pyramid", "falcon",
  "gin", "echo", "fiber", "chi", "gorilla-mux", "beego", "buffalo", "hertz", "gqlgen", "connect-go", "grpc-go",
  "laravel", "symfony", "slim", "lumen", "codeigniter", "cakephp", "yii", "laminas", "phalcon"
]);
const CLI_SIGNALS = new Set(["cobra", "urfave-cli", "kong", "click", "typer"]);
const CMS_FRAMEWORKS = new Set(["wordpress", "drupal", "joomla", "magento"]);
const DATA_SCIENCE_SIGNALS = new Set(["jupyter", "pandas", "numpy", "scipy", "scikit-learn", "pytorch", "tensorflow", "polars"]);
const WORKER_SIGNALS = new Set(["celery", "rq", "dramatiq"]);

export function detectProjectTypeSignals(
  context: DetectorContext,
  input: ProjectTypeInputs
): ProjectTypeSignal[] {
  const signals: ProjectTypeSignal[] = [];
  const frameworkIds = new Set(input.frameworks.map((framework) => framework.id));
  const languageIds = new Set(input.languages.map((language) => language.id.toLowerCase()));
  const hasPrimarySources = context.files.some((file) => file.scope === "root" || file.scope === "src");
  const primaryPackageJson = context.packageJsonRecords.find((record) => record.path === "package.json");
  const primaryComposerJson = context.composerJsonRecords.find((record) => record.path === "composer.json");

  if (primaryPackageJson?.data.bin || hasFramework(frameworkIds, CLI_SIGNALS) || context.files.some((file) => file.path.startsWith("cmd/"))) {
    pushProjectType(signals, "cli", evidencePathFromContext(context, "package.json", "cmd/"));
  }

  if (primaryPackageJson?.data.name && primaryPackageJson.data.version) {
    pushProjectType(signals, "package", {
      path: primaryPackageJson.path,
      scope: primaryPackageJson.scope,
      reason: "package.json has name and version",
      confidence: 0.96
    });
  }

  if (primaryComposerJson?.data.name) {
    pushProjectType(signals, "package", {
      path: primaryComposerJson.path,
      scope: primaryComposerJson.scope,
      reason: "composer.json has package name",
      confidence: 0.94
    });
  }

  if (isLikelyLibrary(primaryPackageJson, primaryComposerJson, frameworkIds, input.commands)) {
    const path = primaryPackageJson?.path ?? primaryComposerJson?.path ?? "package.json";
    const scope = primaryPackageJson?.scope ?? primaryComposerJson?.scope ?? "root";
    pushProjectType(signals, "library", { path, scope, reason: "package/composer metadata indicates reusable library", confidence: 0.86 });
  }

  if (hasFramework(frameworkIds, FRONTEND_FRAMEWORKS)) {
    pushProjectType(signals, "web-app", frameworkEvidence(input.frameworks, FRONTEND_FRAMEWORKS, "frontend framework indicates web app", 0.9));
  }
  if (hasFramework(frameworkIds, FULLSTACK_FRAMEWORKS)) {
    pushProjectType(signals, "fullstack", frameworkEvidence(input.frameworks, FULLSTACK_FRAMEWORKS, "meta framework indicates fullstack app", 0.92));
  }
  if (hasFramework(frameworkIds, STATIC_SITE_FRAMEWORKS)) {
    pushProjectType(signals, "static-site", frameworkEvidence(input.frameworks, STATIC_SITE_FRAMEWORKS, "framework indicates static-site project", 0.9));
  }
  if (hasFramework(frameworkIds, API_FRAMEWORKS) || context.files.some((file) => /(^|\/)api\//.test(file.path))) {
    pushProjectType(signals, "api", frameworkEvidence(input.frameworks, API_FRAMEWORKS, "API framework or api path is present", 0.88));
  }
  if (hasFramework(frameworkIds, CMS_FRAMEWORKS)) {
    pushProjectType(signals, "cms", frameworkEvidence(input.frameworks, CMS_FRAMEWORKS, "CMS framework signature is present", 0.9));
  }
  if (hasFramework(frameworkIds, DATA_SCIENCE_SIGNALS) || context.files.some((file) => /(^|\/)notebooks?\//.test(file.path))) {
    pushProjectType(signals, "data-science", frameworkEvidence(input.frameworks, DATA_SCIENCE_SIGNALS, "data-science frameworks/notebooks are present", 0.88));
  }
  if (hasFramework(frameworkIds, WORKER_SIGNALS) || context.files.some((file) => file.path.startsWith("services/worker") || file.path.startsWith("workers/"))) {
    pushProjectType(signals, "worker/service", evidencePathFromContext(context, "services/worker", "workers/"));
  }

  if (isMonorepo(context, frameworkIds)) {
    pushProjectType(signals, "monorepo", evidencePathFromContext(context, "pnpm-workspace.yaml", "packages/"));
  }

  const docsFiles = context.files.filter((file) => file.scope === "docs");
  if (docsFiles.length > 0 && !hasPrimarySources) {
    pushProjectType(signals, "docs", {
      path: docsFiles[0].path,
      scope: docsFiles[0].scope,
      reason: "docs files dominate repository",
      confidence: 0.78
    });
  }

  if (!signals.some((signal) => signal.id === "package") && languageIds.has("go") && context.goModRecords.length > 0) {
    const goMod = context.goModRecords[0];
    pushProjectType(signals, "package", {
      path: goMod.path,
      scope: goMod.scope,
      reason: "go.mod indicates module package",
      confidence: 0.88
    });
  }

  if (!signals.some((signal) => signal.id === "package") && languageIds.has("python") && context.pyprojectRecords.length > 0) {
    const pyproject = context.pyprojectRecords[0];
    pushProjectType(signals, "package", {
      path: pyproject.path,
      scope: pyproject.scope,
      reason: "pyproject.toml indicates python package metadata",
      confidence: 0.86
    });
  }

  // Mild compatibility hint: toolchain indicates JS package workflow.
  if (
    input.packageManagers.some((manager) => manager.id === "npm")
    && input.buildTools.some((tool) => tool.id === "tsup")
    && input.testTools.some((tool) => tool.id === "vitest")
  ) {
    pushProjectType(signals, "package", {
      path: "package.json",
      scope: "root",
      reason: "npm + tsup + vitest toolchain indicates package workflow",
      confidence: 0.72
    });
  }

  return signals;
}

function pushProjectType(
  output: ProjectTypeSignal[],
  id: ProjectTypeDetection["id"],
  evidenceSource: { path: string; scope: ProjectTypeSignal["evidence"]["scope"]; reason: string; confidence: number }
): void {
  output.push({
    id,
    confidence: evidenceSource.confidence,
    evidence: makeEvidence(evidenceSource.path, evidenceSource.scope, evidenceSource.reason, evidenceSource.confidence, "found_path")
  });
}

function hasFramework(frameworkIds: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (frameworkIds.has(candidate)) return true;
  }
  return false;
}

function frameworkEvidence(
  frameworks: FrameworkSignal[],
  ids: Set<string>,
  reason: string,
  confidence: number
): { path: string; scope: ProjectTypeSignal["evidence"]["scope"]; reason: string; confidence: number } {
  const matched = frameworks.find((framework) => ids.has(framework.id));
  if (!matched) {
    return { path: ".", scope: "root", reason, confidence };
  }
  return {
    path: matched.evidence.path,
    scope: matched.evidence.scope,
    reason: `${reason} (${matched.id})`,
    confidence
  };
}

function evidencePathFromContext(
  context: DetectorContext,
  preferredPath: string,
  fallbackPrefix: string
): { path: string; scope: ProjectTypeSignal["evidence"]["scope"]; reason: string; confidence: number } {
  const exact = context.files.find((file) => file.path === preferredPath);
  if (exact) {
    return {
      path: exact.path,
      scope: exact.scope,
      reason: `${preferredPath} is present`,
      confidence: 0.9
    };
  }
  const prefix = context.files.find((file) => file.path.startsWith(fallbackPrefix));
  if (prefix) {
    return {
      path: prefix.path,
      scope: prefix.scope,
      reason: `${fallbackPrefix} path is present`,
      confidence: 0.86
    };
  }
  return {
    path: preferredPath,
    scope: "root",
    reason: `${preferredPath} convention implies project type`,
    confidence: 0.8
  };
}

function isMonorepo(context: DetectorContext, frameworkIds: Set<string>): boolean {
  if (context.files.some((file) => file.path === "pnpm-workspace.yaml" || file.path === "turbo.json" || file.path === "nx.json" || file.path === "lerna.json" || file.path === "rush.json")) {
    return true;
  }
  const workspacePackageCount = context.packageJsonRecords
    .filter((record) => /^(packages|apps|services)\/[^/]+\/package\.json$/.test(record.path))
    .length;
  if (workspacePackageCount >= 2) return true;
  return frameworkIds.has("turborepo") || frameworkIds.has("nx") || frameworkIds.has("lerna");
}

function isLikelyLibrary(
  packageJson: DetectorContext["packageJsonRecords"][number] | undefined,
  composerJson: DetectorContext["composerJsonRecords"][number] | undefined,
  frameworkIds: Set<string>,
  commands: CommandFact[]
): boolean {
  if (composerJson?.data.type && composerJson.data.type.toLowerCase().includes("library")) {
    return true;
  }
  if (!packageJson) return false;
  const hasEntrypoints = Boolean(packageJson.data.main || packageJson.data.module || packageJson.data.exports || packageJson.data.types);
  const hasCli = Boolean(packageJson.data.bin);
  const hasAppSignals = hasFramework(frameworkIds, FRONTEND_FRAMEWORKS) || hasFramework(frameworkIds, API_FRAMEWORKS)
    || commands.some((command) => command.role === "dev" || command.role === "start");
  return hasEntrypoints && !hasCli && !hasAppSignals;
}

