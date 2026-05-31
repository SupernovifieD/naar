import path from "node:path";
import fg from "fast-glob";
import { parse as parseToml } from "@iarna/toml";
import { readFile } from "node:fs/promises";
import type {
  AIAssistantDetection,
  CommandFact,
  CommandRole,
  FactEvidence,
  FrameworkDetection,
  LanguageDetection,
  PackageManagerDetection,
  ProjectTypeDetection,
  RepoFacts,
  RepoFinding,
  RepoPrimaryFacts,
  RepoSecondaryFacts,
  RepoTopology,
  ScanScope,
  ToolDetection
} from "../types/index.js";
import { MAX_SCAN_DEPTH, MAX_SCAN_FILES } from "../config/defaults.js";
import { classifyPathScope, isPrimaryScope, normalizePath } from "./scope.js";

const IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**"
];

export const SCAN_SCHEMA_VERSION = 2;

type ScanOptions = {
  maxFiles?: number;
  maxDepth?: number;
};

type ScopedFile = {
  path: string;
  scope: ScanScope;
};

type PackageJsonLike = {
  name?: string;
  version?: string;
  license?: string;
  private?: boolean;
  type?: string;
  main?: string;
  module?: string;
  types?: string;
  files?: unknown;
  exports?: unknown;
  bin?: unknown;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

type PackageJsonRecord = {
  path: string;
  scope: ScanScope;
  data: PackageJsonLike;
};

type DependencySignal = {
  dep: string;
  path: string;
  scope: ScanScope;
  reason: string;
};

type FrameworkSignal = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  evidence: FactEvidence;
};

type PackageManagerSignal = {
  id: PackageManagerDetection["id"];
  confidence: number;
  lockfile: string;
  workspaceMode?: boolean;
  evidence: FactEvidence;
};

type LanguageSignal = {
  id: string;
  confidence: number;
  evidence: FactEvidence;
};

type ProjectTypeSignal = {
  id: ProjectTypeDetection["id"];
  confidence: number;
  evidence: FactEvidence;
};

type ToolSignal = {
  id: string;
  confidence: number;
  evidence: FactEvidence;
};

const FRONTEND_FRAMEWORKS = new Set(["react", "nextjs", "vue", "nuxt", "svelte", "sveltekit", "angular", "vite", "tailwind", "shadcn-ui"]);
const PYTHON_FRAMEWORKS = new Set(["fastapi", "flask", "django", "streamlit", "pytest"]);

const FRAMEWORK_DEPENDENCY_MAP: Record<string, { id: string; category: FrameworkDetection["category"]; confidence: number }> = {
  react: { id: "react", category: "frontend", confidence: 0.97 },
  next: { id: "nextjs", category: "frontend", confidence: 0.98 },
  vue: { id: "vue", category: "frontend", confidence: 0.97 },
  nuxt: { id: "nuxt", category: "frontend", confidence: 0.98 },
  svelte: { id: "svelte", category: "frontend", confidence: 0.97 },
  "@sveltejs/kit": { id: "sveltekit", category: "frontend", confidence: 0.98 },
  "@angular/core": { id: "angular", category: "frontend", confidence: 0.98 },
  vite: { id: "vite", category: "build", confidence: 0.95 },
  tailwindcss: { id: "tailwind", category: "styling", confidence: 0.95 },
  flask: { id: "flask", category: "backend", confidence: 0.95 },
  fastapi: { id: "fastapi", category: "backend", confidence: 0.95 },
  django: { id: "django", category: "backend", confidence: 0.95 },
  streamlit: { id: "streamlit", category: "backend", confidence: 0.9 },
  pytest: { id: "pytest", category: "testing", confidence: 0.95 }
};

const BUILD_TOOL_NAMES = ["tsup", "vite", "webpack", "rollup", "esbuild", "parcel", "swc", "tsc"];
const TEST_TOOL_NAMES = ["vitest", "jest", "mocha", "ava", "pytest", "playwright", "cypress"];
const FRAMEWORK_CATEGORY_RANK: Record<FrameworkDetection["category"], number> = {
  frontend: 1,
  backend: 2,
  styling: 3,
  testing: 4,
  build: 5,
  infra: 6
};

export async function scanRepo(repoRoot: string, options: ScanOptions = {}): Promise<RepoFacts> {
  const maxFiles = options.maxFiles ?? MAX_SCAN_FILES;
  const maxDepth = options.maxDepth ?? MAX_SCAN_DEPTH;

  const files = await fg(["**/*"], {
    cwd: repoRoot,
    dot: true,
    onlyFiles: true,
    deep: maxDepth,
    unique: true,
    ignore: IGNORE_GLOBS,
    followSymbolicLinks: false
  });

  const trimmedFiles = files.slice(0, maxFiles).map((file) => normalizePath(file));
  const scopedFiles = trimmedFiles.map((file): ScopedFile => ({ path: file, scope: classifyPathScope(file) }));
  const fileSet = new Set(scopedFiles.map((file) => file.path));

  const packageJsonData = await loadPackageJsonData(repoRoot, scopedFiles);
  const dependencySignals = await collectDependencySignals(repoRoot, scopedFiles, packageJsonData);

  const frameworkSignals = detectFrameworkSignals(scopedFiles, dependencySignals);
  const frameworkSplit = splitSignalsByPrimaryScope(frameworkSignals);
  const primaryFrameworks = aggregateFrameworkSignals(frameworkSplit.primary);
  const secondaryFrameworks = aggregateFrameworkSignals(frameworkSplit.secondary);

  const packageManagerSignals = detectPackageManagerSignals(scopedFiles, fileSet, packageJsonData);
  const packageManagerSplit = splitSignalsByPrimaryScope(packageManagerSignals);
  let primaryPackageManagers = aggregatePackageManagerSignals(packageManagerSplit.primary);
  const secondaryPackageManagers = aggregatePackageManagerSignals(packageManagerSplit.secondary);

  if (
    primaryPackageManagers.length === 0
    && packageJsonData.some((pkg) => isPrimaryScope(pkg.scope))
  ) {
    primaryPackageManagers = [{
      id: "npm",
      confidence: 0.5,
      lockfiles: [],
      evidence: [makeEvidence("package.json", "root", "package.json is present without a lockfile", 0.5)]
    }];
  }

  const languageSignals = detectLanguageSignals(scopedFiles, primaryFrameworks, secondaryFrameworks);
  const languageSplit = splitSignalsByPrimaryScope(languageSignals);
  const primaryLanguages = aggregateLanguageSignals(languageSplit.primary);
  const secondaryLanguages = aggregateLanguageSignals(languageSplit.secondary);

  const buildToolSignals = detectToolSignals(packageJsonData, "build");
  const testToolSignals = detectToolSignals(packageJsonData, "test");
  const buildToolSplit = splitSignalsByPrimaryScope(buildToolSignals);
  const testToolSplit = splitSignalsByPrimaryScope(testToolSignals);
  const primaryBuildTools = aggregateToolSignals(buildToolSplit.primary);
  const secondaryBuildTools = aggregateToolSignals(buildToolSplit.secondary);
  const primaryTestTools = aggregateToolSignals(testToolSplit.primary);
  const secondaryTestTools = aggregateToolSignals(testToolSplit.secondary);
  const ciSignals = detectCiSignals(scopedFiles);
  const infraSignals = detectInfraSignals(scopedFiles);
  const ciSplit = splitSignalsByPrimaryScope(ciSignals);
  const infraSplit = splitSignalsByPrimaryScope(infraSignals);
  const primaryCi = aggregateToolSignals(ciSplit.primary);
  const secondaryCi = aggregateToolSignals(ciSplit.secondary);
  const primaryInfra = aggregateToolSignals(infraSplit.primary);
  const secondaryInfra = aggregateToolSignals(infraSplit.secondary);

  const commands = detectCommandFacts(packageJsonData);
  const commandSplit = splitCommandFactsByPrimaryScope(commands);

  const projectTypeSignals = await detectProjectTypeSignals(repoRoot, scopedFiles, packageJsonData, {
    primaryFrameworks,
    primaryPackageManagers,
    primaryLanguages,
    primaryBuildTools,
    primaryTestTools
  });
  const projectTypeSplit = splitSignalsByPrimaryScope(projectTypeSignals);
  const primaryProjectTypes = aggregateProjectTypeSignals(projectTypeSplit.primary);
  const secondaryProjectTypes = aggregateProjectTypeSignals(projectTypeSplit.secondary);

  const topology = detectTopology(scopedFiles);
  const aiAssistants = detectAssistants(scopedFiles);
  const findings = detectFindings(scopedFiles, primaryFrameworks, aiAssistants, topology, primaryTestTools, primaryCi, primaryInfra);
  const readiness = calculateReadiness(findings);

  const primaryFacts: RepoPrimaryFacts = {
    projectTypes: primaryProjectTypes,
    languages: primaryLanguages,
    frameworks: primaryFrameworks,
    packageManagers: primaryPackageManagers,
    buildTools: primaryBuildTools,
    testTools: primaryTestTools,
    ci: primaryCi,
    infra: primaryInfra,
    commands: commandSplit.primary
  };

  const secondaryFacts: RepoSecondaryFacts = {
    projectTypes: secondaryProjectTypes,
    languages: secondaryLanguages,
    frameworks: secondaryFrameworks,
    packageManagers: secondaryPackageManagers,
    buildTools: secondaryBuildTools,
    testTools: secondaryTestTools,
    ci: secondaryCi,
    infra: secondaryInfra,
    commands: commandSplit.secondary
  };

  return {
    scanSchemaVersion: SCAN_SCHEMA_VERSION,
    repoRoot,
    scanTimeIso: new Date().toISOString(),
    languages: primaryLanguages.map((language) => language.id),
    packageManagers: primaryPackageManagers,
    frameworks: primaryFrameworks,
    aiAssistants,
    findings,
    topology,
    readiness,
    primaryFacts,
    secondaryFacts
  };
}

async function loadPackageJsonData(repoRoot: string, files: ScopedFile[]): Promise<PackageJsonRecord[]> {
  const packageJsonFiles = files.filter((file) => path.basename(file.path) === "package.json");
  const data: PackageJsonRecord[] = [];

  for (const file of packageJsonFiles) {
    const fullPath = path.join(repoRoot, file.path);
    try {
      const raw = await readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw) as PackageJsonLike;
      data.push({ path: file.path, scope: file.scope, data: parsed });
    } catch {
      // ignore invalid package file
    }
  }

  return data;
}

async function collectDependencySignals(
  repoRoot: string,
  files: ScopedFile[],
  packageJsonData: PackageJsonRecord[]
): Promise<DependencySignal[]> {
  const signals: DependencySignal[] = [];

  for (const pkg of packageJsonData) {
    for (const dep of Object.keys(pkg.data.dependencies ?? {})) {
      signals.push({
        dep: dep.toLowerCase(),
        path: pkg.path,
        scope: pkg.scope,
        reason: `dependencies.${dep} is present`
      });
    }
    for (const dep of Object.keys(pkg.data.devDependencies ?? {})) {
      signals.push({
        dep: dep.toLowerCase(),
        path: pkg.path,
        scope: pkg.scope,
        reason: `devDependencies.${dep} is present`
      });
    }
  }

  const requirementsFiles = files.filter((file) => path.basename(file.path).toLowerCase() === "requirements.txt");
  for (const file of requirementsFiles) {
    try {
      const raw = await readFile(path.join(repoRoot, file.path), "utf8");
      const deps = parseRequirementsDependencies(raw);
      for (const dep of deps) {
        signals.push({
          dep,
          path: file.path,
          scope: file.scope,
          reason: `requirements.txt declares ${dep}`
        });
      }
    } catch {
      // ignore unreadable requirements file
    }
  }

  const pyprojectFiles = files.filter((file) => path.basename(file.path).toLowerCase() === "pyproject.toml");
  for (const file of pyprojectFiles) {
    try {
      const raw = await readFile(path.join(repoRoot, file.path), "utf8");
      const deps = parsePyprojectDependencies(raw);
      for (const dep of deps) {
        signals.push({
          dep,
          path: file.path,
          scope: file.scope,
          reason: `pyproject.toml declares ${dep}`
        });
      }
    } catch {
      // ignore unreadable pyproject
    }
  }

  return signals;
}

function parseRequirementsDependencies(raw: string): string[] {
  const deps = new Set<string>();

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const normalized = trimmed.split(/[<>=!~\[\]]/, 1)[0]?.trim().toLowerCase();
    if (normalized) deps.add(normalized);
  }

  return [...deps];
}

function parsePyprojectDependencies(raw: string): string[] {
  const deps = new Set<string>();

  try {
    const parsed = parseToml(raw) as {
      project?: { dependencies?: string[] };
      tool?: { poetry?: { dependencies?: Record<string, unknown> } };
    };

    for (const entry of parsed.project?.dependencies ?? []) {
      const normalized = String(entry).split(/[<>=!~\[\]]/, 1)[0]?.trim().toLowerCase();
      if (normalized) deps.add(normalized);
    }

    const poetryDeps = parsed.tool?.poetry?.dependencies ?? {};
    for (const name of Object.keys(poetryDeps)) {
      if (name.toLowerCase() === "python") continue;
      deps.add(name.toLowerCase());
    }
  } catch {
    // best-effort parse only
  }

  return [...deps];
}

function detectFrameworkSignals(
  files: ScopedFile[],
  dependencySignals: DependencySignal[]
): FrameworkSignal[] {
  const signals: FrameworkSignal[] = [];

  for (const signal of dependencySignals) {
    const mapped = FRAMEWORK_DEPENDENCY_MAP[signal.dep];
    if (!mapped) continue;
    signals.push({
      id: mapped.id,
      category: mapped.category,
      confidence: mapped.confidence,
      evidence: makeEvidence(signal.path, signal.scope, signal.reason, mapped.confidence)
    });
  }

  for (const file of files) {
    const base = path.basename(file.path).toLowerCase();

    if (/^next\.config\./.test(base)) {
      signals.push(frameworkSignal("nextjs", "frontend", file, "next.config.* file is present", 0.96));
    }
    if (/^nuxt\.config\./.test(base)) {
      signals.push(frameworkSignal("nuxt", "frontend", file, "nuxt.config.* file is present", 0.96));
    }
    if (/^svelte\.config\./.test(base)) {
      signals.push(frameworkSignal("svelte", "frontend", file, "svelte.config.* file is present", 0.95));
    }
    if (/^vite\.config\./.test(base)) {
      signals.push(frameworkSignal("vite", "build", file, "vite.config.* file is present", 0.94));
    }
    if (/^tailwind\.config\./.test(base)) {
      signals.push(frameworkSignal("tailwind", "styling", file, "tailwind.config.* file is present", 0.94));
    }
    if (base === "components.json") {
      signals.push(frameworkSignal("shadcn-ui", "styling", file, "components.json is present", 0.9));
    }
    if (base === "angular.json") {
      signals.push(frameworkSignal("angular", "frontend", file, "angular.json is present", 0.95));
    }
    if (/\.(tsx|jsx)$/i.test(file.path)) {
      signals.push(frameworkSignal("react", "frontend", file, "TSX/JSX file is present", 0.7));
    }
    if (/\.vue$/i.test(file.path)) {
      signals.push(frameworkSignal("vue", "frontend", file, "Vue component file is present", 0.85));
    }
    if (file.path.endsWith("main.py")) {
      signals.push(frameworkSignal("fastapi", "backend", file, "main.py is present", 0.7));
    }
    if (path.basename(file.path) === "app.py") {
      signals.push(frameworkSignal("flask", "backend", file, "app.py is present", 0.7));
    }
    if (path.basename(file.path) === "manage.py") {
      signals.push(frameworkSignal("django", "backend", file, "manage.py is present", 0.75));
    }
    if (/streamlit/i.test(file.path)) {
      signals.push(frameworkSignal("streamlit", "backend", file, "streamlit path reference is present", 0.7));
    }

    if (/\.py$/i.test(file.path) && (/(^|\/)tests?\//i.test(file.path) || /(^|\/)test_[^/]+\.py$/i.test(file.path))) {
      signals.push(frameworkSignal("pytest", "testing", file, "Python test file pattern is present", 0.65));
    }
  }

  return signals;
}

function detectCiSignals(files: ScopedFile[]): ToolSignal[] {
  const signals: ToolSignal[] = [];

  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const base = path.basename(lowerPath);

    if (lowerPath.startsWith(".github/workflows/")) {
      signals.push(toolSignal("github-actions", file, ".github/workflows file is present", 0.95));
      continue;
    }
    if (base === ".gitlab-ci.yml") {
      signals.push(toolSignal("gitlab-ci", file, ".gitlab-ci.yml is present", 0.95));
      continue;
    }
    if (lowerPath.startsWith(".circleci/")) {
      signals.push(toolSignal("circleci", file, ".circleci config is present", 0.95));
      continue;
    }
    if (base === "jenkinsfile") {
      signals.push(toolSignal("jenkins", file, "Jenkinsfile is present", 0.95));
    }
  }

  return signals;
}

function detectInfraSignals(files: ScopedFile[]): ToolSignal[] {
  const signals: ToolSignal[] = [];

  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const base = path.basename(lowerPath);

    if (base === "dockerfile") {
      signals.push(toolSignal("docker", file, "Dockerfile is present", 0.95));
      continue;
    }
    if (base === "docker-compose.yml" || base === "compose.yml") {
      signals.push(toolSignal("docker-compose", file, `${base} is present`, 0.95));
      continue;
    }
    if (base === "vercel.json") {
      signals.push(toolSignal("vercel", file, "vercel.json is present", 0.9));
      continue;
    }
    if (base === "netlify.toml") {
      signals.push(toolSignal("netlify", file, "netlify.toml is present", 0.9));
      continue;
    }
    if (base === "fly.toml") {
      signals.push(toolSignal("fly.io", file, "fly.toml is present", 0.9));
      continue;
    }
    if (base.endsWith(".tf") || base.endsWith(".tfvars")) {
      signals.push(toolSignal("terraform", file, `${base} is present`, 0.85));
      continue;
    }
    if (/(^|\/)(k8s|kubernetes)\//.test(lowerPath) && (base.endsWith(".yml") || base.endsWith(".yaml"))) {
      signals.push(toolSignal("kubernetes", file, "k8s/kubernetes manifest is present", 0.8));
    }
  }

  return signals;
}

function detectPackageManagerSignals(
  files: ScopedFile[],
  fileSet: Set<string>,
  packageJsonData: PackageJsonRecord[]
): PackageManagerSignal[] {
  const signals: PackageManagerSignal[] = [];
  const hasPrimaryWorkspaces = packageJsonData.some((pkg) => isPrimaryScope(pkg.scope) && typeof pkg.data.workspaces !== "undefined")
    || files.some((file) => isPrimaryScope(file.scope) && file.path === "pnpm-workspace.yaml");

  for (const file of files) {
    const base = path.basename(file.path);

    if (base === "pnpm-lock.yaml") {
      signals.push({
        id: "pnpm",
        confidence: 1,
        lockfile: file.path,
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(file.path, file.scope, "pnpm-lock.yaml is present", 1)
      });
    }
    if (base === "yarn.lock") {
      signals.push({
        id: "yarn",
        confidence: 1,
        lockfile: file.path,
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(file.path, file.scope, "yarn.lock is present", 1)
      });
    }
    if (base === "package-lock.json") {
      signals.push({
        id: "npm",
        confidence: 1,
        lockfile: file.path,
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(file.path, file.scope, "package-lock.json is present", 1)
      });
    }
    if (base === "bun.lockb" || base === "bun.lock") {
      signals.push({
        id: "bun",
        confidence: 1,
        lockfile: file.path,
        evidence: makeEvidence(file.path, file.scope, `${base} is present`, 1)
      });
    }
    if (base === "requirements.txt") {
      signals.push({
        id: "pip",
        confidence: 0.9,
        lockfile: file.path,
        evidence: makeEvidence(file.path, file.scope, "requirements.txt is present", 0.9)
      });
    }
    if (base === "poetry.lock") {
      signals.push({
        id: "poetry",
        confidence: 1,
        lockfile: file.path,
        evidence: makeEvidence(file.path, file.scope, "poetry.lock is present", 1)
      });
    }
    if (base === "uv.lock") {
      signals.push({
        id: "uv",
        confidence: 1,
        lockfile: file.path,
        evidence: makeEvidence(file.path, file.scope, "uv.lock is present", 1)
      });
    }
    if (base === "Pipfile") {
      signals.push({
        id: "pipenv",
        confidence: 1,
        lockfile: file.path,
        evidence: makeEvidence(file.path, file.scope, "Pipfile is present", 1)
      });
    }
  }

  if (!signals.some((signal) => signal.id === "npm") && packageJsonData.length > 0) {
    for (const pkg of packageJsonData) {
      signals.push({
        id: "npm",
        confidence: 0.5,
        lockfile: "",
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(pkg.path, pkg.scope, "package.json is present without detected lockfile", 0.5)
      });
    }
  }

  return signals;
}

function detectLanguageSignals(
  files: ScopedFile[],
  primaryFrameworks: FrameworkDetection[],
  secondaryFrameworks: FrameworkDetection[]
): LanguageSignal[] {
  const signals: LanguageSignal[] = [];

  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase();
    if (ext === ".ts" || ext === ".tsx") signals.push(languageSignal("TypeScript", file, `file extension ${ext} is present`, 0.95));
    if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") signals.push(languageSignal("JavaScript", file, `file extension ${ext} is present`, 0.9));
    if (ext === ".py") signals.push(languageSignal("Python", file, "file extension .py is present", 0.95));
    if (ext === ".go") signals.push(languageSignal("Go", file, "file extension .go is present", 0.95));
    if (ext === ".rs") signals.push(languageSignal("Rust", file, "file extension .rs is present", 0.95));
    if (ext === ".java") signals.push(languageSignal("Java", file, "file extension .java is present", 0.95));
    if (ext === ".php") signals.push(languageSignal("PHP", file, "file extension .php is present", 0.95));
  }

  for (const framework of primaryFrameworks) {
    if (FRONTEND_FRAMEWORKS.has(framework.id)) {
      const evidence = framework.evidence[0] ?? makeEvidence(".", "root", `framework ${framework.id} implies JavaScript`, 0.75);
      signals.push({ id: "JavaScript", confidence: 0.75, evidence: { ...evidence, reason: `framework ${framework.id} implies JavaScript` } });
    }
    if (PYTHON_FRAMEWORKS.has(framework.id)) {
      const evidence = framework.evidence[0] ?? makeEvidence(".", "root", `framework ${framework.id} implies Python`, 0.75);
      signals.push({ id: "Python", confidence: 0.75, evidence: { ...evidence, reason: `framework ${framework.id} implies Python` } });
    }
  }

  for (const framework of secondaryFrameworks) {
    if (FRONTEND_FRAMEWORKS.has(framework.id) || PYTHON_FRAMEWORKS.has(framework.id)) {
      const inferredLanguage = FRONTEND_FRAMEWORKS.has(framework.id) ? "JavaScript" : "Python";
      const evidence = framework.evidence[0] ?? makeEvidence(".", "test", `framework ${framework.id} implies ${inferredLanguage}`, 0.7);
      signals.push({
        id: inferredLanguage,
        confidence: 0.7,
        evidence: { ...evidence, reason: `framework ${framework.id} implies ${inferredLanguage}` }
      });
    }
  }

  return signals;
}

function detectToolSignals(
  packageJsonData: PackageJsonRecord[],
  group: "build" | "test"
): ToolSignal[] {
  const signals: ToolSignal[] = [];
  const targetNames = group === "build" ? BUILD_TOOL_NAMES : TEST_TOOL_NAMES;

  for (const pkg of packageJsonData) {
    const deps = pkg.data.dependencies ?? {};
    const devDeps = pkg.data.devDependencies ?? {};
    const scripts = pkg.data.scripts ?? {};

    for (const toolName of targetNames) {
      if (Object.prototype.hasOwnProperty.call(deps, toolName)) {
        signals.push({
          id: toolName,
          confidence: 0.95,
          evidence: makeEvidence(pkg.path, pkg.scope, `dependencies.${toolName} is present`, 0.95)
        });
      }
      if (Object.prototype.hasOwnProperty.call(devDeps, toolName)) {
        signals.push({
          id: toolName,
          confidence: 0.95,
          evidence: makeEvidence(pkg.path, pkg.scope, `devDependencies.${toolName} is present`, 0.95)
        });
      }

      for (const [scriptName, rawScript] of Object.entries(scripts)) {
        if (!rawScript || typeof rawScript !== "string") continue;
        if (containsToken(rawScript, toolName)) {
          signals.push({
            id: toolName,
            confidence: 0.85,
            evidence: makeEvidence(pkg.path, pkg.scope, `scripts.${scriptName} contains ${toolName}`, 0.85)
          });
        }
      }
    }

    if (group === "build" && scripts.typecheck && /\btsc\b/.test(scripts.typecheck)) {
      signals.push({
        id: "tsc",
        confidence: 0.9,
        evidence: makeEvidence(pkg.path, pkg.scope, "scripts.typecheck invokes tsc", 0.9)
      });
    }
  }

  return signals;
}

function detectCommandFacts(packageJsonData: PackageJsonRecord[]): CommandFact[] {
  const commands: CommandFact[] = [];

  for (const pkg of packageJsonData) {
    const scripts = pkg.data.scripts ?? {};

    for (const [name, rawScript] of Object.entries(scripts)) {
      if (!rawScript || typeof rawScript !== "string") continue;
      const { role, confidence } = classifyCommandRole(name, rawScript);
      const command = name === "test" ? "npm test" : `npm run ${name}`;

      commands.push({
        name,
        role,
        command,
        rawScript,
        scope: pkg.scope,
        confidence,
        evidence: [
          makeEvidence(pkg.path, pkg.scope, `scripts.${name} is defined`, confidence)
        ]
      });
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function classifyCommandRole(name: string, rawScript: string): { role: CommandRole; confidence: number } {
  const normalizedName = name.trim().toLowerCase();
  const script = rawScript.toLowerCase();

  if (normalizedName === "build") return { role: "build", confidence: 0.99 };
  if (normalizedName === "dev") return { role: "dev", confidence: 0.99 };
  if (normalizedName === "test") return { role: "test", confidence: 0.99 };
  if (normalizedName === "typecheck" || normalizedName === "check-types") return { role: "typecheck", confidence: 0.99 };
  if (normalizedName === "lint" || normalizedName.startsWith("lint:")) return { role: "lint", confidence: 0.98 };
  if (normalizedName === "format" || normalizedName === "fmt" || normalizedName.startsWith("format:")) return { role: "format", confidence: 0.98 };
  if (normalizedName === "publish") return { role: "publish", confidence: 0.98 };
  if (normalizedName === "release") return { role: "release", confidence: 0.98 };
  if (normalizedName === "prepack") return { role: "prepack", confidence: 0.99 };
  if (normalizedName === "prepublish" || normalizedName === "prepublishonly") return { role: "prepublish", confidence: 0.99 };
  if (normalizedName === "start") return { role: "start", confidence: 0.98 };

  if (normalizedName.includes("e2e") || containsToken(script, "playwright") || containsToken(script, "cypress")) {
    return { role: "e2e", confidence: 0.9 };
  }
  if (normalizedName.includes("unit")) return { role: "unit-test", confidence: 0.9 };
  if (normalizedName.includes("integration")) return { role: "integration-test", confidence: 0.9 };
  if (normalizedName.includes("clean") || /^rimraf\b/.test(script)) return { role: "clean", confidence: 0.9 };
  if (normalizedName.includes("generate") || normalizedName === "gen") return { role: "generate", confidence: 0.9 };
  if (normalizedName.includes("migrate")) return { role: "migrate", confidence: 0.9 };

  if (/docker(-compose)?\s+up/.test(script) || /docker\s+compose\s+up/.test(script)) {
    return { role: "docker-up", confidence: 0.85 };
  }
  if (/docker(-compose)?\s+down/.test(script) || /docker\s+compose\s+down/.test(script)) {
    return { role: "docker-down", confidence: 0.85 };
  }
  if (/\btsc\b\s+--noemit/.test(script)) {
    return { role: "typecheck", confidence: 0.85 };
  }
  if (/\bvitest\b|\bjest\b|\bpytest\b/.test(script)) {
    return { role: "test", confidence: 0.8 };
  }

  return { role: "unknown", confidence: 0.6 };
}

async function detectProjectTypeSignals(
  repoRoot: string,
  files: ScopedFile[],
  packageJsonData: PackageJsonRecord[],
  primary: {
    primaryFrameworks: FrameworkDetection[];
    primaryPackageManagers: PackageManagerDetection[];
    primaryLanguages: LanguageDetection[];
    primaryBuildTools: ToolDetection[];
    primaryTestTools: ToolDetection[];
  }
): Promise<ProjectTypeSignal[]> {
  const signals: ProjectTypeSignal[] = [];
  const rootPackage = packageJsonData.find((pkg) => pkg.path === "package.json");
  const primaryFrameworkIds = new Set(primary.primaryFrameworks.map((framework) => framework.id));

  if (rootPackage) {
    if (hasCliBin(rootPackage.data)) {
      signals.push(projectTypeSignal("cli", rootPackage.path, rootPackage.scope, "package.json bin field is defined", 0.98));
    }

    if (rootPackage.data.name && rootPackage.data.version) {
      signals.push(projectTypeSignal("package", rootPackage.path, rootPackage.scope, "package.json name and version are defined", 0.96));
    }

    if (
      (rootPackage.data.main || rootPackage.data.module || rootPackage.data.exports || rootPackage.data.types)
      && !hasCliBin(rootPackage.data)
    ) {
      signals.push(projectTypeSignal("library", rootPackage.path, rootPackage.scope, "package entrypoint fields indicate a reusable library", 0.85));
    }

    if (typeof rootPackage.data.workspaces !== "undefined") {
      signals.push(projectTypeSignal("monorepo", rootPackage.path, rootPackage.scope, "package.json workspaces field is defined", 0.95));
    }

    const scripts = rootPackage.data.scripts ?? {};
    const hasWebScript = Boolean(scripts.dev || scripts.start || scripts.build);
    if (
      hasWebScript
      && [...primaryFrameworkIds].some((id) => ["nextjs", "react", "vue", "nuxt", "svelte", "sveltekit", "angular"].includes(id))
    ) {
      signals.push(projectTypeSignal("web-app", rootPackage.path, rootPackage.scope, "frontend framework and app scripts are present", 0.82));
    }
  }

  if (files.some((file) => file.path === "pnpm-workspace.yaml" && isPrimaryScope(file.scope))) {
    signals.push(projectTypeSignal("monorepo", "pnpm-workspace.yaml", "root", "pnpm-workspace.yaml is present", 0.95));
  }

  if (
    primaryFrameworkIds.has("fastapi")
    || primaryFrameworkIds.has("flask")
    || primaryFrameworkIds.has("django")
    || files.some((file) => isPrimaryScope(file.scope) && /(^|\/)api\//.test(file.path))
  ) {
    const evidencePath = primaryFrameworkIds.has("fastapi") || primaryFrameworkIds.has("flask") || primaryFrameworkIds.has("django")
      ? (primary.primaryFrameworks.find((framework) => framework.id === "fastapi" || framework.id === "flask" || framework.id === "django")?.evidence[0]?.path ?? ".")
      : files.find((file) => isPrimaryScope(file.scope) && /(^|\/)api\//.test(file.path))?.path ?? ".";
    const evidenceScope = classifyPathScope(evidencePath);
    signals.push(projectTypeSignal("api", evidencePath, evidenceScope, "API framework or API route structure is present", 0.86));
  }

  const nonFixturePackageManifests = packageJsonData.filter((pkg) => isPrimaryScope(pkg.scope));
  const workspacePackageCount = nonFixturePackageManifests.filter((pkg) => /^(packages|apps|services)\/[^/]+\/package\.json$/.test(pkg.path)).length;
  if (workspacePackageCount >= 2) {
    signals.push(projectTypeSignal("monorepo", "packages/*/package.json", "src", "multiple workspace package manifests are present", 0.88));
  }

  const sourceFileCount = files.filter((file) => isPrimaryScope(file.scope) && /\.(ts|tsx|js|jsx|py|go|rs|java|php)$/i.test(file.path)).length;
  const docsFileCount = files.filter((file) => file.scope === "docs").length;
  if (sourceFileCount === 0 && docsFileCount > 0) {
    const docPath = files.find((file) => file.scope === "docs")?.path ?? "docs";
    signals.push(projectTypeSignal("docs", docPath, "docs", "repository appears documentation-dominant", 0.75));
  }

  // Conservative CLI fallback for build entrypoint patterns.
  if (!signals.some((signal) => signal.id === "cli") && files.some((file) => file.path === "tsup.config.ts" && isPrimaryScope(file.scope))) {
    try {
      const raw = await readFile(path.join(repoRoot, "tsup.config.ts"), "utf8");
      if (/entry\s*:\s*\[[^\]]*['"]src\/cli\.ts['"]/m.test(raw)) {
        signals.push(projectTypeSignal("cli", "tsup.config.ts", "root", "tsup entry includes src/cli.ts", 0.84));
      }
    } catch {
      // ignore unreadable tsup config
    }
  }

  // Keep tool-derived hints available for future UX without forcing project type assertions.
  if (
    primary.primaryPackageManagers.some((manager) => manager.id === "npm")
    && primary.primaryLanguages.some((language) => language.id === "TypeScript")
    && primary.primaryBuildTools.some((tool) => tool.id === "tsup")
    && primary.primaryTestTools.some((tool) => tool.id === "vitest")
  ) {
    const evidence = makeEvidence("package.json", "root", "npm + TypeScript + tsup + vitest toolchain is present", 0.7);
    signals.push({ id: "package", confidence: 0.7, evidence });
  }

  return signals;
}

function hasCliBin(pkg: PackageJsonLike): boolean {
  if (typeof pkg.bin === "string" && pkg.bin.trim().length > 0) return true;
  if (pkg.bin && typeof pkg.bin === "object") {
    return Object.keys(pkg.bin as Record<string, unknown>).length > 0;
  }
  return false;
}

function detectTopology(files: ScopedFile[]): RepoTopology {
  const sourceDirs = new Set<string>();
  const routeDirs = new Set<string>();
  const componentDirs = new Set<string>();
  const apiDirs = new Set<string>();
  const testDirs = new Set<string>();
  const docDirs = new Set<string>();

  for (const file of files) {
    if (!isRepositorySignalScope(file.scope)) {
      continue;
    }

    if (/^(src|app)\//.test(file.path) || /\/(src|app)\//.test(file.path)) {
      sourceDirs.add(firstDir(file.path));
    }
    if (/^packages\/[^/]+\/src\//.test(file.path) || /^apps\/[^/]+\//.test(file.path) || /^services\/[^/]+\//.test(file.path)) {
      sourceDirs.add(firstDir(file.path));
    }
    if (/(^|\/)pages\//.test(file.path) || /(^|\/)app\/.*page\./.test(file.path) || /(^|\/)src\/routes\//.test(file.path)) {
      routeDirs.add(parentDir(file.path));
    }
    if (/app\/api\//.test(file.path) || /pages\/api\//.test(file.path) || /(^|\/)api\//.test(file.path)) {
      apiDirs.add(parentDir(file.path));
    }
    if (/(^|\/)components\//.test(file.path)) {
      componentDirs.add(parentDir(file.path));
    }
    if (file.scope === "test" || /\.(test|spec)\.[a-z0-9]+$/i.test(file.path)) {
      testDirs.add(parentDir(file.path));
    }
    if (file.scope === "docs") {
      docDirs.add(parentDir(file.path));
    }
  }

  return {
    sourceDirs: [...sourceDirs].sort(),
    routeDirs: [...routeDirs].sort(),
    componentDirs: [...componentDirs].sort(),
    apiDirs: [...apiDirs].sort(),
    testDirs: [...testDirs].sort(),
    docDirs: [...docDirs].sort()
  };
}

function detectAssistants(files: ScopedFile[]): AIAssistantDetection[] {
  const repoFiles = files.filter((file) => isPrimaryScope(file.scope));
  const paths = repoFiles.map((file) => file.path);
  const fileSet = new Set(paths);

  const hasClaude = fileSet.has("CLAUDE.md") || fileSet.has(".claude/CLAUDE.md") || paths.some((f) => f.startsWith(".claude/"));
  const hasCursor = paths.some((f) => f.startsWith(".cursor/")) || fileSet.has(".cursorrules");
  const hasCopilot = fileSet.has(".github/copilot-instructions.md") || paths.some((f) => f.startsWith(".github/instructions/") && f.endsWith(".instructions.md"));
  const hasCodex = fileSet.has("AGENTS.md") || paths.some((f) => f.startsWith(".codex/")) || paths.some((f) => f.startsWith(".agents/skills/"));
  const hasGeneric = paths.some((f) => f.startsWith(".agents/skills/"));

  return [
    {
      id: "claude",
      status: hasClaude ? "found" : "missing",
      configPathsFound: paths.filter((f) => f === "CLAUDE.md" || f === ".claude/CLAUDE.md" || f.startsWith(".claude/")).slice(0, 20),
      recommendedInstallTargets: ["claude_project_skills"]
    },
    {
      id: "cursor",
      status: hasCursor ? "found" : "missing",
      configPathsFound: paths.filter((f) => f.startsWith(".cursor/") || f === ".cursorrules").slice(0, 20),
      recommendedInstallTargets: ["cursor_project_rules"]
    },
    {
      id: "copilot",
      status: hasCopilot ? "found" : "missing",
      configPathsFound: paths.filter((f) => f === ".github/copilot-instructions.md" || (f.startsWith(".github/instructions/") && f.endsWith(".instructions.md"))).slice(0, 20),
      recommendedInstallTargets: ["copilot_repo_instructions"]
    },
    {
      id: "codex",
      status: hasCodex ? "found" : "missing",
      configPathsFound: paths.filter((f) => f === "AGENTS.md" || f.startsWith(".codex/") || f.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["codex_repo_skills"]
    },
    {
      id: "generic",
      status: hasGeneric ? "found" : "missing",
      configPathsFound: paths.filter((f) => f.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["generic_agent_skills"]
    }
  ];
}

function detectFindings(
  files: ScopedFile[],
  frameworks: FrameworkDetection[],
  assistants: AIAssistantDetection[],
  topology: RepoTopology,
  testTools: ToolDetection[],
  ciTools: ToolDetection[],
  infraTools: ToolDetection[]
): RepoFinding[] {
  const findings: RepoFinding[] = [];
  const frameworkIds = new Set(frameworks.map((framework) => framework.id));
  const ciIds = new Set(ciTools.map((tool) => tool.id));
  const infraIds = new Set(infraTools.map((tool) => tool.id));

  const hasReadme = files.some((file) => {
    if (file.scope === "vendor" || file.scope === "generated" || file.scope === "fixture" || file.scope === "example") {
      return false;
    }
    return /^readme(\.[a-z0-9]+)?$/i.test(path.basename(file.path));
  });

  if (!hasReadme) {
    findings.push({
      code: "missing_readme",
      severity: "warn",
      message: "Repository is missing README documentation.",
      category: "docs",
      evidence: [makeEvidence(".", "root", "no README.* file found outside fixture/example/generated/vendor scopes", 0.9)]
    });
  }

  const hasPrimaryTests = topology.testDirs.length > 0 || testTools.length > 0 || frameworkIds.has("pytest");
  const hasCi = ciIds.size > 0;
  if (!hasPrimaryTests && !hasCi) {
    findings.push({
      code: "missing_testing_setup",
      severity: "warn",
      message: "No primary test configuration or test directories were detected.",
      category: "testing",
      evidence: [makeEvidence(".", "root", "no test directories/tools found in root/src/test scopes", 0.85)]
    });
  }

  const copilot = assistants.find((assistant) => assistant.id === "copilot");
  if (copilot?.status === "missing") {
    findings.push({
      code: "missing_copilot_instructions",
      severity: "info",
      message: "GitHub Copilot repository instructions are missing.",
      category: "ai-config",
      evidence: [makeMissingEvidence(".github/copilot-instructions.md", "root", "Expected Copilot repository instructions were not found in primary scopes", 0.85)]
    });
  }

  const claude = assistants.find((assistant) => assistant.id === "claude");
  if (claude?.status === "missing") {
    findings.push({
      code: "missing_claude_config",
      severity: "info",
      message: "Claude Code project configuration is missing.",
      category: "ai-config",
      evidence: [makeMissingEvidence("CLAUDE.md", "root", "Expected CLAUDE.md or .claude config was not found in primary scopes", 0.85)]
    });
  }

  const hasContainer = infraIds.has("docker") || infraIds.has("docker-compose");
  if (!hasContainer && !hasCi) {
    findings.push({
      code: "missing_ci_or_container",
      severity: "info",
      message: "No CI workflows or container manifests detected.",
      category: "stack",
      evidence: [makeMissingEvidence(".github/workflows", "root", "No Dockerfile/compose/workflow files were found in primary scopes", 0.8)]
    });
  }

  return findings;
}

function calculateReadiness(findings: RepoFinding[]): RepoFacts["readiness"] {
  let score = 100;

  for (const finding of findings) {
    if (finding.severity === "error") score -= 25;
    if (finding.severity === "warn") score -= 12;
    if (finding.severity === "info") score -= 5;
  }

  if (score < 0) score = 0;

  const grade: RepoFacts["readiness"]["grade"] =
    score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor";

  return {
    score,
    grade,
    missingCapabilities: findings.map((finding) => finding.code)
  };
}

function splitCommandFactsByPrimaryScope(signals: CommandFact[]): { primary: CommandFact[]; secondary: CommandFact[] } {
  const primary: CommandFact[] = [];
  const secondary: CommandFact[] = [];

  for (const signal of signals) {
    if (isPrimaryScope(signal.scope)) {
      primary.push(signal);
    } else {
      secondary.push(signal);
    }
  }

  return { primary, secondary };
}

function splitSignalsByPrimaryScope<T extends { evidence: FactEvidence }>(signals: T[]): { primary: T[]; secondary: T[] } {
  const primary: T[] = [];
  const secondary: T[] = [];

  for (const signal of signals) {
    if (isPrimaryScope(signal.evidence.scope)) {
      primary.push(signal);
    } else {
      secondary.push(signal);
    }
  }

  return { primary, secondary };
}

function aggregateFrameworkSignals(signals: FrameworkSignal[]): FrameworkDetection[] {
  const byId = new Map<string, FrameworkDetection>();

  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        category: signal.category,
        confidence: signal.confidence,
        evidence: [signal.evidence]
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }

  return [...byId.values()]
    .sort((a, b) => {
      const byCategory = FRAMEWORK_CATEGORY_RANK[a.category] - FRAMEWORK_CATEGORY_RANK[b.category];
      if (byCategory !== 0) return byCategory;
      const byConfidence = b.confidence - a.confidence;
      if (byConfidence !== 0) return byConfidence;
      return a.id.localeCompare(b.id);
    });
}

function aggregatePackageManagerSignals(signals: PackageManagerSignal[]): PackageManagerDetection[] {
  const byId = new Map<PackageManagerSignal["id"], PackageManagerDetection>();

  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        confidence: signal.confidence,
        lockfiles: signal.lockfile ? [signal.lockfile] : [],
        workspaceMode: signal.workspaceMode,
        evidence: [signal.evidence]
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.workspaceMode = Boolean(existing.workspaceMode || signal.workspaceMode);
    if (signal.lockfile && !existing.lockfiles.includes(signal.lockfile)) {
      existing.lockfiles.push(signal.lockfile);
    }
    existing.evidence = dedupeEvidence([...(existing.evidence ?? []), signal.evidence]);
  }

  return [...byId.values()]
    .map((item) => ({ ...item, lockfiles: [...item.lockfiles].sort() }))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

function aggregateLanguageSignals(signals: LanguageSignal[]): LanguageDetection[] {
  const byId = new Map<string, LanguageDetection>();

  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        confidence: signal.confidence,
        evidence: [signal.evidence]
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }

  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

function aggregateToolSignals(signals: ToolSignal[]): ToolDetection[] {
  const byId = new Map<string, ToolDetection>();

  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        confidence: signal.confidence,
        evidence: [signal.evidence]
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }

  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

function aggregateProjectTypeSignals(signals: ProjectTypeSignal[]): ProjectTypeDetection[] {
  const byId = new Map<ProjectTypeSignal["id"], ProjectTypeDetection>();

  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        confidence: signal.confidence,
        evidence: [signal.evidence]
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }

  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

function dedupeEvidence(evidence: FactEvidence[]): FactEvidence[] {
  const seen = new Set<string>();
  const output: FactEvidence[] = [];

  for (const item of evidence) {
    const key = `${item.path}::${item.scope}::${item.reason}::${String(item.exists)}::${item.kind ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function makeEvidence(pathValue: string, scope: ScanScope, reason: string, confidence = 0.9): FactEvidence {
  return {
    path: normalizePath(pathValue),
    scope,
    reason,
    confidence,
    exists: true,
    kind: "found_path"
  };
}

function makeMissingEvidence(pathValue: string, scope: ScanScope, reason: string, confidence = 0.9): FactEvidence {
  return {
    path: normalizePath(pathValue),
    scope,
    reason,
    confidence,
    exists: false,
    kind: "missing_expected_path"
  };
}

function frameworkSignal(
  id: string,
  category: FrameworkDetection["category"],
  file: ScopedFile,
  reason: string,
  confidence: number
): FrameworkSignal {
  return {
    id,
    category,
    confidence,
    evidence: makeEvidence(file.path, file.scope, reason, confidence)
  };
}

function languageSignal(id: string, file: ScopedFile, reason: string, confidence: number): LanguageSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(file.path, file.scope, reason, confidence)
  };
}

function toolSignal(id: string, file: ScopedFile, reason: string, confidence: number): ToolSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(file.path, file.scope, reason, confidence)
  };
}

function projectTypeSignal(
  id: ProjectTypeDetection["id"],
  pathValue: string,
  scope: ScanScope,
  reason: string,
  confidence: number
): ProjectTypeSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(pathValue, scope, reason, confidence)
  };
}

function containsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`, "i");
  return pattern.test(text);
}

function isRepositorySignalScope(scope: ScanScope): boolean {
  return scope === "root" || scope === "src" || scope === "test" || scope === "docs";
}

function firstDir(file: string): string {
  const idx = file.indexOf("/");
  return idx === -1 ? "." : file.slice(0, idx);
}

function parentDir(file: string): string {
  const idx = file.lastIndexOf("/");
  return idx === -1 ? "." : file.slice(0, idx);
}
