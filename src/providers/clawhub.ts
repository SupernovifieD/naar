import type { ProviderSearchQuery, SkillFetchedBundle, SkillProvider, SkillProviderResult, SkillRef } from "../types/index.js";
import { CLAWHUB_SEED_SKILLS, SKILL_MARKDOWN } from "./data.js";

export class ClawHubProvider implements SkillProvider {
  readonly id = "clawhub";
  readonly displayName = "ClawHub";
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
      candidates: CLAWHUB_SEED_SKILLS,
      warnings: ["Using curated fallback dataset for ClawHub provider in v0.1."]
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const skill = CLAWHUB_SEED_SKILLS.find((candidate) => candidate.providerSkillId === ref.skillId || candidate.canonicalSkillId === ref.skillId);
    if (!skill) {
      throw new Error(`ClawHub skill not found: ${ref.skillId}`);
    }

    const files: Record<string, string> = {
      "SKILL.md": SKILL_MARKDOWN[skill.canonicalSkillId] ?? `# ${skill.name}\n`
    };

    if (skill.metadata.hasScripts) {
      files["scripts/setup.sh"] = "#!/usr/bin/env bash\necho setup\n";
    }

    return { skill, files };
  }
}
