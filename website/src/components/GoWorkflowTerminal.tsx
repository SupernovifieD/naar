import { useEffect, useMemo, useRef, useState } from "react";

interface GoWorkflowTerminalProps {
  version: string;
}

type LineTone = "default" | "muted" | "section" | "success" | "loading" | "install";

interface TerminalLineData {
  text: string;
  tone?: LineTone;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TYPING_MS = 95;
const STEP_PAUSE_MS = 550;
const LONG_PAUSE_MS = 900;
const SPINNER_STEP_MS = 90;
const MIN_SPINNER_DURATION_MS = 950;

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

      await pushLine({ text: `Naar v${version}` }, LONG_PAUSE_MS);
      if (!isCurrentRun(runIdRef, currentRun)) return;
      await pushLine({ text: "Repo: ~/my-project", tone: "muted" });
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[1/5] Scan", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Scanning repository", "Repository scanned");
      await pushLine({ text: "Stack: TypeScript, npm, vitest, github-actions" });
      await pushLine({ text: "Assistants: codex found · agents-md found" });
      await pushLine({ text: "Readiness: 90% Excellent" });
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[2/5] Providers", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Fetching providers", "Providers fetched");
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[3/5] Recommendations", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Ranking skills", "Ranked skills");
      await pushLine({ text: "1) vitest-testing [clawhub]" });
      await pushLine({ text: "Match: 75%   Pre-fetch risk: 0%   Status: PRELIMINARILY ELIGIBLE" });
      await pushLine({ text: "Why: Matched repo need: vitest_testing" });
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[4/5] Selection", tone: "section" }, 280);
      await pushLine({ text: "✔ Skill selected: vitest-testing", tone: "success" });
      await pushLine({ text: "✔ Target selected: codex_repo_skills", tone: "success" });
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "[5/5] Install", tone: "section" }, 280);
      await runSpinnerLine(draft, setLines, runIdRef, currentRun, "Building install plan", "Install plan ready");
      await pushLine({ text: "+ .naar/skills/vitest-testing/SKILL.md", tone: "install" });
      await pushLine({ text: "+ .agents/skills/vitest-testing/SKILL.md", tone: "install" });
      await pushLine({ text: "" }, 180);
      await pushLine({ text: "Summary: 2 write · 0 update · 0 blocked" });

      if (!isCurrentRun(runIdRef, currentRun)) return;
      setShowFinalPrompt(true);
    };

    void run();
    return undefined;
  }, [finalLines, inView, reducedMotion, version]);

  return (
    <div ref={rootRef} className="flex h-[26.25rem] flex-col sm:h-[26.25rem] lg:h-[28.75rem]">
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

  const toneClass = {
    default: "text-text",
    muted: "text-text-muted",
    section: "font-semibold text-text",
    success: "text-success",
    loading: "text-cyan-300",
    install: "text-success"
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
  draft.push({ text: `${SPINNER_FRAMES[frameIndex]} ${label}`, tone: "loading" });
  setLines([...draft]);

  while (performance.now() - startedAt < MIN_SPINNER_DURATION_MS) {
    if (!isCurrentRun(runIdRef, currentRun)) return;
    await wait(SPINNER_STEP_MS);
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    draft[draft.length - 1] = { text: `${SPINNER_FRAMES[frameIndex]} ${label}`, tone: "loading" };
    setLines([...draft]);
  }

  draft[draft.length - 1] = { text: `✔ ${successText}`, tone: "success" };
  setLines([...draft]);
  await wait(LONG_PAUSE_MS);
}

function buildFinalLines(version: string): TerminalLineData[] {
  return [
    { text: `Naar v${version}` },
    { text: "Repo: ~/my-project", tone: "muted" },
    { text: "" },
    { text: "[1/5] Scan", tone: "section" },
    { text: "✔ Repository scanned", tone: "success" },
    { text: "Stack: TypeScript, npm, vitest, github-actions" },
    { text: "Assistants: codex found · agents-md found" },
    { text: "Readiness: 90% Excellent" },
    { text: "" },
    { text: "[2/5] Providers", tone: "section" },
    { text: "✔ Providers fetched", tone: "success" },
    { text: "" },
    { text: "[3/5] Recommendations", tone: "section" },
    { text: "✔ Ranked skills", tone: "success" },
    { text: "1) vitest-testing [clawhub]" },
    { text: "Match: 75%   Pre-fetch risk: 0%   Status: PRELIMINARILY ELIGIBLE" },
    { text: "Why: Matched repo need: vitest_testing" },
    { text: "" },
    { text: "[4/5] Selection", tone: "section" },
    { text: "✔ Skill selected: vitest-testing", tone: "success" },
    { text: "✔ Target selected: codex_repo_skills", tone: "success" },
    { text: "" },
    { text: "[5/5] Install", tone: "section" },
    { text: "✔ Install plan ready", tone: "success" },
    { text: "+ .naar/skills/vitest-testing/SKILL.md", tone: "install" },
    { text: "+ .agents/skills/vitest-testing/SKILL.md", tone: "install" },
    { text: "" },
    { text: "Summary: 2 write · 0 update · 0 blocked" }
  ];
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
