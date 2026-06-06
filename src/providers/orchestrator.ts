import type { ProviderSearchQuery, SkillProvider, SkillProviderResult } from "../types/index.js";
import { DEFAULT_PROVIDERS } from "../config/defaults.js";
import { AwesomeAgentSkillsProvider } from "./awesome.js";
import { ClawHubProvider } from "./clawhub.js";
import { OfficialAnthropicSkillsProvider } from "./anthropic.js";

function createProviderRegistry(): Record<string, SkillProvider> {
  return {
    anthropic: new OfficialAnthropicSkillsProvider(),
    clawhub: new ClawHubProvider(),
    awesome: new AwesomeAgentSkillsProvider()
  };
}

export function availableProviderIds(): string[] {
  return Object.keys(createProviderRegistry());
}

export function buildProviders(providerIds: string[]): SkillProvider[] {
  const registry = createProviderRegistry();
  const selected = providerIds.length > 0 ? providerIds : DEFAULT_PROVIDERS;
  const providers: SkillProvider[] = [];

  for (const id of selected) {
    const provider = registry[id];
    if (provider) providers.push(provider);
  }

  return providers;
}

export async function queryProviders(
  providers: SkillProvider[],
  query: ProviderSearchQuery
): Promise<SkillProviderResult[]> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        return await provider.search(query);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          providerId: provider.id,
          fetchedAtIso: new Date().toISOString(),
          mode: "error",
          candidates: [],
          warnings: [`Provider ${provider.id} failed: ${message}`]
        } satisfies SkillProviderResult;
      }
    })
  );

  return results;
}
