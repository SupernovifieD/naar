import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import CopyButton from "./CopyButton";
import type { IndexedSkillRecord, SkillsIndexPayload } from "../data/skillsIndex";
import { formatLongDate } from "../lib/date";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INITIAL_VISIBLE_RESULTS = 3;
const MIN_SEARCH_SPINNER_MS = 720;

interface RankedSkill {
  skill: IndexedSkillRecord;
  score: number;
  exact: boolean;
}

interface SkillSearchTerminalProps {
  dataUrl: string;
}

export default function SkillSearchTerminal({ dataUrl }: SkillSearchTerminalProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [skills, setSkills] = useState<IndexedSkillRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [results, setResults] = useState<RankedSkill[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showSpinnerLine, setShowSpinnerLine] = useState(false);
  const [focused, setFocused] = useState(false);
  const loadPromiseRef = useRef<Promise<IndexedSkillRecord[]> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadIndex = useCallback(async (): Promise<IndexedSkillRecord[]> => {
    if (skills) {
      return skills;
    }

    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

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

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setSubmittedQuery(null);
      setResults([]);
      setExpanded(false);
      setShowSpinnerLine(false);
      return;
    }

    setSubmittedQuery(nextQuery);
    setSearching(true);
    setExpanded(false);
    setShowSpinnerLine(true);

    const startedAt = window.performance.now();
    const [index] = await Promise.all([loadIndex()]);
    const rankedResults = rankSkills(index, nextQuery);
    const elapsed = window.performance.now() - startedAt;
    if (elapsed < MIN_SEARCH_SPINNER_MS) {
      await wait(MIN_SEARCH_SPINNER_MS - elapsed);
    }

    setResults(rankedResults);
    setSearching(false);
  }

  const visibleResults = useMemo(() => {
    if (expanded) return results;
    return results.slice(0, INITIAL_VISIBLE_RESULTS);
  }, [expanded, results]);

  const hasMoreResults = results.length > INITIAL_VISIBLE_RESULTS && !expanded;
  const showResults = submittedQuery !== null && !searching;
  const showingCount = expanded ? results.length : Math.min(results.length, INITIAL_VISIBLE_RESULTS);

  return (
    <div className={`flex flex-col ${expanded ? "h-[28rem] sm:h-[29rem] lg:h-[32.5rem]" : "h-[21.5rem] sm:h-[22.5rem] lg:h-[24rem]"}`}>
      <form onSubmit={handleSubmit} className="border-b border-white/8 pb-4">
        <button type="submit" className="sr-only">Search skills</button>
        <label
          htmlFor="skill-search-input"
          className="terminal-line relative min-h-12 cursor-text rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition-colors duration-200 ease-glide hover:border-white/16 focus-within:border-white/20"
          onClick={() => inputRef.current?.focus()}
        >
          <span className="terminal-prompt">➜</span>
          <span className="shrink-0 text-text-soft">~</span>
          <span className="shrink-0 terminal-command">naar search</span>
          <span className="min-w-0 flex-1 break-all text-text">
            {query ? query : <span className="text-text-soft/70">ui</span>}
            {focused ? <span className="terminal-cursor ml-1" aria-hidden="true" /> : null}
          </span>
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
            className="absolute inset-0 opacity-0"
            aria-label="Search skills"
          />
        </label>
      </form>

      <div className="relative flex-1 min-h-0 pt-4">
        <div className={`h-full min-h-0 ${expanded ? "terminal-scroll pr-1" : "overflow-hidden"}`}>
          {showSpinnerLine && searching && submittedQuery ? (
            <div className="space-y-2 text-text-muted">
              <p className="terminal-line"><span className="text-cyan-300">{SPINNER_FRAMES[spinnerIndex]}</span><span>Searching for “{submittedQuery}”</span></p>
            </div>
          ) : null}

          {!submittedQuery && !loadError ? (
            <p className="text-sm text-text-soft">Type a query and press Enter. Try testing, github actions, or next.</p>
          ) : null}

          {loadError && !searching ? (
            <p className="text-sm text-warning">{loadError}</p>
          ) : null}

          {showResults ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-success">✔ Search complete</p>
                <p className="font-semibold text-text">Search results for “{submittedQuery}”</p>
                <p className="text-sm text-text-soft">Showing {showingCount} of {results.length}</p>
              </div>

              {results.length === 0 ? (
                loadError ? null : <p className="text-sm text-text-soft">No matching skills found. Try testing, github actions, or next.</p>
              ) : (
                <div className="relative">
                  <div className="space-y-5">
                    {visibleResults.map(({ skill }, index) => {
                      const license = skill.license ?? "No license declared";
                      const status = (skill.status ?? "eligible").toUpperCase();

                      return (
                        <article key={skill.id} className="space-y-3 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
                          <div className="terminal-line gap-2">
                            <span className="font-semibold text-text">{index + 1})</span>
                            {skill.url ? (
                              <a
                                href={skill.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-text underline decoration-white/10 underline-offset-4 transition-colors duration-200 ease-glide hover:text-accent-gold"
                              >
                                {skill.name}
                              </a>
                            ) : (
                              <span className="font-semibold text-text">{skill.name}</span>
                            )}
                            <span className="text-cyan-300">[{skill.provider}]</span>
                          </div>
                          <p className="text-sm leading-6 text-text-muted">
                            <span className="text-blue-300">Publisher</span>
                            <span className="text-text-muted">: </span>
                            <span className="text-text">{skill.publisher ?? skill.provider}</span>
                            <span className="px-2 text-text-soft">·</span>
                            <span className="text-blue-300">License</span>
                            <span className="text-text-muted">: </span>
                            <span className={skill.license ? "text-text" : "text-warning"}>{license}</span>
                            <span className="px-2 text-text-soft">·</span>
                            <span className="text-blue-300">Status</span>
                            <span className="text-text-muted">: </span>
                            <span className={status === "BLOCKED" ? "text-danger" : status === "RISKY" ? "text-warning" : "text-success"}>{status}</span>
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
                          <div className="space-y-2">
                            <p className="text-sm leading-6 text-text-muted">
                              <span className="text-blue-300">Install</span>
                              <span className="text-text-muted">:</span>
                            </p>
                            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <code className="min-w-0 break-all border-0 bg-transparent p-0 text-sm text-cyan-300">{skill.npxCommand}</code>
                              <CopyButton text={skill.npxCommand} label="Copy" />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {hasMoreResults ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-2xl bg-gradient-to-t from-[rgba(8,11,17,0.98)] via-[rgba(8,11,17,0.88)] to-transparent pt-16">
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-text transition-colors duration-200 ease-glide hover:border-white/20 hover:bg-white/10"
                      >
                        Show more ↓
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
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

  return {
    skill,
    exact,
    score
  };
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
