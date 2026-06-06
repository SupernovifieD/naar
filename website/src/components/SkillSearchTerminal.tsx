import { useCallback, useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton";
import type { IndexedSkillRecord, SkillsIndexPayload } from "../data/skillsIndex";

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

interface IndexLoadResult {
  skills: IndexedSkillRecord[];
  error: string | null;
}

interface SearchTurn {
  id: number;
  query: string;
  results: RankedSkill[];
  error: string | null;
}

interface PendingTurn {
  id: number;
  query: string;
}

export default function SkillSearchTerminal({ dataUrl }: SkillSearchTerminalProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [skills, setSkills] = useState<IndexedSkillRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchTurn[]>([]);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const loadPromiseRef = useRef<Promise<IndexLoadResult> | null>(null);
  const nextTurnIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const loadIndex = useCallback(async (): Promise<IndexLoadResult> => {
    if (skills) {
      return { skills, error: loadError };
    }
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
        return { skills: nextSkills, error: null };
      })
      .catch(() => {
        const error = "Local search index is unavailable right now.";
        setSkills([]);
        setLoadError(error);
        return { skills: [], error };
      })
      .finally(() => {
        loadPromiseRef.current = null;
      });

    return loadPromiseRef.current;
  }, [dataUrl, loadError, skills]);

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

  useEffect(() => {
    inputRef.current?.focus();
  }, [history.length, pendingTurn]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [history, pendingTurn]);

  const handleSubmit = async (event: SubmitEventLike) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery || pendingTurn) {
      return;
    }

    const turnId = nextTurnIdRef.current;
    nextTurnIdRef.current += 1;

    setPendingTurn({ id: turnId, query: nextQuery });
    setSearching(true);
    setQuery("");

    const startedAt = window.performance.now();
    const { skills: index, error } = await loadIndex();
    const rankedResults = error ? [] : rankSkills(index, nextQuery);
    const elapsed = window.performance.now() - startedAt;
    if (elapsed < MIN_SEARCH_SPINNER_MS) {
      await wait(MIN_SEARCH_SPINNER_MS - elapsed);
    }

    setHistory((current) => [
      ...current,
      {
        id: turnId,
        query: nextQuery,
        results: rankedResults,
        error
      }
    ]);
    setPendingTurn(null);
    setSearching(false);
  };

  const terminalExpanded = history.length > 0 || pendingTurn !== null;
  const rootHeight = terminalExpanded
    ? "h-[26.25rem] sm:h-[28.75rem] lg:h-[32.5rem]"
    : "h-[7.75rem] sm:h-[8.5rem]";

  return (
    <div className={`flex flex-col overflow-hidden text-left transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${rootHeight}`}>
      <div ref={viewportRef} className="terminal-scroll flex-1 min-h-0 px-5 py-5 sm:px-6 sm:py-6">
        {history.map((turn) => (
          <SearchTurnTranscript key={turn.id} turn={turn} />
        ))}

        {pendingTurn ? (
          <div className="space-y-2">
            <PromptLine query={pendingTurn.query} />
            <p className="terminal-line">
              <span className="text-cyan-300">{SPINNER_FRAMES[spinnerIndex]}</span>
              <span className="text-text">Searching for "{pendingTurn.query}"</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <PromptInputLine
              query={query}
              inputRef={inputRef}
              onChange={setQuery}
            />
            {history.length === 0 ? (
              <div className="space-y-1 pl-[4.1rem] text-sm">
                {loadError ? (
                  <p className="text-warning">{loadError}</p>
                ) : (
                  <>
                    <p className="text-text-soft">Try: testing, github actions, next</p>
                    <p className="text-text-soft">Press Enter to search.</p>
                  </>
                )}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

function SearchTurnTranscript({ turn }: { turn: SearchTurn }) {
  return (
    <div className="pb-5">
      <PromptLine query={turn.query} />
      <div className="mt-2 space-y-1">
        {turn.error ? (
          <>
            <p className="terminal-line">
              <span className="text-warning">⚠</span>
              <span className="text-warning">{turn.error}</span>
            </p>
            <div aria-hidden="true" className="h-3" />
          </>
        ) : (
          <>
            <p className="terminal-line">
              <span className="text-success">✔</span>
              <span className="text-text">Search complete</span>
            </p>
            <p className="font-semibold text-text">Search results for "{turn.query}"</p>
            <div aria-hidden="true" className="h-3" />

            {turn.results.length === 0 ? (
              <>
                <p className="terminal-line">
                  <span className="text-warning">⚠</span>
                  <span className="text-warning">No skills found for "{turn.query}".</span>
                </p>
                <p className="text-text-soft">Try a broader term or search a specific provider.</p>
              </>
            ) : (
              <div className="space-y-4">
                {turn.results.map((result, index) => (
                  <SearchResultLines key={`${turn.id}:${result.skill.id}`} rank={index + 1} result={result} />
                ))}
              </div>
            )}

            <div aria-hidden="true" className="h-4" />
          </>
        )}
      </div>
    </div>
  );
}

function SearchResultLines({
  rank,
  result
}: {
  rank: number;
  result: RankedSkill;
}) {
  const { skill } = result;
  const displayId = skill.installRef.split(":").slice(1).join(":") || skill.name;

  return (
    <div className="space-y-1.5">
      <p className="whitespace-pre-wrap break-words">
        <span className="font-semibold text-text">{rank}. {displayId}</span>
        <span className="text-text"> </span>
        <span className="text-cyan-300">[{skill.provider}]</span>
      </p>

      <p className="line-clamp-2 text-text-muted">{skill.description}</p>

      <p className="whitespace-pre-wrap break-words text-text">
        <span className="text-blue-300">Publisher</span>
        <span className="text-text"> {skill.publisher ?? skill.provider}</span>
        <span className="text-text-soft"> · </span>
        <span className="text-blue-300">License</span>
        <span className={skill.license ? "text-text" : "text-warning"}> {skill.license ?? "No license declared"}</span>
        <span className="text-text-soft"> · </span>
        <span className="text-blue-300">Updated</span>
        <span className="text-text"> {formatDateOnly(skill.updatedAt) ?? "unknown"}</span>
      </p>

      <div className="flex items-start gap-2 whitespace-pre-wrap break-words">
        <p className="min-w-0 flex-1">
          <span className="text-blue-300">Install</span>
          <span className="text-text">: </span>
          <span className="break-all text-cyan-300">{skill.npxCommand}</span>
        </p>
        <CopyButton text={skill.npxCommand} label="Copy install command" iconOnly />
      </div>
    </div>
  );
}

function PromptLine({ query }: { query: string }) {
  return (
    <p className="terminal-line items-center">
      <span className="terminal-prompt">➜</span>
      <span className="text-text-soft">~</span>
      <span className="terminal-command shrink-0">naar search</span>
      {query ? <span className="whitespace-pre-wrap break-words text-text">{query}</span> : null}
    </p>
  );
}

function PromptInputLine({
  query,
  inputRef,
  onChange
}: {
  query: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const inputWidth = `calc(${Math.max(query.length, 1)}ch + 0.55rem)`;

  const moveCaretToEnd = () => {
    if (!inputRef.current) return;
    const cursorIndex = inputRef.current.value.length;
    inputRef.current.setSelectionRange(cursorIndex, cursorIndex);
  };

  return (
    <p className="terminal-line items-center cursor-text" onClick={() => inputRef.current?.focus()}>
      <span className="terminal-prompt">➜</span>
      <span className="text-text-soft">~</span>
      <span className="terminal-command shrink-0">naar search</span>
      <span className="relative inline-flex min-w-[0.55rem] max-w-full items-center">
        <span aria-hidden="true" className="whitespace-pre text-text">
          {query}
        </span>
        <span className="terminal-cursor shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={moveCaretToEnd}
          onClick={moveCaretToEnd}
          spellCheck={false}
          autoComplete="off"
          aria-label="Search skills"
          className="absolute inset-y-0 left-0 bg-transparent p-0 text-transparent caret-transparent outline-none"
          style={{ width: inputWidth }}
        />
      </span>
    </p>
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

function formatDateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
