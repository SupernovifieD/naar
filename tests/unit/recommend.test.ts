import { describe, expect, it } from "vitest";
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
    expect(result.recommendations[0].penalties).toContain("Language-only match; no deeper project need match");
    expect(result.recommendations[0].scoreBreakdown.some((item) => item.kind === "language_only_penalty")).toBe(true);
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
    expect(defiRec?.penalties.some((penalty) => penalty.startsWith("Domain-specific skill:"))).toBe(true);
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
    expect(result.recommendations[0].penalties).toContain(
      "Skill targets react, but those frameworks are only in fixture/secondary scope"
    );
    expect(result.recommendations[0].scoreBreakdown.some((item) => item.kind === "secondary_only_framework_penalty")).toBe(true);
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
    expect(recommendation.matchedFacts.length).toBeGreaterThan(0);
    expect(Array.isArray(recommendation.penalties)).toBe(true);
    expect(Array.isArray(recommendation.eligibilityReasons)).toBe(true);
    expect(recommendation.scoreBreakdown.length).toBeGreaterThan(0);
  });
});
