import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const COMMANDS = [
  "naar search ui",
  "naar go",
  "naar recommend --compact",
  "naar install clawhub:vitest-testing --dry-run",
  "naar targets list",
  "naar history",
  "naar scan --json",
  "naar list"
] as const;

const BASE_COMMAND = "naar";
const TYPE_MS = 70;
const DELETE_MS = 46;
const HOLD_MS = 1300;

export default function CommandTypingTerminal() {
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [command, setCommand] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef(0);
  const commandRef = useRef("");

  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);

    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    runIdRef.current += 1;
    const currentRun = runIdRef.current;

    if (!inView) {
      setCommand("");
      commandRef.current = "";
      return undefined;
    }

    if (reducedMotion) {
      setCommand("naar go");
      commandRef.current = "naar go";
      return undefined;
    }

    const loop = async () => {
      setCommand("");
      commandRef.current = "";
      await typeTo(COMMANDS[0], setCommand, commandRef, currentRun, runIdRef);
      while (isCurrentRun(runIdRef, currentRun)) {
        for (let index = 0; index < COMMANDS.length; index += 1) {
          if (index === 0) {
            await wait(HOLD_MS);
          } else {
            await deleteTo(BASE_COMMAND, setCommand, commandRef, currentRun, runIdRef);
            await typeTo(COMMANDS[index].slice(BASE_COMMAND.length), setCommand, commandRef, currentRun, runIdRef, true);
            await wait(HOLD_MS);
          }

          if (index === COMMANDS.length - 1) {
            await deleteTo(BASE_COMMAND, setCommand, commandRef, currentRun, runIdRef);
            await typeTo(COMMANDS[0].slice(BASE_COMMAND.length), setCommand, commandRef, currentRun, runIdRef, true);
          }
        }
      }
    };

    void loop();
    return undefined;
  }, [inView, reducedMotion]);

  return (
    <div ref={rootRef} className="flex h-[7.25rem] items-center px-5 py-5 sm:h-[7.75rem]">
      <div className="terminal-line w-full text-base sm:text-lg">
        <span className="terminal-prompt">➜</span>
        <span className="text-text-soft">~</span>
        <span className="terminal-command">{command}</span>
        <span className="terminal-cursor" aria-hidden="true" />
      </div>
    </div>
  );
}

async function typeTo(
  nextValue: string,
  setCommand: Dispatch<SetStateAction<string>>,
  commandRef: { current: string },
  currentRun: number,
  runIdRef: { current: number },
  append = false
): Promise<void> {
  const prefix = append ? BASE_COMMAND : "";
  const value = append ? `${prefix}${nextValue}` : nextValue;
  const start = append ? prefix.length : 0;

  for (let index = start; index < value.length; index += 1) {
    if (!isCurrentRun(runIdRef, currentRun)) return;
    const nextCommand = value.slice(0, index + 1);
    commandRef.current = nextCommand;
    setCommand(nextCommand);
    await wait(TYPE_MS);
  }
}

async function deleteTo(
  target: string,
  setCommand: Dispatch<SetStateAction<string>>,
  commandRef: { current: string },
  currentRun: number,
  runIdRef: { current: number }
): Promise<void> {
  const current = commandRef.current;

  for (let index = current.length; index > target.length; index -= 1) {
    if (!isCurrentRun(runIdRef, currentRun)) return;
    const nextCommand = current.slice(0, index - 1);
    commandRef.current = nextCommand;
    setCommand(nextCommand);
    await wait(DELETE_MS);
  }
}

function isCurrentRun(runIdRef: { current: number }, currentRun: number): boolean {
  return runIdRef.current === currentRun;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
