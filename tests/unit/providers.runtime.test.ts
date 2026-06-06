import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDERS } from "../../src/config/defaults.js";
import { availableProviderIds, buildProviders } from "../../src/providers/orchestrator.js";
import { resolveProviderRuntimeConfig } from "../../src/providers/runtime.js";

describe("resolveProviderRuntimeConfig", () => {
  it("ignores removed Anthropic env vars", () => {
    const runtime = resolveProviderRuntimeConfig({
      ANTHROPIC_API_KEY: "fake-key",
      ANTHROPIC_API_BASE_URL: "https://example.invalid",
      ANTHROPIC_API_VERSION: "2099-01-01",
      ANTHROPIC_BETA_HEADERS: "alpha,beta",
      GITHUB_TOKEN: "github-token",
      GITHUB_API_BASE_URL: "https://api.github.example"
    } as NodeJS.ProcessEnv);

    expect(runtime).not.toHaveProperty("anthropic");
    expect(runtime.github.token).toBe("github-token");
    expect(runtime.github.apiBaseUrl).toBe("https://api.github.example");
    expect(JSON.stringify(runtime)).not.toContain("fake-key");
    expect(JSON.stringify(runtime)).not.toContain("https://example.invalid");
    expect(JSON.stringify(runtime)).not.toContain("2099-01-01");
    expect(JSON.stringify(runtime)).not.toContain("alpha");
    expect(JSON.stringify(runtime)).not.toContain("beta");
  });
});

describe("provider registry", () => {
  it("keeps anthropic registered", () => {
    const providers = buildProviders(["anthropic"]);

    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("anthropic");
    expect(providers[0].displayName).toBe("Anthropic Official Skills");
  });

  it("registers awesome without changing defaults", () => {
    const providers = buildProviders(["awesome"]);

    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("awesome");
    expect(providers[0].displayName).toBe("Awesome Agent Skills");
  });

  it("keeps anthropic in the default provider selection", () => {
    expect(DEFAULT_PROVIDERS).toEqual(["anthropic", "clawhub"]);
    expect(buildProviders([]).map((provider) => provider.id)).toEqual(["anthropic", "clawhub"]);
  });

  it("lists all registered provider ids", () => {
    expect(availableProviderIds()).toEqual(["anthropic", "clawhub", "awesome"]);
  });
});
