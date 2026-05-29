export interface AnthropicRuntimeConfig {
  apiKey?: string;
  baseUrl: string;
  apiVersion: string;
  betaHeaders: string[];
}

export interface ClawHubRuntimeConfig {
  baseUrl: string;
  token?: string;
}

export interface GitHubRuntimeConfig {
  apiBaseUrl: string;
  token?: string;
}

export interface ProviderRuntimeConfig {
  anthropic: AnthropicRuntimeConfig;
  clawhub: ClawHubRuntimeConfig;
  github: GitHubRuntimeConfig;
  timeoutMs: number;
  retryMaxAttempts: number;
}

const DEFAULT_ANTHROPIC_BETA_HEADERS = [
  "skills-2025-10-02",
  "code-execution-2025-05-22",
  "files-api-2025-04-14"
];

export function resolveProviderRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ProviderRuntimeConfig {
  const anthropicBetaRaw = env.ANTHROPIC_BETA_HEADERS?.trim();
  const anthropicBetaHeaders = anthropicBetaRaw
    ? anthropicBetaRaw.split(",").map((header) => header.trim()).filter(Boolean)
    : DEFAULT_ANTHROPIC_BETA_HEADERS;

  return {
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
      baseUrl: env.ANTHROPIC_API_BASE_URL?.trim() || "https://api.anthropic.com",
      apiVersion: env.ANTHROPIC_API_VERSION?.trim() || "2023-06-01",
      betaHeaders: anthropicBetaHeaders
    },
    clawhub: {
      baseUrl: env.CLAWHUB_API_BASE_URL?.trim() || "https://clawhub.ai",
      token: env.CLAWHUB_API_TOKEN?.trim() || undefined
    },
    github: {
      apiBaseUrl: env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com",
      token: env.GITHUB_TOKEN?.trim() || undefined
    },
    timeoutMs: clampInt(env.NAAR_PROVIDER_TIMEOUT_MS, 10_000, 1_000, 120_000),
    retryMaxAttempts: clampInt(env.NAAR_PROVIDER_RETRY_ATTEMPTS, 3, 1, 8)
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
