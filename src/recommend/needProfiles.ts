import type { NeedMatchStrength } from "../types/index.js";

export type NeedMatchProfile = {
  id: string;
  exact?: string[];
  strong?: string[];
  weak?: string[];
  anti?: string[];
  allowWeakOnly?: boolean;
  notes?: string;
};

export type NeedMatchLexicon = {
  primaryText: string;
  primaryTokens: Set<string>;
  supportingText: string;
  supportingTokens: Set<string>;
};

export type NeedProfileMatch = {
  strength: NeedMatchStrength;
  matchedTerms: string[];
  antiTerms: string[];
  reason?: string;
};

export const NEED_MATCH_PROFILES: NeedMatchProfile[] = [
  {
    id: "typescript_config_review",
    exact: ["tsconfig", "compiler options", "typescript strict", "strict mode", "type safety", "type guards", "utility types", "generics"],
    strong: ["typescript config", "safe refactor", "typecheck", "tsc"],
    weak: ["typescript"],
    anti: ["react app only", "frontend only", "full-stack only"],
    allowWeakOnly: true
  },
  {
    id: "typescript_refactor_safety",
    strong: ["safe refactor", "refactoring", "type safety", "strict types", "type guards", "generics", "narrowing", "compiler errors"],
    weak: ["typescript"],
    allowWeakOnly: true
  },
  {
    id: "typescript_typecheck",
    strong: ["tsc", "typecheck", "compiler", "compiler errors", "typescript errors", "strict mode"],
    weak: ["typescript"],
    allowWeakOnly: true
  },
  {
    id: "node_cli_development",
    strong: ["cli", "command-line", "command line", "terminal", "commander", "yargs", "oclif", "node cli", "npm cli"],
    weak: ["node", "javascript", "typescript"],
    anti: ["web app", "react app", "frontend app"],
    allowWeakOnly: false
  },
  {
    id: "cli_command_design",
    strong: ["cli command", "command design", "command-line interface", "terminal command", "commander", "yargs", "argument parsing", "flags", "subcommands"],
    weak: ["cli", "terminal"],
    anti: ["prompt engineering", "prompt optimization", "ai prompt", "llm prompt"],
    allowWeakOnly: false
  },
  {
    id: "interactive_cli_ux",
    strong: ["terminal ui", "tui", "interactive cli", "inquirer", "@inquirer/prompts", "command-line prompts", "terminal prompts", "interactive terminal", "cli prompts"],
    weak: ["interactive", "prompt"],
    anti: ["prompt engineering", "prompt optimization", "ai prompt", "llm prompt", "prompt framework", "crisp framework"],
    allowWeakOnly: false
  },
  {
    id: "vitest_testing",
    strong: ["vitest", "unit test", "unit testing", "test runner", "test coverage", "mocking", "test suite", "assertions"],
    weak: ["testing", "tests"],
    anti: ["skill eval", "skill evaluation", "prompt eval", "model eval", "benchmark skill", "skill performance", "llm evaluation"],
    allowWeakOnly: false
  },
  {
    id: "test_generation",
    strong: ["test generation", "generate tests", "unit tests", "vitest", "jest", "playwright", "test cases", "test coverage"],
    weak: ["testing", "tests"],
    anti: ["skill eval", "prompt eval", "model benchmark", "skill performance"],
    allowWeakOnly: false
  },
  {
    id: "test_debugging",
    strong: ["debug tests", "test failures", "vitest", "jest", "flaky tests", "unit test debugging", "test runner"],
    weak: ["debugging", "tests"],
    anti: ["skill eval", "benchmark skill", "model eval"],
    allowWeakOnly: false
  },
  {
    id: "github_actions_ci",
    strong: ["github actions", ".github/workflows", "ci", "continuous integration", "workflow yaml", "workflow yml", "release workflow", "npm publish workflow"],
    weak: ["workflow"],
    anti: ["agent workflow", "business workflow", "multi-skill workflow", "workflow recipes"],
    allowWeakOnly: false
  },
  {
    id: "npm_package_development",
    strong: ["npm package", "package development", "package manager", "npm", "package.json", "publish", "prepack", "prepublish", "library package"],
    weak: ["package"],
    allowWeakOnly: true
  },
  {
    id: "npm_publish_workflow",
    strong: ["npm publish", "publish workflow", "package release", "prepublish", "prepack", "release automation", "semantic release", "npm registry"],
    weak: ["publish", "release"],
    allowWeakOnly: false
  },
  {
    id: "release_safety",
    strong: ["release safety", "safe release", "versioning", "changelog", "npm publish", "release workflow", "prepublish", "prepack"],
    weak: ["release"],
    allowWeakOnly: false
  },
  {
    id: "tsup_build_pipeline",
    strong: ["tsup", "bundling", "bundle", "typescript bundler", "build pipeline", "esm", "cjs"],
    weak: ["build"],
    allowWeakOnly: false
  },
  {
    id: "provider_integration",
    strong: ["provider", "provider integration", "api integration", "sdk integration", "external service", "api client", "http client", "integration layer"],
    weak: ["api", "sdk", "full-stack"],
    anti: ["generic application", "type safety only", "frontend only"],
    allowWeakOnly: false
  },
  {
    id: "http_api_client",
    strong: ["http client", "api client", "fetch", "undici", "sdk client", "rest api", "external api"],
    weak: ["api"],
    allowWeakOnly: false
  },
  {
    id: "safe_file_writes",
    strong: ["file write", "filesystem", "fs", "safe write", "atomic write", "installer", "apply changes", "dry run", "write plan", "patch"],
    weak: ["files"],
    allowWeakOnly: false
  },
  {
    id: "install_plan_review",
    strong: ["install plan", "dry run", "installer", "apply changes", "safe install", "preview changes", "rollback"],
    weak: ["install"],
    allowWeakOnly: false
  },
  {
    id: "json_schema_validation",
    strong: ["json schema", "schema validation", "zod", "validation", "parse", "safeparse", "typed schema"],
    weak: ["json"],
    allowWeakOnly: false
  },
  {
    id: "zod_validation",
    strong: ["zod", "safeparse", "zod schema", "schema validation"],
    weak: ["validation"],
    allowWeakOnly: false
  },
  {
    id: "agent_config_setup",
    strong: [
      "claude.md",
      "agents.md",
      "copilot instructions",
      "github copilot instructions",
      "repo instructions",
      "repository instructions",
      "project instructions",
      "agent config",
      "agent setup",
      "claude code setup",
      "claude md",
      "cursor rules",
      "codex setup",
      "project skills",
      "skill installation"
    ],
    weak: ["claude", "copilot", "agent"],
    anti: ["claude api", "internal communications", "brand guidelines", "algorithmic art", "web artifacts", "defi", "trading", "crypto", "prompt optimization"],
    allowWeakOnly: false
  },
  {
    id: "claude_project_setup",
    strong: ["claude.md", "claude md", "claude code setup", "project skills", "repo instructions", "claude project setup"],
    weak: ["claude", "agent"],
    anti: ["claude api", "internal communications", "algorithmic art", "defi", "trading", "crypto", "prompt optimization"],
    allowWeakOnly: false
  },
  {
    id: "copilot_instruction_setup",
    strong: ["copilot instructions", "github copilot instructions", "repo instructions", "repository instructions", "project instructions"],
    weak: ["copilot", "agent"],
    anti: ["claude api", "internal communications", "algorithmic art", "defi", "trading", "crypto", "prompt optimization"],
    allowWeakOnly: false
  }
];

const NEED_PROFILE_MAP = new Map(NEED_MATCH_PROFILES.map((profile) => [profile.id, profile]));

export function getNeedMatchProfile(needId: string): NeedMatchProfile | null {
  return NEED_PROFILE_MAP.get(needId) ?? null;
}

export function matchNeedProfile(profile: NeedMatchProfile, lexicon: NeedMatchLexicon): NeedProfileMatch {
  const exactHits = matchTerms(profile.exact ?? [], lexicon, "primary");
  const strongHits = matchTerms(profile.strong ?? [], lexicon, "primary");
  const weakHits = matchTerms(profile.weak ?? [], lexicon, "all");
  const antiHits = matchTerms(profile.anti ?? [], lexicon, "all");

  if (antiHits.length > 0 && exactHits.length === 0 && strongHits.length === 0) {
    return {
      strength: "negative",
      matchedTerms: [],
      antiTerms: antiHits,
      reason: profile.notes ?? `Anti-trigger terms matched for ${profile.id}`
    };
  }

  if (exactHits.length > 0) {
    return {
      strength: "exact",
      matchedTerms: dedupe([...exactHits, ...strongHits]),
      antiTerms: antiHits
    };
  }

  if (strongHits.length > 0) {
    return {
      strength: "strong",
      matchedTerms: strongHits,
      antiTerms: antiHits
    };
  }

  if (weakHits.length > 0 && profile.allowWeakOnly !== false) {
    return {
      strength: "weak",
      matchedTerms: weakHits,
      antiTerms: antiHits
    };
  }

  if (weakHits.length > 0 && profile.allowWeakOnly === false) {
    return {
      strength: "none",
      matchedTerms: weakHits,
      antiTerms: antiHits,
      reason: `Weak-only evidence is not accepted for ${profile.id}`
    };
  }

  return {
    strength: "none",
    matchedTerms: [],
    antiTerms: antiHits
  };
}

function matchTerms(terms: string[], lexicon: NeedMatchLexicon, scope: "primary" | "all"): string[] {
  const hits: string[] = [];
  for (const rawTerm of terms) {
    const term = normalizeText(rawTerm);
    if (!term) continue;
    if (termMatch(term, lexicon.primaryText, lexicon.primaryTokens)) {
      hits.push(rawTerm);
      continue;
    }
    if (scope === "all" && termMatch(term, lexicon.supportingText, lexicon.supportingTokens)) {
      hits.push(rawTerm);
    }
  }
  return dedupe(hits);
}

function termMatch(term: string, text: string, tokens: Set<string>): boolean {
  if (term.includes(" ")) {
    if (text.includes(term)) return true;
    const parts = term.split(" ").filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every((part) => tokens.has(part));
  }
  return tokens.has(term);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
