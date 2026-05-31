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

  return buildSecurityReport(signals);
}

export function mergeSecuritySignals(
  baseReport: SkillSecurityReport,
  contentSignals: SecuritySignal[]
): SkillSecurityReport {
  if (contentSignals.length === 0) {
    return baseReport;
  }
  const mergedSignals = dedupeSignals([...baseReport.signals, ...contentSignals]);
  return buildSecurityReport(mergedSignals);
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
  const riskPercent = toRiskPercent(report.score);
  const hardBlockThreshold = toRiskPercent(60);
  const requiredRiskThreshold = toRiskPercent(policy.minSecurityScore);

  if (report.score < 60) {
    reasons.push(`Risk ${riskPercent}% exceeds hard block threshold (>${hardBlockThreshold}%).`);
  }
  if (report.score < policy.minSecurityScore) {
    reasons.push(`Risk ${riskPercent}% exceeds required threshold (>${requiredRiskThreshold}%).`);
  }
  if (policy.noScripts && hasScripts) {
    reasons.push("Skill includes scripts and --no-scripts is enabled.");
  }
  const criticalSignals = report.signals.filter((signal) => signal.severity === "critical");
  if (criticalSignals.length > 0) {
    if (criticalSignals.some((signal) => CONTENT_CRITICAL_SIGNAL_IDS.has(signal.id))) {
      reasons.push("Suspicious executable content detected in skill files.");
    } else {
      reasons.push("Critical security signal detected.");
    }
  }
  if (report.signals.some((signal) => signal.id === "unpinned_source")) {
    reasons.push("Install source is not pinned to an immutable version/ref.");
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

function toRiskPercent(safetyScore: number): number {
  const clampedSafety = Math.max(0, Math.min(100, Math.round(safetyScore)));
  return 100 - clampedSafety;
}

function buildSecurityReport(signals: SecuritySignal[]): SkillSecurityReport {
  const dedupedSignals = dedupeSignals(signals);
  const penalty = dedupedSignals.reduce((sum, signal) => sum + signal.penalty, 0);
  const score = Math.max(0, 100 - penalty);

  const level: SkillSecurityReport["level"] =
    score >= 85 ? "low" : score >= 70 ? "medium" : score >= 40 ? "high" : "critical";

  return {
    score,
    level,
    signals: dedupedSignals,
    requiresOverride: score < 80 || dedupedSignals.some((signal) => signal.severity === "critical")
  };
}

function dedupeSignals(signals: SecuritySignal[]): SecuritySignal[] {
  const byId = new Map<string, SecuritySignal>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    if (!existing) {
      byId.set(signal.id, {
        id: signal.id,
        severity: signal.severity,
        detail: signal.detail,
        penalty: signal.penalty,
        evidence: signal.evidence ? [...signal.evidence] : undefined
      });
      continue;
    }

    existing.severity = highestSeverity(existing.severity, signal.severity);
    existing.penalty = Math.max(existing.penalty, signal.penalty);
    if (existing.detail.length === 0 && signal.detail.length > 0) {
      existing.detail = signal.detail;
    }

    const mergedEvidence = mergeEvidence(existing.evidence, signal.evidence);
    if (mergedEvidence.length > 0) {
      existing.evidence = mergedEvidence;
    }
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeEvidence(
  left: SecuritySignal["evidence"],
  right: SecuritySignal["evidence"]
): NonNullable<SecuritySignal["evidence"]> {
  const merged: NonNullable<SecuritySignal["evidence"]> = [];
  const seen = new Set<string>();
  for (const evidence of [...(left ?? []), ...(right ?? [])]) {
    const key = `${evidence.path}:${evidence.line ?? 0}:${evidence.excerpt ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(evidence);
  }
  return merged;
}

function highestSeverity(
  left: SecuritySignal["severity"],
  right: SecuritySignal["severity"]
): SecuritySignal["severity"] {
  const rank = (value: SecuritySignal["severity"]): number => {
    if (value === "critical") return 4;
    if (value === "high") return 3;
    if (value === "medium") return 2;
    return 1;
  };
  return rank(left) >= rank(right) ? left : right;
}

const CONTENT_CRITICAL_SIGNAL_IDS = new Set([
  "remote_pipe_to_shell",
  "destructive_filesystem_command",
  "credential_or_secret_exfiltration",
  "reverse_shell_pattern",
  "encoded_or_eval_execution"
]);
