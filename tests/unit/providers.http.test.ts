import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { ProviderHttpClient, ProviderHttpError } from "../../src/providers/http.js";

let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

beforeEach(() => {
  previousDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(previousDispatcher);
});

describe("ProviderHttpClient", () => {
  it("retries 429 responses using Retry-After and then succeeds", async () => {
    const pool = mockAgent.get("https://example.test");
    pool.intercept({ method: "GET", path: "/retry" }).reply(429, { error: "rate_limited" }, {
      headers: { "retry-after": "1" }
    });
    pool.intercept({ method: "GET", path: "/retry" }).reply(200, { ok: true });

    const sleep = vi.fn(async () => {});
    const client = new ProviderHttpClient({
      maxAttempts: 2,
      random: () => 0,
      sleep
    });

    const response = await client.getJson<{ ok: boolean }>("https://example.test/retry");
    expect(response.data.ok).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("normalizes network failures into ProviderHttpError", async () => {
    const pool = mockAgent.get("https://example.test");
    pool.intercept({ method: "GET", path: "/network" }).replyWithError(new Error("network down"));

    const client = new ProviderHttpClient({
      maxAttempts: 1,
      random: () => 0
    });

    try {
      await client.getJson("https://example.test/network");
      expect.unreachable("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderHttpError);
      const providerError = error as ProviderHttpError;
      expect(providerError.message.toLowerCase()).toContain("failed");
    }
  });
});
