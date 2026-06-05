import { useEffect, useMemo, useRef, useState } from "react";

interface GoWorkflowTerminalProps {
  version: string;
}

type LineTone = "default" | "muted" | "section" | "loading" | "install";
type LinePartTone = "default" | "muted" | "label" | "command" | "success" | "warning" | "danger" | "info";

interface TerminalLineData {
  text: string;
  tone?: LineTone;
  parts?: LinePart[];
}

interface LinePart {
  text: string;
  tone?: LinePartTone;
  strong?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TYPING_MS = 112;
const STEP_PAUSE_MS = 680;
const LONG_PAUSE_MS = 1040;
const SPINNER_STEP_MS = 108;
const MIN_SPINNER_DURATION_MS = 1240;

export default function GoWorkflowTerminal({ version }: GoWorkflowTerminalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [inView, setInView] = useState(false);
  const [typedCommand, setTypedCommand] = useState("");
  const [lines, setLines] = useState<TerminalLineData[]>([]);
  const [showTypingCursor, setShowTypingCursor] = useState(false);
  const [showFinalPrompt, setShowFinalPrompt] = useState(false);
  const runIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const finalLines = useMemo(() => buildFinalLines(version), [version]);

  useEffect(() => {
    const target = rootRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
    }, { threshold: 0.4 });

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scrollNode = scrollRef.current;
    if (!scrollNode) return;
    scrollNode.scrollTop = scrollNode.scrollHeight;
  }, [lines, showFinalPrompt, typedCommand]);

  useEffect(() => {
    runIdRef.current += 1;
    const currentRun = runIdRef.current;

    if (!inView) {
      setTypedCommand("");
      setLines([]);
      setShowTypingCursor(false);
      setShowFinalPrompt(false);
      return undefined;
    }

    if (reducedMotion) {
      setTypedCommand("naar go");
      setLines(finalLines);
      setShowTypingCursor(false);
      setShowFinalPrompt(true);
      return undefined;
    }

    const run = async () => {
      setTypedCommand("");
      setLines([]);
      setShowFinalPrompt(false);
      setShowTypingCursor(true);

      for (const char of "naar go") {
        if (!isCurrentRun(runIdRef, currentRun)) return;
        setTypedCommand((current) => current + char);
        await wait(TYPING_MS);
      }

      if (!isCurrentRun(runIdRef, currentRun)) return;
      await wait(STEP_PAUSE_MS);
      setShowTypingCursor(false);

      const draft: TerminalLineData[] = [];

      const pushLine = async (line: TerminalLineData, delay = STEP_PAUSE_MS) => {
        draft.push(line);
        setLines([...draft]);
        await wait(delay);
      };

      await pushLine(versionLine(version), LONG_PAUSE_MS);
      if (!isCurrentRun(runIdRef, currentRun)) return;
      await pushLine(repoLine("Repo", "~/my-project"));
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[1/5] Scan", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Scanning repository", "Repository scanned");
      await pushLine(keyValueLine("Stack", [{ text: "TypeScript, npm, vitest, github-actions" }]));
      await pushLine(assistantsLine());
      await pushLine(readinessLine());
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[2/5] Providers", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Fetching providers", "Providers fetched");
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[3/5] Recommendations", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Ranking skills", "Ranked skills");
      await pushLine(recommendationHeadingLine());
      await pushLine(recommendationMetaLine());
      await pushLine(whyLine());
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[4/5] Selection", tone: "section" }, 280);
      await pushLine(selectionLine("Skill selected", "vitest-testing"));
      await pushLine(selectionLine("Target selected", "codex_repo_skills"));
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[5/5] Install", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Building install plan", "Install plan ready");
      await pushLine(installPathLine(".naar/skills/vitest-testing/SKILL.md"));
      await pushLine(installPathLine(".agents/skills/vitest-testing/SKILL.md"));
      await pushLine({ text: "" }, 180);
      await pushLine(summaryLine());

      if (!isCurrentRun(runIdRef, currentRun)) return;
      setShowFinalPrompt(true);
    };

    void run();
    return undefined;
  }, [finalLines, inView, reducedMotion, version]);

  return (
    <div ref={rootRef} className="flex h-[26.25rem] flex-col lg:h-[27.125rem]">
      <div ref={scrollRef} className="terminal-scroll flex-1 min-h-0 px-5 py-5">
        <PromptLine command={typedCommand} cursor={showTypingCursor} />
        {lines.map((line, index) => (
          <OutputLine key={`${index}:${line.text}`} line={line} />
        ))}
        {showFinalPrompt ? <PromptLine command="" cursor /> : null}
      </div>
    </div>
  );
}

function OutputLine({ line }: { line: TerminalLineData }) {
  if (!line.text) {
    return <div aria-hidden="true" className="h-2" />;
  }

  if (line.parts) {
    return (
      <p className="whitespace-pre-wrap break-words leading-7 text-text">
        {line.parts.map((part, index) => (
          <span
            key={`${index}:${part.text}`}
            className={[
              partToneClass(part.tone),
              part.strong ? "font-semibold" : ""
            ].filter(Boolean).join(" ")}
          >
            {part.text}
          </span>
        ))}
      </p>
    );
  }

  const toneClass = {
    default: "text-text",
    muted: "text-text-muted",
    section: "font-semibold text-text",
    loading: "text-text",
    install: "text-text"
  }[line.tone ?? "default"];

  return <p className={`terminal-line ${toneClass}`}>{line.text}</p>;
}

function PromptLine({ command, cursor }: { command: string; cursor: boolean }) {
  return (
    <p className="terminal-line mb-2">
      <span className="terminal-prompt">➜</span>
      <span className="text-text-soft">~</span>
      <span className="terminal-command">{command}</span>
      {cursor ? <span className="terminal-cursor" aria-hidden="true" /> : null}
    </p>
  );
}

async function runSpinnerLine(
  draft: TerminalLineData[],
  setLines: (lines: TerminalLineData[]) => void,
  runIdRef: { current: number },
  currentRun: number,
  label: string,
  successText: string
): Promise<void> {
  const startedAt = performance.now();
  let frameIndex = 0;
  draft.push(spinnerLine(SPINNER_FRAMES[frameIndex], label));
  setLines([...draft]);

  while (performance.now() - startedAt < MIN_SPINNER_DURATION_MS) {
    if (!isCurrentRun(runIdRef, currentRun)) return;
    await wait(SPINNER_STEP_MS);
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    draft[draft.length - 1] = spinnerLine(SPINNER_FRAMES[frameIndex], label);
    setLines([...draft]);
  }

  draft[draft.length - 1] = successLine(successText);
  setLines([...draft]);
  await wait(LONG_PAUSE_MS);
}

function buildFinalLines(version: string): TerminalLineData[] {
  return [
    versionLine(version),
    repoLine("Repo", "~/my-project"),
    { text: "" },
    { text: "[1/5] Scan", tone: "section" },
    successLine("Repository scanned"),
    keyValueLine("Stack", [{ text: "TypeScript, npm, vitest, github-actions" }]),
    assistantsLine(),
    readinessLine(),
    { text: "" },
    { text: "[2/5] Providers", tone: "section" },
    successLine("Providers fetched"),
    { text: "" },
    { text: "[3/5] Recommendations", tone: "section" },
    successLine("Ranked skills"),
    recommendationHeadingLine(),
    recommendationMetaLine(),
    whyLine(),
    { text: "" },
    { text: "[4/5] Selection", tone: "section" },
    selectionLine("Skill selected", "vitest-testing"),
    selectionLine("Target selected", "codex_repo_skills"),
    { text: "" },
    { text: "[5/5] Install", tone: "section" },
    successLine("Install plan ready"),
    installPathLine(".naar/skills/vitest-testing/SKILL.md"),
    installPathLine(".agents/skills/vitest-testing/SKILL.md"),
    { text: "" },
    summaryLine()
  ];
}

function part(text: string, tone: LinePartTone = "default", strong = false): LinePart {
  return { text, tone, strong };
}

function partToneClass(tone: LinePartTone | undefined): string {
  switch (tone) {
    case "muted":
      return "text-text-soft";
    case "label":
      return "text-blue-300";
    case "command":
    case "info":
      return "text-cyan-300";
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-danger";
    default:
      return "text-text";
  }
}

function repoLine(label: string, value: string): TerminalLineData {
  return {
    text: `${label}: ${value}`,
    parts: [part(`${label}: `), part(value, "muted")]
  };
}

function versionLine(version: string): TerminalLineData {
  return {
    text: `Naar v${version}`,
    parts: [part("Naar", "default", true), part(` v${version}`)]
  };
}

function keyValueLine(label: string, valueParts: LinePart[]): TerminalLineData {
  return {
    text: `${label}: ${valueParts.map((segment) => segment.text).join("")}`,
    parts: [part(`${label}: `, "label"), ...valueParts]
  };
}

function spinnerLine(frame: string, label: string): TerminalLineData {
  return {
    text: `${frame} ${label}`,
    tone: "loading",
    parts: [part(`${frame} `, "info"), part(label)]
  };
}

function successLine(text: string): TerminalLineData {
  return {
    text: `✔ ${text}`,
    parts: [part("✔ ", "success"), part(text)]
  };
}

function assistantsLine(): TerminalLineData {
  return keyValueLine("Assistants", [
    part("codex "),
    part("found", "success"),
    part(" · ", "muted"),
    part("agents-md "),
    part("found", "success")
  ]);
}

function readinessLine(): TerminalLineData {
  return keyValueLine("Readiness", [
    part("90%", "success"),
    part(" ", "muted"),
    part("Excellent", "success")
  ]);
}

function recommendationHeadingLine(): TerminalLineData {
  return {
    text: "1) vitest-testing [clawhub]",
    parts: [
      part("1) ", "default", true),
      part("vitest-testing", "default", true),
      part(" ", "default"),
      part("[clawhub]", "info")
    ]
  };
}

function recommendationMetaLine(): TerminalLineData {
  return {
    text: "Match: 75%   Pre-fetch risk: 0%   Status: PRELIMINARILY ELIGIBLE",
    parts: [
      part("Match: ", "label"),
      part("75%", "warning"),
      part("   ", "muted"),
      part("Pre-fetch risk: ", "label"),
      part("0%", "success"),
      part("   ", "muted"),
      part("Status: ", "label"),
      part("PRELIMINARILY ELIGIBLE", "success")
    ]
  };
}

function whyLine(): TerminalLineData {
  return keyValueLine("Why", [part("Matched repo need: vitest_testing")]);
}

function selectionLine(label: string, value: string): TerminalLineData {
  return {
    text: `✔ ${label}: ${value}`,
    parts: [part("✔ ", "success"), part(`${label}: `, "label"), part(value, "command")]
  };
}

function installPathLine(path: string): TerminalLineData {
  return {
    text: `+ ${path}`,
    tone: "install",
    parts: [part("+ ", "success"), part(path, "muted")]
  };
}

function summaryLine(): TerminalLineData {
  return {
    text: "Summary: 2 write · 0 update · 0 blocked",
    parts: [
      part("Summary: ", "label"),
      part("2 write"),
      part(" · ", "muted"),
      part("0 update"),
      part(" · ", "muted"),
      part("0 blocked", "muted")
    ]
  };
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);

    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}

function isCurrentRun(runIdRef: { current: number }, currentRun: number): boolean {
  return runIdRef.current === currentRun;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
