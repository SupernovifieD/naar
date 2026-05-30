import pc from "picocolors";
import type { RepoFinding } from "../types/index.js";

interface ColorValueOptions {
  percent?: boolean;
}

export function colorScore(score: number, options: ColorValueOptions = {}): string {
  const label = formatValue(score, options.percent === true);
  if (score >= 80) return pc.green(label);
  if (score >= 60) return pc.yellow(label);
  return pc.red(label);
}

export function colorRisk(score: number, options: ColorValueOptions = {}): string {
  const label = formatValue(score, options.percent === true);
  if (score >= 80) return pc.green(label);
  if (score >= 60) return pc.yellow(label);
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

function formatValue(value: number, asPercent: boolean): string {
  if (!asPercent) {
    return String(value);
  }

  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  const clamped = Math.max(0, Math.min(100, normalized));
  return `${clamped}%`;
}
