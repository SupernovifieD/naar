import type { SecuritySignal, SecuritySignalEvidence } from "../types/index.js";

export interface SkillContentSecurityOptions {
  maxEvidencePerSignal?: number;
  maxExcerptLength?: number;
}

type ContentContext =
  | "plain_text"
  | "fenced_code"
  | "inline_code"
  | "html_comment"
  | "markdown_comment"
  | "frontmatter";

interface LineContext {
  context: ContentContext;
  fenceLanguage?: string;
}

interface SignalDefinition {
  id: string;
  severity: SecuritySignal["severity"];
  penalty: number;
  detail: string;
}

interface SignalMatch {
  signal: SignalDefinition;
  line: number;
  excerpt: string;
}

const DEFAULT_MAX_EVIDENCE_PER_SIGNAL = 3;
const DEFAULT_MAX_EXCERPT_LENGTH = 160;

const SAFE_CONTEXT_TERMS = [
  "do not",
  "don't",
  "avoid",
  "never",
  "should not",
  "warning",
  "danger",
  "bad example",
  "anti-pattern"
];

const IMPERATIVE_TERMS = [
  "run this command",
  "copy and run",
  "paste into terminal",
  "execute:",
  "run:",
  "execute",
  "run"
];

const MARKDOWN_COMMENT_RE = /^\s*\[\/\/\]:\s*#\s*\((.*?)\)\s*$/i;
const INLINE_CODE_RE = /`([^`]+)`/g;
const FENCE_RE = /^\s*```([A-Za-z0-9_-]+)?\s*$/;
const FRONTMATTER_DELIMITER_RE = /^\s*---\s*$/;
const SHELL_FENCE_LANGS = new Set(["bash", "sh", "zsh", "shell", "powershell", "ps1", "pwsh"]);

const SIGNALS: Record<string, SignalDefinition> = {
  remote_pipe_to_shell: {
    id: "remote_pipe_to_shell",
    severity: "critical",
    penalty: 100,
    detail: "Remote content piped directly into shell execution."
  },
  destructive_filesystem_command: {
    id: "destructive_filesystem_command",
    severity: "critical",
    penalty: 100,
    detail: "Destructive filesystem command detected."
  },
  credential_or_secret_exfiltration: {
    id: "credential_or_secret_exfiltration",
    severity: "critical",
    penalty: 100,
    detail: "Credential/secret exfiltration pattern detected."
  },
  reverse_shell_pattern: {
    id: "reverse_shell_pattern",
    severity: "critical",
    penalty: 100,
    detail: "Reverse shell or network shell pattern detected."
  },
  encoded_or_eval_execution: {
    id: "encoded_or_eval_execution",
    severity: "critical",
    penalty: 100,
    detail: "Encoded/eval execution pattern detected."
  },
  shell_command_in_markdown: {
    id: "shell_command_in_markdown",
    severity: "high",
    penalty: 50,
    detail: "Shell command found in markdown/comment/code content."
  },
  explicit_execution_instruction: {
    id: "explicit_execution_instruction",
    severity: "high",
    penalty: 40,
    detail: "Explicit instruction to execute shell command detected."
  },
  permission_change_instruction: {
    id: "permission_change_instruction",
    severity: "high",
    penalty: 35,
    detail: "Permission-changing shell instruction detected."
  },
  package_install_instruction: {
    id: "package_install_instruction",
    severity: "high",
    penalty: 30,
    detail: "Package installation instruction detected."
  },
  sensitive_path_write_or_access: {
    id: "sensitive_path_write_or_access",
    severity: "high",
    penalty: 40,
    detail: "Sensitive path access/write reference detected."
  },
  network_download_reference: {
    id: "network_download_reference",
    severity: "medium",
    penalty: 20,
    detail: "Network download command/reference detected."
  },
  secret_or_env_access_reference: {
    id: "secret_or_env_access_reference",
    severity: "medium",
    penalty: 20,
    detail: "Secret/environment-variable access reference detected."
  },
  background_process_instruction: {
    id: "background_process_instruction",
    severity: "medium",
    penalty: 30,
    detail: "Background-process/daemonization instruction detected."
  }
};

export function analyzeSkillContent(
  files: Record<string, string>,
  options: SkillContentSecurityOptions = {}
): SecuritySignal[] {
  const maxEvidencePerSignal = normalizePositiveInt(options.maxEvidencePerSignal, DEFAULT_MAX_EVIDENCE_PER_SIGNAL);
  const maxExcerptLength = normalizePositiveInt(options.maxExcerptLength, DEFAULT_MAX_EXCERPT_LENGTH);
  const aggregated = new Map<string, SecuritySignal>();

  const paths = Object.keys(files).sort((left, right) => left.localeCompare(right));
  for (const filePath of paths) {
    const content = files[filePath];
    if (typeof content !== "string" || content.length === 0) continue;
    analyzeFile(filePath, content, aggregated, {
      maxEvidencePerSignal,
      maxExcerptLength
    });
  }

  return [...aggregated.values()].sort(compareSignals);
}

function analyzeFile(
  filePath: string,
  content: string,
  aggregated: Map<string, SecuritySignal>,
  options: { maxEvidencePerSignal: number; maxExcerptLength: number }
): void {
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceLanguage: string | undefined;
  let inHtmlComment = false;
  let inFrontmatter = lines.length > 0 && FRONTMATTER_DELIMITER_RE.test(lines[0]);
  let frontmatterCompleted = !inFrontmatter;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const lowerLine = line.toLowerCase();
    const prevLine = index > 0 ? lines[index - 1].toLowerCase() : "";
    const nextLine = index + 1 < lines.length ? lines[index + 1].toLowerCase() : "";

    if (inFrontmatter) {
      if (index > 0 && FRONTMATTER_DELIMITER_RE.test(line)) {
        inFrontmatter = false;
        frontmatterCompleted = true;
      } else {
        const match = analyzeLineSignals(line, lowerLine, prevLine, nextLine, {
          context: "frontmatter"
        });
        flushMatches(aggregated, filePath, match, lineNumber, options.maxEvidencePerSignal, options.maxExcerptLength);
      }
      continue;
    }

    if (!frontmatterCompleted && FRONTMATTER_DELIMITER_RE.test(line)) {
      frontmatterCompleted = true;
      continue;
    }

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLanguage = (fenceMatch[1] ?? "").toLowerCase();
      } else {
        inFence = false;
        fenceLanguage = undefined;
      }
      continue;
    }

    let context: LineContext = { context: "plain_text" };
    if (inFence) {
      context = {
        context: "fenced_code",
        fenceLanguage
      };
    } else if (inHtmlComment || line.includes("<!--")) {
      context = { context: "html_comment" };
    } else if (MARKDOWN_COMMENT_RE.test(line)) {
      context = { context: "markdown_comment" };
    }

    if (!inHtmlComment && line.includes("<!--") && !line.includes("-->")) {
      inHtmlComment = true;
    } else if (inHtmlComment && line.includes("-->")) {
      inHtmlComment = false;
    }

    const match = analyzeLineSignals(line, lowerLine, prevLine, nextLine, context);
    flushMatches(aggregated, filePath, match, lineNumber, options.maxEvidencePerSignal, options.maxExcerptLength);

    const inlineMatches = [...line.matchAll(INLINE_CODE_RE)];
    for (const inlineMatch of inlineMatches) {
      const inline = inlineMatch[1];
      if (!inline?.trim()) continue;
      const inlineLower = inline.toLowerCase();
      const inlineSignalMatches = analyzeLineSignals(inline, inlineLower, prevLine, nextLine, {
        context: "inline_code"
      });
      flushMatches(
        aggregated,
        filePath,
        inlineSignalMatches,
        lineNumber,
        options.maxEvidencePerSignal,
        options.maxExcerptLength
      );
    }
  }
}

function analyzeLineSignals(
  line: string,
  lowerLine: string,
  prevLine: string,
  nextLine: string,
  context: LineContext
): SignalMatch[] {
  const matches: SignalMatch[] = [];
  const window = `${prevLine} ${lowerLine} ${nextLine}`;
  const hasNegation = SAFE_CONTEXT_TERMS.some((term) => window.includes(term));
  const imperative = hasImperativeInstruction(lowerLine);
  const suppressDanger = hasNegation && !imperative;

  if (remotePipeToShell(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.remote_pipe_to_shell, line));
  }
  if (destructiveFilesystemCommand(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.destructive_filesystem_command, line));
  }
  if (credentialExfiltration(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.credential_or_secret_exfiltration, line));
  }
  if (reverseShellPattern(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.reverse_shell_pattern, line));
  }
  if (encodedOrEvalExecution(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.encoded_or_eval_execution, line));
  }

  const shellLike = shellCommandLike(line);
  const shellContext =
    context.context === "fenced_code" && context.fenceLanguage && SHELL_FENCE_LANGS.has(context.fenceLanguage);
  if (shellLike && (shellContext || context.context === "html_comment" || context.context === "markdown_comment" || context.context === "inline_code")) {
    if (!suppressDanger) {
      matches.push(matchSignal(SIGNALS.shell_command_in_markdown, line));
    }
  }

  if (explicitExecutionInstruction(lowerLine, nextLine) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.explicit_execution_instruction, line));
  }
  if (permissionChangeInstruction(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.permission_change_instruction, line));
  }
  if (packageInstallInstruction(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.package_install_instruction, line));
  }
  if (sensitivePathAccess(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.sensitive_path_write_or_access, line));
  }
  if (networkDownloadReference(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.network_download_reference, line));
  }
  if (secretOrEnvAccessReference(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.secret_or_env_access_reference, line));
  }
  if (backgroundProcessInstruction(line) && !suppressDanger) {
    matches.push(matchSignal(SIGNALS.background_process_instruction, line));
  }

  return dedupeMatches(matches);
}

function flushMatches(
  aggregated: Map<string, SecuritySignal>,
  path: string,
  matches: SignalMatch[],
  line: number,
  maxEvidencePerSignal: number,
  maxExcerptLength: number
): void {
  for (const match of matches) {
    addSignalEvidence(
      aggregated,
      match.signal,
      {
        path,
        line,
        excerpt: sanitizeExcerpt(match.excerpt, maxExcerptLength)
      },
      maxEvidencePerSignal
    );
  }
}

function addSignalEvidence(
  aggregated: Map<string, SecuritySignal>,
  signal: SignalDefinition,
  evidence: SecuritySignalEvidence,
  maxEvidencePerSignal: number
): void {
  const existing = aggregated.get(signal.id);
  if (!existing) {
    aggregated.set(signal.id, {
      id: signal.id,
      severity: signal.severity,
      detail: signal.detail,
      penalty: signal.penalty,
      evidence: [evidence]
    });
    return;
  }

  const nextEvidence = existing.evidence ? [...existing.evidence] : [];
  const duplicate = nextEvidence.some((item) =>
    item.path === evidence.path
    && item.line === evidence.line
    && item.excerpt === evidence.excerpt
  );
  if (!duplicate && nextEvidence.length < maxEvidencePerSignal) {
    nextEvidence.push(evidence);
  }

  existing.evidence = nextEvidence;
}

function matchSignal(signal: SignalDefinition, excerpt: string): SignalMatch {
  return { signal, line: 0, excerpt };
}

function compareSignals(left: SecuritySignal, right: SecuritySignal): number {
  return severityRank(right.severity) - severityRank(left.severity)
    || right.penalty - left.penalty
    || left.id.localeCompare(right.id);
}

function severityRank(value: SecuritySignal["severity"]): number {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function sanitizeExcerpt(input: string, maxLength: number): string {
  const compact = input.replace(/\s+/g, " ").trim();
  const clipped = compact.length > maxLength ? `${compact.slice(0, Math.max(0, maxLength - 1))}…` : compact;
  return clipped
    .replace(/(api[_ -]?key|token|secret|password)\s*[:=]\s*["']?([A-Za-z0-9_\-.]+)/gi, "$1=<redacted>")
    .replace(/sk-[A-Za-z0-9]{10,}/g, "<redacted>");
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function dedupeMatches(matches: SignalMatch[]): SignalMatch[] {
  const seen = new Set<string>();
  const deduped: SignalMatch[] = [];
  for (const match of matches) {
    const key = `${match.signal.id}:${match.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

function hasImperativeInstruction(line: string): boolean {
  if (/\b(do not run|don't run|avoid running|never run)\b/i.test(line)) {
    return false;
  }
  return IMPERATIVE_TERMS.some((term) => line.includes(term));
}

function remotePipeToShell(line: string): boolean {
  return /\b(curl|wget)\b[^\n|]{0,220}\|\s*(bash|sh|zsh)\b/i.test(line)
    || /\b(irm|iwr|invoke-webrequest)\b[^\n|]{0,220}\|\s*iex\b/i.test(line);
}

function destructiveFilesystemCommand(line: string): boolean {
  return /\brm\s+-rf\s+(\/|~|~\/\.ssh|\$HOME|"\$HOME")\b/i.test(line)
    || /\bdel\s+\/s\s+\/q\s+[a-z]:\\/i.test(line)
    || /\bremove-item\b[^\n]*-recurse[^\n]*-force[^\n]*\$home\b/i.test(line);
}

function credentialExfiltration(line: string): boolean {
  const hasSensitiveRead = /\b(cat\s+~\/\.ssh\/id_rsa|cat\s+~\/\.env|printenv\b|env\b)\b/i.test(line)
    || /\$\(\s*cat\s+~\/\.env\s*\)/i.test(line);
  const hasExfilTarget = /\b(curl|wget)\b/i.test(line);
  return hasSensitiveRead && hasExfilTarget;
}

function reverseShellPattern(line: string): boolean {
  return /\bnc\s+-e\s+\/bin\/sh\b/i.test(line)
    || /\/dev\/tcp\/[^\s/]+\/\d+/i.test(line)
    || /\bpython\s+-c\b[^\n]*(socket|pty)/i.test(line);
}

function encodedOrEvalExecution(line: string): boolean {
  return /\bbase64\s+-d\b[^\n|]{0,220}\|\s*(bash|sh|zsh)\b/i.test(line)
    || /\beval\s*\(\s*atob\s*\(/i.test(line)
    || /\bpowershell(?:\.exe)?\s+-enc\b/i.test(line)
    || /\bpython\s+-c\b[^\n]*\bexec\s*\(/i.test(line)
    || /\bnode\s+-e\b[^\n]*\beval\s*\(/i.test(line);
}

function explicitExecutionInstruction(line: string, nextLine: string): boolean {
  const instruction = /\b(run this command|execute|copy and run|paste into terminal|run:|execute:)\b/i.test(line);
  if (!instruction) return false;
  return shellCommandLike(line) || shellCommandLike(nextLine);
}

function permissionChangeInstruction(line: string): boolean {
  return /\b(chmod\s+\+x|sudo\s+chmod|chown\b)\b/i.test(line);
}

function packageInstallInstruction(line: string): boolean {
  return /\b(npm\s+(install|i)\b|pnpm\s+add\b|yarn\s+add\b|pip\s+install\b|uv\s+pip\s+install\b|brew\s+install\b|apt(?:-get)?\s+install\b)\b/i.test(line);
}

function sensitivePathAccess(line: string): boolean {
  return /(\/etc\/|~\/\.ssh|~\/\.bashrc|~\/\.zshrc|\$home\/\.config)/i.test(line);
}

function networkDownloadReference(line: string): boolean {
  return /\b(curl|wget|invoke-webrequest|iwr|irm)\b[^\n]*(https?:\/\/|www\.)/i.test(line)
    || /\bfetch\s*\(\s*["']https?:\/\//i.test(line);
}

function secretOrEnvAccessReference(line: string): boolean {
  return /\b(process\.env|os\.environ)\b/i.test(line)
    || /\$[A-Z_]*(API_KEY|TOKEN|SECRET)[A-Z_]*/.test(line)
    || /\.env\b/i.test(line);
}

function backgroundProcessInstruction(line: string): boolean {
  return /\b(nohup|disown)\b/i.test(line)
    || /&>\/dev\/null\s*&/.test(line)
    || /\bstart-process\b[^\n]*-windowstyle\s+hidden\b/i.test(line);
}

function shellCommandLike(line: string): boolean {
  return /\b(curl|wget|bash|sh|zsh|powershell|pwsh|chmod|chown|rm\s+-rf|npm|pnpm|yarn|pip|uv|brew|apt(?:-get)?|python\s+-c|node\s+-e)\b/i.test(line);
}
