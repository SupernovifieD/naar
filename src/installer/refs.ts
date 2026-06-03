import type { SkillRef } from "../types/index.js";

export interface ParsedSkillRef {
  raw: string;
  providerId: string;
  skillId: string;
  version?: string;
}

export function parseSkillRef(value: string): ParsedSkillRef {
  const raw = value;
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error(invalidRefMessage(raw));
  }

  const providerId = trimmed.slice(0, separatorIndex).trim().toLowerCase();
  const skillAndVersion = trimmed.slice(separatorIndex + 1).trim();
  if (!providerId || !skillAndVersion) {
    throw new Error(invalidRefMessage(raw));
  }

  const versionSeparator = skillAndVersion.lastIndexOf("@");
  const skillId = versionSeparator >= 0
    ? skillAndVersion.slice(0, versionSeparator).trim()
    : skillAndVersion;
  const version = versionSeparator >= 0
    ? skillAndVersion.slice(versionSeparator + 1).trim()
    : undefined;

  if (!skillId || (versionSeparator >= 0 && !version) || /\s/.test(providerId) || /\s/.test(skillId)) {
    throw new Error(invalidRefMessage(raw));
  }

  return version
    ? { raw, providerId, skillId, version }
    : { raw, providerId, skillId };
}

export function toSkillRef(ref: ParsedSkillRef): SkillRef {
  return {
    providerId: ref.providerId,
    skillId: ref.skillId,
    version: ref.version
  };
}

export function formatSkillRef(ref: SkillRef): string {
  return `${ref.providerId}:${ref.skillId}${ref.version ? `@${ref.version}` : ""}`;
}

function invalidRefMessage(raw: string): string {
  return `Invalid skill reference "${raw}". Expected provider:skill or provider:skill@version.`;
}
