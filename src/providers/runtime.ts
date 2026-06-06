export interface ClawHubRuntimeConfig {
  baseUrl: string;
  token?: string;
}

export interface GitHubRuntimeConfig {
  apiBaseUrl: string;
  token?: string;
}

export interface ProviderRuntimeConfig {
  clawhub: ClawHubRuntimeConfig;
  github: GitHubRuntimeConfig;
  timeoutMs: number;
  retryMaxAttempts: number;
}

export function resolveProviderRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ProviderRuntimeConfig {
  return {
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
