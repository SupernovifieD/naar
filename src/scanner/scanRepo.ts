import path from "node:path";
import fg from "fast-glob";
import type {
  AIAssistantDetection,
  CommandFact,
  FactEvidence,
  RepoFacts,
  RepoFinding,
  RepoPrimaryFacts,
  RepoSecondaryFacts,
  RepoTopology,
  ScanScope,
  ToolDetection
} from "../types/index.js";
import { MAX_SCAN_DEPTH, MAX_SCAN_FILES } from "../config/defaults.js";
import { isPrimaryScope, normalizePath } from "./scope.js";
import {
  aggregateFrameworkSignals,
  aggregateLanguageSignals,
  aggregatePackageManagerSignals,
  aggregateProjectTypeSignals,
  aggregateToolSignals,
  buildDetectorContext,
  createScopedFiles,
  dedupeEvidence,
  makeEvidence,
  makeMissingEvidence,
  splitCommandsByScope,
  splitSignalsByScope,
  type DetectionResult,
  type ScopedFile,
  type ToolSignal
} from "./detectors/common.js";
import { detectJavaScriptEcosystem } from "./detectors/javascript.js";
import { detectPythonEcosystem } from "./detectors/python.js";
import { detectGoEcosystem } from "./detectors/go.js";
import { detectPhpEcosystem } from "./detectors/php.js";
import { detectCommandFacts } from "./detectors/commands.js";
import { detectProjectTypeSignals } from "./detectors/projectTypes.js";

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
  const scopedFiles = createScopedFiles(trimmedFiles);
  const context = await buildDetectorContext(repoRoot, scopedFiles);

  const js = detectJavaScriptEcosystem(context);
  const python = detectPythonEcosystem(context);
  const golang = detectGoEcosystem(context);
  const php = detectPhpEcosystem(context);
  const commands = dedupeCommandFacts(detectCommandFacts(context));
  const ciSignals = detectCiSignals(scopedFiles);
  const infraSignals = detectInfraSignals(scopedFiles);

  const merged = mergeDetectionResults([js, python, golang, php]);
  merged.commands.push(...commands);
  merged.ciTools.push(...ciSignals);
  merged.infraTools.push(...infraSignals);

  const aggregatedForTypes = {
    frameworks: aggregateFrameworkSignals(merged.frameworks),
    languages: aggregateLanguageSignals(merged.languages),
    packageManagers: aggregatePackageManagerSignals(merged.packageManagers),
    buildTools: aggregateToolSignals([...merged.buildTools, ...merged.lintTools, ...merged.formatTools]),
    testTools: aggregateToolSignals(merged.testTools),
    commands: dedupeCommandFacts(merged.commands)
  };

  merged.projectTypes.push(...detectProjectTypeSignals(context, {
    frameworks: merged.frameworks,
    languages: aggregatedForTypes.languages,
    packageManagers: aggregatedForTypes.packageManagers,
    commands: aggregatedForTypes.commands,
    buildTools: aggregatedForTypes.buildTools,
    testTools: aggregatedForTypes.testTools
  }));

  const frameworkSplit = splitSignalsByScope(merged.frameworks);
  const languageSplit = splitSignalsByScope(merged.languages);
  const packageManagerSplit = splitSignalsByScope(merged.packageManagers);
  const buildToolSplit = splitSignalsByScope([...merged.buildTools, ...merged.lintTools, ...merged.formatTools]);
  const testToolSplit = splitSignalsByScope(merged.testTools);
  const ciSplit = splitSignalsByScope(merged.ciTools);
  const infraSplit = splitSignalsByScope(merged.infraTools);
  const projectTypeSplit = splitSignalsByScope(merged.projectTypes);
  const commandSplit = splitCommandsByScope(dedupeCommandFacts(merged.commands));

  let primaryPackageManagers = aggregatePackageManagerSignals(packageManagerSplit.primary);
  const secondaryPackageManagers = aggregatePackageManagerSignals(packageManagerSplit.secondary);
  if (primaryPackageManagers.length === 0 && context.packageJsonRecords.some((record) => isPrimaryScope(record.scope))) {
    primaryPackageManagers = [{
      id: "npm",
      confidence: 0.5,
      lockfiles: [],
      evidence: [makeEvidence("package.json", "root", "package.json is present without a lockfile", 0.5, "manifest_field")]
    }];
  }

  const primaryFacts: RepoPrimaryFacts = {
    projectTypes: aggregateProjectTypeSignals(projectTypeSplit.primary),
    languages: aggregateLanguageSignals(languageSplit.primary),
    frameworks: aggregateFrameworkSignals(frameworkSplit.primary),
    packageManagers: primaryPackageManagers,
    buildTools: aggregateToolSignals(buildToolSplit.primary),
    testTools: aggregateToolSignals(testToolSplit.primary),
    ci: aggregateToolSignals(ciSplit.primary),
    infra: aggregateToolSignals(infraSplit.primary),
    commands: commandSplit.primary
  };

  const secondaryFacts: RepoSecondaryFacts = {
    projectTypes: aggregateProjectTypeSignals(projectTypeSplit.secondary),
    languages: aggregateLanguageSignals(languageSplit.secondary),
    frameworks: aggregateFrameworkSignals(frameworkSplit.secondary),
    packageManagers: secondaryPackageManagers,
    buildTools: aggregateToolSignals(buildToolSplit.secondary),
    testTools: aggregateToolSignals(testToolSplit.secondary),
    ci: aggregateToolSignals(ciSplit.secondary),
    infra: aggregateToolSignals(infraSplit.secondary),
    commands: commandSplit.secondary
  };

  const topology = detectTopology(scopedFiles);
  const aiAssistants = detectAssistants(scopedFiles);
  const findings = detectFindings(
    scopedFiles,
    primaryFacts.frameworks,
    aiAssistants,
    topology,
    primaryFacts.testTools,
    primaryFacts.ci,
    primaryFacts.infra
  );
  const readiness = calculateReadiness(findings);

  return {
    scanSchemaVersion: SCAN_SCHEMA_VERSION,
    repoRoot,
    scanTimeIso: new Date().toISOString(),
    languages: primaryFacts.languages.map((language) => language.id),
    packageManagers: primaryFacts.packageManagers,
    frameworks: primaryFacts.frameworks,
    aiAssistants,
    findings,
    topology,
    readiness,
    primaryFacts,
    secondaryFacts
  };
}

function mergeDetectionResults(results: DetectionResult[]): DetectionResult {
  const merged: DetectionResult = {
    languages: [],
    packageManagers: [],
    frameworks: [],
    buildTools: [],
    testTools: [],
    lintTools: [],
    formatTools: [],
    ciTools: [],
    infraTools: [],
    commands: [],
    projectTypes: []
  };

  for (const result of results) {
    merged.languages.push(...result.languages);
    merged.packageManagers.push(...result.packageManagers);
    merged.frameworks.push(...result.frameworks);
    merged.buildTools.push(...result.buildTools);
    merged.testTools.push(...result.testTools);
    merged.lintTools.push(...result.lintTools);
    merged.formatTools.push(...result.formatTools);
    merged.ciTools.push(...result.ciTools);
    merged.infraTools.push(...result.infraTools);
    merged.commands.push(...result.commands);
    merged.projectTypes.push(...result.projectTypes);
  }

  return merged;
}

function dedupeCommandFacts(commands: CommandFact[]): CommandFact[] {
  const seen = new Set<string>();
  const output: CommandFact[] = [];
  for (const command of commands) {
    const key = `${command.scope}:${command.name}:${command.command}:${command.rawScript}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...command,
      evidence: dedupeEvidence(command.evidence)
    });
  }
  return output.sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
}

function detectCiSignals(files: ScopedFile[]): ToolSignal[] {
  const signals: ToolSignal[] = [];
  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const base = path.basename(lowerPath);

    if (lowerPath.startsWith(".github/workflows/")) {
      signals.push(toolSignal("github-actions", file, ".github/workflows file is present", 0.95, "config"));
      continue;
    }
    if (base === ".gitlab-ci.yml") {
      signals.push(toolSignal("gitlab-ci", file, ".gitlab-ci.yml is present", 0.95, "config"));
      continue;
    }
    if (lowerPath.startsWith(".circleci/")) {
      signals.push(toolSignal("circleci", file, ".circleci config is present", 0.95, "config"));
      continue;
    }
    if (base === "jenkinsfile") {
      signals.push(toolSignal("jenkins", file, "Jenkinsfile is present", 0.95, "config"));
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
      signals.push(toolSignal("docker", file, "Dockerfile is present", 0.95, "config"));
      continue;
    }
    if (base === "docker-compose.yml" || base === "compose.yml") {
      signals.push(toolSignal("docker-compose", file, `${base} is present`, 0.95, "config"));
      continue;
    }
    if (base === "vercel.json") {
      signals.push(toolSignal("vercel", file, "vercel.json is present", 0.9, "config"));
      continue;
    }
    if (base === "netlify.toml") {
      signals.push(toolSignal("netlify", file, "netlify.toml is present", 0.9, "config"));
      continue;
    }
    if (base === "fly.toml") {
      signals.push(toolSignal("fly.io", file, "fly.toml is present", 0.9, "config"));
      continue;
    }
    if (base.endsWith(".tf") || base.endsWith(".tfvars")) {
      signals.push(toolSignal("terraform", file, `${base} is present`, 0.85, "config"));
      continue;
    }
    if (/(^|\/)(k8s|kubernetes)\//.test(lowerPath) && (base.endsWith(".yml") || base.endsWith(".yaml"))) {
      signals.push(toolSignal("kubernetes", file, "k8s/kubernetes manifest is present", 0.8, "config"));
    }
  }
  return signals;
}

function toolSignal(
  id: string,
  file: ScopedFile,
  reason: string,
  confidence: number,
  kind: FactEvidence["kind"] = "found_path"
): ToolSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(file.path, file.scope, reason, confidence, kind)
  };
}

function detectTopology(files: ScopedFile[]): RepoTopology {
  const sourceDirs = new Set<string>();
  const routeDirs = new Set<string>();
  const componentDirs = new Set<string>();
  const apiDirs = new Set<string>();
  const testDirs = new Set<string>();
  const docDirs = new Set<string>();

  for (const file of files) {
    if (!isRepositorySignalScope(file.scope)) continue;

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

  const hasClaude = fileSet.has("CLAUDE.md") || fileSet.has(".claude/CLAUDE.md") || paths.some((file) => file.startsWith(".claude/"));
  const hasCursor = paths.some((file) => file.startsWith(".cursor/")) || fileSet.has(".cursorrules");
  const hasCopilot = fileSet.has(".github/copilot-instructions.md") || paths.some((file) => file.startsWith(".github/instructions/") && file.endsWith(".instructions.md"));
  const hasCodex = fileSet.has("AGENTS.md") || paths.some((file) => file.startsWith(".codex/")) || paths.some((file) => file.startsWith(".agents/skills/"));
  const hasGeneric = paths.some((file) => file.startsWith(".agents/skills/"));

  return [
    {
      id: "claude",
      status: hasClaude ? "found" : "missing",
      configPathsFound: paths.filter((file) => file === "CLAUDE.md" || file === ".claude/CLAUDE.md" || file.startsWith(".claude/")).slice(0, 20),
      recommendedInstallTargets: ["claude_project_skills"]
    },
    {
      id: "cursor",
      status: hasCursor ? "found" : "missing",
      configPathsFound: paths.filter((file) => file.startsWith(".cursor/") || file === ".cursorrules").slice(0, 20),
      recommendedInstallTargets: ["cursor_project_rules"]
    },
    {
      id: "copilot",
      status: hasCopilot ? "found" : "missing",
      configPathsFound: paths.filter((file) => file === ".github/copilot-instructions.md" || (file.startsWith(".github/instructions/") && file.endsWith(".instructions.md"))).slice(0, 20),
      recommendedInstallTargets: ["copilot_repo_instructions"]
    },
    {
      id: "codex",
      status: hasCodex ? "found" : "missing",
      configPathsFound: paths.filter((file) => file === "AGENTS.md" || file.startsWith(".codex/") || file.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["codex_repo_skills"]
    },
    {
      id: "generic",
      status: hasGeneric ? "found" : "missing",
      configPathsFound: paths.filter((file) => file.startsWith(".agents/skills/")).slice(0, 20),
      recommendedInstallTargets: ["generic_agent_skills"]
    }
  ];
}

function detectFindings(
  files: ScopedFile[],
  frameworks: RepoPrimaryFacts["frameworks"],
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

