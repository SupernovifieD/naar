import path from "node:path";
import type { FactEvidence, FrameworkDetection } from "../../types/index.js";
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
  collectPackageJsonDependencies,
  containsToken,
  emptyDetectionResult,
  makeEvidence
} from "./common.js";

type JsRegistryEntry = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  deps: string[];
  configPatterns?: RegExp[];
  pathPatterns?: RegExp[];
};

type JsToolEntry = {
  id: string;
  confidence: number;
  deps: string[];
  configPatterns?: RegExp[];
  scriptHints?: string[];
};

const JS_FRAMEWORKS: JsRegistryEntry[] = [
  { id: "react", category: "frontend", confidence: 0.97, deps: ["react"] },
  { id: "vue", category: "frontend", confidence: 0.97, deps: ["vue"] },
  { id: "angular", category: "frontend", confidence: 0.97, deps: ["@angular/core"], configPatterns: [/angular\.json$/] },
  { id: "svelte", category: "frontend", confidence: 0.97, deps: ["svelte"], configPatterns: [/svelte\.config\./] },
  { id: "solid", category: "frontend", confidence: 0.95, deps: ["solid-js"] },
  { id: "preact", category: "frontend", confidence: 0.95, deps: ["preact"] },
  { id: "qwik", category: "frontend", confidence: 0.95, deps: ["@builder.io/qwik"] },
  { id: "lit", category: "frontend", confidence: 0.94, deps: ["lit", "lit-html"] },
  { id: "alpine", category: "frontend", confidence: 0.93, deps: ["alpinejs"] },
  { id: "nextjs", category: "frontend", confidence: 0.98, deps: ["next"], configPatterns: [/next\.config\./], pathPatterns: [/^app\//, /^pages\//] },
  { id: "nuxt", category: "frontend", confidence: 0.98, deps: ["nuxt"], configPatterns: [/nuxt\.config\./] },
  { id: "sveltekit", category: "frontend", confidence: 0.98, deps: ["@sveltejs/kit"], configPatterns: [/svelte\.config\./] },
  { id: "astro", category: "frontend", confidence: 0.97, deps: ["astro"], configPatterns: [/astro\.config\./] },
  { id: "remix", category: "frontend", confidence: 0.96, deps: ["@remix-run/node", "@remix-run/react"], configPatterns: [/remix\.config\./] },
  { id: "gatsby", category: "frontend", confidence: 0.95, deps: ["gatsby"], configPatterns: [/gatsby-config\./] },
  { id: "redwoodjs", category: "frontend", confidence: 0.94, deps: ["@redwoodjs/core"], configPatterns: [/redwood\.toml$/] },
  { id: "blitzjs", category: "frontend", confidence: 0.93, deps: ["blitz"], configPatterns: [/blitz\.config\./] },
  { id: "tanstack-start", category: "frontend", confidence: 0.92, deps: ["@tanstack/start"] },
  { id: "vitepress", category: "frontend", confidence: 0.94, deps: ["vitepress"], configPatterns: [/vitepress\.config\./, /^docs\/\.vitepress\//] },
  { id: "docusaurus", category: "frontend", confidence: 0.94, deps: ["@docusaurus/core"], configPatterns: [/docusaurus\.config\./] },
  { id: "express", category: "backend", confidence: 0.96, deps: ["express"] },
  { id: "fastify", category: "backend", confidence: 0.96, deps: ["fastify"] },
  { id: "nestjs", category: "backend", confidence: 0.96, deps: ["@nestjs/core"] },
  { id: "koa", category: "backend", confidence: 0.95, deps: ["koa"] },
  { id: "hono", category: "backend", confidence: 0.95, deps: ["hono"] },
  { id: "elysia", category: "backend", confidence: 0.95, deps: ["elysia"] },
  { id: "adonisjs", category: "backend", confidence: 0.94, deps: ["@adonisjs/core"] },
  { id: "feathers", category: "backend", confidence: 0.94, deps: ["@feathersjs/feathers"] },
  { id: "loopback", category: "backend", confidence: 0.94, deps: ["@loopback/core"] },
  { id: "trpc", category: "backend", confidence: 0.94, deps: ["@trpc/server"] },
  { id: "apollo-server", category: "backend", confidence: 0.94, deps: ["@apollo/server", "apollo-server"] },
  { id: "graphql-yoga", category: "backend", confidence: 0.93, deps: ["graphql-yoga"] },
  { id: "vitest", category: "testing", confidence: 0.96, deps: ["vitest"] },
  { id: "jest", category: "testing", confidence: 0.96, deps: ["jest"] },
  { id: "mocha", category: "testing", confidence: 0.94, deps: ["mocha"] },
  { id: "jasmine", category: "testing", confidence: 0.94, deps: ["jasmine"] },
  { id: "playwright", category: "testing", confidence: 0.95, deps: ["playwright", "@playwright/test"] },
  { id: "cypress", category: "testing", confidence: 0.95, deps: ["cypress"] },
  { id: "testing-library", category: "testing", confidence: 0.92, deps: ["@testing-library/react", "@testing-library/vue", "@testing-library/dom"] },
  { id: "tailwind", category: "styling", confidence: 0.95, deps: ["tailwindcss"], configPatterns: [/tailwind\.config\./] },
  { id: "shadcn-ui", category: "styling", confidence: 0.9, deps: ["class-variance-authority"], configPatterns: [/components\.json$/] },
  { id: "bootstrap", category: "styling", confidence: 0.93, deps: ["bootstrap"] },
  { id: "mui", category: "styling", confidence: 0.93, deps: ["@mui/material"] },
  { id: "chakra-ui", category: "styling", confidence: 0.93, deps: ["@chakra-ui/react"] },
  { id: "ant-design", category: "styling", confidence: 0.93, deps: ["antd"] },
  { id: "styled-components", category: "styling", confidence: 0.93, deps: ["styled-components"] },
  { id: "emotion", category: "styling", confidence: 0.93, deps: ["@emotion/react"] },
  { id: "sass", category: "styling", confidence: 0.9, deps: ["sass", "node-sass"] },
  { id: "postcss", category: "styling", confidence: 0.9, deps: ["postcss"], configPatterns: [/postcss\.config\./] },
  { id: "prisma", category: "backend", confidence: 0.93, deps: ["prisma", "@prisma/client"] },
  { id: "drizzle", category: "backend", confidence: 0.92, deps: ["drizzle-orm"] },
  { id: "typeorm", category: "backend", confidence: 0.92, deps: ["typeorm"] },
  { id: "sequelize", category: "backend", confidence: 0.92, deps: ["sequelize"] },
  { id: "mongoose", category: "backend", confidence: 0.92, deps: ["mongoose"] },
  { id: "knex", category: "backend", confidence: 0.92, deps: ["knex"] }
];

const BUILD_TOOLS: JsToolEntry[] = [
  { id: "vite", confidence: 0.95, deps: ["vite"], configPatterns: [/vite\.config\./], scriptHints: ["vite"] },
  { id: "webpack", confidence: 0.95, deps: ["webpack"], configPatterns: [/webpack\.config\./], scriptHints: ["webpack"] },
  { id: "rollup", confidence: 0.95, deps: ["rollup"], configPatterns: [/rollup\.config\./], scriptHints: ["rollup"] },
  { id: "parcel", confidence: 0.94, deps: ["parcel"], configPatterns: [/\.parcelrc$/], scriptHints: ["parcel"] },
  { id: "esbuild", confidence: 0.94, deps: ["esbuild"], scriptHints: ["esbuild"] },
  { id: "tsup", confidence: 0.95, deps: ["tsup"], configPatterns: [/tsup\.config\./], scriptHints: ["tsup"] },
  { id: "swc", confidence: 0.93, deps: ["@swc/core", "@swc/cli"], configPatterns: [/\.swcrc$/], scriptHints: ["swc"] },
  { id: "babel", confidence: 0.93, deps: ["@babel/core"], configPatterns: [/(^|\/)\.babelrc/, /babel\.config\./], scriptHints: ["babel"] },
  { id: "turbopack", confidence: 0.9, deps: ["@vercel/turbopack"], scriptHints: ["turbopack"] },
  { id: "nx", confidence: 0.94, deps: ["nx", "@nrwl/workspace"], configPatterns: [/nx\.json$/], scriptHints: ["nx"] },
  { id: "turborepo", confidence: 0.94, deps: ["turbo"], configPatterns: [/turbo\.json$/], scriptHints: ["turbo"] },
  { id: "lerna", confidence: 0.93, deps: ["lerna"], configPatterns: [/lerna\.json$/], scriptHints: ["lerna"] },
  { id: "rush", confidence: 0.93, deps: ["@microsoft/rush"], configPatterns: [/rush\.json$/] },
  { id: "tsc", confidence: 0.9, deps: ["typescript"], configPatterns: [/tsconfig\.json$/], scriptHints: ["tsc"] }
];

const LINT_TOOLS: JsToolEntry[] = [
  { id: "eslint", confidence: 0.95, deps: ["eslint"], configPatterns: [/eslint\.config\./, /\.eslintrc(\.|$)/], scriptHints: ["eslint"] },
  { id: "biome", confidence: 0.94, deps: ["@biomejs/biome"], configPatterns: [/biome\.json$/], scriptHints: ["biome"] },
  { id: "stylelint", confidence: 0.94, deps: ["stylelint"], configPatterns: [/stylelint\.config\./, /\.stylelintrc(\.|$)/], scriptHints: ["stylelint"] }
];

const FORMAT_TOOLS: JsToolEntry[] = [
  { id: "prettier", confidence: 0.95, deps: ["prettier"], configPatterns: [/prettier\.config\./, /\.prettierrc(\.|$)/], scriptHints: ["prettier"] },
  { id: "biome", confidence: 0.93, deps: ["@biomejs/biome"], scriptHints: ["biome format"] }
];

const TEST_TOOLS: JsToolEntry[] = [
  { id: "vitest", confidence: 0.95, deps: ["vitest"], scriptHints: ["vitest"] },
  { id: "jest", confidence: 0.95, deps: ["jest"], scriptHints: ["jest"] },
  { id: "mocha", confidence: 0.94, deps: ["mocha"], scriptHints: ["mocha"] },
  { id: "jasmine", confidence: 0.94, deps: ["jasmine"], scriptHints: ["jasmine"] },
  { id: "playwright", confidence: 0.95, deps: ["playwright", "@playwright/test"], scriptHints: ["playwright"] },
  { id: "cypress", confidence: 0.95, deps: ["cypress"], scriptHints: ["cypress"] }
];

const JS_PACKAGE_MANAGER_LOCKS: Array<{ name: string; id: PackageManagerSignal["id"]; confidence: number }> = [
  { name: "pnpm-lock.yaml", id: "pnpm", confidence: 1 },
  { name: "yarn.lock", id: "yarn", confidence: 1 },
  { name: "package-lock.json", id: "npm", confidence: 1 },
  { name: "bun.lockb", id: "bun", confidence: 1 },
  { name: "bun.lock", id: "bun", confidence: 1 },
  { name: "deno.lock", id: "deno", confidence: 1 }
];

const JS_CONFIG_LANGUAGE_HINTS: Array<{ pattern: RegExp; language: string; confidence: number }> = [
  { pattern: /tsconfig\.json$/, language: "TypeScript", confidence: 0.98 },
  { pattern: /deno\.jsonc?$/, language: "TypeScript", confidence: 0.94 },
  { pattern: /package\.json$/, language: "JavaScript", confidence: 0.86 }
];

export function detectJavaScriptEcosystem(context: DetectorContext): DetectionResult {
  const result = emptyDetectionResult();
  const dependencySignals = collectPackageJsonDependencies(context.packageJsonRecords);
  const allTextScripts = context.packageJsonRecords.flatMap((pkg) => Object.entries(pkg.data.scripts ?? {}).map(([name, raw]) => ({
    path: pkg.path,
    scope: pkg.scope,
    scriptName: name,
    rawScript: String(raw)
  })));

  const hasPrimaryWorkspaces = context.packageJsonRecords.some((pkg) => pkg.scope === "root" && typeof pkg.data.workspaces !== "undefined")
    || context.files.some((file) => file.path === "pnpm-workspace.yaml" && file.scope === "root");

  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    const base = path.basename(lower);

    for (const lock of JS_PACKAGE_MANAGER_LOCKS) {
      if (base !== lock.name) continue;
      result.packageManagers.push({
        id: lock.id,
        confidence: lock.confidence,
        lockfile: file.path,
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(file.path, file.scope, `${lock.name} is present`, lock.confidence, "config")
      });
    }

    for (const hint of JS_CONFIG_LANGUAGE_HINTS) {
      if (!hint.pattern.test(lower)) continue;
      result.languages.push(languageSignal(hint.language, file.path, file.scope, `${base} indicates ${hint.language}`, hint.confidence, "config"));
    }

    if (base === ".nvmrc" || base === ".node-version") {
      result.languages.push(languageSignal("JavaScript", file.path, file.scope, `${base} indicates Node.js runtime`, 0.85, "config"));
    }
    if (/\.(ts|tsx)$/i.test(file.path)) {
      result.languages.push(languageSignal("TypeScript", file.path, file.scope, `file extension ${path.extname(file.path)} is present`, 0.95));
    }
    if (/\.(js|jsx|mjs|cjs)$/i.test(file.path)) {
      result.languages.push(languageSignal("JavaScript", file.path, file.scope, `file extension ${path.extname(file.path)} is present`, 0.9));
    }
  }

  if (context.packageJsonRecords.length > 0 && !result.packageManagers.some((item) => item.id === "npm")) {
    for (const pkg of context.packageJsonRecords) {
      result.packageManagers.push({
        id: "npm",
        confidence: 0.5,
        lockfile: "",
        workspaceMode: hasPrimaryWorkspaces,
        evidence: makeEvidence(pkg.path, pkg.scope, "package.json is present without detected JS lockfile", 0.5, "manifest_field")
      });
    }
  }

  for (const entry of JS_FRAMEWORKS) {
    pushFrameworkSignals(entry, context, dependencySignals, result.frameworks);
  }
  for (const entry of BUILD_TOOLS) {
    pushToolSignals(entry, context, dependencySignals, allTextScripts, result.buildTools);
  }
  for (const entry of TEST_TOOLS) {
    pushToolSignals(entry, context, dependencySignals, allTextScripts, result.testTools);
  }
  for (const entry of LINT_TOOLS) {
    pushToolSignals(entry, context, dependencySignals, allTextScripts, result.lintTools);
  }
  for (const entry of FORMAT_TOOLS) {
    pushToolSignals(entry, context, dependencySignals, allTextScripts, result.formatTools);
  }

  return result;
}

function pushFrameworkSignals(
  entry: JsRegistryEntry,
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
    if (entry.configPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.88, entry.confidence - 0.02),
        evidence: makeEvidence(file.path, file.scope, `${path.basename(file.path)} indicates ${entry.id}`, Math.max(0.88, entry.confidence - 0.02), "config")
      });
    }
    if (entry.pathPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.78, entry.confidence - 0.15),
        evidence: makeEvidence(file.path, file.scope, `path convention ${file.path} indicates ${entry.id}`, Math.max(0.78, entry.confidence - 0.15), "found_path")
      });
    }
  }
}

function pushToolSignals(
  entry: JsToolEntry,
  context: DetectorContext,
  dependencies: DependencySignal[],
  scripts: Array<{ path: string; scope: FactEvidence["scope"]; scriptName: string; rawScript: string }>,
  output: ToolSignal[]
): void {
  for (const signal of dependencies) {
    if (!entry.deps.includes(signal.dep)) continue;
    output.push(toolSignal(entry.id, signal.path, signal.scope, signal.reason, entry.confidence, "dependency"));
  }

  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    if (!entry.configPatterns?.some((pattern) => pattern.test(lower))) continue;
    output.push(toolSignal(entry.id, file.path, file.scope, `${path.basename(file.path)} indicates ${entry.id}`, Math.max(0.86, entry.confidence - 0.04), "config"));
  }

  for (const script of scripts) {
    if (!entry.scriptHints?.some((hint) => containsToken(script.rawScript.toLowerCase(), hint.toLowerCase()))) continue;
    output.push(toolSignal(
      entry.id,
      script.path,
      script.scope,
      `scripts.${script.scriptName} contains ${entry.id}`,
      Math.max(0.84, entry.confidence - 0.08),
      "script"
    ));
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

