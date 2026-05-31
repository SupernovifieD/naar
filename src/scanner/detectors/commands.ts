import type { CommandFact, CommandRole } from "../../types/index.js";
import type { DetectorContext } from "./common.js";
import { containsToken, makeEvidence } from "./common.js";

export function detectCommandFacts(context: DetectorContext): CommandFact[] {
  const commands: CommandFact[] = [];

  for (const pkg of context.packageJsonRecords) {
    for (const [name, rawScript] of Object.entries(pkg.data.scripts ?? {})) {
      if (!rawScript || typeof rawScript !== "string") continue;
      const normalizedCommand = name === "test" ? "npm test" : `npm run ${name}`;
      const classification = classifyCommandRole(name, rawScript);
      commands.push({
        name,
        role: classification.role,
        command: normalizedCommand,
        rawScript,
        scope: pkg.scope,
        confidence: classification.confidence,
        evidence: [makeEvidence(pkg.path, pkg.scope, `scripts.${name} is defined`, classification.confidence, "script")]
      });
    }
  }

  for (const composer of context.composerJsonRecords) {
    const scripts = composer.data.scripts ?? {};
    for (const [name, script] of Object.entries(scripts)) {
      const rawScript = Array.isArray(script) ? script.map((item) => String(item)).join(" && ") : String(script);
      if (!rawScript || rawScript === "undefined") continue;
      const classification = classifyCommandRole(name, rawScript);
      commands.push({
        name,
        role: classification.role,
        command: name === "test" ? "composer test" : `composer run ${name}`,
        rawScript,
        scope: composer.scope,
        confidence: classification.confidence,
        evidence: [makeEvidence(composer.path, composer.scope, `composer scripts.${name} is defined`, classification.confidence, "script")]
      });
    }
  }

  for (const makefile of context.makefileRecords) {
    for (const target of makefile.targets) {
      if (!target.body) continue;
      const classification = classifyCommandRole(target.name, target.body);
      commands.push({
        name: target.name,
        role: classification.role,
        command: `make ${target.name}`,
        rawScript: target.body,
        scope: makefile.scope,
        confidence: classification.confidence,
        evidence: [makeEvidence(makefile.path, makefile.scope, `Makefile target ${target.name} is defined`, classification.confidence, "script")]
      });
    }
  }

  for (const pyproject of context.pyprojectRecords) {
    const tool = asRecord(pyproject.parsed.tool);
    const poeTasks = asRecord(asRecord(tool?.poe)?.tasks);
    for (const [name, value] of Object.entries(poeTasks ?? {})) {
      const rawScript = stringifyTaskValue(value);
      if (!rawScript) continue;
      const classification = classifyCommandRole(name, rawScript);
      commands.push({
        name,
        role: classification.role,
        command: `poe ${name}`,
        rawScript,
        scope: pyproject.scope,
        confidence: classification.confidence,
        evidence: [makeEvidence(pyproject.path, pyproject.scope, `pyproject [tool.poe.tasks.${name}] is defined`, classification.confidence, "manifest_field")]
      });
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

export function classifyCommandRole(name: string, rawScript: string): { role: CommandRole; confidence: number } {
  const normalizedName = name.trim().toLowerCase();
  const script = rawScript.toLowerCase();

  if (normalizedName === "install" || normalizedName.startsWith("install:")) return { role: "install", confidence: 0.98 };
  if (normalizedName === "build") return { role: "build", confidence: 0.99 };
  if (normalizedName === "dev") return { role: "dev", confidence: 0.99 };
  if (normalizedName === "start" || normalizedName === "serve") return { role: "start", confidence: 0.99 };
  if (normalizedName === "test") return { role: "test", confidence: 0.99 };
  if (normalizedName === "typecheck" || normalizedName === "check-types" || normalizedName === "analyse") return { role: "typecheck", confidence: 0.98 };
  if (normalizedName === "lint" || normalizedName.startsWith("lint:")) return { role: "lint", confidence: 0.98 };
  if (normalizedName === "format" || normalizedName === "fmt" || normalizedName.startsWith("format:")) return { role: "format", confidence: 0.98 };
  if (normalizedName === "release") return { role: "release", confidence: 0.98 };
  if (normalizedName === "publish") return { role: "publish", confidence: 0.98 };
  if (normalizedName === "prepack") return { role: "prepack", confidence: 0.99 };
  if (normalizedName === "prepublish" || normalizedName === "prepublishonly") return { role: "prepublish", confidence: 0.99 };

  if (normalizedName.includes("seed")) return { role: "seed", confidence: 0.95 };
  if (normalizedName.includes("migrate")) return { role: "migrate", confidence: 0.95 };
  if (normalizedName.includes("generate") || normalizedName === "gen") return { role: "generate", confidence: 0.94 };
  if (normalizedName.includes("clean")) return { role: "clean", confidence: 0.92 };
  if (normalizedName.includes("unit")) return { role: "unit-test", confidence: 0.92 };
  if (normalizedName.includes("integration")) return { role: "integration-test", confidence: 0.92 };
  if (normalizedName.includes("e2e")) return { role: "e2e", confidence: 0.94 };

  if (/docker(-compose)?\s+up/.test(script) || /docker\s+compose\s+up/.test(script)) {
    return { role: "docker-up", confidence: 0.9 };
  }
  if (/docker(-compose)?\s+down/.test(script) || /docker\s+compose\s+down/.test(script)) {
    return { role: "docker-down", confidence: 0.9 };
  }

  if (containsToken(script, "go test") || containsToken(script, "pytest") || containsToken(script, "phpunit") || containsToken(script, "pest")) {
    return { role: "test", confidence: 0.88 };
  }
  if (containsToken(script, "ruff") || containsToken(script, "eslint") || containsToken(script, "golangci-lint") || containsToken(script, "phpcs")) {
    return { role: "lint", confidence: 0.86 };
  }
  if (containsToken(script, "black") || containsToken(script, "prettier") || containsToken(script, "gofmt") || containsToken(script, "php-cs-fixer")) {
    return { role: "format", confidence: 0.86 };
  }
  if (containsToken(script, "mypy") || containsToken(script, "pyright") || containsToken(script, "phpstan") || containsToken(script, "psalm") || containsToken(script, "tsc --noemit")) {
    return { role: "typecheck", confidence: 0.86 };
  }
  if (containsToken(script, "go build") || containsToken(script, "webpack") || containsToken(script, "vite build")) {
    return { role: "build", confidence: 0.85 };
  }
  if (containsToken(script, "composer install") || containsToken(script, "npm ci") || containsToken(script, "pip install")) {
    return { role: "install", confidence: 0.86 };
  }

  return { role: "unknown", confidence: 0.6 };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringifyTaskValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" && ");
  const mapped = asRecord(value);
  if (!mapped) return "";
  if (typeof mapped.cmd === "string") return mapped.cmd;
  if (Array.isArray(mapped.cmd)) return mapped.cmd.map((item) => String(item)).join(" && ");
  if (Array.isArray(mapped.shell)) return mapped.shell.map((item) => String(item)).join(" && ");
  if (typeof mapped.shell === "string") return mapped.shell;
  return "";
}

