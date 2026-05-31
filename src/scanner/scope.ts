import path from "node:path";
import type { ScanScope } from "../types/index.js";

const TEST_FILE_PATTERN = /\.(test|spec)\.[a-z0-9]+$/i;
const DOC_NAME_PATTERN = /^(readme|contributing|changelog)(\.[a-z0-9]+)?$/i;

export function classifyPathScope(inputPath: string): ScanScope {
  const normalized = normalizePath(inputPath);
  const lower = normalized.toLowerCase();
  const base = path.basename(lower);

  if (isVendorPath(lower)) return "vendor";
  if (isGeneratedPath(lower)) return "generated";
  if (/(^|\/)(__fixtures__|fixtures)\//.test(lower)) return "fixture";
  if (/(^|\/)(examples?|samples|demos?)\//.test(lower)) return "example";
  if (/(^|\/)(__tests__|tests?)\//.test(lower) || TEST_FILE_PATTERN.test(lower)) return "test";
  if (lower.startsWith("docs/") || /(^|\/)docs\//.test(lower) || DOC_NAME_PATTERN.test(base)) return "docs";
  if (lower.startsWith(".github/")) return "root";
  if (isSourcePath(lower)) return "src";
  if (!lower.includes("/")) return "root";

  // Default nested paths to src-level scope to avoid losing real project signals.
  return "src";
}

export function isPrimaryScope(scope: ScanScope): boolean {
  return scope === "root" || scope === "src";
}

export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isVendorPath(lowerPath: string): boolean {
  return lowerPath.startsWith("node_modules/")
    || lowerPath.includes("/node_modules/")
    || lowerPath.startsWith("vendor/")
    || lowerPath.includes("/vendor/")
    || lowerPath.startsWith(".venv/")
    || lowerPath.includes("/.venv/");
}

function isGeneratedPath(lowerPath: string): boolean {
  return lowerPath.startsWith("dist/")
    || lowerPath.includes("/dist/")
    || lowerPath.startsWith("build/")
    || lowerPath.includes("/build/")
    || lowerPath.startsWith(".next/")
    || lowerPath.includes("/.next/")
    || lowerPath.startsWith(".nuxt/")
    || lowerPath.includes("/.nuxt/")
    || lowerPath.startsWith(".svelte-kit/")
    || lowerPath.includes("/.svelte-kit/")
    || lowerPath.startsWith("coverage/")
    || lowerPath.includes("/coverage/")
    || lowerPath.startsWith(".turbo/")
    || lowerPath.includes("/.turbo/");
}

function isSourcePath(lowerPath: string): boolean {
  if (lowerPath.startsWith("src/") || lowerPath.startsWith("app/")) return true;
  if (lowerPath.startsWith("packages/") || lowerPath.startsWith("apps/") || lowerPath.startsWith("services/")) return true;
  if (lowerPath.startsWith("scripts/") || lowerPath.startsWith("bin/") || lowerPath.startsWith("lib/")) return true;
  return false;
}
