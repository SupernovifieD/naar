import { useCallback, useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton";
import type { IndexedSkillRecord, SkillsIndexPayload } from "../data/skillsIndex";
import { formatLongDate } from "../lib/date";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MIN_SEARCH_SPINNER_MS = 720;

interface RankedSkill {
  skill: IndexedSkillRecord;
  score: number;
  exact: boolean;
}

interface SkillSearchTerminalProps {
  dataUrl: string;
}

interface SubmitEventLike {
  preventDefault(): void;
}

export default function SkillSearchTerminal({ dataUrl }: SkillSearchTerminalProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [skills, setSkills] = useState<IndexedSkillRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [results, setResults] = useState<RankedSkill[]>([]);
  const [focused, setFocused] = useState(false);
  const loadPromiseRef = useRef<Promise<IndexedSkillRecord[]> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsViewportRef = useRef<HTMLDivElement | null>(null);

  const loadIndex = useCallback(async (): Promise<IndexedSkillRecord[]> => {
    if (skills) return skills;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = fetch(dataUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load skills index (${response.status})`);
        }
        const payload = (await response.json()) as SkillsIndexPayload | IndexedSkillRecord[];
        const nextSkills = Array.isArray(payload) ? payload : payload.skills ?? [];
        setSkills(nextSkills);
        setLoadError(null);
        return nextSkills;
      })
      .catch(() => {
        setSkills([]);
        setLoadError("Local search index is unavailable right now.");
        return [];
      })
      .finally(() => {
        loadPromiseRef.current = null;
      });

    return loadPromiseRef.current;
  }, [dataUrl, skills]);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    if (!searching) {
      setSpinnerIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSpinnerIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => window.clearInterval(timer);
  }, [searching]);

  const handleSubmit = async (event: SubmitEventLike) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setSubmittedQuery(null);
      setResults([]);
      setSearching(false);
      if (resultsViewportRef.current) {
        resultsViewportRef.current.scrollTop = 0;
      }
      return;
    }

    setSubmittedQuery(nextQuery);
    setSearching(true);
    setResults([]);
    if (resultsViewportRef.current) {
      resultsViewportRef.current.scrollTop = 0;
    }

    const startedAt = window.performance.now();
    const [index] = await Promise.all([loadIndex()]);
    const rankedResults = rankSkills(index, nextQuery);
    const elapsed = window.performance.now() - startedAt;
    if (elapsed < MIN_SEARCH_SPINNER_MS) {
      await wait(MIN_SEARCH_SPINNER_MS - elapsed);
    }

    setResults(rankedResults);
    setSearching(false);
  };

  useEffect(() => {
    if (!submittedQuery || searching || !resultsViewportRef.current) return;
    resultsViewportRef.current.scrollTop = 0;
  }, [results, searching, submittedQuery]);

  const terminalExpanded = searching || submittedQuery !== null;
  const promptWidth = `${Math.max(query.length + 1, 2)}ch`;
  const rootHeight = terminalExpanded
    ? "h-[26.25rem] sm:h-[28.75rem] lg:h-[32.5rem]"
    : "h-[7.75rem] sm:h-[8.5rem]";
  const promptHelper = loadError
    ? <p className="text-warning">{loadError}</p>
    : (
        <>
          <p className="text-text-soft">Try: testing, github actions, next</p>
          <p className="text-text-soft">Press Enter to search.</p>
        </>
      );

  return (
    <div className={`flex flex-col overflow-hidden text-left transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${rootHeight}`}>
      <form onSubmit={handleSubmit} className="shrink-0 px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <label htmlFor="skill-search-input" className="sr-only">Search skills</label>
        <button type="submit" className="sr-only">Search</button>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="terminal-line items-center gap-3 cursor-text" onClick={() => inputRef.current?.focus()}>
            <span className="terminal-prompt">➜</span>
            <span className="text-text-soft">~</span>
            <span className="terminal-command shrink-0">naar search</span>
            <span className="inline-flex min-w-[1ch] items-center gap-0 text-text">
              <input
                id="skill-search-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                spellCheck={false}
                autoComplete="off"
                aria-label="Search skills"
                className="terminal-input max-w-full"
                style={{ width: promptWidth }}
              />
              {!focused && query.length === 0 ? <span className="terminal-cursor" aria-hidden="true" /> : null}
            </span>
          </p>

          {!terminalExpanded ? (
            <div className="mt-2 space-y-1 pl-[4.15rem] text-left text-sm">
              {promptHelper}
            </div>
          ) : null}
        </div>
      </form>

      {terminalExpanded ? (
        <div className="flex-1 min-h-0 border-t border-white/6 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <div ref={resultsViewportRef} className="terminal-scroll h-full pr-2">
            {loadError && !searching ? (
              <p className="text-sm text-warning">{loadError}</p>
            ) : null}

            {searching && submittedQuery ? (
              <div className="space-y-1 text-sm text-text-muted">
                <p className="terminal-line gap-3"><span className="text-cyan-300">{SPINNER_FRAMES[spinnerIndex]}</span><span>Searching for “{submittedQuery}”</span></p>
              </div>
            ) : null}

            {!searching && submittedQuery ? (
              <div className="space-y-4">
                <div className="space-y-1 text-sm">
                  <p className="text-success">✔ Search complete</p>
                  <p className="text-text-soft">Showing {results.length} result{results.length === 1 ? "" : "s"} for “{submittedQuery}”</p>
                </div>

                {results.length === 0 ? (
                  loadError ? null : <p className="text-sm text-text-soft">No matching skills found. Try testing, github actions, or next.</p>
                ) : (
                  <div className="space-y-5 pb-2">
                    {results.map(({ skill }, index) => (
                      <SearchResult key={skill.id} skill={skill} index={index} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchResult({
  skill,
  index
}: {
  skill: IndexedSkillRecord;
  index: number;
}) {
  const status = (skill.status ?? "eligible").toUpperCase();
  const statusClass = status === "BLOCKED"
    ? "text-danger"
    : status === "RISKY"
      ? "text-warning"
      : "text-success";

  return (
    <article className="space-y-2 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
      <p className="text-text">
        <span className="font-semibold text-text">{index + 1}) {skill.name}</span>{" "}
        <span className="text-cyan-300">[{skill.provider}]</span>
      </p>
      <p className="text-sm leading-6 text-text-muted">
        <span className="text-blue-300">Publisher</span>
        <span className="text-text-muted">: </span>
        <span className="text-text">{skill.publisher ?? skill.provider}</span>
        <span className="px-2 text-text-soft">·</span>
        <span className="text-blue-300">License</span>
        <span className="text-text-muted">: </span>
        <span className={skill.license ? "text-text" : "text-warning"}>{skill.license ?? "No license declared"}</span>
        <span className="px-2 text-text-soft">·</span>
        <span className="text-blue-300">Status</span>
        <span className="text-text-muted">: </span>
        <span className={statusClass}>{status}</span>
      </p>
      <p className="text-sm leading-6 text-text-muted">
        <span className="text-blue-300">Description</span>
        <span className="text-text-muted">: </span>
        <span>{skill.description}</span>
      </p>
      {skill.updatedAt ? (
        <p className="text-sm leading-6 text-text-muted">
          <span className="text-blue-300">Updated</span>
          <span className="text-text-muted">: </span>
          <span>{formatLongDate(skill.updatedAt)}</span>
        </p>
      ) : null}
      {skill.url ? (
        <p className="text-sm leading-6 text-text-muted">
          <span className="text-blue-300">Page</span>
          <span className="text-text-muted">: </span>
          <a
            href={skill.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-accent-gold underline decoration-white/10 underline-offset-4 transition-colors duration-200 ease-glide hover:text-text"
          >
            {skill.url}
          </a>
        </p>
      ) : null}
      <div className="space-y-1 text-sm leading-6 text-text-muted">
        <p>
          <span className="text-blue-300">Install</span>
          <span className="text-text-muted">:</span>
        </p>
        <div className="flex items-start gap-2 pl-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-cyan-300">
            {skill.npxCommand}
          </code>
          <CopyButton text={skill.npxCommand} label="Copy install command" iconOnly />
        </div>
      </div>
    </article>
  );
}

function rankSkills(skills: IndexedSkillRecord[], query: string): RankedSkill[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const tokens = tokenizeSearchText(normalizedQuery);

  return skills
    .map((skill) => scoreSkill(skill, normalizedQuery, tokens))
    .filter((result) => result.exact || result.score >= 18)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.exact !== right.exact) return left.exact ? -1 : 1;
      return left.skill.name.localeCompare(right.skill.name);
    });
}

function scoreSkill(skill: IndexedSkillRecord, normalizedQuery: string, tokens: string[]): RankedSkill {
  const haystacks = {
    name: normalizeSearchText(skill.name),
    id: normalizeSearchText(skill.id),
    installRef: normalizeSearchText(skill.installRef),
    description: normalizeSearchText(skill.description),
    provider: normalizeSearchText(skill.provider),
    publisher: normalizeSearchText(skill.publisher ?? ""),
    tags: (skill.tags ?? []).map(normalizeSearchText)
  };

  const exact = [haystacks.name, haystacks.id, haystacks.installRef].includes(normalizedQuery);
  let score = exact ? 120 : 0;

  if (haystacks.name.includes(normalizedQuery)) score += 85;
  if (haystacks.id.includes(normalizedQuery) || haystacks.installRef.includes(normalizedQuery)) score += 72;
  if (haystacks.provider.includes(normalizedQuery) || haystacks.publisher.includes(normalizedQuery)) score += 18;
  if (haystacks.description.includes(normalizedQuery)) score += 26;

  for (const token of tokens) {
    if (containsToken(haystacks.name, token)) score += 32;
    if (containsToken(haystacks.id, token) || containsToken(haystacks.installRef, token)) score += 26;
    if (containsToken(haystacks.description, token)) score += 14;
    if (containsToken(haystacks.provider, token) || containsToken(haystacks.publisher, token)) score += 10;
    if (haystacks.tags.some((tag) => containsToken(tag, token))) score += 18;
  }

  if (skill.risk === 0) score += 3;
  else if ((skill.risk ?? 0) >= 40) score -= 6;

  return { skill, exact, score };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_\-/:]+/g, " ")
    .replace(/[^a-z0-9.+# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(" ").filter(Boolean))];
}

function containsToken(text: string, token: string): boolean {
  return text.split(" ").includes(token);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
