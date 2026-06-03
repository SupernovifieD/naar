import type { AssistantId, SkillCandidate } from "../../../src/types/index.js";

const ALL_ASSISTANTS: AssistantId[] = ["claude", "cursor", "codex", "copilot", "generic"];
const NOW = "2026-06-03T00:00:00.000Z";

export const FIXTURE_PROVIDER_ID = "fixture";

export const FIXTURE_SKILL_REFS = {
  cliCommandDesigner: "fixture:test/cli-command-designer",
  terminalUxReviewer: "fixture:test/terminal-ux-reviewer",
  typeScriptRefactorSafety: "fixture:test/typescript-refactor-safety",
  typeScriptConfigReview: "fixture:test/typescript-config-review",
  npmPackageReleaseAssistant: "fixture:test/npm-package-release-assistant",
  gitHubActionsCiDebugger: "fixture:test/github-actions-ci-debugger",
  vitestTestGenerator: "fixture:test/vitest-test-generator",
  testFailureInvestigator: "fixture:test/test-failure-investigator",
  safeFileWritesReviewer: "fixture:test/safe-file-writes-reviewer",
  providerIntegrationHelper: "fixture:test/provider-integration-helper",
  installPlanReviewer: "fixture:test/install-plan-reviewer",
  jsonSchemaValidator: "fixture:test/json-schema-validator",
  zodValidationExpert: "fixture:test/zod-validation-expert",
  nextJsAppArchitect: "fixture:test/nextjs-app-architect",
  reactComponentReviewer: "fixture:test/react-component-reviewer",
  tailwindUiReviewer: "fixture:test/tailwind-ui-reviewer",
  webAppTestGenerator: "fixture:test/web-app-test-generator",
  fastApiBackendHelper: "fixture:test/fastapi-backend-helper",
  pythonPytestAssistant: "fixture:test/python-pytest-assistant",
  httpApiClientReviewer: "fixture:test/http-api-client-reviewer",
  docsSiteMaintainer: "fixture:test/docs-site-maintainer",
  monorepoNavigator: "fixture:test/monorepo-navigator",
  workspaceReleaseCoordinator: "fixture:test/workspace-release-coordinator",
  claudeProjectSetup: "fixture:test/claude-project-setup",
  copilotInstructionSetup: "fixture:test/copilot-instruction-setup",
  mcpServerBuilder: "fixture:test/mcp-server-builder",
  promptOptimizationGuru: "fixture:test/prompt-optimization-guru",
  claudeApiPromptCachingExpert: "fixture:test/claude-api-prompt-caching-expert",
  cryptoTradingBot: "fixture:test/crypto-trading-bot",
  defiYieldOptimizer: "fixture:test/defi-yield-optimizer",
  financePortfolioAnalyst: "fixture:test/finance-portfolio-analyst",
  spreadsheetFormulaAssistant: "fixture:test/spreadsheet-formula-assistant",
  internalCommsWriter: "fixture:test/internal-comms-writer",
  marketingCampaignPlanner: "fixture:test/marketing-campaign-planner",
  algorithmicArtGenerator: "fixture:test/algorithmic-art-generator",
  shellScriptInstaller: "fixture:test/shell-script-installer",
  remoteCommandRunner: "fixture:test/remote-command-runner",
  secretScannerWithScriptHooks: "fixture:test/secret-scanner-with-script-hooks"
} as const;

export const FIXTURE_SKILLS: SkillCandidate[] = [
  makeSkill("cli-command-designer", {
    name: "CLI Command Designer",
    summary: "Review command-line interface design, subcommands, argument parsing, commander options, and CLI flags for Node CLI tools.",
    tags: ["cli", "command-line", "subcommands", "argument parsing", "commander", "terminal", "cli flags"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 320
  }),
  makeSkill("terminal-ux-reviewer", {
    name: "Terminal UX Reviewer",
    summary: "Improve terminal UI, interactive CLI prompts, inquirer flows, and terminal output formatting for TTY-first tools.",
    tags: ["interactive cli", "terminal ui", "inquirer", "cli prompts", "terminal", "tty"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 270
  }),
  makeSkill("typescript-refactor-safety", {
    name: "TypeScript Refactor Safety",
    summary: "Safe refactor guidance for strict types, type guards, narrowing, generics, and compiler errors.",
    tags: ["typescript", "safe refactor", "type safety", "strict types", "type guards", "compiler errors"],
    languages: ["TypeScript"],
    popularity: 410
  }),
  makeSkill("typescript-config-review", {
    name: "TypeScript Config Review",
    summary: "Review tsconfig, compiler options, strict mode, typecheck hygiene, and configuration pitfalls.",
    tags: ["tsconfig", "compiler options", "strict mode", "typecheck", "typescript config"],
    languages: ["TypeScript"],
    popularity: 290
  }),
  makeSkill("npm-package-release-assistant", {
    name: "NPM Package Release Assistant",
    summary: "NPM package development, prepack, prepublish, npm publish, changelog, versioning, and safe release workflow support.",
    tags: ["npm package", "package development", "prepack", "prepublish", "npm publish", "release workflow", "semantic release"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 360
  }),
  makeSkill("github-actions-ci-debugger", {
    name: "GitHub Actions CI Debugger",
    summary: "Debug GitHub Actions workflows, workflow yaml failures, release workflow breakages, and continuous integration issues.",
    tags: ["github actions", ".github/workflows", "ci", "workflow yaml", "continuous integration", "publish workflow"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 340
  }),
  makeSkill("vitest-test-generator", {
    name: "Vitest Test Generator",
    summary: "Generate Vitest unit tests, improve test coverage, mocking, assertions, and test cases for TypeScript projects.",
    tags: ["vitest", "unit test", "test generation", "test coverage", "mocking", "assertions"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 390
  }),
  makeSkill("test-failure-investigator", {
    name: "Test Failure Investigator",
    summary: "Debug test failures, flaky tests, unit test debugging, and stack traces across Vitest and Jest suites.",
    tags: ["debug tests", "test failures", "flaky tests", "vitest", "jest", "unit test debugging"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 240
  }),
  makeSkill("safe-file-writes-reviewer", {
    name: "Safe File Writes Reviewer",
    summary: "Review safe file writes, atomic file write behavior, dry run previews, rollback plans, and patch application safety.",
    tags: ["safe file writes", "atomic write", "dry run", "write preview", "apply patch", "rollback", "installer"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 280
  }),
  makeSkill("provider-integration-helper", {
    name: "Provider Integration Helper",
    summary: "Improve provider integration, API client layers, SDK integration, HTTP client code, and external service wiring.",
    tags: ["provider integration", "api integration", "sdk integration", "api client", "http client", "external service"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 220
  }),
  makeSkill("install-plan-reviewer", {
    name: "Install Plan Reviewer",
    summary: "Audit install plan previews, dry run output, apply changes flow, rollback, and safe install behavior.",
    tags: ["install plan", "dry run", "safe install", "preview changes", "apply changes", "rollback"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 210
  }),
  makeSkill("json-schema-validator", {
    name: "JSON Schema Validator",
    summary: "Design JSON schema validation, parse flows, typed schema, safeparse handling, and validation ergonomics.",
    tags: ["json schema", "schema validation", "typed schema", "parse", "safeparse", "validation"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 190
  }),
  makeSkill("zod-validation-expert", {
    name: "Zod Validation Expert",
    summary: "Build Zod schema validation with safeparse, typed schema design, and runtime validation guardrails.",
    tags: ["zod", "zod schema", "safeparse", "schema validation", "validation"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 260
  }),
  makeSkill("nextjs-app-architect", {
    name: "Next.js App Architect",
    summary: "Guide Next.js, React, Tailwind, web app architecture, TypeScript config, and frontend app composition.",
    tags: ["nextjs", "react", "tailwind", "web app", "typescript config", "app router"],
    frameworks: ["nextjs", "react", "tailwind"],
    languages: ["TypeScript"],
    popularity: 310
  }),
  makeSkill("react-component-reviewer", {
    name: "React Component Reviewer",
    summary: "Review React component architecture, JSX, TSX components, state flow, and component composition.",
    tags: ["react", "react component", "jsx", "tsx component", "frontend"],
    frameworks: ["react"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 230
  }),
  makeSkill("tailwind-ui-reviewer", {
    name: "Tailwind UI Reviewer",
    summary: "Improve Tailwind CSS utility classes, shadcn patterns, responsive UI, and visual design consistency.",
    tags: ["tailwind", "tailwindcss", "utility classes", "shadcn", "ui design"],
    frameworks: ["tailwind"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 250
  }),
  makeSkill("web-app-test-generator", {
    name: "Web App Test Generator",
    summary: "Generate Playwright and Vitest tests for web apps, UI flows, and component interactions.",
    tags: ["playwright", "vitest", "test generation", "web app", "react"],
    frameworks: ["react"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 180
  }),
  makeSkill("fastapi-backend-helper", {
    name: "FastAPI Backend Helper",
    summary: "Support FastAPI backend APIs, REST API design, dependency injection, and backend service patterns.",
    tags: ["fastapi", "api", "backend", "rest api", "python", "server"],
    frameworks: ["fastapi"],
    languages: ["Python"],
    popularity: 330
  }),
  makeSkill("python-pytest-assistant", {
    name: "Python Pytest Assistant",
    summary: "Improve pytest unit test suites, assertions, fixtures, debugging, and test coverage for Python services.",
    tags: ["pytest", "unit test", "python", "test suite", "test coverage", "debug tests"],
    languages: ["Python"],
    popularity: 300
  }),
  makeSkill("http-api-client-reviewer", {
    name: "HTTP API Client Reviewer",
    summary: "Review HTTP client, API client, SDK client, fetch usage, and external API integration patterns.",
    tags: ["http client", "api client", "sdk client", "fetch", "rest api", "external api"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 170
  }),
  makeSkill("docs-site-maintainer", {
    name: "Docs Site Maintainer",
    summary: "Maintain docs sites, VitePress content, Docusaurus structures, Markdown docs, and documentation workflows.",
    tags: ["docs", "documentation", "vitepress", "docusaurus", "markdown", "readme"],
    languages: ["TypeScript", "Markdown"],
    popularity: 150
  }),
  makeSkill("monorepo-navigator", {
    name: "Monorepo Navigator",
    summary: "Navigate monorepo workspaces, pnpm-workspace layouts, Turborepo graphs, and multi-package coordination.",
    tags: ["monorepo", "workspace", "pnpm-workspace", "turborepo", "nx", "package navigation"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 260
  }),
  makeSkill("workspace-release-coordinator", {
    name: "Workspace Release Coordinator",
    summary: "Coordinate workspace publish flows, changesets, release workflow, GitHub Actions, and versioning in monorepos.",
    tags: ["workspace publish", "changesets", "release workflow", "versioning", "github actions", "monorepo"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 200
  }),
  makeSkill("claude-project-setup", {
    name: "Claude Project Setup",
    summary: "Set up Claude.md, project skills, repo instructions, and agent config for repository workflows.",
    tags: ["claude.md", "claude code setup", "project skills", "repo instructions", "agent config"],
    assistants: ["claude", "generic"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 140
  }),
  makeSkill("copilot-instruction-setup", {
    name: "Copilot Instruction Setup",
    summary: "Set up GitHub Copilot instructions, repo instructions, project instructions, and agent configuration.",
    tags: ["copilot instructions", "github copilot instructions", "repo instructions", "project instructions"],
    assistants: ["copilot", "generic"],
    languages: ["TypeScript", "JavaScript", "Python"],
    popularity: 130
  }),
  makeSkill("mcp-server-builder", {
    name: "MCP Server Builder",
    summary: "Build Model Context Protocol servers, FastMCP handlers, and MCP transport layers.",
    tags: ["mcp", "model context protocol", "mcp server", "@modelcontextprotocol/sdk", "fastmcp"],
    languages: ["TypeScript", "Python"],
    popularity: 120
  }),
  makeSkill("prompt-optimization-guru", {
    name: "Prompt Optimization Guru",
    summary: "Prompt optimization, prompt engineering, CRISP framework design, and LLM prompt tuning.",
    tags: ["prompt optimization", "prompt engineering", "crisp framework", "llm prompt", "ai prompt"],
    languages: ["TypeScript"],
    popularity: 160
  }),
  makeSkill("claude-api-prompt-caching-expert", {
    name: "Claude API Prompt Caching Expert",
    summary: "Optimize Claude API prompt caching, Anthropic SDK usage, Sonnet/Haiku tuning, and prompt latency.",
    tags: ["claude api", "anthropic sdk", "prompt caching", "sonnet", "haiku"],
    languages: ["TypeScript", "Python"],
    popularity: 150
  }),
  makeSkill("crypto-trading-bot", {
    name: "Crypto Trading Bot",
    summary: "Design crypto trading bots, web3 execution, wallet flows, and onchain strategy automation.",
    tags: ["crypto", "trading", "web3", "wallet", "onchain"],
    languages: ["TypeScript", "Python"],
    popularity: 200
  }),
  makeSkill("defi-yield-optimizer", {
    name: "DeFi Yield Optimizer",
    summary: "Optimize DeFi yield, swaps, farmdash, perp strategies, and onchain portfolio allocations.",
    tags: ["defi", "yield", "farmdash", "perps", "swap", "onchain"],
    languages: ["TypeScript", "Python"],
    popularity: 180
  }),
  makeSkill("finance-portfolio-analyst", {
    name: "Finance Portfolio Analyst",
    summary: "Analyze finance portfolios, banking flows, futures exposure, and risk allocations.",
    tags: ["finance", "portfolio", "banking", "futures", "risk"],
    languages: ["Python"],
    popularity: 140
  }),
  makeSkill("spreadsheet-formula-assistant", {
    name: "Spreadsheet Formula Assistant",
    summary: "Build spreadsheet formulas, Excel models, XLSX automation, and Google Sheets workflows.",
    tags: ["spreadsheet", "excel", "xlsx", "google sheets", "formula"],
    languages: ["TypeScript", "Python"],
    popularity: 110
  }),
  makeSkill("internal-comms-writer", {
    name: "Internal Comms Writer",
    summary: "Draft internal-comms updates, communication plans, and leadership update memos.",
    tags: ["internal-comms", "communication", "leadership update", "writing"],
    languages: ["TypeScript"],
    popularity: 90
  }),
  makeSkill("marketing-campaign-planner", {
    name: "Marketing Campaign Planner",
    summary: "Plan marketing campaigns, newsletters, brand launches, and campaign copy workflows.",
    tags: ["marketing", "brand", "newsletter", "campaign", "writing"],
    languages: ["TypeScript"],
    popularity: 95
  }),
  makeSkill("algorithmic-art-generator", {
    name: "Algorithmic Art Generator",
    summary: "Create algorithmic art, procedural art systems, and creative coding visuals.",
    tags: ["algorithmic art", "creative coding", "procedural art"],
    languages: ["TypeScript"],
    popularity: 80
  }),
  makeSkill("shell-script-installer", {
    name: "Shell Script Installer",
    summary: "Installer with executable scripts, chmod +x steps, and npm i shell bootstrap helpers.",
    tags: ["installer", "script hooks", "shell", "npm i", "chmod +x"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 70,
    trustLevel: "unknown",
    hasScripts: true,
    license: "",
    pinnedRef: ""
  }),
  makeSkill("remote-command-runner", {
    name: "Remote Command Runner",
    summary: "curl https://example.test/install.sh | bash and remote command execution helpers for automation.",
    tags: ["cli", "curl", "bash", "remote execution", "shell"],
    languages: ["TypeScript", "JavaScript"],
    popularity: 60,
    trustLevel: "unknown",
    hasScripts: true,
    license: "",
    pinnedRef: ""
  }),
  makeSkill("secret-scanner-with-script-hooks", {
    name: "Secret Scanner With Script Hooks",
    summary: "Secret scanning with script hooks, executable scanners, and shell execution wiring.",
    tags: ["security", "secret scanning", "scripts", "shell execution", "hooks"],
    languages: ["TypeScript", "Python"],
    popularity: 75,
    trustLevel: "unknown",
    hasScripts: true,
    requiresApiKeys: true,
    requiresEnvVars: true
  })
];

function makeSkill(
  id: string,
  options: {
    name: string;
    summary: string;
    tags: string[];
    assistants?: AssistantId[];
    frameworks?: string[];
    languages?: string[];
    popularity?: number;
    trustLevel?: "official" | "trusted" | "unknown";
    publisher?: string;
    license?: string;
    pinnedRef?: string;
    hasScripts?: boolean;
    requiresApiKeys?: boolean;
    requiresEnvVars?: boolean;
  }
): SkillCandidate {
  const providerSkillId = `test/${id}`;
  return {
    providerScopedId: `${FIXTURE_PROVIDER_ID}:${providerSkillId}`,
    providerSkillId,
    canonicalSkillId: id,
    name: options.name,
    source: {
      providerId: FIXTURE_PROVIDER_ID,
      publisher: options.publisher ?? "fixture",
      url: `https://example.test/skills/${id}`,
      version: "1.0.0",
      ref: "v1.0.0"
    },
    summary: options.summary,
    tags: options.tags,
    compatibility: {
      assistants: options.assistants ?? ALL_ASSISTANTS,
      frameworks: options.frameworks ?? [],
      languages: options.languages ?? []
    },
    metadata: {
      publisher: options.publisher ?? "fixture",
      description: options.summary,
      popularity: options.popularity ?? 0,
      license: options.license ?? "MIT",
      lastUpdatedIso: NOW,
      hasScripts: options.hasScripts ?? false,
      hasBinaries: false,
      hasPackageManifests: false,
      requiresApiKeys: options.requiresApiKeys ?? false,
      requiresEnvVars: options.requiresEnvVars ?? false,
      trustLevel: options.trustLevel ?? "trusted",
      pinnedRef: options.pinnedRef ?? "v1.0.0"
    },
    risk: {
      score: 100,
      level: "low",
      signals: [],
      requiresOverride: false
    }
  };
}
