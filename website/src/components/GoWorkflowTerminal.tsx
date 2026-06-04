import { Fragment, useEffect, useMemo, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_DURATIONS_MS = [1100, 1200, 1500, 1600, 1200, 1600, 2600];

interface GoWorkflowTerminalProps {
  version: string;
}

export default function GoWorkflowTerminal({ version }: GoWorkflowTerminalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(reducedMotion ? FRAME_DURATIONS_MS.length - 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      setFrameIndex(FRAME_DURATIONS_MS.length - 1);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSpinnerIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, 90);

    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setFrameIndex((current) => (current + 1) % FRAME_DURATIONS_MS.length);
    }, FRAME_DURATIONS_MS[frameIndex] ?? 1400);

    return () => window.clearTimeout(timeout);
  }, [frameIndex, reducedMotion]);

  const spinner = SPINNER_FRAMES[spinnerIndex];
  const frames = useMemo(() => buildFrames(version, spinner), [spinner, version]);

  return <div className="font-mono text-[0.92rem] leading-7 text-text">{frames[frameIndex]}</div>;
}

function buildFrames(version: string, spinner: string) {
  return [
    <Fragment key="scan">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <ActiveLine spinner={spinner} text="Scanning repository" />
    </Fragment>,
    <Fragment key="providers">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <ActiveLine spinner={spinner} text="Fetching providers" />
    </Fragment>,
    <Fragment key="recommendations-loading">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <SuccessLine text="Providers fetched" />
      <BlankLine />
      <SectionLine text="[3/5] Recommendations" />
      <ActiveLine spinner={spinner} text="Ranking skills" />
    </Fragment>,
    <Fragment key="recommendations-ready">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <SuccessLine text="Providers fetched" />
      <BlankLine />
      <SectionLine text="[3/5] Recommendations" />
      <SuccessLine text="Ranked skills" />
      <MutedLine text="Showing top 5 of 10" />
      <BlankLine />
      <SkillTitleLine index="1." name="vitest-testing" provider="clawhub" />
      <LabelValueLine label="Match" value="75% · Risk 0% · Status PRELIMINARILY ELIGIBLE" />
      <LabelValueLine label="Why" value="Matched repo need: vitest_testing (strong)" />
      <InstallLine command="naar install clawhub:vitest-testing" />
    </Fragment>,
    <Fragment key="selection">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <SuccessLine text="Providers fetched" />
      <BlankLine />
      <SectionLine text="[3/5] Recommendations" />
      <SuccessLine text="Ranked skills" />
      <MutedLine text="Showing top 5 of 10" />
      <BlankLine />
      <SkillTitleLine index="1." name="vitest-testing" provider="clawhub" />
      <LabelValueLine label="Match" value="75% · Risk 0% · Status PRELIMINARILY ELIGIBLE" />
      <LabelValueLine label="Why" value="Matched repo need: vitest_testing (strong)" />
      <InstallLine command="naar install clawhub:vitest-testing" />
      <BlankLine />
      <SectionLine text="[4/5] Selection" />
      <MutedLine text="Review skills before installing." />
    </Fragment>,
    <Fragment key="installing">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <SuccessLine text="Providers fetched" />
      <BlankLine />
      <SectionLine text="[3/5] Recommendations" />
      <SuccessLine text="Ranked skills" />
      <MutedLine text="Showing top 5 of 10" />
      <BlankLine />
      <SectionLine text="[4/5] Selection" />
      <MutedLine text="Review skills before installing." />
      <BlankLine />
      <SectionLine text="[5/5] Install" />
      <ActiveLine spinner={spinner} text="Building install plan" />
    </Fragment>,
    <Fragment key="complete">
      <TitleLine text={`Naar v${version}`} />
      <MutedLine text="Repo: ~/my-project" />
      <BlankLine />
      <SectionLine text="[1/5] Scan" />
      <SuccessLine text="Repository scanned" />
      <LabelValueLine label="Stack" value="TypeScript, JavaScript · npm · vitest · github-actions" />
      <LabelValueLine label="Assistants" value="codex found · agents-md found" />
      <LabelValueLine label="Readiness" value="90% Excellent" valueTone="success" />
      <BlankLine />
      <SectionLine text="[2/5] Providers" />
      <SuccessLine text="Providers fetched" />
      <BlankLine />
      <SectionLine text="[3/5] Recommendations" />
      <SuccessLine text="Ranked skills" />
      <MutedLine text="Showing top 5 of 10" />
      <BlankLine />
      <SkillTitleLine index="1." name="vitest-testing" provider="clawhub" />
      <LabelValueLine label="Match" value="75% · Risk 0% · Status PRELIMINARILY ELIGIBLE" />
      <LabelValueLine label="Why" value="Matched repo need: vitest_testing (strong)" />
      <InstallLine command="naar install clawhub:vitest-testing" />
      <BlankLine />
      <SectionLine text="[4/5] Selection" />
      <MutedLine text="Review skills before installing." />
      <BlankLine />
      <SectionLine text="[5/5] Install" />
      <SuccessLine text="Install plan ready" />
      <InstallLine command="+ .naar/skills/story-setup/SKILL.md" prefixTone="success" />
      <InstallLine command="+ .agents/skills/story-setup/SKILL.md" prefixTone="success" />
      <BlankLine />
      <LabelValueLine label="Summary" value="2 write · 0 update · 0 blocked" />
    </Fragment>
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

function BlankLine() {
  return <div aria-hidden="true">&nbsp;</div>;
}

function TitleLine({ text }: { text: string }) {
  return <p className="font-semibold text-text">{text}</p>;
}

function MutedLine({ text }: { text: string }) {
  return <p className="text-text-muted">{text}</p>;
}

function SectionLine({ text }: { text: string }) {
  return <p className="font-semibold text-text">{text}</p>;
}

function SuccessLine({ text }: { text: string }) {
  return <p><span className="text-success">✔</span> {text}</p>;
}

function ActiveLine({ spinner, text }: { spinner: string; text: string }) {
  return <p><span className="text-cyan-300">{spinner}</span> {text}</p>;
}

function LabelValueLine({
  label,
  value,
  valueTone
}: {
  label: string;
  value: string;
  valueTone?: "default" | "success";
}) {
  return (
    <p>
      <span className="text-blue-300">{label}</span>
      <span className="text-text-muted">: </span>
      <span className={valueTone === "success" ? "text-success" : "text-text"}>{value}</span>
    </p>
  );
}

function SkillTitleLine({ index, name, provider }: { index: string; name: string; provider: string }) {
  return (
    <p>
      <span className="font-semibold text-text">{index} {name}</span>{" "}
      <span className="text-cyan-300">[{provider}]</span>
    </p>
  );
}

function InstallLine({
  command,
  prefixTone = "default"
}: {
  command: string;
  prefixTone?: "default" | "success";
}) {
  if (prefixTone === "success") {
    return <p className="text-success">{command}</p>;
  }

  return (
    <p>
      <span className="text-blue-300">Install</span>
      <span className="text-text-muted">: </span>
      <span className="text-cyan-300">{command}</span>
    </p>
  );
}
