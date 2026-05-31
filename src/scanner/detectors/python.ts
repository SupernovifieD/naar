import path from "node:path";
import type { FactEvidence, FrameworkDetection, PackageManagerDetection } from "../../types/index.js";
import type {
  DependencySignal,
  DetectionResult,
  DetectorContext,
  FrameworkSignal,
  LanguageSignal,
  PackageManagerSignal,
  ToolSignal
} from "./common.js";
import {
  collectPyprojectDependencies,
  collectRequirementsDependencies,
  containsToken,
  emptyDetectionResult,
  makeEvidence
} from "./common.js";

type PythonEntry = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  deps: string[];
  configPatterns?: RegExp[];
  pathPatterns?: RegExp[];
};

type PythonToolEntry = {
  id: string;
  confidence: number;
  deps: string[];
  configPatterns?: RegExp[];
  pyprojectSections?: string[];
};

const PY_FRAMEWORKS: PythonEntry[] = [
  { id: "django", category: "backend", confidence: 0.96, deps: ["django"], pathPatterns: [/manage\.py$/i, /wsgi\.py$/i, /asgi\.py$/i] },
  { id: "flask", category: "backend", confidence: 0.95, deps: ["flask"], pathPatterns: [/app\.py$/i] },
  { id: "fastapi", category: "backend", confidence: 0.96, deps: ["fastapi"], pathPatterns: [/main\.py$/i] },
  { id: "starlette", category: "backend", confidence: 0.94, deps: ["starlette"] },
  { id: "litestar", category: "backend", confidence: 0.94, deps: ["litestar"] },
  { id: "sanic", category: "backend", confidence: 0.94, deps: ["sanic"] },
  { id: "tornado", category: "backend", confidence: 0.93, deps: ["tornado"] },
  { id: "pyramid", category: "backend", confidence: 0.93, deps: ["pyramid"] },
  { id: "falcon", category: "backend", confidence: 0.93, deps: ["falcon"] },
  { id: "jupyter", category: "testing", confidence: 0.9, deps: ["jupyter", "notebook", "jupyterlab"], pathPatterns: [/(^|\/)notebooks?\//] },
  { id: "pandas", category: "backend", confidence: 0.9, deps: ["pandas"] },
  { id: "numpy", category: "backend", confidence: 0.9, deps: ["numpy"] },
  { id: "scipy", category: "backend", confidence: 0.9, deps: ["scipy"] },
  { id: "scikit-learn", category: "backend", confidence: 0.9, deps: ["scikit-learn", "sklearn"] },
  { id: "pytorch", category: "backend", confidence: 0.9, deps: ["torch", "pytorch"] },
  { id: "tensorflow", category: "backend", confidence: 0.9, deps: ["tensorflow"] },
  { id: "polars", category: "backend", confidence: 0.9, deps: ["polars"] },
  { id: "click", category: "backend", confidence: 0.9, deps: ["click"] },
  { id: "typer", category: "backend", confidence: 0.9, deps: ["typer"] },
  { id: "rich", category: "backend", confidence: 0.9, deps: ["rich"] },
  { id: "textual", category: "backend", confidence: 0.9, deps: ["textual"] },
  { id: "pytest", category: "testing", confidence: 0.96, deps: ["pytest"], configPatterns: [/pytest\.ini$/] },
  { id: "nose", category: "testing", confidence: 0.9, deps: ["nose", "nose2"] },
  { id: "tox", category: "testing", confidence: 0.9, deps: ["tox"], configPatterns: [/tox\.ini$/] },
  { id: "nox", category: "testing", confidence: 0.9, deps: ["nox"], configPatterns: [/noxfile\.py$/] },
  { id: "coverage", category: "testing", confidence: 0.88, deps: ["coverage"] },
  { id: "sqlalchemy", category: "backend", confidence: 0.92, deps: ["sqlalchemy"] },
  { id: "alembic", category: "backend", confidence: 0.92, deps: ["alembic"] },
  { id: "tortoise-orm", category: "backend", confidence: 0.9, deps: ["tortoise-orm"] },
  { id: "peewee", category: "backend", confidence: 0.9, deps: ["peewee"] },
  { id: "celery", category: "backend", confidence: 0.9, deps: ["celery"] },
  { id: "rq", category: "backend", confidence: 0.88, deps: ["rq"] },
  { id: "dramatiq", category: "backend", confidence: 0.88, deps: ["dramatiq"] }
];

const PY_BUILD_TOOLS: PythonToolEntry[] = [
  { id: "setuptools", confidence: 0.92, deps: ["setuptools"], configPatterns: [/setup\.py$/, /setup\.cfg$/] },
  { id: "hatch", confidence: 0.92, deps: ["hatchling", "hatch"] },
  { id: "pdm", confidence: 0.92, deps: ["pdm"] }
];

const PY_TEST_TOOLS: PythonToolEntry[] = [
  { id: "pytest", confidence: 0.95, deps: ["pytest"], configPatterns: [/pytest\.ini$/], pyprojectSections: ["[tool.pytest.ini_options]"] },
  { id: "tox", confidence: 0.9, deps: ["tox"], configPatterns: [/tox\.ini$/] },
  { id: "nox", confidence: 0.9, deps: ["nox"], configPatterns: [/noxfile\.py$/] },
  { id: "coverage", confidence: 0.88, deps: ["coverage"] }
];

const PY_LINT_TOOLS: PythonToolEntry[] = [
  { id: "ruff", confidence: 0.95, deps: ["ruff"], pyprojectSections: ["[tool.ruff]"] },
  { id: "mypy", confidence: 0.94, deps: ["mypy"], pyprojectSections: ["[tool.mypy]"] },
  { id: "pyright", confidence: 0.94, deps: ["pyright"] },
  { id: "pylint", confidence: 0.94, deps: ["pylint"] },
  { id: "flake8", confidence: 0.94, deps: ["flake8"] }
];

const PY_FORMAT_TOOLS: PythonToolEntry[] = [
  { id: "black", confidence: 0.95, deps: ["black"] },
  { id: "isort", confidence: 0.93, deps: ["isort"] }
];

const PY_PACKAGE_MANAGERS: Array<{ pattern: RegExp; id: PackageManagerDetection["id"]; confidence: number; reason: string }> = [
  { pattern: /requirements(\-dev)?(\.in|\.txt)$/i, id: "pip", confidence: 0.9, reason: "requirements file is present" },
  { pattern: /poetry\.lock$/i, id: "poetry", confidence: 1, reason: "poetry.lock is present" },
  { pattern: /uv\.lock$/i, id: "uv", confidence: 1, reason: "uv.lock is present" },
  { pattern: /pipfile$/i, id: "pipenv", confidence: 1, reason: "Pipfile is present" },
  { pattern: /pipfile\.lock$/i, id: "pipenv", confidence: 0.96, reason: "Pipfile.lock is present" },
  { pattern: /environment\.yml$/i, id: "conda", confidence: 0.94, reason: "environment.yml is present" },
  { pattern: /conda\.yml$/i, id: "conda", confidence: 0.94, reason: "conda.yml is present" },
  { pattern: /setup\.py$/i, id: "setuptools", confidence: 0.9, reason: "setup.py is present" },
  { pattern: /setup\.cfg$/i, id: "setuptools", confidence: 0.88, reason: "setup.cfg is present" }
];

export function detectPythonEcosystem(context: DetectorContext): DetectionResult {
  const result = emptyDetectionResult();
  const dependencies = [
    ...collectRequirementsDependencies(context.requirementsRecords),
    ...collectPyprojectDependencies(context.pyprojectRecords)
  ];

  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    const base = path.basename(lower);
    if (/\.(py)$/i.test(file.path)) {
      result.languages.push(languageSignal("Python", file.path, file.scope, "file extension .py is present", 0.95));
    }
    for (const manager of PY_PACKAGE_MANAGERS) {
      if (!manager.pattern.test(lower)) continue;
      result.packageManagers.push(packageManagerSignal(manager.id, file.path, file.scope, manager.reason, manager.confidence));
    }
    if (base === "pyproject.toml") {
      result.languages.push(languageSignal("Python", file.path, file.scope, "pyproject.toml is present", 0.9, "manifest_field"));
    }
  }

  for (const record of context.pyprojectRecords) {
    const rawLower = record.raw.toLowerCase();
    if (containsToken(rawLower, "[tool.poetry]")) {
      result.packageManagers.push(packageManagerSignal("poetry", record.path, record.scope, "pyproject.toml contains [tool.poetry]", 0.95));
    }
    if (containsToken(rawLower, "[tool.uv]")) {
      result.packageManagers.push(packageManagerSignal("uv", record.path, record.scope, "pyproject.toml contains [tool.uv]", 0.9));
    }
    if (containsToken(rawLower, "[tool.pdm]")) {
      result.packageManagers.push(packageManagerSignal("pdm", record.path, record.scope, "pyproject.toml contains [tool.pdm]", 0.95));
    }
    if (containsToken(rawLower, "[tool.hatch")) {
      result.packageManagers.push(packageManagerSignal("hatch", record.path, record.scope, "pyproject.toml contains [tool.hatch.*]", 0.95));
    }
    if (containsToken(rawLower, "setuptools")) {
      result.packageManagers.push(packageManagerSignal("setuptools", record.path, record.scope, "pyproject.toml references setuptools", 0.85));
    }
    if (containsToken(rawLower, "pip-tools")) {
      result.packageManagers.push(packageManagerSignal("pip-tools", record.path, record.scope, "pyproject.toml references pip-tools", 0.85));
    }
  }

  for (const framework of PY_FRAMEWORKS) {
    pushFrameworkSignals(framework, context, dependencies, result.frameworks);
  }
  for (const tool of PY_BUILD_TOOLS) {
    pushToolSignals(tool, context, dependencies, result.buildTools);
  }
  for (const tool of PY_TEST_TOOLS) {
    pushToolSignals(tool, context, dependencies, result.testTools);
  }
  for (const tool of PY_LINT_TOOLS) {
    pushToolSignals(tool, context, dependencies, result.lintTools);
  }
  for (const tool of PY_FORMAT_TOOLS) {
    pushToolSignals(tool, context, dependencies, result.formatTools);
  }

  return result;
}

function pushFrameworkSignals(
  entry: PythonEntry,
  context: DetectorContext,
  dependencies: DependencySignal[],
  output: FrameworkSignal[]
): void {
  for (const dep of dependencies) {
    if (!entry.deps.includes(dep.dep)) continue;
    output.push({
      id: entry.id,
      category: entry.category,
      confidence: entry.confidence,
      evidence: makeEvidence(dep.path, dep.scope, dep.reason, entry.confidence, "dependency")
    });
  }
  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    if (entry.configPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.84, entry.confidence - 0.05),
        evidence: makeEvidence(file.path, file.scope, `${path.basename(file.path)} indicates ${entry.id}`, Math.max(0.84, entry.confidence - 0.05), "config")
      });
    }
    if (entry.pathPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.78, entry.confidence - 0.12),
        evidence: makeEvidence(file.path, file.scope, `path convention ${file.path} indicates ${entry.id}`, Math.max(0.78, entry.confidence - 0.12), "found_path")
      });
    }
  }
}

function pushToolSignals(
  entry: PythonToolEntry,
  context: DetectorContext,
  dependencies: DependencySignal[],
  output: ToolSignal[]
): void {
  for (const dep of dependencies) {
    if (!entry.deps.includes(dep.dep)) continue;
    output.push(toolSignal(entry.id, dep.path, dep.scope, dep.reason, entry.confidence, "dependency"));
  }
  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    if (!entry.configPatterns?.some((pattern) => pattern.test(lower))) continue;
    output.push(toolSignal(
      entry.id,
      file.path,
      file.scope,
      `${path.basename(file.path)} indicates ${entry.id}`,
      Math.max(0.84, entry.confidence - 0.05),
      "config"
    ));
  }
  if (entry.pyprojectSections && context.pyprojectRecords.length > 0) {
    for (const record of context.pyprojectRecords) {
      const rawLower = record.raw.toLowerCase();
      for (const section of entry.pyprojectSections) {
        if (!rawLower.includes(section.toLowerCase())) continue;
        output.push(toolSignal(entry.id, record.path, record.scope, `pyproject section ${section} is present`, Math.max(0.84, entry.confidence - 0.05), "manifest_field"));
      }
    }
  }
}

function packageManagerSignal(
  id: PackageManagerSignal["id"],
  filePath: string,
  scope: FactEvidence["scope"],
  reason: string,
  confidence: number
): PackageManagerSignal {
  return {
    id,
    confidence,
    lockfile: filePath,
    evidence: makeEvidence(filePath, scope, reason, confidence, "config")
  };
}

function languageSignal(
  id: string,
  filePath: string,
  scope: FactEvidence["scope"],
  reason: string,
  confidence: number,
  kind: FactEvidence["kind"] = "found_path"
): LanguageSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(filePath, scope, reason, confidence, kind)
  };
}

function toolSignal(
  id: string,
  filePath: string,
  scope: FactEvidence["scope"],
  reason: string,
  confidence: number,
  kind: FactEvidence["kind"] = "found_path"
): ToolSignal {
  return {
    id,
    confidence,
    evidence: makeEvidence(filePath, scope, reason, confidence, kind)
  };
}

