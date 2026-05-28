import path from "node:path";
import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import type {
  AIAssistantDetection,
  FrameworkDetection,
  PackageManagerDetection,
  RepoFacts,
  RepoFinding,
  RepoTopology
} from "../types/index.js";
import { MAX_SCAN_DEPTH, MAX_SCAN_FILES } from "../config/defaults.js";

const IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**"
];

type ScanOptions = {
  maxFiles?: number;
  maxDepth?: number;
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

  const trimmedFiles = files.slice(0, maxFiles);
  const fileSet = new Set(trimmedFiles);

  const packageJsonData = await loadPackageJsonData(repoRoot, trimmedFiles);
  const deps = new Set<string>();
  for (const pkg of packageJsonData) {
    Object.keys(pkg.dependencies ?? {}).forEach((dep) => deps.add(dep));
    Object.keys(pkg.devDependencies ?? {}).forEach((dep) => deps.add(dep));
  }

  const frameworks = detectFrameworks(trimmedFiles, fileSet, deps);
  const packageManagers = detectPackageManagers(trimmedFiles, fileSet, packageJsonData);
  const topology = detectTopology(trimmedFiles);
  const aiAssistants = detectAssistants(trimmedFiles, fileSet);
  const findings = detectFindings(trimmedFiles, frameworks, aiAssistants, topology);
  const languages = detectLanguages(trimmedFiles, frameworks);

  const readiness = calculateReadiness(findings);

  return {
    repoRoot,
    scanTimeIso: new Date().toISOString(),
    languages,
    packageManagers,
    frameworks,
    aiAssistants,
    findings,
    topology,
    readiness
  };
}

async function loadPackageJsonData(repoRoot: string, files: string[]): Promise<Array<Record<string, unknown>>> {
  const packageJsonFiles = files.filter((file) => file.endsWith("package.json"));
  const data: Array<Record<string, unknown>> = [];

  for (const file of packageJsonFiles) {
    const fullPath = path.join(repoRoot, file);
    try {
      const raw = await readFile(fullPath, "utf8");
      data.push(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      // ignore invalid package file
    }
  }

  return data;
}

function hasFile(files: Set<string>, matcher: (file: string) => boolean): boolean {
  for (const file of files) {
    if (matcher(file)) {
      return true;
    }
  }
  return false;
}

function detectFrameworks(
  files: string[],
  fileSet: Set<string>,
  deps: Set<string>
): FrameworkDetection[] {
  const detections: FrameworkDetection[] = [];

  const add = (id: string, category: FrameworkDetection["category"], evidence: string[], confidence = 0.95): void => {
    detections.push({ id, category, evidence, confidence });
  };

  if (deps.has("react") || hasFile(fileSet, (f) => /\.(tsx|jsx)$/.test(f))) {
    add("react", "frontend", ["package.json dependencies", "*.tsx|*.jsx"]);
  }
  if (hasFile(fileSet, (f) => /^next\.config\./.test(path.basename(f))) || deps.has("next")) {
    add("nextjs", "frontend", ["next.config.* or dependency"]);
  }
  if (deps.has("vue") || hasFile(fileSet, (f) => f.includes(".vue"))) {
    add("vue", "frontend", ["vue dependency or *.vue"]);
  }
  if (hasFile(fileSet, (f) => /^nuxt\.config\./.test(path.basename(f))) || deps.has("nuxt")) {
    add("nuxt", "frontend", ["nuxt.config.* or dependency"]);
  }
  if (hasFile(fileSet, (f) => /^svelte\.config\./.test(path.basename(f))) || deps.has("svelte")) {
    add("svelte", "frontend", ["svelte.config.* or dependency"]);
  }
  if (deps.has("@sveltejs/kit")) {
    add("sveltekit", "frontend", ["@sveltejs/kit dependency"]);
  }
  if (fileSet.has("angular.json") || deps.has("@angular/core")) {
    add("angular", "frontend", ["angular.json or dependency"]);
  }
  if (hasFile(fileSet, (f) => /^vite\.config\./.test(path.basename(f))) || deps.has("vite")) {
    add("vite", "build", ["vite.config.* or dependency"]);
  }
  if (hasFile(fileSet, (f) => /^tailwind\.config\./.test(path.basename(f))) || deps.has("tailwindcss")) {
    add("tailwind", "styling", ["tailwind.config.* or dependency"]);
  }
  if (fileSet.has("components.json")) {
    add("shadcn-ui", "styling", ["components.json"]);
  }
  if (deps.has("typescript") || fileSet.has("tsconfig.json")) {
    add("typescript", "build", ["typescript dependency or tsconfig.json"], 0.9);
  }

  // Python framework rules
  if (deps.has("flask") || fileSet.has("app.py")) {
    add("flask", "backend", ["flask dependency or app.py"], deps.has("flask") ? 0.95 : 0.7);
  }
  if (deps.has("fastapi") || hasFile(fileSet, (f) => f.endsWith("main.py"))) {
    add("fastapi", "backend", ["fastapi dependency or main.py"], deps.has("fastapi") ? 0.95 : 0.7);
  }
  if (fileSet.has("manage.py") || deps.has("django")) {
    add("django", "backend", ["manage.py or django dependency"]);
  }
  if (deps.has("streamlit") || hasFile(fileSet, (f) => f.includes("streamlit"))) {
    add("streamlit", "backend", ["streamlit dependency or file reference"], 0.8);
  }
  if (deps.has("pytest") || hasFile(fileSet, (f) => /(^|\/)tests?\//.test(f) || /\.(test|spec)\./.test(f))) {
    add("pytest", "testing", ["pytest dependency or tests folder"], deps.has("pytest") ? 0.95 : 0.6);
  }

  // Infra / CI / container
  if (fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml") || fileSet.has("compose.yml")) {
    add("docker", "infra", ["Dockerfile or compose"]);
  }
  if (hasFile(fileSet, (f) => f.startsWith(".github/workflows/"))) {
    add("github-actions", "infra", [".github/workflows"]);
  }

  // Deduplicate by id
  const byId = new Map<string, FrameworkDetection>();
  for (const detection of detections) {
    if (!byId.has(detection.id)) {
      byId.set(detection.id, detection);
    }
  }

  return [...byId.values()];
}

function detectPackageManagers(
  files: string[],
  fileSet: Set<string>,
  packageJsonData: Array<Record<string, unknown>>
): PackageManagerDetection[] {
  const results: PackageManagerDetection[] = [];
  const hasWorkspaces = packageJsonData.some((pkg) => typeof pkg.workspaces !== "undefined") ||
    fileSet.has("pnpm-workspace.yaml");

  if (fileSet.has("pnpm-lock.yaml")) {
    results.push({ id: "pnpm", confidence: 1, lockfiles: ["pnpm-lock.yaml"], workspaceMode: hasWorkspaces });
  }
  if (fileSet.has("yarn.lock")) {
    results.push({ id: "yarn", confidence: 1, lockfiles: ["yarn.lock"], workspaceMode: hasWorkspaces });
  }
  if (fileSet.has("package-lock.json")) {
    results.push({ id: "npm", confidence: 1, lockfiles: ["package-lock.json"], workspaceMode: hasWorkspaces });
  }
  if (fileSet.has("bun.lockb") || fileSet.has("bun.lock")) {
    results.push({ id: "bun", confidence: 1, lockfiles: fileSet.has("bun.lockb") ? ["bun.lockb"] : ["bun.lock"] });
  }

  if (fileSet.has("requirements.txt")) {
    results.push({ id: "pip", confidence: 0.9, lockfiles: ["requirements.txt"] });
  }
  if (fileSet.has("poetry.lock")) {
    results.push({ id: "poetry", confidence: 1, lockfiles: ["poetry.lock"] });
  }
  if (fileSet.has("uv.lock")) {
    results.push({ id: "uv", confidence: 1, lockfiles: ["uv.lock"] });
  }
  if (fileSet.has("Pipfile")) {
    results.push({ id: "pipenv", confidence: 1, lockfiles: ["Pipfile"] });
  }

  if (results.length === 0 && files.some((file) => file.endsWith("package.json"))) {
    results.push({ id: "npm", confidence: 0.5, lockfiles: [] });
  }

  return results;
}

function detectTopology(files: string[]): RepoTopology {
  const sourceDirs = new Set<string>();
  const routeDirs = new Set<string>();
  const componentDirs = new Set<string>();
  const apiDirs = new Set<string>();
  const testDirs = new Set<string>();
  const docDirs = new Set<string>();

  for (const file of files) {
    if (/^(src|app)\//.test(file) || /\/(src|app)\//.test(file)) {
      sourceDirs.add(firstDir(file));
    }
    if (/^packages\/[^/]+\/src\//.test(file) || /^apps\/[^/]+\//.test(file) || /^services\/[^/]+\//.test(file)) {
      sourceDirs.add(firstDir(file));
    }
    if (/(^|\/)pages\//.test(file) || /(^|\/)app\/.*page\./.test(file) || /(^|\/)src\/routes\//.test(file)) {
      routeDirs.add(parentDir(file));
    }
    if (/app\/api\//.test(file) || /pages\/api\//.test(file) || /(^|\/)api\//.test(file)) {
      apiDirs.add(parentDir(file));
    }
    if (/(^|\/)components\//.test(file)) {
      componentDirs.add(parentDir(file));
    }
    if (/(^|\/)(__tests__|tests?)\//.test(file) || /\.(test|spec)\.[a-z0-9]+$/.test(file)) {
      testDirs.add(parentDir(file));
    }
    if (/^docs\//.test(file) || /README/i.test(path.basename(file)) || /CONTRIBUTING/i.test(path.basename(file)) || /AGENTS/i.test(path.basename(file))) {
      docDirs.add(parentDir(file));
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

function detectAssistants(files: string[], fileSet: Set<string>): AIAssistantDetection[] {
  const hasClaude = fileSet.has("CLAUDE.md") || fileSet.has(".claude/CLAUDE.md") || files.some((f) => f.startsWith(".claude/"));
  const hasCursor = files.some((f) => f.startsWith(".cursor/")) || fileSet.has(".cursorrules");
  const hasCopilot = fileSet.has(".github/copilot-instructions.md") || files.some((f) => f.startsWith(".github/instructions/") && f.endsWith(".instructions.md"));
  const hasCodex = fileSet.has("AGENTS.md") || files.some((f) => f.startsWith(".codex/")) || files.some((f) => f.startsWith(".agents/skills/"));
  const hasGeneric = files.some((f) => f.startsWith(".agents/skills/"));

  return [
    {
      id: "claude",
      status: hasClaude ? "found" : "missing",
      configPathsFound: files.filter((f) => f === "CLAUDE.md" || f === ".claude/CLAUDE.md" || f.startsWith(".claude/")).slice(0, 20),
      recommendedInstallTargets: ["claude_project_skills"]
    },
    {
      id: "cursor",
      status: hasCursor ? "found" : "missing",
      configPathsFound: files.filter((f) => f.startsWith(".cursor/") || f === ".cursorrules").slice(0, 20),
      recommendedInstallTargets: ["cursor_project_rules"]
    },
    {
      id: "copilot",
      status: hasCopilot ? "found" : "missing",
      configPathsFound: files.filter((f) => f === ".github/copilot-instructions.md" || (f.startsWith(".github/instructions/") && f.endsWith(".instructions.md"))).slice(0, 20),
      recommendedInstallTargets: ["copilot_repo_instructions"]
    },
    {
      id: "codex",
      status: hasCodex ? "found" : "missing",
      configPathsFound: files.filter((f) => f === "AGENTS.md" || f.startsWith(".codex/") || f.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["codex_repo_skills"]
    },
    {
      id: "generic",
      status: hasGeneric ? "found" : "missing",
      configPathsFound: files.filter((f) => f.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["generic_agent_skills"]
    }
  ];
}

function detectFindings(
  files: string[],
  frameworks: FrameworkDetection[],
  assistants: AIAssistantDetection[],
  topology: RepoTopology
): RepoFinding[] {
  const findings: RepoFinding[] = [];
  const frameworkIds = new Set(frameworks.map((f) => f.id));

  if (!files.some((f) => /README/i.test(path.basename(f)))) {
    findings.push({
      code: "missing_readme",
      severity: "warn",
      message: "Repository is missing README documentation.",
      category: "docs"
    });
  }

  if (!frameworkIds.has("pytest") && topology.testDirs.length === 0 && !frameworkIds.has("github-actions")) {
    findings.push({
      code: "missing_testing_setup",
      severity: "warn",
      message: "No test configuration or test directories were detected.",
      category: "testing"
    });
  }

  const copilot = assistants.find((assistant) => assistant.id === "copilot");
  if (copilot?.status === "missing") {
    findings.push({
      code: "missing_copilot_instructions",
      severity: "info",
      message: "GitHub Copilot repository instructions are missing.",
      category: "ai-config"
    });
  }

  const claude = assistants.find((assistant) => assistant.id === "claude");
  if (claude?.status === "missing") {
    findings.push({
      code: "missing_claude_config",
      severity: "info",
      message: "Claude Code project configuration is missing.",
      category: "ai-config"
    });
  }

  if (!frameworkIds.has("docker") && !frameworkIds.has("github-actions")) {
    findings.push({
      code: "missing_ci_or_container",
      severity: "info",
      message: "No CI workflows or container manifests detected.",
      category: "stack"
    });
  }

  return findings;
}

function detectLanguages(files: string[], frameworks: FrameworkDetection[]): string[] {
  const languageSet = new Set<string>();

  for (const file of files) {
    if (/\.(ts|tsx)$/.test(file)) languageSet.add("TypeScript");
    if (/\.(js|jsx|mjs|cjs)$/.test(file)) languageSet.add("JavaScript");
    if (/\.py$/.test(file)) languageSet.add("Python");
    if (/\.go$/.test(file)) languageSet.add("Go");
    if (/\.rs$/.test(file)) languageSet.add("Rust");
    if (/\.java$/.test(file)) languageSet.add("Java");
    if (/\.php$/.test(file)) languageSet.add("PHP");
  }

  if (frameworks.some((framework) => ["nextjs", "react", "vite", "angular", "vue", "nuxt", "svelte", "sveltekit"].includes(framework.id))) {
    languageSet.add("JavaScript");
  }
  if (frameworks.some((framework) => ["fastapi", "flask", "django", "streamlit", "pytest"].includes(framework.id))) {
    languageSet.add("Python");
  }

  return [...languageSet].sort();
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

function firstDir(file: string): string {
  const idx = file.indexOf("/");
  return idx === -1 ? "." : file.slice(0, idx);
}

function parentDir(file: string): string {
  const idx = file.lastIndexOf("/");
  return idx === -1 ? "." : file.slice(0, idx);
}
