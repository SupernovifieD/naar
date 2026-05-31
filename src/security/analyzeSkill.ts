import type { SecuritySignal, SkillCandidate, SkillSecurityReport } from "../types/index.js";

export interface SecurityPolicy {
  minSecurityScore: number;
  noScripts: boolean;
  allowRisky?: boolean;
}

export type SecurityInstallStatus = "eligible" | "risky" | "blocked";

export interface SecurityPolicyDecisionDetail {
  code: string;
  message: string;
  hardBlock: boolean;
  signalId?: string;
  severity?: SecuritySignal["severity"];
}

export interface SecurityPolicyDecision {
  allowed: boolean;
  status: SecurityInstallStatus;
  hardBlocked: boolean;
  overrideable: boolean;
  reasons: string[];
  hardBlockReasons: string[];
  overrideReasons: string[];
  details: SecurityPolicyDecisionDetail[];
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
  const decision = evaluateInstallDecision(report, policy, hasScripts);
  return {
    allowed: decision.allowed,
    reasons: decision.allowed ? [] : decision.reasons
  };
}

export function evaluateInstallDecision(
  report: SkillSecurityReport,
  policy: SecurityPolicy,
  hasScripts: boolean
): SecurityPolicyDecision {
  const hardReasonsByCode = new Map<string, SecurityPolicyDecisionDetail>();
  const overrideReasonsByCode = new Map<string, SecurityPolicyDecisionDetail>();
  const riskPercent = toRiskPercent(report.score);
  const hardBlockThreshold = toRiskPercent(HARD_BLOCK_SECURITY_SCORE);
  const requiredRiskThreshold = toRiskPercent(policy.minSecurityScore);

  const addReason = (
    target: Map<string, SecurityPolicyDecisionDetail>,
    detail: SecurityPolicyDecisionDetail
  ): void => {
    if (!target.has(detail.code)) {
      target.set(detail.code, detail);
    }
  };

  if (report.score < HARD_BLOCK_SECURITY_SCORE) {
    addReason(hardReasonsByCode, {
      code: "hard_risk_threshold",
      hardBlock: true,
      message: `Risk ${riskPercent}% exceeds hard block threshold (>${hardBlockThreshold}%).`
    });
  }
  if (report.score < policy.minSecurityScore) {
    addReason(overrideReasonsByCode, {
      code: "policy_risk_threshold",
      hardBlock: false,
      message: `Risk ${riskPercent}% exceeds required threshold (>${requiredRiskThreshold}%).`
    });
  }
  if (policy.noScripts && hasScripts) {
    addReason(hardReasonsByCode, {
      code: "scripts_disallowed",
      hardBlock: true,
      message: "Skill includes scripts and --no-scripts is enabled."
    });
  }

  const criticalSignals = report.signals.filter((signal) => signal.severity === "critical");
  if (criticalSignals.length > 0) {
    const hasCriticalContentSignal = criticalSignals.some((signal) => CONTENT_CRITICAL_SIGNAL_IDS.has(signal.id));
    if (hasCriticalContentSignal) {
      addReason(hardReasonsByCode, {
        code: "critical_content_signal",
        hardBlock: true,
        message: "Suspicious executable content detected in skill files."
      });
    } else {
      addReason(hardReasonsByCode, {
        code: "critical_signal",
        hardBlock: true,
        message: "Critical security signal detected."
      });
    }
  }

  for (const signal of report.signals) {
    const message = `${signal.id} [${signal.severity}]: ${signal.detail}`;
    if (signal.severity === "critical") {
      addReason(hardReasonsByCode, {
        code: `critical_signal:${signal.id}`,
        hardBlock: true,
        message,
        signalId: signal.id,
        severity: signal.severity
      });
      continue;
    }

    addReason(overrideReasonsByCode, {
      code: `signal:${signal.id}`,
      hardBlock: false,
      message,
      signalId: signal.id,
      severity: signal.severity
    });
  }

  if (report.signals.some((signal) => signal.id === "unpinned_source")) {
    addReason(overrideReasonsByCode, {
      code: "unpinned_source",
      hardBlock: false,
      message: "Install source is not pinned to an immutable version/ref.",
      signalId: "unpinned_source",
      severity: "medium"
    });
  }

  const hardBlockReasons = [...hardReasonsByCode.values()].map((detail) => detail.message);
  const overrideReasons = [...overrideReasonsByCode.values()].map((detail) => detail.message);
  const hardBlocked = hardBlockReasons.length > 0;
  const hasOverrideRisk = overrideReasons.length > 0;
  const allowRisky = policy.allowRisky === true;

  let status: SecurityInstallStatus = "eligible";
  if (hardBlocked) {
    status = "blocked";
  } else if (hasOverrideRisk) {
    status = allowRisky ? "risky" : "blocked";
  }

  const reasons = hardBlocked
    ? hardBlockReasons
    : hasOverrideRisk
      ? allowRisky
        ? overrideReasons
        : [
            ...overrideReasons,
            "Use --allow-risky to explicitly acknowledge and install overrideable risky skills."
          ]
      : [];

  return {
    allowed: status === "eligible" || status === "risky",
    status,
    hardBlocked,
    overrideable: !hardBlocked && hasOverrideRisk,
    reasons,
    hardBlockReasons,
    overrideReasons,
    details: [
      ...hardReasonsByCode.values(),
      ...overrideReasonsByCode.values()
    ]
  };
}

function toRiskPercent(safetyScore: number): number {
  const clampedSafety = Math.max(0, Math.min(100, Math.round(safetyScore)));
  return 100 - clampedSafety;
}

const HARD_BLOCK_SECURITY_SCORE = 60;

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
