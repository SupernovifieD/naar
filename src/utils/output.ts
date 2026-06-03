import pc from "picocolors";
import type { AssistantId, RecommendationStatus, RepoFinding, SkillCandidate, SkillRecommendation } from "../types/index.js";

interface ColorValueOptions {
  percent?: boolean;
}

interface RecommendationCardRenderOptions {
  indent?: string;
  reasonLimit?: number;
  columns?: number;
  compact?: boolean;
  verbose?: boolean;
  scoreLabel?: string;
}

type MetaFieldTone = "default" | "warning" | "danger";

const CARD_MIN_WIDTH = 68;
const CARD_MAX_WIDTH = 96;
const CARD_FALLBACK_COLUMNS = 80;
const DEFAULT_REASON_LIMIT = 2;

const ASSISTANT_ORDER: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];

export function colorScore(score: number, options: ColorValueOptions = {}): string {
  const label = formatValue(score, options.percent === true);
  if (score >= 80) return pc.green(label);
  if (score >= 60) return pc.yellow(label);
  return pc.red(label);
}

export function colorRisk(score: number, options: ColorValueOptions = {}): string {
  const riskPercent = toRiskPercent(score);
  const label = formatValue(riskPercent, options.percent === true);
  if (riskPercent <= 20) return pc.green(label);
  if (riskPercent <= 40) return pc.yellow(label);
  return pc.red(label);
}

export function formatReason(reason: string): string {
  const [label, ...rest] = reason.split(":");
  if (rest.length === 0) {
    return pc.white(reason);
  }

  const detail = rest.join(":").trim();
  return `${pc.blue(label.trim())}:${detail ? ` ${pc.white(detail)}` : ""}`;
}

export function formatList(values: string[], fallback = "none"): string {
  if (values.length === 0) return pc.dim(fallback);
  return values.map((value) => pc.cyan(value)).join(", ");
}

export function colorAssistantStatus(status: "found" | "missing" | "partial"): string {
  if (status === "found") return pc.green("found");
  if (status === "partial") return pc.yellow("partial");
  return pc.dim("missing");
}

export function colorFindingSeverity(severity: RepoFinding["severity"]): string {
  if (severity === "error") return pc.red(severity);
  if (severity === "warn") return pc.yellow(severity);
  return pc.cyan(severity);
}

export function warningLine(message: string): string {
  return `${pc.yellow("⚠")} ${pc.yellow(message)}`;
}

export function warningHeader(title = "Warnings"): string {
  return pc.yellow(`⚠ ${title}`);
}

export function resolveSkillDescription(candidate: Pick<SkillCandidate, "summary" | "metadata">): string | null {
  const preferred = candidate.metadata.description ?? candidate.summary;
  const normalized = preferred
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveRecommendationCardWidth(columns: number | undefined = process.stdout.columns): number {
  const normalized = typeof columns === "number" && Number.isFinite(columns)
    ? Math.floor(columns)
    : CARD_FALLBACK_COLUMNS;
  return Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, normalized - 2));
}

export function wrapForTerminal(text: string, width: number): string[] {
  const normalizedWidth = Math.max(8, Math.floor(width));
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const words = normalizedText.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > normalizedWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += normalizedWidth) {
        lines.push(word.slice(i, i + normalizedWidth));
      }
      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= normalizedWidth) {
      current += ` ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function renderRecommendationCards(
  recommendations: SkillRecommendation[],
  options: RecommendationCardRenderOptions = {}
): string {
  const sections = recommendations.map((recommendation, index) =>
    renderRecommendationCard(recommendation, index + 1, options)
  );
  return sections.join("\n");
}

export function renderRecommendationCard(
  recommendation: SkillRecommendation,
  rank: number,
  options: RecommendationCardRenderOptions = {}
): string {
  const indent = options.indent ?? "";
  const compact = options.compact === true;
  const verbose = options.verbose === true;
  const reasonLimit = compact
    ? 1
    : (options.reasonLimit ?? DEFAULT_REASON_LIMIT);
  const cardWidth = resolveRecommendationCardWidth(options.columns);
  const divider = `${indent}${pc.dim("-".repeat(cardWidth))}`;

  const lines: string[] = [];
  lines.push(divider);
  lines.push(
    `${indent}${pc.bold(`${rank}) ${recommendation.candidate.name}`)} ${pc.cyan(`[${recommendation.candidate.source.providerId}]`)}`
  );
  const status = resolveRecommendationStatus(recommendation);
  const scoreLabel = options.scoreLabel ?? "Match score";
  const publisher = recommendation.candidate.metadata.publisher
    ?? recommendation.candidate.source.publisher
    ?? recommendation.candidate.source.providerId;
  lines.push(
    `${indent}${pc.blue("Publisher")}: ${pc.white(publisher)}`
    + `   ${pc.blue(scoreLabel)}: ${colorScore(recommendation.score, { percent: true })}`
    + `   ${pc.blue("Pre-fetch risk estimate")}: ${colorRisk(recommendation.candidate.risk.score, { percent: true })}`
    + `   ${pc.blue("Status")}: ${colorPreliminaryRecommendationStatus(status)}`
  );

  if (!compact) {
    const description = resolveSkillDescription(recommendation.candidate);
    if (description) {
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "Description",
        value: description
      });
    }
  }

  const reasons = (recommendation.reasons ?? []).slice(0, reasonLimit).map((reason) => reason.trim()).filter(Boolean);
  appendWrappedReasonsField(lines, {
    cardWidth,
    indent,
    label: "Why",
    reasons
  });

  const eligibilityReasons = (recommendation.eligibilityReasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  if (eligibilityReasons.length > 0 && (!compact || verbose)) {
    appendWrappedReasonsField(lines, {
      cardWidth,
      indent,
      label: "Eligibility",
      reasons: compact ? eligibilityReasons.slice(0, 1) : eligibilityReasons
    });
  }

  if (!compact) {
    appendWrappedField(lines, {
      cardWidth,
      indent,
      label: "Targets",
      value: formatTargets(recommendation.candidate.compatibility.assistants)
    });

    const metadataFields = formatRecommendationMetaFields(recommendation);
    if (metadataFields.length > 0) {
      appendMetaFields(lines, {
        cardWidth,
        indent,
        label: "Meta",
        fields: metadataFields
      });
    }
  }

  if (verbose) {
    appendWrappedField(lines, {
      cardWidth,
      indent,
      label: "Match Score Model",
      value: `final=${recommendation.score} raw=${recommendation.rawScore ?? recommendation.score}`
        + ` relevanceRaw=${recommendation.relevanceRaw ?? recommendation.score}`
        + ` qualityRaw=${recommendation.qualityRaw ?? 0}`
    });

    const allCaps = recommendation.capsApplied ?? [];
    const capReasons = allCaps.slice(0, 3);
    if (capReasons.length > 0) {
      const strictestCap = Math.min(...allCaps.map((item) => item.cap));
      const reasonSummary = capReasons.map((item) => item.reason).join("; ");
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "Cap Summary",
        value: `strictest=${strictestCap}; ${reasonSummary}`
      });
    }

    const categories = (recommendation.skillCategories ?? []).slice(0, 8);
    if (categories.length > 0) {
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "Skill Categories",
        value: categories.join(", ")
      });
    }

    const domainSignals = (recommendation.domainSignals ?? []).slice(0, 8);
    if (domainSignals.length > 0) {
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "Domain Signals",
        value: domainSignals.join(", ")
      });
    }

    const matchedNeeds = (recommendation.matchedNeeds ?? []).slice(0, 8);
    if (matchedNeeds.length > 0) {
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "Matched Needs",
        value: matchedNeeds.join(", ")
      });
    }

    const matchedNeedDetails = (recommendation.matchedNeedDetails ?? []).slice(0, 8).map((item) => {
      const terms = item.matchedTerms.length > 0 ? ` terms=${item.matchedTerms.join("|")}` : "";
      const anti = item.antiTerms.length > 0 ? ` anti=${item.antiTerms.join("|")}` : "";
      const reason = item.reason ? ` reason=${item.reason}` : "";
      const sign = item.points >= 0 ? "+" : "";
      return `${item.id} [${item.strength}] ${sign}${item.points}${terms}${anti}${reason}`;
    });
    if (matchedNeedDetails.length > 0) {
      appendWrappedReasonsField(lines, {
        cardWidth,
        indent,
        label: "Matched Need Details",
        reasons: matchedNeedDetails
      });
    }

    const matchedFacts = (recommendation.matchedFacts ?? []).slice(0, 8).map((fact) => {
      const detail = fact.detail ? ` (${fact.detail})` : "";
      return `${fact.source}:${fact.factType}:${fact.id}${detail}`;
    });
    if (matchedFacts.length > 0) {
      appendWrappedReasonsField(lines, {
        cardWidth,
        indent,
        label: "Matched Facts",
        reasons: matchedFacts
      });
    }

    const breakdown = (recommendation.scoreBreakdown ?? []).map((entry) => {
      const sign = entry.points >= 0 ? "+" : "";
      const strength = entry.strength ? ` [${entry.strength}]` : "";
      const terms = entry.matchedTerms && entry.matchedTerms.length > 0 ? ` terms=${entry.matchedTerms.join("|")}` : "";
      const anti = entry.antiTerms && entry.antiTerms.length > 0 ? ` anti=${entry.antiTerms.join("|")}` : "";
      const reason = entry.reason ? ` reason=${entry.reason}` : "";
      return `${sign}${entry.points} ${entry.kind}${strength}: ${entry.detail}${terms}${anti}${reason}`;
    });
    if (breakdown.length > 0) {
      appendWrappedReasonsField(lines, {
        cardWidth,
        indent,
        label: "Score Breakdown",
        reasons: breakdown
      });
    }

    const capsApplied = (recommendation.capsApplied ?? []).slice(0, 8).map((cap) =>
      `${cap.kind}: cap=${cap.cap} reason=${cap.reason}`
    );
    if (capsApplied.length > 0) {
      appendWrappedReasonsField(lines, {
        cardWidth,
        indent,
        label: "Caps Applied",
        reasons: capsApplied
      });
    }
  }

  const securityReasons = (recommendation.blockReasons ?? []).map((reason) => reason.trim()).filter(Boolean);
  if (status === "blocked" && securityReasons.length > 0) {
    appendWrappedReasonsField(lines, {
      cardWidth,
      indent,
      label: "Blocked",
      reasons: securityReasons.slice(0, 3)
    });
  } else if (status === "risky" && securityReasons.length > 0) {
    appendWrappedReasonsField(lines, {
      cardWidth,
      indent,
      label: "Risky",
      reasons: securityReasons.slice(0, 3)
    });
  }

  if ((status === "blocked" || status === "risky") && recommendation.candidate.risk.signals.length > 0) {
    const signalSummary = recommendation.candidate.risk.signals
      .slice(0, 3)
      .map((signal) => `${signal.id} [${signal.severity}]`);
    appendWrappedField(lines, {
      cardWidth,
      indent,
      label: "Signals",
      value: signalSummary.join("; ")
    });
  }

  lines.push(divider);
  return `${lines.join("\n")}\n`;
}

export function formatRecommendationChoiceDescription(recommendation: SkillRecommendation): string {
  const reasons = recommendation.reasons.slice(0, DEFAULT_REASON_LIMIT).map((reason) => reason.trim()).filter(Boolean);
  const why = reasons.length > 0 ? reasons.join("; ") : "n/a";
  const targets = formatTargets(recommendation.candidate.compatibility.assistants);
  const status = formatPreliminaryRecommendationStatus(resolveRecommendationStatus(recommendation));
  const publisher = recommendation.candidate.metadata.publisher ?? "n/a";
  const trust = recommendation.candidate.metadata.trustLevel ?? "unknown";
  const security = (recommendation.blockReasons ?? []).slice(0, 1).join("; ");
  return [
    `- Preliminary status: ${status}`,
    `- Why: ${why}`,
    ...(security ? [`- Security: ${security}`] : []),
    `- Targets: ${targets}`,
    `- Publisher: ${publisher}`,
    `- Trust: ${trust}`
  ].join("\n");
}

function appendWrappedField(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; value: string }
): void {
  const displayLabel = toDisplayLabel(options.label);
  const plainPrefix = `${options.indent}${displayLabel}: `;
  const continuationPrefix = `${options.indent}${" ".repeat(displayLabel.length + 2)}`;
  const availableWidth = Math.max(12, options.cardWidth - plainPrefix.length);
  const wrapped = wrapForTerminal(options.value, availableWidth);

  if (wrapped.length === 0) {
    return;
  }

  lines.push(`${options.indent}${pc.blue(displayLabel)}: ${pc.white(wrapped[0])}`);
  for (const segment of wrapped.slice(1)) {
    lines.push(`${continuationPrefix}${pc.white(segment)}`);
  }
}

function appendWrappedReasonsField(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; reasons: string[] }
): void {
  const displayLabel = toDisplayLabel(options.label);
  const reasonPrefix = `${options.indent}  `;
  const availableWidth = Math.max(12, options.cardWidth - reasonPrefix.length);

  lines.push(`${options.indent}${pc.blue(displayLabel)}:`);

  for (const reason of options.reasons) {
    const wrapped = wrapForTerminal(reason, availableWidth);
    if (wrapped.length === 0) {
      continue;
    }

    lines.push(`${reasonPrefix}${formatReason(wrapped[0])}`);

    for (const segment of wrapped.slice(1)) {
      lines.push(`${reasonPrefix}${pc.white(segment)}`);
    }
  }

  if (options.reasons.length === 0) {
    lines.push(`${reasonPrefix}${pc.white("n/a")}`);
  }
}

function appendMetaFields(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; fields: Array<{ key: string; value: string; tone?: MetaFieldTone }> }
): void {
  if (options.fields.length === 0) {
    return;
  }

  const displayLabel = toDisplayLabel(options.label);
  lines.push(`${options.indent}${pc.blue(displayLabel)}:`);

  for (const field of options.fields) {
    const displayKey = toDisplayLabel(field.key);
    const plainPrefix = `${options.indent}  ${displayKey}: `;
    const continuationPrefix = `${options.indent}  ${" ".repeat(displayKey.length + 2)}`;
    const availableWidth = Math.max(12, options.cardWidth - plainPrefix.length);
    const wrapped = wrapForTerminal(field.value, availableWidth);

    if (wrapped.length === 0) {
      continue;
    }

    lines.push(`${options.indent}  ${pc.blue(displayKey)}: ${colorMetaValue(wrapped[0], field.tone)}`);
    for (const segment of wrapped.slice(1)) {
      lines.push(`${continuationPrefix}${colorMetaValue(segment, field.tone)}`);
    }
  }
}

function toDisplayLabel(value: string): string {
  const withSpaces = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return withSpaces
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTargets(assistants: AssistantId[]): string {
  const unique = [...new Set(assistants)];
  const sorted = unique.sort((left, right) => assistantRank(left) - assistantRank(right));
  return sorted.join(", ");
}

function formatRecommendationMetaFields(
  recommendation: SkillRecommendation
): Array<{ key: string; value: string; tone?: MetaFieldTone }> {
  const metadata = recommendation.candidate.metadata;
  const parts: Array<{ key: string; value: string; tone?: MetaFieldTone }> = [];

  if (metadata.trustLevel) {
    parts.push({ key: "trust", value: metadata.trustLevel });
  }
  const hasLicense = typeof metadata.license === "string" && metadata.license.trim().length > 0;
  const missingLicense = !hasLicense;
  const status = resolveRecommendationStatus(recommendation);
  parts.push({
    key: "license",
    value: hasLicense ? metadata.license!.trim() : "No license declared",
    tone: missingLicense
      ? (status === "blocked" ? "danger" : "warning")
      : "default"
  });
  if (metadata.lastUpdatedIso) {
    parts.push({ key: "updated", value: formatUpdated(metadata.lastUpdatedIso) });
  }

  return parts;
}

function colorMetaValue(value: string, tone: MetaFieldTone | undefined): string {
  if (tone === "danger") return pc.red(value);
  if (tone === "warning") return pc.yellow(value);
  return pc.white(value);
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return value;
}

function assistantRank(assistant: AssistantId): number {
  const rank = ASSISTANT_ORDER.indexOf(assistant);
  return rank >= 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function resolveRecommendationStatus(recommendation: SkillRecommendation): RecommendationStatus {
  if (recommendation.status) {
    return recommendation.status;
  }
  return recommendation.blocked ? "blocked" : "eligible";
}

function colorPreliminaryRecommendationStatus(status: RecommendationStatus): string {
  const label = formatPreliminaryRecommendationStatus(status);
  if (status === "eligible") return pc.green(label);
  if (status === "risky") return pc.yellow(label);
  return pc.red(label);
}

function formatPreliminaryRecommendationStatus(status: RecommendationStatus): string {
  if (status === "eligible") return "PRELIMINARILY ELIGIBLE";
  if (status === "risky") return "PRELIMINARILY RISKY";
  if (status === "incompatible") return "PRELIMINARILY INCOMPATIBLE";
  return "PRELIMINARILY BLOCKED";
}

function formatValue(value: number, asPercent: boolean): string {
  if (!asPercent) {
    return String(value);
  }

  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  const clamped = Math.max(0, Math.min(100, normalized));
  return `${clamped}%`;
}

export function toRiskPercent(safetyScore: number): number {
  const normalized = Number.isFinite(safetyScore) ? Math.round(safetyScore) : 0;
  const clampedSafety = Math.max(0, Math.min(100, normalized));
  return 100 - clampedSafety;
}
