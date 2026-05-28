import type { SecuritySignal, SkillCandidate, SkillSecurityReport } from "../types/index.js";

export interface SecurityPolicy {
  minSecurityScore: number;
  noScripts: boolean;
}

export function analyzeSkill(skill: SkillCandidate): SkillSecurityReport {
  const signals: SecuritySignal[] = [];

  const push = (
    id: string,
    severity: SecuritySignal["severity"],
    detail: string,
    penalty: number
  ): void => {
    signals.push({ id, severity, detail, penalty });
  };

  const meta = skill.metadata;
  if (meta.hasScripts) {
    push("includes_scripts", "high", "Skill bundle includes executable scripts.", 50);
  }
  if (meta.hasBinaries) {
    push("includes_binaries", "critical", "Skill bundle includes binary artifacts.", 80);
  }
  if (meta.hasPackageManifests) {
    push("includes_package_manifests", "medium", "Skill bundle includes package manifests.", 25);
  }
  if (meta.requiresApiKeys) {
    push("requires_api_keys", "medium", "Skill requires API keys to operate.", 10);
  }
  if (meta.requiresEnvVars) {
    push("requires_env_vars", "low", "Skill requires environment variables.", 8);
  }
  if (!meta.license) {
    push("missing_license", "medium", "License is not declared.", 10);
  }
  if (!meta.pinnedRef) {
    push("unpinned_source", "medium", "Source is not pinned to immutable commit/version.", 8);
  }
  if (meta.trustLevel === "unknown") {
    push("unknown_publisher", "high", "Publisher identity is unknown.", 30);
  }

  const stalePenalty = stalePenaltyFromDate(meta.lastUpdatedIso);
  if (stalePenalty > 0) {
    push("stale_skill", "medium", "Skill appears stale/unmaintained.", stalePenalty);
  }

  const searchable = [skill.summary, ...skill.tags].join(" ").toLowerCase();
  if (/\b(curl|wget|bash|zsh|powershell|chmod \+x|npm i|pip install)\b/.test(searchable)) {
    push("shell_commands_referenced", "medium", "Skill references shell execution patterns.", 20);
  }
  if (/\b(base64\s+-d|eval\s*\(|nc\s+-e|\/dev\/tcp|rm\s+-rf)\b/.test(searchable)) {
    push("suspicious_behavior", "critical", "Skill contains suspicious command patterns.", 100);
  }

  const penalty = signals.reduce((sum, signal) => sum + signal.penalty, 0);
  const score = Math.max(0, 100 - penalty);

  const level: SkillSecurityReport["level"] =
    score >= 85 ? "low" : score >= 70 ? "medium" : score >= 40 ? "high" : "critical";

  return {
    score,
    level,
    signals,
    requiresOverride: score < 80 || signals.some((signal) => signal.severity === "critical")
  };
}

function stalePenaltyFromDate(lastUpdatedIso?: string): number {
  if (!lastUpdatedIso) return 15;
  const date = new Date(lastUpdatedIso);
  if (Number.isNaN(date.getTime())) return 15;
  const now = Date.now();
  const ageDays = (now - date.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 730) return 25;
  if (ageDays > 365) return 20;
  if (ageDays > 180) return 10;
  return 0;
}

export function isInstallAllowed(report: SkillSecurityReport, policy: SecurityPolicy, hasScripts: boolean): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (report.score < 60) {
    reasons.push("Security score below hard block threshold (<60).");
  }
  if (report.score < policy.minSecurityScore) {
    reasons.push(`Security score below required threshold (${policy.minSecurityScore}).`);
  }
  if (policy.noScripts && hasScripts) {
    reasons.push("Skill includes scripts and --no-scripts is enabled.");
  }
  if (report.signals.some((signal) => signal.id === "suspicious_behavior")) {
    reasons.push("Suspicious behavior signal detected.");
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}
