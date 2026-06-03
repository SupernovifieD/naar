import pc from "picocolors";
import type { AssistantId, SkillCandidate, SkillProviderResult } from "../types/index.js";
import { resolveSkillDescription, wrapForTerminal } from "../utils/output.js";
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

  if (options.verbose) {
    appendProviderDiagnostics(lines, options.providerSummaries ?? [], options.warnings ?? []);
  }

  lines.push(`${pc.bold(`Search results for "${query}"`)}`);
  if (!options.all && typeof options.limit === "number" && options.totalResults > options.results.length) {
    lines.push(pc.dim(`Showing ${options.results.length} of ${options.totalResults} matches. Use --all to show every meaningful result.`));
  }
  lines.push("");

  if (options.results.length === 0) {
    lines.push(`${pc.yellow("⚠")} ${pc.yellow(`No skills found for "${query}".`)}`);
    lines.push(`Try a broader term or search a specific provider with ${pc.cyan("--provider <id>")}.`);
    if (!options.verbose && (options.warnings ?? []).length > 0) {
      lines.push("");
      lines.push(`${pc.bold("Provider notes")}:`);
      for (const warning of options.warnings ?? []) {
        lines.push(`- ${pc.yellow(warning)}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  for (const [index, result] of options.results.entries()) {
    if (options.compact) {
      appendCompactResult(lines, result, columns);
    } else {
      appendFullResult(lines, result, columns, options.verbose === true);
    }

    if (index < options.results.length - 1) {
      lines.push("");
    }
  }

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

function appendFullResult(
  lines: string[],
  result: SearchRankedCandidate,
  columns: number,
  verbose: boolean
): void {
  const candidate = result.candidate;
  lines.push(`${pc.bold(candidate.canonicalSkillId)}  ${pc.dim(`[${pc.cyan(candidate.source.providerId)}]`)}`);

  const description = resolveSkillDescription(candidate);
  if (description) {
    for (const line of wrapForTerminal(description, Math.max(MIN_DESCRIPTION_WIDTH, columns))) {
      lines.push(line);
    }
  }

  lines.push(formatMetadataLine(candidate));
  const targets = formatTargets(candidate.compatibility.assistants);
  if (targets) {
    lines.push(`${pc.blue("Targets")}: ${pc.cyan(targets)}`);
  }

  const pageUrl = resolveSkillPageUrl(candidate);
  if (pageUrl) {
    lines.push(`${pc.blue("Page")}: ${pc.cyan(pageUrl)}`);
  }

  const install = formatInstallInfo(candidate);
  lines.push(`${pc.blue("Install")}: ${pc.cyan(install.command)}`);

  if (verbose) {
    lines.push(`${pc.blue("Search match")}: ${pc.cyan(`${result.score}%`)}`);
    lines.push(`${pc.blue("Provider skill ID")}: ${pc.white(candidate.providerSkillId)}`);
    lines.push(`${pc.blue("Canonical skill ID")}: ${pc.white(candidate.canonicalSkillId)}`);
    lines.push(`${pc.blue("Pre-fetch risk estimate")}: ${pc.white(`${toRiskPercent(candidate.risk.score)}%`)}`);
    if (candidate.metadata.trustLevel) {
      lines.push(`${pc.blue("Trust")}: ${pc.white(candidate.metadata.trustLevel)}`);
    }
    if (result.reasons.length > 0) {
      lines.push(`${pc.blue("Reasons")}:`);
      for (const reason of result.reasons) {
        lines.push(`  - ${pc.white(reason)}`);
      }
    }
  }
}

function appendCompactResult(
  lines: string[],
  result: SearchRankedCandidate,
  columns: number
): void {
  const candidate = result.candidate;
  const description = resolveSkillDescription(candidate) ?? candidate.summary;
  const availableDescriptionWidth = Math.max(24, columns - candidate.canonicalSkillId.length - candidate.source.providerId.length - 8);
  const summary = truncate(description, availableDescriptionWidth);
  lines.push(`${pc.bold(candidate.canonicalSkillId)} ${pc.dim(`[${pc.cyan(candidate.source.providerId)}]`)} - ${summary}`);

  const metadata = [
    candidate.metadata.publisher ?? candidate.source.publisher ?? candidate.source.providerId,
    colorLicense(candidate),
    formatUpdated(candidate.metadata.lastUpdatedIso),
    resolveSkillPageUrl(candidate)
  ].filter((value): value is string => Boolean(value));
  lines.push(`  ${pc.dim(metadata.join(" · "))}`);
  lines.push(`  ${pc.blue("install")}: ${pc.cyan(formatInstallInfo(candidate).command)}`);
}

function appendProviderDiagnostics(
  lines: string[],
  providers: SearchProviderSummary[],
  warnings: string[]
): void {
  if (providers.length > 0) {
    lines.push(`${pc.bold("Providers")}:`);
    for (const provider of providers) {
      const mode = provider.mode ? ` mode=${pc.cyan(provider.mode)}` : "";
      lines.push(`- ${pc.bold(provider.providerId)}${mode} candidates=${pc.cyan(String(provider.candidateCount))}`);
    }
  }

  if (warnings.length > 0) {
    if (providers.length > 0) {
      lines.push("");
    }
    lines.push(`${pc.bold("Provider notes")}:`);
    for (const warning of warnings) {
      lines.push(`- ${pc.yellow(warning)}`);
    }
  }

  if (providers.length > 0 || warnings.length > 0) {
    lines.push("");
  }
}

function formatMetadataLine(candidate: SkillCandidate): string {
  const fields = [
    `${pc.blue("Publisher")}: ${pc.white(candidate.metadata.publisher ?? candidate.source.publisher ?? candidate.source.providerId)}`,
    `${pc.blue("License")}: ${colorLicense(candidate)}`,
    `${pc.blue("Updated")}: ${pc.white(formatUpdated(candidate.metadata.lastUpdatedIso) ?? "unknown")}`
  ];
  return fields.join(pc.dim("   "));
}

function colorLicense(candidate: SkillCandidate): string {
  const license = candidate.metadata.license?.trim();
  return license && license.length > 0
    ? pc.white(license)
    : pc.yellow("No license declared");
}

function formatUpdated(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
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
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
