import type { InstallTarget, SkillRef } from "../types/index.js";
import { buildProviders } from "../providers/orchestrator.js";
import { isCandidateCompatibleWithTarget } from "../targets/index.js";
import type { ResolvedSkill } from "./plan.js";
import { formatSkillRef } from "./refs.js";

export async function resolveSkillRefs(refs: SkillRef[], targets: InstallTarget[]): Promise<ResolvedSkill[]> {
  const providerIds = [...new Set(refs.map((ref) => ref.providerId))];
  const providers = buildProviders(providerIds);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const unknownProvider = providerIds.find((providerId) => !byId.has(providerId));
  if (unknownProvider) {
    throw new Error(`Unknown provider "${unknownProvider}". Available providers: ${availableProviderIds().join(", ")}.`);
  }

  const resolved: ResolvedSkill[] = [];
  for (const ref of refs) {
    const provider = byId.get(ref.providerId);
    if (!provider) {
      throw new Error(`Unknown provider "${ref.providerId}". Available providers: ${availableProviderIds().join(", ")}.`);
    }

    try {
      const bundle = await provider.fetchFiles(ref);
      const compatibleTargets = targets.filter((target) => isCandidateCompatibleWithTarget(bundle.skill, target));
      resolved.push({ bundle, targets: compatibleTargets });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch ${formatSkillRef(ref)}: ${message}`);
    }
  }

  return resolved;
}

function availableProviderIds(): string[] {
  return buildProviders([]).map((provider) => provider.id);
}
