import type { ProviderSearchQuery, SkillProvider, SkillProviderResult } from "../types/index.js";
import { ClawHubProvider } from "./clawhub.js";
import { OfficialAnthropicSkillsProvider } from "./anthropic.js";

export function buildProviders(providerIds: string[]): SkillProvider[] {
  const registry: Record<string, SkillProvider> = {
    anthropic: new OfficialAnthropicSkillsProvider(),
    clawhub: new ClawHubProvider()
  };

  const selected = providerIds.length > 0 ? providerIds : ["anthropic", "clawhub"];
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
