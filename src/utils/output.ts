import pc from "picocolors";
import type { AssistantId, RepoFinding, SkillCandidate, SkillRecommendation } from "../types/index.js";

interface ColorValueOptions {
  percent?: boolean;
}

interface RecommendationCardRenderOptions {
  indent?: string;
  reasonLimit?: number;
  columns?: number;
  compact?: boolean;
}

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
  lines.push(
    `${indent}${pc.blue("score")}: ${colorScore(recommendation.score, { percent: true })}`
    + `   ${pc.blue("risk")}: ${colorRisk(recommendation.candidate.risk.score, { percent: true })}`
    + `   ${pc.blue("status")}: ${recommendation.blocked ? pc.red("BLOCKED") : pc.green("ELIGIBLE")}`
  );

  if (!compact) {
    const description = resolveSkillDescription(recommendation.candidate);
    if (description) {
      appendWrappedField(lines, {
        cardWidth,
        indent,
        label: "description",
        value: description
      });
    }
  }

  const reasons = recommendation.reasons.slice(0, reasonLimit).map((reason) => reason.trim()).filter(Boolean);
  appendWrappedReasonsField(lines, {
    cardWidth,
    indent,
    label: "why",
    reasons
  });

  if (!compact) {
    appendWrappedField(lines, {
      cardWidth,
      indent,
      label: "targets",
      value: formatTargets(recommendation.candidate.compatibility.assistants)
    });

    const metadataFields = formatRecommendationMetaFields(recommendation);
    if (metadataFields.length > 0) {
      appendMetaFields(lines, {
        cardWidth,
        indent,
        label: "meta",
        fields: metadataFields
      });
    }
  }

  if (recommendation.blocked && recommendation.blockReasons && recommendation.blockReasons.length > 0) {
    appendWrappedField(lines, {
      cardWidth,
      indent,
      label: "blocked",
      value: recommendation.blockReasons.join("; ")
    });
  }

  lines.push(divider);
  return `${lines.join("\n")}\n`;
}

export function formatRecommendationChoiceDescription(recommendation: SkillRecommendation): string {
  const reasons = recommendation.reasons.slice(0, DEFAULT_REASON_LIMIT).map((reason) => reason.trim()).filter(Boolean);
  const why = reasons.length > 0 ? reasons.join("; ") : "n/a";
  const targets = formatTargets(recommendation.candidate.compatibility.assistants);
  const status = recommendation.blocked ? "BLOCKED" : "ELIGIBLE";
  const publisher = recommendation.candidate.metadata.publisher ?? "n/a";
  const trust = recommendation.candidate.metadata.trustLevel ?? "unknown";
  return [
    `- status: ${status}`,
    `- why: ${why}`,
    `- targets: ${targets}`,
    `- publisher: ${publisher}`,
    `- trust: ${trust}`
  ].join("\n");
}

function appendWrappedField(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; value: string }
): void {
  const plainPrefix = `${options.indent}${options.label}: `;
  const continuationPrefix = `${options.indent}${" ".repeat(options.label.length + 2)}`;
  const availableWidth = Math.max(12, options.cardWidth - plainPrefix.length);
  const wrapped = wrapForTerminal(options.value, availableWidth);

  if (wrapped.length === 0) {
    return;
  }

  lines.push(`${options.indent}${pc.blue(options.label)}: ${pc.white(wrapped[0])}`);
  for (const segment of wrapped.slice(1)) {
    lines.push(`${continuationPrefix}${pc.white(segment)}`);
  }
}

function appendWrappedReasonsField(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; reasons: string[] }
): void {
  const plainPrefix = `${options.indent}${options.label}: `;
  const continuationPrefix = `${options.indent}${" ".repeat(options.label.length + 2)}`;
  const availableWidth = Math.max(12, options.cardWidth - plainPrefix.length);

  if (options.reasons.length === 0) {
    appendWrappedField(lines, {
      cardWidth: options.cardWidth,
      indent: options.indent,
      label: options.label,
      value: "n/a"
    });
    return;
  }

  let printedAny = false;

  for (const reason of options.reasons) {
    const wrapped = wrapForTerminal(reason, availableWidth);
    if (wrapped.length === 0) {
      continue;
    }

    const firstSegment = wrapped[0];
    if (!printedAny) {
      lines.push(`${options.indent}${pc.blue(options.label)}: ${formatReason(firstSegment)}`);
      printedAny = true;
    } else {
      lines.push(`${continuationPrefix}${formatReason(firstSegment)}`);
    }

    for (const segment of wrapped.slice(1)) {
      lines.push(`${continuationPrefix}${pc.white(segment)}`);
    }
  }

  if (!printedAny) {
    appendWrappedField(lines, {
      cardWidth: options.cardWidth,
      indent: options.indent,
      label: options.label,
      value: "n/a"
    });
  }
}

function appendMetaFields(
  lines: string[],
  options: { cardWidth: number; indent: string; label: string; fields: Array<{ key: string; value: string }> }
): void {
  if (options.fields.length === 0) {
    return;
  }

  lines.push(`${options.indent}${pc.blue(options.label)}:`);

  for (const field of options.fields) {
    const plainPrefix = `${options.indent}  ${field.key}: `;
    const continuationPrefix = `${options.indent}  ${" ".repeat(field.key.length + 2)}`;
    const availableWidth = Math.max(12, options.cardWidth - plainPrefix.length);
    const wrapped = wrapForTerminal(field.value, availableWidth);

    if (wrapped.length === 0) {
      continue;
    }

    lines.push(`${options.indent}  ${pc.blue(field.key)}: ${pc.white(wrapped[0])}`);
    for (const segment of wrapped.slice(1)) {
      lines.push(`${continuationPrefix}${pc.white(segment)}`);
    }
  }
}

function formatTargets(assistants: AssistantId[]): string {
  const unique = [...new Set(assistants)];
  const sorted = unique.sort((left, right) => assistantRank(left) - assistantRank(right));
  return sorted.join(", ");
}

function formatRecommendationMetaFields(recommendation: SkillRecommendation): Array<{ key: string; value: string }> {
  const metadata = recommendation.candidate.metadata;
  const parts: Array<{ key: string; value: string }> = [];

  const publisher = metadata.publisher;
  if (publisher) {
    parts.push({ key: "publisher", value: publisher });
  }
  if (metadata.trustLevel) {
    parts.push({ key: "trust", value: metadata.trustLevel });
  }
  if (metadata.license) {
    parts.push({ key: "license", value: metadata.license });
  }
  if (metadata.lastUpdatedIso) {
    parts.push({ key: "updated", value: formatUpdated(metadata.lastUpdatedIso) });
  }

  return parts;
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
