import type { ProviderSearchQuery, SkillFetchedBundle, SkillProvider, SkillProviderResult, SkillRef } from "../types/index.js";
import { ANTHROPIC_SEED_SKILLS, SKILL_MARKDOWN } from "./data.js";

export class OfficialAnthropicSkillsProvider implements SkillProvider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic Official Skills";
  readonly capabilities = {
    search: true,
    fetchFiles: true,
    fetchMetadata: true,
    verifyVersion: true,
    popularity: true,
    publisherInfo: true,
    license: true,
    lastUpdated: true,
    prepareInstall: true
  };

  async search(_query: ProviderSearchQuery): Promise<SkillProviderResult> {
    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      candidates: ANTHROPIC_SEED_SKILLS,
      warnings: ["Using curated fallback dataset for Anthropic provider in v0.1."]
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const skill = ANTHROPIC_SEED_SKILLS.find((candidate) => candidate.providerSkillId === ref.skillId || candidate.canonicalSkillId === ref.skillId);
    if (!skill) {
      throw new Error(`Anthropic skill not found: ${ref.skillId}`);
    }

    return {
      skill,
      files: {
        "SKILL.md": SKILL_MARKDOWN[skill.canonicalSkillId] ?? `# ${skill.name}\n`
      }
    };
  }
}
