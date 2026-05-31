import path from "node:path";
import type { FactEvidence, FrameworkDetection } from "../../types/index.js";
import type {
  DependencySignal,
  DetectionResult,
  DetectorContext,
  FrameworkSignal,
  LanguageSignal,
  ToolSignal
} from "./common.js";
import {
  collectGoModDependencies,
  containsToken,
  emptyDetectionResult,
  makeEvidence
} from "./common.js";

type GoEntry = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  deps: string[];
  pathPatterns?: RegExp[];
};

type GoToolEntry = {
  id: string;
  confidence: number;
  deps?: string[];
  filePatterns?: RegExp[];
  makefileHints?: string[];
};

const GO_FRAMEWORKS: GoEntry[] = [
  { id: "gin", category: "backend", confidence: 0.96, deps: ["github.com/gin-gonic/gin"] },
  { id: "echo", category: "backend", confidence: 0.95, deps: ["github.com/labstack/echo"] },
  { id: "fiber", category: "backend", confidence: 0.95, deps: ["github.com/gofiber/fiber"] },
  { id: "chi", category: "backend", confidence: 0.95, deps: ["github.com/go-chi/chi"] },
  { id: "gorilla-mux", category: "backend", confidence: 0.94, deps: ["github.com/gorilla/mux"] },
  { id: "beego", category: "backend", confidence: 0.94, deps: ["github.com/beego/beego"] },
  { id: "buffalo", category: "backend", confidence: 0.94, deps: ["github.com/gobuffalo/buffalo"] },
  { id: "hertz", category: "backend", confidence: 0.93, deps: ["github.com/cloudwego/hertz"] },
  { id: "gqlgen", category: "backend", confidence: 0.93, deps: ["github.com/99designs/gqlgen"] },
  { id: "connect-go", category: "backend", confidence: 0.93, deps: ["connectrpc.com/connect"] },
  { id: "grpc-go", category: "backend", confidence: 0.93, deps: ["google.golang.org/grpc"] },
  { id: "cobra", category: "backend", confidence: 0.93, deps: ["github.com/spf13/cobra"], pathPatterns: [/^cmd\//] },
  { id: "urfave-cli", category: "backend", confidence: 0.92, deps: ["github.com/urfave/cli"], pathPatterns: [/^cmd\//] },
  { id: "kong", category: "backend", confidence: 0.91, deps: ["github.com/alecthomas/kong"], pathPatterns: [/^cmd\//] },
  { id: "bubbletea", category: "backend", confidence: 0.9, deps: ["github.com/charmbracelet/bubbletea"] },
  { id: "lipgloss", category: "backend", confidence: 0.9, deps: ["github.com/charmbracelet/lipgloss"] }
];

const GO_TEST_TOOLS: GoToolEntry[] = [
  { id: "go-test", confidence: 0.88, makefileHints: ["go test ./...", "go test"] },
  { id: "testify", confidence: 0.94, deps: ["github.com/stretchr/testify"] },
  { id: "ginkgo", confidence: 0.93, deps: ["github.com/onsi/ginkgo"] },
  { id: "gomock", confidence: 0.93, deps: ["github.com/golang/mock"] },
  { id: "mockery", confidence: 0.92, deps: ["github.com/vektra/mockery"] }
];

const GO_LINT_TOOLS: GoToolEntry[] = [
  { id: "golangci-lint", confidence: 0.95, filePatterns: [/\.golangci\.ya?ml$/], makefileHints: ["golangci-lint run"] },
  { id: "go-vet", confidence: 0.9, makefileHints: ["go vet ./...", "go vet"] },
  { id: "staticcheck", confidence: 0.9, makefileHints: ["staticcheck"] }
];

const GO_FORMAT_TOOLS: GoToolEntry[] = [
  { id: "gofmt", confidence: 0.9, makefileHints: ["gofmt", "go fmt"] }
];

const GO_BUILD_TOOLS: GoToolEntry[] = [
  { id: "go-build", confidence: 0.9, makefileHints: ["go build ./...", "go build"] },
  { id: "gorm", confidence: 0.92, deps: ["gorm.io/gorm"] },
  { id: "sqlx", confidence: 0.91, deps: ["github.com/jmoiron/sqlx"] },
  { id: "ent", confidence: 0.91, deps: ["entgo.io/ent"] },
  { id: "bun", confidence: 0.9, deps: ["github.com/uptrace/bun"] },
  { id: "goose", confidence: 0.9, deps: ["github.com/pressly/goose"] },
  { id: "migrate", confidence: 0.9, deps: ["github.com/golang-migrate/migrate"] }
];

export function detectGoEcosystem(context: DetectorContext): DetectionResult {
  const result = emptyDetectionResult();
  const dependencies = collectGoModDependencies(context.goModRecords);

  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    const base = path.basename(lower);
    if (base === "go.mod" || base === "go.work" || /\.go$/i.test(file.path)) {
      result.languages.push(languageSignal("Go", file.path, file.scope, `${base} indicates Go ecosystem`, 0.95, base.endsWith(".go") ? "found_path" : "manifest_field"));
    }
  }

  for (const entry of GO_FRAMEWORKS) {
    pushFrameworkSignals(entry, context, dependencies, result.frameworks);
  }
  pushToolSignals(GO_BUILD_TOOLS, context, dependencies, result.buildTools);
  pushToolSignals(GO_TEST_TOOLS, context, dependencies, result.testTools);
  pushToolSignals(GO_LINT_TOOLS, context, dependencies, result.lintTools);
  pushToolSignals(GO_FORMAT_TOOLS, context, dependencies, result.formatTools);

  return result;
}

function pushFrameworkSignals(
  entry: GoEntry,
  context: DetectorContext,
  dependencies: DependencySignal[],
  output: FrameworkSignal[]
): void {
  for (const signal of dependencies) {
    if (!entry.deps.includes(signal.dep)) continue;
    output.push({
      id: entry.id,
      category: entry.category,
      confidence: entry.confidence,
      evidence: makeEvidence(signal.path, signal.scope, signal.reason, entry.confidence, "dependency")
    });
  }
  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    if (!entry.pathPatterns?.some((pattern) => pattern.test(lower))) continue;
    output.push({
      id: entry.id,
      category: entry.category,
      confidence: Math.max(0.8, entry.confidence - 0.1),
      evidence: makeEvidence(file.path, file.scope, `path convention ${file.path} indicates ${entry.id}`, Math.max(0.8, entry.confidence - 0.1), "found_path")
    });
  }
}

function pushToolSignals(
  entries: GoToolEntry[],
  context: DetectorContext,
  dependencies: DependencySignal[],
  output: ToolSignal[]
): void {
  for (const entry of entries) {
    for (const dep of dependencies) {
      if (!entry.deps?.includes(dep.dep)) continue;
      output.push(toolSignal(entry.id, dep.path, dep.scope, dep.reason, entry.confidence, "dependency"));
    }
    for (const file of context.files) {
      const lower = file.path.toLowerCase();
      if (!entry.filePatterns?.some((pattern) => pattern.test(lower))) continue;
      output.push(toolSignal(
        entry.id,
        file.path,
        file.scope,
        `${path.basename(file.path)} indicates ${entry.id}`,
        Math.max(0.84, entry.confidence - 0.04),
        "config"
      ));
    }
    for (const makefile of context.makefileRecords) {
      for (const target of makefile.targets) {
        if (!entry.makefileHints?.some((hint) => containsToken(target.body.toLowerCase(), hint.toLowerCase()))) continue;
        output.push(toolSignal(
          entry.id,
          makefile.path,
          makefile.scope,
          `Makefile target ${target.name} contains ${entry.id} hint`,
          Math.max(0.82, entry.confidence - 0.08),
          "script"
        ));
      }
    }
  }
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

