export type FrameworkCategory =
  | "frontend"
  | "backend"
  | "testing"
  | "styling"
  | "build"
  | "infra";

export type ScanScope =
  | "root"
  | "src"
  | "test"
  | "fixture"
  | "example"
  | "docs"
  | "generated"
  | "vendor";

export interface FactEvidence {
  path: string;
  scope: ScanScope;
  reason: string;
  confidence?: number;
  exists?: boolean;
  kind?: "found_path" | "missing_expected_path" | "manifest_field" | "dependency" | "script" | "config";
}

export interface LanguageDetection {
  id: string;
  confidence: number;
  evidence: FactEvidence[];
}

export type ProjectTypeId =
  | "cli"
  | "library"
  | "web-app"
  | "api"
  | "fullstack"
  | "monorepo"
  | "docs"
  | "package"
  | "static-site"
  | "data-science"
  | "cms"
  | "worker/service";

export interface ProjectTypeDetection {
  id: ProjectTypeId;
  confidence: number;
  evidence: FactEvidence[];
}

export interface ToolDetection {
  id: string;
  confidence: number;
  evidence: FactEvidence[];
}

export type CommandRole =
  | "install"
  | "build"
  | "dev"
  | "test"
  | "typecheck"
  | "lint"
  | "format"
  | "publish"
  | "release"
  | "prepack"
  | "prepublish"
  | "start"
  | "e2e"
  | "unit-test"
  | "integration-test"
  | "clean"
  | "generate"
  | "migrate"
  | "seed"
  | "docker-up"
  | "docker-down"
  | "unknown";

export interface CommandFact {
  name: string;
  role: CommandRole;
  command: string;
  rawScript: string;
  scope: ScanScope;
  confidence: number;
  evidence: FactEvidence[];
}

export interface RepoPrimaryFacts {
  projectTypes: ProjectTypeDetection[];
  languages: LanguageDetection[];
  frameworks: FrameworkDetection[];
  packageManagers: PackageManagerDetection[];
  buildTools: ToolDetection[];
  testTools: ToolDetection[];
  ci: ToolDetection[];
  infra: ToolDetection[];
  commands: CommandFact[];
}

export interface RepoSecondaryFacts {
  projectTypes: ProjectTypeDetection[];
  languages: LanguageDetection[];
  frameworks: FrameworkDetection[];
  packageManagers: PackageManagerDetection[];
  buildTools: ToolDetection[];
  testTools: ToolDetection[];
  ci: ToolDetection[];
  infra: ToolDetection[];
  commands: CommandFact[];
}

export interface RepoFacts {
  scanSchemaVersion?: number;
  repoRoot: string;
  scanTimeIso: string;
  languages: string[];
  packageManagers: PackageManagerDetection[];
  frameworks: FrameworkDetection[];
  aiAssistants: AIAssistantDetection[];
  findings: RepoFinding[];
  topology: RepoTopology;
  readiness: RepoReadiness;
  primaryFacts?: RepoPrimaryFacts;
  secondaryFacts?: RepoSecondaryFacts;
}

export interface RepoTopology {
  sourceDirs: string[];
  routeDirs: string[];
  componentDirs: string[];
  apiDirs: string[];
  testDirs: string[];
  docDirs: string[];
}

export interface RepoReadiness {
  score: number;
  grade: "Excellent" | "Good" | "Fair" | "Poor";
  missingCapabilities: string[];
}

export interface FrameworkDetection {
  id: string;
  category: FrameworkCategory;
  confidence: number;
  evidence: FactEvidence[];
  version?: string;
}

export interface PackageManagerDetection {
  id: "npm" | "pnpm" | "yarn" | "bun" | "deno" | "pip" | "pip-tools" | "poetry" | "uv" | "pipenv" | "conda" | "setuptools" | "hatch" | "pdm" | "composer";
  confidence: number;
  lockfiles: string[];
  evidence?: FactEvidence[];
  workspaceMode?: boolean;
}

export type AssistantId = "claude" | "cursor" | "copilot" | "codex" | "generic";

export interface AIAssistantDetection {
  id: AssistantId;
  status: "found" | "missing" | "partial";
  configPathsFound: string[];
  recommendedInstallTargets: InstallTarget[];
  notes?: string[];
}

export interface RepoFinding {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  evidence?: FactEvidence[];
  category: "stack" | "testing" | "docs" | "ai-config" | "security";
}

export interface SkillCandidate {
  providerScopedId?: string;
  providerSkillId: string;
  canonicalSkillId: string;
  name: string;
  source: SkillSource;
  summary: string;
  tags: string[];
  compatibility: SkillCompatibility;
  metadata: SkillMetadata;
  risk: SkillSecurityReport;
  files?: SkillFileDescriptor[];
}

export interface SkillSource {
  providerId: string;
  url?: string;
  version?: string;
  ref?: string;
  publisher?: string;
}

export interface SkillCompatibility {
  assistants: AssistantId[];
  frameworks?: string[];
  languages?: string[];
}

export interface SkillMetadata {
  publisher?: string;
  description?: string;
  popularity?: number;
  license?: string;
  lastUpdatedIso?: string;
  hasScripts?: boolean;
  hasBinaries?: boolean;
  hasPackageManifests?: boolean;
  requiresApiKeys?: boolean;
  requiresEnvVars?: boolean;
  installTargets?: InstallTarget[];
  trustLevel?: "official" | "trusted" | "unknown";
  pinnedRef?: string;
}

export interface SkillFileDescriptor {
  path: string;
  sizeBytes?: number;
  kind: "markdown" | "script" | "binary" | "config" | "other";
}

export interface ProviderCapabilities {
  search: boolean;
  inspect?: boolean;
  fetchMetadata?: boolean;
  fetchFiles: boolean;
  verifyVersion?: boolean;
  popularity?: boolean;
  publisherInfo?: boolean;
  license?: boolean;
  lastUpdated?: boolean;
  prepareInstall?: boolean;
}

export interface ProviderSearchQuery {
  repoFacts: RepoFacts;
  targets?: InstallTarget[];
  limit?: number;
}

export interface SkillRef {
  providerId: string;
  skillId: string;
  version?: string;
}

export interface SkillFetchedBundle {
  skill: SkillCandidate;
  files: Record<string, string>;
}

export interface SkillVersionInfo {
  version: string;
  pinnedRef?: string;
}

export interface PopularitySignals {
  downloads?: number;
  stars?: number;
  score?: number;
}

export interface SkillProvider {
  id: string;
  displayName: string;
  capabilities: ProviderCapabilities;
  search(query: ProviderSearchQuery): Promise<SkillProviderResult>;
  inspect?(ref: SkillRef): Promise<SkillCandidate>;
  fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle>;
  fetchVersionInfo?(ref: SkillRef): Promise<SkillVersionInfo>;
  fetchPopularity?(ref: SkillRef): Promise<PopularitySignals | null>;
}

export interface SkillProviderResult {
  providerId: string;
  fetchedAtIso: string;
  mode?: string;
  candidates: SkillCandidate[];
  nextCursor?: string;
  rateLimit?: { remaining?: number; resetAtIso?: string };
  warnings?: string[];
}

export interface MatchedFact {
  factType: string;
  id: string;
  source: "primaryFacts" | "secondaryFacts" | "repoNeeds" | "candidateMetadata" | "repoSignals";
  evidence?: FactEvidence[];
  detail?: string;
}

export type NeedMatchStrength = "exact" | "strong" | "weak" | "negative" | "none";

export interface MatchedNeedDetail {
  id: string;
  strength: NeedMatchStrength;
  points: number;
  matchedTerms: string[];
  antiTerms: string[];
  reason?: string;
}

export interface RecommendationCapApplied {
  kind: string;
  cap: number;
  reason: string;
}

export interface RecommendationScoreComponent {
  kind: string;
  points: number;
  detail: string;
  strength?: NeedMatchStrength;
  matchedTerms?: string[];
  antiTerms?: string[];
  reason?: string;
}

export interface RepoNeed {
  id: string;
  weight: number;
  sourceFacts: MatchedFact[];
  reason: string;
}

export type RecommendationStatus = "eligible" | "risky" | "blocked" | "incompatible";

export type SkillCategory =
  | "code"
  | "testing"
  | "debugging"
  | "refactoring"
  | "config"
  | "ci"
  | "release"
  | "cli"
  | "api"
  | "security"
  | "agent-setup"
  | "mcp"
  | "prompting"
  | "skill-development"
  | "general-productivity"
  | "writing"
  | "design"
  | "finance"
  | "crypto"
  | "art"
  | "spreadsheet"
  | "unknown";

export interface SkillRecommendation {
  candidate: SkillCandidate;
  score: number;
  rawScore?: number;
  relevanceRaw?: number;
  qualityRaw?: number;
  status?: RecommendationStatus;
  overrideable?: boolean;
  hardBlocked?: boolean;
  reasons: string[];
  matchedNeeds: string[];
  matchedNeedDetails?: MatchedNeedDetail[];
  matchedFacts: MatchedFact[];
  eligibilityReasons: string[];
  penalties: string[];
  capsApplied?: RecommendationCapApplied[];
  skillCategories?: SkillCategory[];
  domainSignals?: string[];
  scoreBreakdown: RecommendationScoreComponent[];
  blocked: boolean;
  blockReasons?: string[];
}

export interface SecuritySignal {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  penalty: number;
  evidence?: SecuritySignalEvidence[];
}

export interface SecuritySignalEvidence {
  path: string;
  line?: number;
  excerpt?: string;
}

export interface SkillSecurityReport {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  signals: SecuritySignal[];
  requiresOverride: boolean;
}

export type InstallTarget =
  | "claude_project_skills"
  | "cursor_project_rules"
  | "copilot_repo_instructions"
  | "codex_repo_skills"
  | "generic_agent_skills";

export interface InstallAction {
  type: "write" | "append" | "mkdir";
  path: string;
  content?: string;
  sourceSkillId?: string;
  overwrite?: boolean;
}

export interface InstallConflict {
  path: string;
  reason: string;
}

export interface InstallPlan {
  planId: string;
  repoRoot: string;
  targets: InstallTarget[];
  actions: InstallAction[];
  conflicts: InstallConflict[];
  summary: { filesToWrite: number; filesToUpdate: number; filesBlocked: number };
  requiresConfirmation: boolean;
}

export interface InstalledSkillRecord {
  providerScopedId?: string;
  canonicalSkillId: string;
  providerId: string;
  providerSkillId: string;
  installedAtIso: string;
  installedVersion: string;
  pinnedRef: string;
  targets: InstallTarget[];
  managedFiles: string[];
  securityScoreAtInstall: number;
}

export interface InstalledState {
  version: 1;
  skills: InstalledSkillRecord[];
}

export interface NaarLock {
  version: 1;
  skills: Array<{
    canonicalSkillId: string;
    providerId: string;
    providerSkillId: string;
    pinnedRef: string;
    installedVersion: string;
    installedAtIso: string;
  }>;
}

export interface NaarConfig {
  defaultProviders: string[];
  defaultTargets: InstallTarget[];
  minSecurityScore: number;
  noScripts: boolean;
}

export interface CliFlags {
  repo: string;
  provider: string[];
  target: InstallTarget[];
  json: boolean;
  compact: boolean;
  apply: boolean;
  dryRun: boolean;
  yes: boolean;
  nonInteractive: boolean;
  noScripts: boolean;
  allowRisky: boolean;
  minSecurityScore: number;
  force: boolean;
  verbose: boolean;
  allCompatible: boolean;
  from?: string;
  fromPlan?: string;
}
