import pc from "picocolors";
import type { AssistantId, SkillCandidate, SkillProviderResult } from "../types/index.js";
import { resolveSkillDescription, wrapForTerminal } from "../utils/output.js";
import {
  command,
  formatDateOnly,
  info,
  joinSegments,
  label,
  muted,
  skill as skillText,
  truncateText,
  value,
  warning
} from "../utils/terminal.js";
import type { SearchRankedCandidate } from "./types.js";

export interface SearchProviderSummary {
  providerId: string;
  mode?: string;
  candidateCount: number;
  warnings: string[];
}

export interface SearchRenderOptions {
  query: string;
  results: SearchRankedCandidate[];
  totalResults: number;
  limit?: number;
  all?: boolean;
  compact?: boolean;
  verbose?: boolean;
  columns?: number;
  providerSummaries?: SearchProviderSummary[];
  warnings?: string[];
}

export interface SearchInstallInfo {
  from: string;
  command: string;
}

const DEFAULT_COLUMNS = 80;
const MIN_DESCRIPTION_WIDTH = 42;
const ASSISTANT_ORDER: AssistantId[] = ["claude", "cursor", "copilot", "codex", "generic"];

export function renderSearchResults(options: SearchRenderOptions): string {
  const lines: string[] = [];
  const query = options.query;
  const columns = resolveColumns(options.columns);

  lines.push(pc.bold(`Search results for "${query}"`));
  if (!options.all && typeof options.limit === "number" && options.totalResults > options.results.length) {
    lines.push(muted(`Showing ${options.results.length} of ${options.totalResults}. Use --limit <n> or --all for more.`));
  }
  lines.push("");

  if (options.results.length === 0) {
    lines.push(`${pc.yellow("⚠")} ${warning(`No skills found for "${query}".`)}`);
    lines.push(`Try a broader term or search a specific provider with ${command("--provider <id>")}.`);
    appendProviderDiagnostics(lines, options.providerSummaries ?? [], options.warnings ?? [], options.verbose === true);
    return `${lines.join("\n")}\n`;
  }

  for (const [index, result] of options.results.entries()) {
    appendResult(lines, result, columns, options.verbose === true, index + 1, options.compact === true);
    if (index < options.results.length - 1) {
      lines.push("");
    }
  }

  appendProviderDiagnostics(lines, options.providerSummaries ?? [], options.warnings ?? [], options.verbose === true);

  return `${lines.join("\n")}\n`;
}

export function toSearchJsonResult(result: SearchRankedCandidate): object {
  return {
    candidate: result.candidate,
    searchScore: result.score,
    exact: result.exact,
    reasons: result.reasons,
    install: formatInstallInfo(result.candidate)
  };
}

export function providerResultsToSearchSummaries(providerResults: SkillProviderResult[]): SearchProviderSummary[] {
  return providerResults.map((result) => ({
    providerId: result.providerId,
    mode: result.mode,
    candidateCount: result.candidates.length,
    warnings: result.warnings ?? []
  }));
}

export function formatInstallInfo(candidate: SkillCandidate): SearchInstallInfo {
  const from = `${candidate.source.providerId}:${candidate.providerSkillId}`;
  return {
    from,
    command: `naar install ${shellQuote(from)}`
  };
}

function appendResult(
  lines: string[],
  result: SearchRankedCandidate,
  columns: number,
  verbose: boolean,
  rank: number,
  compact: boolean
): void {
  const candidate = result.candidate;
  lines.push(`${skillText(`${rank}. ${candidate.providerSkillId}`)} ${info(`[${candidate.source.providerId}]`)}`);

  const description = resolveSkillDescription(candidate) ?? candidate.summary;
  if (description) {
    const wrapped = wrapForTerminal(
      compact ? truncateText(description, Math.max(36, columns - 8)) : description,
      Math.max(MIN_DESCRIPTION_WIDTH, columns - 2)
    ).slice(0, compact ? 1 : 2);
    for (const line of wrapped) {
      lines.push(line);
    }
  }

  lines.push(formatMetadataLine(candidate));
  lines.push(`${label("Install")}: ${command(formatInstallInfo(candidate).command)}`);

  if (verbose) {
    lines.push(`${label("Search match")}: ${info(`${result.score}%`)}`);
    lines.push(`${label("Canonical ID")}: ${value(candidate.canonicalSkillId)}`);
    lines.push(`${label("Provider skill ID")}: ${value(candidate.providerSkillId)}`);
    lines.push(`${label("Pre-fetch risk")}: ${value(`${toRiskPercent(candidate.risk.score)}%`)}`);
    const targets = formatTargets(candidate.compatibility.assistants);
    if (targets) {
      lines.push(`${label("Targets")}: ${info(targets)}`);
    }
    const pageUrl = resolveSkillPageUrl(candidate);
    if (pageUrl) {
      lines.push(`${label("Page")}: ${command(pageUrl)}`);
    }
    if (candidate.metadata.trustLevel) {
      lines.push(`${label("Trust")}: ${value(candidate.metadata.trustLevel)}`);
    }
    if (result.reasons.length > 0) {
      lines.push(`${label("Reasons")}:`);
      for (const reason of result.reasons) {
        lines.push(`  - ${value(reason)}`);
      }
    }
  }
}

function appendProviderDiagnostics(
  lines: string[],
  providers: SearchProviderSummary[],
  warnings: string[],
  verbose: boolean
): void {
  if (verbose && providers.length > 0) {
    lines.push("");
    lines.push(pc.bold("Providers"));
    for (const provider of providers) {
      const mode = provider.mode ? ` ${muted("·")} mode ${info(provider.mode)}` : "";
      lines.push(`* ${skillText(provider.providerId)}${mode}${muted(" · ")}${value(`${provider.candidateCount} candidates`)}`);
    }
  }

  if (warnings.length > 0) {
    if (providers.length > 0 || lines.length > 0) {
      lines.push("");
    }
    lines.push(pc.bold("Provider notes"));
    for (const warning of warnings) {
      lines.push(`* ${pc.yellow(warning)}`);
    }
  }
}

function formatMetadataLine(candidate: SkillCandidate): string {
  return joinSegments([
    `${label("Publisher")} ${value(candidate.metadata.publisher ?? candidate.source.publisher ?? candidate.source.providerId)}`,
    `${label("License")} ${colorLicense(candidate)}`,
    `${label("Updated")} ${value(formatUpdated(candidate.metadata.lastUpdatedIso) ?? "unknown")}`
  ]);
}

function colorLicense(candidate: SkillCandidate): string {
  const license = candidate.metadata.license?.trim();
  return license && license.length > 0
    ? pc.white(license)
    : pc.yellow("No license declared");
}

function formatUpdated(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return formatDateOnly(value);
}

function formatTargets(assistants: AssistantId[]): string {
  return [...new Set(assistants)]
    .sort((left, right) => assistantRank(left) - assistantRank(right))
    .join(", ");
}

function assistantRank(assistant: AssistantId): number {
  const index = ASSISTANT_ORDER.indexOf(assistant);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function resolveSkillPageUrl(candidate: SkillCandidate): string | undefined {
  const rawUrl = candidate.source.url?.trim();
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return undefined;
  try {
    return new URL(rawUrl).toString();
  } catch {
    return undefined;
  }
}

function resolveColumns(columns: number | undefined): number {
  if (typeof columns !== "number" || !Number.isFinite(columns)) return DEFAULT_COLUMNS;
  return Math.max(50, Math.floor(columns) - 2);
}

function toRiskPercent(safetyScore: number): number {
  const normalized = Number.isFinite(safetyScore) ? Math.round(safetyScore) : 0;
  const clampedSafety = Math.max(0, Math.min(100, normalized));
  return 100 - clampedSafety;
}

function truncate(value: string, maxLength: number): string {
  return truncateText(value, maxLength);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
