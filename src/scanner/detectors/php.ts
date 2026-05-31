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
  collectComposerDependencies,
  containsToken,
  emptyDetectionResult,
  makeEvidence
} from "./common.js";

type PhpFrameworkEntry = {
  id: string;
  category: FrameworkDetection["category"];
  confidence: number;
  deps: string[];
  pathPatterns?: RegExp[];
  configPatterns?: RegExp[];
};

type PhpToolEntry = {
  id: string;
  confidence: number;
  deps: string[];
  configPatterns?: RegExp[];
  scriptHints?: string[];
};

const PHP_FRAMEWORKS: PhpFrameworkEntry[] = [
  { id: "laravel", category: "backend", confidence: 0.96, deps: ["laravel/framework"], pathPatterns: [/artisan$/i] },
  { id: "symfony", category: "backend", confidence: 0.96, deps: ["symfony/framework-bundle"], pathPatterns: [/bin\/console$/i, /symfony\.lock$/i] },
  { id: "slim", category: "backend", confidence: 0.95, deps: ["slim/slim"] },
  { id: "lumen", category: "backend", confidence: 0.94, deps: ["laravel/lumen-framework"] },
  { id: "codeigniter", category: "backend", confidence: 0.94, deps: ["codeigniter4/framework"] },
  { id: "cakephp", category: "backend", confidence: 0.94, deps: ["cakephp/cakephp"] },
  { id: "yii", category: "backend", confidence: 0.94, deps: ["yiisoft/yii2"] },
  { id: "laminas", category: "backend", confidence: 0.93, deps: ["laminas/laminas-mvc", "zendframework/zend-mvc"] },
  { id: "phalcon", category: "backend", confidence: 0.93, deps: ["phalcon/incubator"] },
  { id: "wordpress", category: "backend", confidence: 0.95, deps: ["roots/wordpress"], pathPatterns: [/wp-config\.php$/i, /^wp-content\//i] },
  { id: "drupal", category: "backend", confidence: 0.95, deps: ["drupal/core"], pathPatterns: [/core\/modules\//i] },
  { id: "joomla", category: "backend", confidence: 0.94, deps: ["joomla/cms"], pathPatterns: [/administrator\//i] },
  { id: "magento", category: "backend", confidence: 0.94, deps: ["magento/product-community-edition", "magento/framework"], pathPatterns: [/app\/etc\/env\.php$/i] }
];

const PHP_TEST_TOOLS: PhpToolEntry[] = [
  { id: "phpunit", confidence: 0.95, deps: ["phpunit/phpunit"], configPatterns: [/phpunit\.xml(\.dist)?$/i], scriptHints: ["phpunit"] },
  { id: "pest", confidence: 0.95, deps: ["pestphp/pest"], scriptHints: ["pest"] },
  { id: "codeception", confidence: 0.93, deps: ["codeception/codeception"], scriptHints: ["codecept"] },
  { id: "behat", confidence: 0.92, deps: ["behat/behat"], scriptHints: ["behat"] }
];

const PHP_LINT_TOOLS: PhpToolEntry[] = [
  { id: "phpstan", confidence: 0.95, deps: ["phpstan/phpstan"], configPatterns: [/phpstan\.neon$/i], scriptHints: ["phpstan"] },
  { id: "psalm", confidence: 0.95, deps: ["vimeo/psalm"], configPatterns: [/psalm\.xml$/i], scriptHints: ["psalm"] },
  { id: "phpcs", confidence: 0.94, deps: ["squizlabs/php_codesniffer"], scriptHints: ["phpcs"] },
  { id: "rector", confidence: 0.93, deps: ["rector/rector"], scriptHints: ["rector"] }
];

const PHP_FORMAT_TOOLS: PhpToolEntry[] = [
  { id: "php-cs-fixer", confidence: 0.94, deps: ["friendsofphp/php-cs-fixer"], configPatterns: [/\.php-cs-fixer\.php$/i], scriptHints: ["php-cs-fixer"] }
];

const PHP_BUILD_TOOLS: PhpToolEntry[] = [
  { id: "doctrine", confidence: 0.92, deps: ["doctrine/orm"] },
  { id: "eloquent", confidence: 0.92, deps: ["illuminate/database"] },
  { id: "propel", confidence: 0.91, deps: ["propel/propel"] }
];

export function detectPhpEcosystem(context: DetectorContext): DetectionResult {
  const result = emptyDetectionResult();
  const dependencies = collectComposerDependencies(context.composerJsonRecords);

  for (const file of context.files) {
    const lower = file.path.toLowerCase();
    const base = path.basename(lower);
    if (/\.php$/i.test(file.path)) {
      result.languages.push(languageSignal("PHP", file.path, file.scope, "file extension .php is present", 0.95));
    }
    if (base === "composer.json") {
      result.packageManagers.push(packageManagerSignal("composer", file.path, file.scope, "composer.json is present", 1, "manifest_field"));
      result.languages.push(languageSignal("PHP", file.path, file.scope, "composer.json indicates PHP project", 0.9, "manifest_field"));
    }
    if (base === "composer.lock") {
      result.packageManagers.push(packageManagerSignal("composer", file.path, file.scope, "composer.lock is present", 1, "config"));
    }
  }

  for (const entry of PHP_FRAMEWORKS) {
    pushFrameworkSignals(entry, context, dependencies, result.frameworks);
  }
  pushToolSignals(PHP_BUILD_TOOLS, context, dependencies, result.buildTools);
  pushToolSignals(PHP_TEST_TOOLS, context, dependencies, result.testTools);
  pushToolSignals(PHP_LINT_TOOLS, context, dependencies, result.lintTools);
  pushToolSignals(PHP_FORMAT_TOOLS, context, dependencies, result.formatTools);

  // script-based tool inference from composer scripts
  for (const composer of context.composerJsonRecords) {
    const scripts = composer.data.scripts ?? {};
    for (const [scriptName, scriptValue] of Object.entries(scripts)) {
      const joined = Array.isArray(scriptValue)
        ? scriptValue.map((item) => String(item)).join(" && ")
        : String(scriptValue);
      const lower = joined.toLowerCase();
      if (containsToken(lower, "phpunit") || containsToken(lower, "pest")) {
        result.testTools.push(toolSignal("phpunit", composer.path, composer.scope, `composer script ${scriptName} contains phpunit/pest`, 0.86, "script"));
      }
      if (containsToken(lower, "phpstan") || containsToken(lower, "psalm")) {
        result.lintTools.push(toolSignal("phpstan", composer.path, composer.scope, `composer script ${scriptName} contains phpstan/psalm`, 0.86, "script"));
      }
      if (containsToken(lower, "php-cs-fixer")) {
        result.formatTools.push(toolSignal("php-cs-fixer", composer.path, composer.scope, `composer script ${scriptName} contains php-cs-fixer`, 0.86, "script"));
      }
    }
  }

  return result;
}

function pushFrameworkSignals(
  entry: PhpFrameworkEntry,
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
    if (entry.pathPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.86, entry.confidence - 0.06),
        evidence: makeEvidence(file.path, file.scope, `path convention ${file.path} indicates ${entry.id}`, Math.max(0.86, entry.confidence - 0.06), "found_path")
      });
    }
    if (entry.configPatterns?.some((pattern) => pattern.test(lower))) {
      output.push({
        id: entry.id,
        category: entry.category,
        confidence: Math.max(0.86, entry.confidence - 0.06),
        evidence: makeEvidence(file.path, file.scope, `${path.basename(file.path)} indicates ${entry.id}`, Math.max(0.86, entry.confidence - 0.06), "config")
      });
    }
  }
}

function pushToolSignals(
  entries: PhpToolEntry[],
  context: DetectorContext,
  dependencies: DependencySignal[],
  output: ToolSignal[]
): void {
  for (const entry of entries) {
    for (const dep of dependencies) {
      if (!entry.deps.includes(dep.dep)) continue;
      output.push(toolSignal(entry.id, dep.path, dep.scope, dep.reason, entry.confidence, "dependency"));
    }
    for (const file of context.files) {
      const lower = file.path.toLowerCase();
      if (entry.configPatterns?.some((pattern) => pattern.test(lower))) {
        output.push(toolSignal(entry.id, file.path, file.scope, `${path.basename(file.path)} indicates ${entry.id}`, Math.max(0.84, entry.confidence - 0.05), "config"));
      }
    }
    for (const composer of context.composerJsonRecords) {
      const scripts = composer.data.scripts ?? {};
      for (const [scriptName, value] of Object.entries(scripts)) {
        const joined = Array.isArray(value) ? value.map((item) => String(item)).join(" && ") : String(value);
        if (!entry.scriptHints?.some((hint) => containsToken(joined.toLowerCase(), hint))) continue;
        output.push(toolSignal(entry.id, composer.path, composer.scope, `composer script ${scriptName} contains ${entry.id}`, Math.max(0.82, entry.confidence - 0.08), "script"));
      }
    }
  }
}

function packageManagerSignal(
  id: PackageManagerSignal["id"],
  filePath: string,
  scope: FactEvidence["scope"],
  reason: string,
  confidence: number,
  kind: FactEvidence["kind"]
): PackageManagerSignal {
  return {
    id,
    confidence,
    lockfile: filePath,
    evidence: makeEvidence(filePath, scope, reason, confidence, kind)
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

