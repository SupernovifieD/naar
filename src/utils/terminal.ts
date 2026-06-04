import path from "node:path";
import ora from "ora";
import pc from "picocolors";

/*
Terminal UX contract

- Color meanings:
  - bold: command titles, section titles, primary object names
  - cyan: actionable commands, provider ids, selected values
  - blue: compact field labels
  - green: success, eligible, safe states
  - yellow: warnings, risky states, missing license, degraded modes
  - red: errors, blocked states, destructive removal
  - dim: secondary metadata, hints, separators, missing values
- Default output:
  - compact, decision-friendly, low repetition
  - repo-relative paths only
  - warnings and blocked/risky states stay visible
- Verbose output:
  - full metadata, diagnostics, exact paths, provider details, model details
- Spinner rules:
  - human mode only
  - always stop before prompts
  - always succeed/fail/stop explicitly
*/

export interface SpinnerOptions {
  enabled?: boolean;
  successText?: string;
  failText?: string;
}

export function heading(text: string): string {
  return pc.bold(text);
}

export function section(title: string): string {
  return pc.bold(title);
}

export function subtle(text: string): string {
  return pc.dim(text);
}

export function label(text: string): string {
  return pc.blue(text);
}

export function value(text: string): string {
  return pc.white(text);
}

export function muted(text: string): string {
  return pc.dim(text);
}

export function success(text: string): string {
  return pc.green(text);
}

export function warning(text: string): string {
  return pc.yellow(text);
}

export function danger(text: string): string {
  return pc.red(text);
}

export function info(text: string): string {
  return pc.cyan(text);
}

export function command(text: string): string {
  return pc.cyan(text);
}

export function pathText(text: string): string {
  return pc.dim(text);
}

export function provider(text: string): string {
  return pc.cyan(text);
}

export function skill(text: string): string {
  return pc.bold(text);
}

export function statusBadge(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (["eligible", "found", "success", "excellent", "good"].includes(normalized)) {
    return success(status);
  }
  if (normalized.includes("risk") || normalized.includes("warn") || normalized.includes("partial")) {
    return warning(status);
  }
  if (normalized.includes("block") || normalized.includes("error") || normalized.includes("missing")) {
    return danger(status);
  }
  return value(status);
}

export function riskBadge(riskPercent: number): string {
  const labelText = `${clampPercent(riskPercent)}%`;
  if (riskPercent <= 20) return success(labelText);
  if (riskPercent <= 40) return warning(labelText);
  return danger(labelText);
}

export function scoreBadge(scorePercent: number): string {
  const labelText = `${clampPercent(scorePercent)}%`;
  if (scorePercent >= 80) return success(labelText);
  if (scorePercent >= 60) return warning(labelText);
  return danger(labelText);
}

export function bullet(text: string): string {
  return `* ${text}`;
}

export function keyValue(key: string, val: string): string {
  return `${label(key)}: ${val}`;
}

export function dimList(values: string[], fallback = "none"): string {
  if (values.length === 0) return muted(fallback);
  return values.map((item) => info(item)).join(muted(", "));
}

export function wrap(text: string, width = Math.max(50, (process.stdout.columns ?? 80) - 2)): string[] {
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
      for (let index = 0; index < word.length; index += normalizedWidth) {
        lines.push(word.slice(index, index + normalizedWidth));
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

export function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function divider(width = Math.max(40, (process.stdout.columns ?? 80) - 2)): string {
  return subtle("-".repeat(Math.max(12, Math.floor(width))));
}

export function createSpinner(text: string, options: SpinnerOptions = {}): ReturnType<typeof ora> | null {
  if (options.enabled === false) return null;
  return ora(text).start();
}

export async function withSpinner<T>(
  text: string,
  task: () => Promise<T>,
  options: SpinnerOptions = {}
): Promise<T> {
  if (options.enabled === false) {
    return task();
  }

  const spinner = ora(text).start();
  try {
    const result = await task();
    spinner.succeed(options.successText ?? text);
    return result;
  } catch (error) {
    spinner.fail(options.failText ?? text);
    throw error;
  }
}

export function joinSegments(values: Array<string | undefined | null | false>): string {
  return values.filter((value): value is string => Boolean(value)).join(muted(" · "));
}

export function formatDateOnly(value: string | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export function formatLocalDateTime(value: string | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function relativePath(repoRoot: string, targetPath: string, options: { absolute?: boolean } = {}): string {
  if (options.absolute) {
    return path.resolve(targetPath);
  }
  const resolvedRepo = path.resolve(repoRoot);
  const resolvedTarget = path.resolve(repoRoot, targetPath);
  const relative = path.relative(resolvedRepo, resolvedTarget) || ".";
  return relative.startsWith("..") ? resolvedTarget : relative;
}

export function humanOutputEnabled(jsonMode: boolean): boolean {
  return jsonMode === false;
}

function clampPercent(value: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(100, normalized));
}
