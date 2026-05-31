import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseToml } from "@iarna/toml";
import type {
  CommandFact,
  FactEvidence,
  FrameworkDetection,
  LanguageDetection,
  PackageManagerDetection,
  ProjectTypeDetection,
  ScanScope,
  ToolDetection
} from "../../types/index.js";
import { classifyPathScope, isPrimaryScope, normalizePath } from "../scope.js";

export type ScopedFile = {
  path: string;
  scope: ScanScope;
};

export type PackageJsonLike = {
  name?: string;
  version?: string;
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

export type ComposerJsonLike = {
  name?: string;
  type?: string;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
  scripts?: Record<string, unknown>;
  autoload?: unknown;
  "autoload-dev"?: unknown;
};

export type PackageJsonRecord = {
  path: string;
  scope: ScanScope;
  data: PackageJsonLike;
};

export type ComposerJsonRecord = {
  path: string;
  scope: ScanScope;
  data: ComposerJsonLike;
};

export type PyprojectRecord = {
  path: string;
  scope: ScanScope;
  raw: string;
  parsed: Record<string, unknown>;
};

export type RequirementsRecord = {
  path: string;
  scope: ScanScope;
  dependencies: string[];
};

export type GoModRecord = {
  path: string;
  scope: ScanScope;
  moduleName?: string;
  dependencies: string[];
  isWorkspace: boolean;
};

export type MakefileRecord = {
  path: string;
  scope: ScanScope;
  targets: Array<{ name: string; body: string }>;
};

export type DependencySignal = {
  dep: string;
  path: string;
  scope: ScanScope;
  reason: string;
  confidence: number;
};

export type FrameworkSignal = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  evidence: FactEvidence;
};

export type PackageManagerSignal = {
  id: PackageManagerDetection["id"];
  confidence: number;
  lockfile: string;
  workspaceMode?: boolean;
  evidence: FactEvidence;
};

export type LanguageSignal = {
  id: string;
  confidence: number;
  evidence: FactEvidence;
};

export type ToolSignal = {
  id: string;
  confidence: number;
  evidence: FactEvidence;
};

export type ProjectTypeSignal = {
  id: ProjectTypeDetection["id"];
  confidence: number;
  evidence: FactEvidence;
};

export interface DetectorContext {
  repoRoot: string;
  files: ScopedFile[];
  fileSet: Set<string>;
  packageJsonRecords: PackageJsonRecord[];
  composerJsonRecords: ComposerJsonRecord[];
  pyprojectRecords: PyprojectRecord[];
  requirementsRecords: RequirementsRecord[];
  goModRecords: GoModRecord[];
  makefileRecords: MakefileRecord[];
}

export interface DetectionResult {
  languages: LanguageSignal[];
  packageManagers: PackageManagerSignal[];
  frameworks: FrameworkSignal[];
  buildTools: ToolSignal[];
  testTools: ToolSignal[];
  lintTools: ToolSignal[];
  formatTools: ToolSignal[];
  ciTools: ToolSignal[];
  infraTools: ToolSignal[];
  commands: CommandFact[];
  projectTypes: ProjectTypeSignal[];
}

export function emptyDetectionResult(): DetectionResult {
  return {
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
}

export async function buildDetectorContext(repoRoot: string, files: ScopedFile[]): Promise<DetectorContext> {
  const fileSet = new Set(files.map((file) => file.path));
  const [
    packageJsonRecords,
    composerJsonRecords,
    pyprojectRecords,
    requirementsRecords,
    goModRecords,
    makefileRecords
  ] = await Promise.all([
    loadPackageJsonRecords(repoRoot, files),
    loadComposerJsonRecords(repoRoot, files),
    loadPyprojectRecords(repoRoot, files),
    loadRequirementsRecords(repoRoot, files),
    loadGoModRecords(repoRoot, files),
    loadMakefileRecords(repoRoot, files)
  ]);

  return {
    repoRoot,
    files,
    fileSet,
    packageJsonRecords,
    composerJsonRecords,
    pyprojectRecords,
    requirementsRecords,
    goModRecords,
    makefileRecords
  };
}

export async function readTextIfExists(repoRoot: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, relativePath), "utf8");
  } catch {
    return null;
  }
}

export function makeEvidence(
  pathValue: string,
  scope: ScanScope,
  reason: string,
  confidence = 0.9,
  kind: FactEvidence["kind"] = "found_path"
): FactEvidence {
  return {
    path: normalizePath(pathValue),
    scope,
    reason,
    confidence,
    exists: true,
    kind
  };
}

export function makeMissingEvidence(
  pathValue: string,
  scope: ScanScope,
  reason: string,
  confidence = 0.9
): FactEvidence {
  return {
    path: normalizePath(pathValue),
    scope,
    reason,
    confidence,
    exists: false,
    kind: "missing_expected_path"
  };
}

export function containsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9_\\-/])${escaped}([^a-z0-9_\\-/]|$)`, "i");
  return pattern.test(text);
}

export function normalizeDependencyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+.+$/, "")
    .split(/[<>=!~\[\]]/, 1)[0]
    .trim();
}

export function detectPathSignals(
  files: ScopedFile[],
  definitions: Array<{ pattern: RegExp; create: (file: ScopedFile) => FrameworkSignal | ToolSignal | LanguageSignal | ProjectTypeSignal }>
): Array<FrameworkSignal | ToolSignal | LanguageSignal | ProjectTypeSignal> {
  const signals: Array<FrameworkSignal | ToolSignal | LanguageSignal | ProjectTypeSignal> = [];
  for (const file of files) {
    for (const definition of definitions) {
      if (!definition.pattern.test(file.path.toLowerCase())) continue;
      signals.push(definition.create(file));
    }
  }
  return signals;
}

export function splitSignalsByScope<T extends { evidence: FactEvidence }>(signals: T[]): { primary: T[]; secondary: T[] } {
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

export function splitCommandsByScope(commands: CommandFact[]): { primary: CommandFact[]; secondary: CommandFact[] } {
  const primary: CommandFact[] = [];
  const secondary: CommandFact[] = [];
  for (const command of commands) {
    if (isPrimaryScope(command.scope)) primary.push(command);
    else secondary.push(command);
  }
  return { primary, secondary };
}

export function dedupeEvidence(evidence: FactEvidence[]): FactEvidence[] {
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

export function aggregateFrameworkSignals(signals: FrameworkSignal[]): FrameworkDetection[] {
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
  const categoryRank: Record<FrameworkDetection["category"], number> = {
    frontend: 1,
    backend: 2,
    styling: 3,
    testing: 4,
    build: 5,
    infra: 6
  };
  return [...byId.values()].sort((a, b) => {
    const byCategory = categoryRank[a.category] - categoryRank[b.category];
    if (byCategory !== 0) return byCategory;
    const byConfidence = b.confidence - a.confidence;
    if (byConfidence !== 0) return byConfidence;
    return a.id.localeCompare(b.id);
  });
}

export function aggregateToolSignals(signals: ToolSignal[]): ToolDetection[] {
  const byId = new Map<string, ToolDetection>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, { id: signal.id, confidence: signal.confidence, evidence: [signal.evidence] });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

export function aggregateLanguageSignals(signals: LanguageSignal[]): LanguageDetection[] {
  const byId = new Map<string, LanguageDetection>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, { id: signal.id, confidence: signal.confidence, evidence: [signal.evidence] });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

export function aggregatePackageManagerSignals(signals: PackageManagerSignal[]): PackageManagerDetection[] {
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

export function aggregateProjectTypeSignals(signals: ProjectTypeSignal[]): ProjectTypeDetection[] {
  const byId = new Map<ProjectTypeSignal["id"], ProjectTypeDetection>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, { id: signal.id, confidence: signal.confidence, evidence: [signal.evidence] });
      continue;
    }
    existing.confidence = Math.max(existing.confidence, signal.confidence);
    existing.evidence = dedupeEvidence([...existing.evidence, signal.evidence]);
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

export async function loadPackageJsonRecords(repoRoot: string, files: ScopedFile[]): Promise<PackageJsonRecord[]> {
  const records: PackageJsonRecord[] = [];
  for (const file of files) {
    if (path.basename(file.path) !== "package.json") continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    try {
      records.push({
        path: file.path,
        scope: file.scope,
        data: JSON.parse(raw) as PackageJsonLike
      });
    } catch {
      // ignore
    }
  }
  return records;
}

export async function loadComposerJsonRecords(repoRoot: string, files: ScopedFile[]): Promise<ComposerJsonRecord[]> {
  const records: ComposerJsonRecord[] = [];
  for (const file of files) {
    if (path.basename(file.path).toLowerCase() !== "composer.json") continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    try {
      records.push({
        path: file.path,
        scope: file.scope,
        data: JSON.parse(raw) as ComposerJsonLike
      });
    } catch {
      // ignore
    }
  }
  return records;
}

export async function loadPyprojectRecords(repoRoot: string, files: ScopedFile[]): Promise<PyprojectRecord[]> {
  const records: PyprojectRecord[] = [];
  for (const file of files) {
    if (path.basename(file.path).toLowerCase() !== "pyproject.toml") continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    try {
      const parsed = parseToml(raw) as Record<string, unknown>;
      records.push({ path: file.path, scope: file.scope, raw, parsed });
    } catch {
      // ignore
    }
  }
  return records;
}

export async function loadRequirementsRecords(repoRoot: string, files: ScopedFile[]): Promise<RequirementsRecord[]> {
  const names = new Set(["requirements.txt", "requirements-dev.txt", "requirements-dev.in", "requirements.in"]);
  const records: RequirementsRecord[] = [];
  for (const file of files) {
    if (!names.has(path.basename(file.path).toLowerCase())) continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    records.push({
      path: file.path,
      scope: file.scope,
      dependencies: parseRequirements(raw)
    });
  }
  return records;
}

export async function loadGoModRecords(repoRoot: string, files: ScopedFile[]): Promise<GoModRecord[]> {
  const records: GoModRecord[] = [];
  for (const file of files) {
    const base = path.basename(file.path).toLowerCase();
    if (base !== "go.mod" && base !== "go.work") continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    records.push(parseGoModFile(file, raw));
  }
  return records;
}

export async function loadMakefileRecords(repoRoot: string, files: ScopedFile[]): Promise<MakefileRecord[]> {
  const records: MakefileRecord[] = [];
  for (const file of files) {
    const base = path.basename(file.path).toLowerCase();
    if (base !== "makefile" && base !== "gnumakefile" && base !== "makefile.mk") continue;
    const raw = await readTextIfExists(repoRoot, file.path);
    if (!raw) continue;
    records.push({
      path: file.path,
      scope: file.scope,
      targets: parseMakefileTargets(raw)
    });
  }
  return records;
}

export function collectPackageJsonDependencies(records: PackageJsonRecord[]): DependencySignal[] {
  const signals: DependencySignal[] = [];
  for (const record of records) {
    for (const dep of Object.keys(record.data.dependencies ?? {})) {
      signals.push({
        dep: dep.toLowerCase(),
        path: record.path,
        scope: record.scope,
        reason: `dependencies.${dep} is present`,
        confidence: 0.96
      });
    }
    for (const dep of Object.keys(record.data.devDependencies ?? {})) {
      signals.push({
        dep: dep.toLowerCase(),
        path: record.path,
        scope: record.scope,
        reason: `devDependencies.${dep} is present`,
        confidence: 0.95
      });
    }
  }
  return signals;
}

export function collectComposerDependencies(records: ComposerJsonRecord[]): DependencySignal[] {
  const signals: DependencySignal[] = [];
  for (const record of records) {
    for (const dep of Object.keys(record.data.require ?? {})) {
      if (dep.toLowerCase() === "php") continue;
      signals.push({
        dep: dep.toLowerCase(),
        path: record.path,
        scope: record.scope,
        reason: `require.${dep} is present`,
        confidence: 0.96
      });
    }
    for (const dep of Object.keys(record.data["require-dev"] ?? {})) {
      signals.push({
        dep: dep.toLowerCase(),
        path: record.path,
        scope: record.scope,
        reason: `require-dev.${dep} is present`,
        confidence: 0.95
      });
    }
  }
  return signals;
}

export function collectPyprojectDependencies(records: PyprojectRecord[]): DependencySignal[] {
  const signals: DependencySignal[] = [];
  for (const record of records) {
    const deps = extractDependenciesFromPyproject(record.parsed);
    for (const dep of deps) {
      signals.push({
        dep,
        path: record.path,
        scope: record.scope,
        reason: `pyproject.toml dependency ${dep} is declared`,
        confidence: 0.93
      });
    }
  }
  return signals;
}

export function collectRequirementsDependencies(records: RequirementsRecord[]): DependencySignal[] {
  const signals: DependencySignal[] = [];
  for (const record of records) {
    for (const dep of record.dependencies) {
      signals.push({
        dep,
        path: record.path,
        scope: record.scope,
        reason: `${path.basename(record.path)} declares ${dep}`,
        confidence: 0.9
      });
    }
  }
  return signals;
}

export function collectGoModDependencies(records: GoModRecord[]): DependencySignal[] {
  const signals: DependencySignal[] = [];
  for (const record of records) {
    for (const dep of record.dependencies) {
      signals.push({
        dep: dep.toLowerCase(),
        path: record.path,
        scope: record.scope,
        reason: `${path.basename(record.path)} requires ${dep}`,
        confidence: 0.92
      });
    }
  }
  return signals;
}

export function parseRequirements(raw: string): string[] {
  const deps = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const dep = normalizeDependencyName(trimmed);
    if (dep) deps.add(dep);
  }
  return [...deps];
}

function extractDependenciesFromPyproject(parsed: Record<string, unknown>): string[] {
  const deps = new Set<string>();
  const project = asRecord(parsed.project);
  const projectDependencies = asArray(project?.dependencies);
  for (const dep of projectDependencies) {
    const normalized = normalizeDependencyName(String(dep));
    if (normalized) deps.add(normalized);
  }
  const optionalDeps = asRecord(project?.["optional-dependencies"]);
  for (const value of Object.values(optionalDeps ?? {})) {
    for (const dep of asArray(value)) {
      const normalized = normalizeDependencyName(String(dep));
      if (normalized) deps.add(normalized);
    }
  }

  const tool = asRecord(parsed.tool);
  const poetry = asRecord(tool?.poetry);
  const poetryDeps = asRecord(poetry?.dependencies);
  for (const dep of Object.keys(poetryDeps ?? {})) {
    if (dep.toLowerCase() === "python") continue;
    deps.add(dep.toLowerCase());
  }
  const poetryGroups = asRecord(poetry?.group);
  for (const group of Object.values(poetryGroups ?? {})) {
    const groupDeps = asRecord(asRecord(group)?.dependencies);
    for (const dep of Object.keys(groupDeps ?? {})) {
      deps.add(dep.toLowerCase());
    }
  }

  return [...deps];
}

function parseGoModFile(file: ScopedFile, raw: string): GoModRecord {
  const dependencies = new Set<string>();
  let moduleName: string | undefined;
  let inRequireBlock = false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("module ")) {
      moduleName = trimmed.slice("module ".length).trim();
      continue;
    }
    if (trimmed.startsWith("require (")) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && trimmed === ")") {
      inRequireBlock = false;
      continue;
    }
    if (trimmed.startsWith("require ")) {
      const mod = trimmed.slice("require ".length).trim().split(/\s+/, 1)[0];
      if (mod) dependencies.add(mod);
      continue;
    }
    if (inRequireBlock) {
      const mod = trimmed.split(/\s+/, 1)[0];
      if (mod) dependencies.add(mod);
    }
  }

  return {
    path: file.path,
    scope: file.scope,
    moduleName,
    dependencies: [...dependencies],
    isWorkspace: path.basename(file.path).toLowerCase() === "go.work"
  };
}

function parseMakefileTargets(raw: string): Array<{ name: string; body: string }> {
  const targets: Array<{ name: string; body: string }> = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith("\t") || /^\s/.test(line) || line.startsWith("#")) continue;
    const match = /^([a-zA-Z0-9_.\-\/]+)\s*:/.exec(line);
    if (!match) continue;
    const name = match[1];
    const bodyLines: string[] = [];
    let next = index + 1;
    while (next < lines.length && /^\t/.test(lines[next])) {
      bodyLines.push(lines[next].trim());
      next += 1;
    }
    targets.push({ name, body: bodyLines.join(" && ") });
  }
  return targets;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function createScopedFiles(paths: string[]): ScopedFile[] {
  return paths.map((file): ScopedFile => ({
    path: normalizePath(file),
    scope: classifyPathScope(file)
  }));
}

