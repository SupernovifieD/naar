import { fetch, Headers } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";

export interface ProviderHttpClientOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProviderHttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class ProviderHttpError extends Error {
  readonly status?: number;
  readonly body?: string;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; body?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = options.status;
    this.body = options.body;
    this.retryable = options.retryable ?? false;
  }
}

export class ProviderHttpClient {
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ProviderHttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 200;
    this.maxDelayMs = options.maxDelayMs ?? 5_000;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<ProviderHttpResponse<T>> {
    return this.requestJson<T>(url, { method: "GET", headers });
  }

  async getBytes(url: string, headers: Record<string, string> = {}): Promise<ProviderHttpResponse<Uint8Array>> {
    return this.requestBytes(url, { method: "GET", headers });
  }

  async getText(url: string, headers: Record<string, string> = {}): Promise<ProviderHttpResponse<string>> {
    return this.requestText(url, { method: "GET", headers });
  }

  async requestJson<T>(url: string, init: UndiciRequestInit): Promise<ProviderHttpResponse<T>> {
    const response = await this.request(url, init);
    const raw = await response.text();

    if (raw.trim().length === 0) {
      return {
        data: {} as T,
        status: response.status,
        headers: response.headers
      };
    }

    try {
      return {
        data: JSON.parse(raw) as T,
        status: response.status,
        headers: response.headers
      };
    } catch {
      throw new ProviderHttpError(`Invalid JSON response from ${init.method ?? "GET"} ${url}`, {
        status: response.status,
        body: truncate(raw)
      });
    }
  }

  async requestBytes(url: string, init: UndiciRequestInit): Promise<ProviderHttpResponse<Uint8Array>> {
    const response = await this.request(url, init);
    const buffer = new Uint8Array(await response.arrayBuffer());
    return {
      data: buffer,
      status: response.status,
      headers: response.headers
    };
  }

  async requestText(url: string, init: UndiciRequestInit): Promise<ProviderHttpResponse<string>> {
    const response = await this.request(url, init);
    const raw = await response.text();
    return {
      data: raw,
      status: response.status,
      headers: response.headers
    };
  }

  private async request(url: string, init: UndiciRequestInit): Promise<UndiciResponse> {
    let lastError: ProviderHttpError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers = new Headers(init.headers);
        if (!headers.has("accept")) {
          headers.set("Accept", "application/json");
        }

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers
        });

        if (response.ok) {
          return response;
        }

        const errorBody = await response.text();
        const retryable = isRetryableStatus(response.status);
        const error = new ProviderHttpError(
          `${init.method ?? "GET"} ${url} failed with ${response.status}${errorBody ? `: ${truncate(errorBody)}` : ""}`,
          {
            status: response.status,
            body: truncate(errorBody),
            retryable
          }
        );

        if (!retryable || attempt >= this.maxAttempts) {
          throw error;
        }

        lastError = error;
        const delayMs = computeRetryDelayMs(response.headers, attempt, this.baseDelayMs, this.maxDelayMs, this.random);
        await this.sleep(delayMs);
        continue;
      } catch (error) {
        const providerError = normalizeUnknownError(error, init.method ?? "GET", url);
        if (!providerError.retryable || attempt >= this.maxAttempts) {
          throw providerError;
        }

        lastError = providerError;
        const delayMs = backoffWithJitter(attempt, this.baseDelayMs, this.maxDelayMs, this.random);
        await this.sleep(delayMs);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new ProviderHttpError(`${init.method ?? "GET"} ${url} failed`, { retryable: false });
  }
}

function normalizeUnknownError(error: unknown, method: string, url: string): ProviderHttpError {
  if (error instanceof ProviderHttpError) {
    return error;
  }

  if (error instanceof Error) {
    const retryable = /(timeout|timed out|econnreset|enotfound|eai_again|aborted|network)/i.test(error.message);
    return new ProviderHttpError(`${method} ${url} failed: ${error.message}`, {
      retryable
    });
  }

  return new ProviderHttpError(`${method} ${url} failed`, { retryable: false });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function computeRetryDelayMs(
  headers: Headers,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number
): number {
  const retryAfter = parseRetryAfter(headers.get("retry-after"));
  if (typeof retryAfter === "number") {
    return clampDelay(retryAfter * 1000, maxDelayMs, random);
  }

  const rateLimitResetDelay = parseRateLimitReset(headers.get("ratelimit-reset"));
  if (typeof rateLimitResetDelay === "number") {
    return clampDelay(rateLimitResetDelay * 1000, maxDelayMs, random);
  }

  const legacyRateLimitResetDelay = parseLegacyRateLimitReset(headers.get("x-ratelimit-reset"));
  if (typeof legacyRateLimitResetDelay === "number") {
    return clampDelay(legacyRateLimitResetDelay * 1000, maxDelayMs, random);
  }

  return backoffWithJitter(attempt, baseDelayMs, maxDelayMs, random);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return undefined;
}

function parseRateLimitReset(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return undefined;
}

function parseLegacyRateLimitReset(value: string | null): number | undefined {
  if (!value) return undefined;
  const epochSeconds = Number.parseInt(value, 10);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return undefined;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, epochSeconds - nowSeconds);
}

function backoffWithJitter(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
  const jitter = Math.floor(exp * 0.25 * random());
  return Math.min(maxDelayMs, exp + jitter);
}

function clampDelay(ms: number, maxDelayMs: number, random: () => number): number {
  const bounded = Math.min(maxDelayMs, Math.max(0, ms));
  const jitter = Math.floor(bounded * 0.1 * random());
  return Math.min(maxDelayMs, bounded + jitter);
}

function truncate(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}
