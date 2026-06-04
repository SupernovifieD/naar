import type {
  AIAssistantDetection,
  AssistantId,
  CommandFact,
  FactEvidence,
  FrameworkCategory,
  FrameworkDetection,
  PackageManagerDetection,
  ProjectTypeDetection,
  ProjectTypeId,
  RepoFacts,
  RepoFinding,
  SkillCandidate,
  SkillCategory,
  ToolDetection
} from "../../types/index.js";
import type { RecommendOptions } from "../recommend.js";

export type RecommendationEvalCategory = SkillCategory | string;

export interface RecommendationThreshold {
  k: number;
  min?: number;
  max?: number;
}

export interface RecommendationExpectations {
  shouldRecommendNeedIds: string[];
  shouldRecommendSkillRefs?: string[];
  topResultShouldMatchAny?: string[];
  topFiveShouldIncludeAny?: string[];
  shouldNotRecommendCategories: RecommendationEvalCategory[];
  shouldNotRecommendSkillRefs?: string[];
  maxBadDomainInTopK?: { k: number; max: number };
  maxBlockedInTopK?: { k: number; max: number };
  maxHardBlockersInTopK?: { k: number; max: number };
  maxPoorFitInTopK?: { k: number; max: number };
  minPrecisionAtK?: { k: number; min: number };
  minRecallAtK?: { k: number; min: number };
}

export interface RecommendationEvalFixture {
  id: string;
  description: string;
  repoFacts: RepoFacts;
  candidates: SkillCandidate[];
  expectations: RecommendationExpectations;
}

const DEFAULT_SCAN_TIME = "2026-06-03T00:00:00.000Z";

export const DEFAULT_RECOMMEND_EVAL_OPTIONS: RecommendOptions = {
  minSecurityScore: 80,
  noScripts: true,
  allowRisky: false,
  eligibleAssistants: ["claude", "cursor", "codex", "copilot", "generic"],
  eligibilitySource: "fallback-all",
  allCompatible: false,
  maxResults: 10,
  referenceDateIso: DEFAULT_SCAN_TIME
};

export function makeEvidence(
  path = "package.json",
  scope: FactEvidence["scope"] = "root",
  reason = "evaluation fixture"
): FactEvidence {
  return {
    path,
    scope,
    reason,
    confidence: 1,
    exists: true,
    kind: "found_path"
  };
}

export function makeTool(id: string, evidencePath = "package.json"): ToolDetection {
  return {
    id,
    confidence: 1,
    evidence: [makeEvidence(evidencePath)]
  };
}

export function makeCommand(
  name: string,
  role: CommandFact["role"],
  rawScript = `npm run ${name}`,
  evidencePath = "package.json"
): CommandFact {
  return {
    name,
    role,
    command: rawScript,
    rawScript,
    scope: "root",
    confidence: 1,
    evidence: [makeEvidence(evidencePath)]
  };
}

export function makeFramework(id: string, evidencePath = "package.json"): FrameworkDetection {
  return {
    id,
    category: inferFrameworkCategory(id),
    confidence: 1,
    evidence: [makeEvidence(evidencePath)]
  };
}

export function makeProjectType(id: ProjectTypeId, evidencePath = "package.json"): ProjectTypeDetection {
  return {
    id,
    confidence: 1,
    evidence: [makeEvidence(evidencePath)]
  };
}

export function makePackageManager(
  id: PackageManagerDetection["id"],
  lockfiles: string[],
  workspaceMode = false
): PackageManagerDetection {
  return {
    id,
    confidence: 1,
    lockfiles,
    evidence: [makeEvidence(lockfiles[0] ?? "package.json")],
    workspaceMode
  };
}

export function makeFinding(
  code: string,
  message: string,
  category: RepoFinding["category"] = "ai-config",
  severity: RepoFinding["severity"] = "warn"
): RepoFinding {
  return {
    code,
    severity,
    message,
    category,
    evidence: [makeEvidence(".")]
  };
}

export function makeAssistantDetection(
  id: AssistantId,
  status: AIAssistantDetection["status"],
  configPathsFound: string[] = []
): AIAssistantDetection {
  return {
    id,
    status,
    configPathsFound,
    recommendedInstallTargets: [],
    notes: []
  };
}

export function makeRepoFacts(options: {
  repoRoot: string;
  projectTypes?: ProjectTypeId[];
  languages?: string[];
  frameworks?: string[];
  secondaryFrameworks?: string[];
  packageManagers?: PackageManagerDetection[];
  buildTools?: string[];
  testTools?: string[];
  ci?: string[];
  infra?: string[];
  commands?: CommandFact[];
  findings?: RepoFinding[];
  assistants?: AIAssistantDetection[];
  scanTimeIso?: string;
}): RepoFacts {
  const primaryProjectTypes = (options.projectTypes ?? []).map((id) => makeProjectType(id));
  const primaryLanguages = (options.languages ?? []).map((id) => ({
    id,
    confidence: 1,
    evidence: [makeEvidence(id === "Python" ? "pyproject.toml" : "package.json")]
  }));
  const primaryFrameworks = (options.frameworks ?? []).map((id) => makeFramework(id));
  const secondaryFrameworks = (options.secondaryFrameworks ?? []).map((id) => ({
    ...makeFramework(id, `tests/fixtures/${id}`),
    evidence: [makeEvidence(`tests/fixtures/${id}`, "fixture")]
  }));
  const packageManagers = options.packageManagers ?? [makePackageManager("npm", ["package-lock.json"])];
  const buildTools = (options.buildTools ?? []).map((id) => makeTool(id));
  const testTools = (options.testTools ?? []).map((id) => makeTool(id));
  const ci = (options.ci ?? []).map((id) => makeTool(id, ".github/workflows/ci.yml"));
  const infra = (options.infra ?? []).map((id) => makeTool(id, "Dockerfile"));

  return {
    scanSchemaVersion: 2,
    repoRoot: options.repoRoot,
    scanTimeIso: options.scanTimeIso ?? DEFAULT_SCAN_TIME,
    languages: options.languages ?? [],
    packageManagers,
    frameworks: primaryFrameworks,
    aiAssistants: options.assistants ?? [],
    findings: options.findings ?? [],
    topology: {
      sourceDirs: ["src"],
      routeDirs: [],
      componentDirs: [],
      apiDirs: [],
      testDirs: [],
      docDirs: []
    },
    readiness: {
      score: 85,
      grade: "Good",
      missingCapabilities: (options.findings ?? []).map((finding) => finding.code)
    },
    primaryFacts: {
      projectTypes: primaryProjectTypes,
      languages: primaryLanguages,
      frameworks: primaryFrameworks,
      packageManagers,
      buildTools,
      testTools,
      ci,
      infra,
      commands: options.commands ?? []
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

function inferFrameworkCategory(id: string): FrameworkCategory {
  switch (id.toLowerCase()) {
    case "react":
    case "nextjs":
    case "vue":
    case "nuxt":
    case "svelte":
    case "sveltekit":
    case "angular":
    case "tailwind":
    case "vitepress":
    case "docusaurus":
      return "frontend";
    case "fastapi":
    case "django":
    case "flask":
    case "express":
    case "nestjs":
      return "backend";
    case "pytest":
    case "playwright":
    case "vitest":
      return "testing";
    case "docker":
    case "github-actions":
      return "infra";
    default:
      return "build";
  }
}
