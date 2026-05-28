import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type {
  AssistantId,
  ProviderSearchQuery,
  SkillCandidate,
  SkillFetchedBundle,
  SkillProvider,
  SkillProviderResult,
  SkillRef
} from "../types/index.js";

const ALL_ASSISTANTS: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];

export class LocalFolderProvider implements SkillProvider {
  readonly id = "local";
  readonly displayName = "Local Folder";
  readonly capabilities = {
    search: true,
    fetchFiles: true
  };

  constructor(private readonly localDir: string) {}

  async search(_query: ProviderSearchQuery): Promise<SkillProviderResult> {
    const skillFiles = await fg(["**/SKILL.md"], {
      cwd: this.localDir,
      onlyFiles: true,
      deep: 4,
      dot: true
    });

    const candidates: SkillCandidate[] = skillFiles.map((file) => {
      const canonicalSkillId = file.replace(/\/SKILL\.md$/, "").replace(/\//g, "-");
      return {
        providerSkillId: `local/${canonicalSkillId}`,
        canonicalSkillId,
        name: canonicalSkillId,
        source: { providerId: "local", url: path.join(this.localDir, file), ref: file },
        summary: "Local skill import",
        tags: ["local"],
        compatibility: { assistants: ALL_ASSISTANTS },
        metadata: { publisher: "local", trustLevel: "trusted" as const, pinnedRef: file },
        risk: { score: 90, level: "low" as const, signals: [], requiresOverride: false }
      };
    });

    return {
      providerId: this.id,
      fetchedAtIso: new Date().toISOString(),
      candidates
    };
  }

  async fetchFiles(ref: SkillRef): Promise<SkillFetchedBundle> {
    const normalized = ref.skillId.startsWith("local/") ? ref.skillId.replace("local/", "") : ref.skillId;
    const skillPath = path.join(this.localDir, normalized.replace(/-/g, "/"), "SKILL.md");
    const content = await readFile(skillPath, "utf8");

    return {
      skill: {
        providerSkillId: `local/${normalized}`,
        canonicalSkillId: normalized,
        name: normalized,
        source: { providerId: "local", url: skillPath, ref: skillPath },
        summary: "Local skill import",
        tags: ["local"],
        compatibility: { assistants: ALL_ASSISTANTS },
        metadata: { publisher: "local", trustLevel: "trusted" as const, pinnedRef: skillPath },
        risk: { score: 90, level: "low" as const, signals: [], requiresOverride: false }
      },
      files: { "SKILL.md": content }
    };
  }
}
