import path from "node:path";
import type {
  AssistantId,
  SkillCandidate,
  SkillCompatibility,
  SkillFileDescriptor,
  SkillMetadata,
  SkillSecurityReport
} from "../types/index.js";

const ALL_ASSISTANTS: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];
const SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".py", ".js", ".ts", ".rb", ".php"]);
const BINARY_EXTENSIONS = new Set([".exe", ".dll", ".so", ".dylib", ".zip", ".tar", ".gz", ".7z", ".jar", ".bin", ".wasm"]);
const PACKAGE_MANIFEST_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "pipfile",
  "cargo.toml",
  "go.mod"
]);

const FRAMEWORK_TAGS = new Set([
  "react",
  "nextjs",
  "next",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "angular",
  "vite",
  "tailwind",
  "shadcn",
  "shadcn-ui",
  "fastapi",
  "django",
  "flask",
  "streamlit",
  "pytest"
]);

const LANGUAGE_TAGS = new Map<string, string>([
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["python", "Python"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["java", "Java"],
  ["php", "PHP"],
  ["ruby", "Ruby"]
]);

const ASSISTANT_TAGS = new Map<string, AssistantId>([
  ["claude", "claude"],
  ["cursor", "cursor"],
  ["copilot", "copilot"],
  ["codex", "codex"],
  ["agent", "generic"],
  ["agents", "generic"],
  ["generic", "generic"]
]);

export interface CandidateBaseInput {
  providerId: string;
  providerSkillId: string;
  canonicalSkillId: string;
  name: string;
  summary: string;
  tags: string[];
  source: {
    url?: string;
    version?: string;
    ref?: string;
    publisher?: string;
  };
  metadata: Partial<SkillMetadata>;
  compatibility?: Partial<SkillCompatibility>;
}

export function providerScopedId(providerId: string, providerSkillId: string): string {
  return `${providerId}:${providerSkillId}`;
}

export function toCanonicalSkillId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96) || "skill";
}

export function buildCandidate(input: CandidateBaseInput): SkillCandidate {
  const compatibility = inferCompatibility(input.tags, input.compatibility);

  return {
    providerScopedId: providerScopedId(input.providerId, input.providerSkillId),
    providerSkillId: input.providerSkillId,
    canonicalSkillId: input.canonicalSkillId,
    name: input.name,
    source: {
      providerId: input.providerId,
      url: input.source.url,
      version: input.source.version,
      ref: input.source.ref,
      publisher: input.source.publisher
    },
    summary: input.summary,
    tags: dedupe(input.tags),
    compatibility,
    metadata: {
      trustLevel: input.metadata.trustLevel ?? "unknown",
      hasScripts: input.metadata.hasScripts ?? false,
      hasBinaries: input.metadata.hasBinaries ?? false,
      hasPackageManifests: input.metadata.hasPackageManifests ?? false,
      requiresApiKeys: input.metadata.requiresApiKeys ?? false,
      requiresEnvVars: input.metadata.requiresEnvVars ?? false,
      ...input.metadata
    },
    risk: baselineRisk()
  };
}

export function describeFiles(files: Record<string, string | Uint8Array>): SkillFileDescriptor[] {
  const descriptors: SkillFileDescriptor[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const normalized = normalizePath(filePath);
    const kind = classifyFile(normalized, content);
    const sizeBytes = typeof content === "string"
      ? Buffer.byteLength(content, "utf8")
      : content.byteLength;

    descriptors.push({
      path: normalized,
      sizeBytes,
      kind
    });
  }

  return descriptors.sort((a, b) => a.path.localeCompare(b.path));
}

export function inferMetadataFromFiles(
  candidate: SkillCandidate,
  files: Record<string, string | Uint8Array>
): SkillMetadata {
  const current = { ...candidate.metadata };
  const text = Object.entries(files)
    .filter(([, content]) => typeof content === "string")
    .map(([, content]) => content as string)
    .join("\n\n")
    .toLowerCase();

  const filePaths = Object.keys(files).map((filePath) => normalizePath(filePath));

  current.hasScripts = filePaths.some((filePath) => isScriptFile(filePath));
  current.hasBinaries = filePaths.some((filePath) => isBinaryFile(filePath));
  current.hasPackageManifests = filePaths.some((filePath) => PACKAGE_MANIFEST_NAMES.has(path.basename(filePath).toLowerCase()));

  const requiresApiKeys = /(api[_ -]?key|token|secret|bearer)/i.test(text);
  const requiresEnvVars = /(environment variable|env var|export [a-z_][a-z0-9_]*=|\.env)/i.test(text);
  current.requiresApiKeys = current.requiresApiKeys || requiresApiKeys;
  current.requiresEnvVars = current.requiresEnvVars || requiresEnvVars;

  return current;
}

export function parseFrontmatter(markdown: string): Record<string, string> {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---\n")) {
    return {};
  }

  const endIndex = trimmed.indexOf("\n---", 4);
  if (endIndex < 0) {
    return {};
  }

  const body = trimmed.slice(4, endIndex);
  const result: Record<string, string> = {};

  for (const line of body.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key || !value) continue;
    result[key] = value;
  }

  return result;
}

function inferCompatibility(tags: string[], input?: Partial<SkillCompatibility>): SkillCompatibility {
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  const assistants = new Set<AssistantId>(input?.assistants ?? []);
  if (assistants.size === 0) {
    for (const tag of normalizedTags) {
      const mapped = ASSISTANT_TAGS.get(tag);
      if (mapped) assistants.add(mapped);
    }
  }
  if (assistants.size === 0) {
    ALL_ASSISTANTS.forEach((assistant) => assistants.add(assistant));
  }

  const frameworks = new Set<string>(input?.frameworks ?? []);
  for (const tag of normalizedTags) {
    if (FRAMEWORK_TAGS.has(tag)) {
      frameworks.add(normalizeFrameworkTag(tag));
    }
  }

  const languages = new Set<string>(input?.languages ?? []);
  for (const tag of normalizedTags) {
    const language = LANGUAGE_TAGS.get(tag);
    if (language) languages.add(language);
  }

  return {
    assistants: [...assistants],
    frameworks: frameworks.size > 0 ? [...frameworks] : undefined,
    languages: languages.size > 0 ? [...languages] : undefined
  };
}

function normalizeFrameworkTag(tag: string): string {
  if (tag === "next") return "nextjs";
  if (tag === "shadcn") return "shadcn-ui";
  return tag;
}

function classifyFile(filePath: string, content: string | Uint8Array): SkillFileDescriptor["kind"] {
  if (filePath.endsWith(".md") || filePath.endsWith(".mdc") || filePath.endsWith(".txt")) return "markdown";
  if (isScriptFile(filePath)) return "script";
  if (isBinaryFile(filePath) || content instanceof Uint8Array) return "binary";
  if (/(\.json|\.ya?ml|\.toml|\.ini|\.cfg)$/.test(filePath)) return "config";
  return "other";
}

function isScriptFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(ext)) return true;
  return /(^|\/)scripts?\//.test(filePath);
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function baselineRisk(): SkillSecurityReport {
  return {
    score: 100,
    level: "low",
    signals: [],
    requiresOverride: false
  };
}
