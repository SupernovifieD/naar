import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import CopyButton from "./CopyButton";
import type { IndexedSkillRecord, SkillsIndexPayload } from "../data/skillsIndex";

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
  const loadPromiseRef = useRef<Promise<IndexedSkillRecord[]> | null>(null);

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
    <div className="font-mono text-[0.92rem] leading-7 text-text">
      <form onSubmit={handleSubmit} className="border-b border-white/8 pb-4">
        <label htmlFor="skill-search-input" className="sr-only">Search skills</label>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-text">
            <span className="shrink-0 text-text-soft">~</span>
            <span className="shrink-0 text-accent-gold">→</span>
            <span className="shrink-0 text-text">naar search</span>
            <input
              id="skill-search-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='"testing"'
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-soft"
              aria-label="Search skills"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-text transition-colors duration-200 ease-glide hover:border-white/20 hover:bg-white/10"
          >
            Search
          </button>
        </div>
      </form>

      <div className="relative pt-4">
        {showSpinnerLine && searching && submittedQuery ? (
          <div className="space-y-2 text-text-muted">
            <p><span className="text-cyan-300">{SPINNER_FRAMES[spinnerIndex]}</span> Searching for "{submittedQuery}"</p>
          </div>
        ) : null}

        {!submittedQuery && !loadError ? (
          <p className="text-sm text-text-soft">Type a query and press Enter. Try “testing”, “github actions”, or “next”.</p>
        ) : null}

        {loadError && !searching ? (
          <p className="text-sm text-warning">{loadError}</p>
        ) : null}

        {showResults ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-success">✔ Search complete</p>
              <p className="font-semibold text-text">Search results for "{submittedQuery}"</p>
              <p className="text-sm text-text-soft">Showing {showingCount} of {results.length}</p>
            </div>

            {results.length === 0 ? (
              loadError ? null : <p className="text-sm text-text-soft">No matching skills found. Try “testing”, “github actions”, or “next”.</p>
            ) : (
              <div className="relative">
                <div className="space-y-5">
                  {visibleResults.map(({ skill }, index) => {
                    const metadataBits = [
                      skill.publisher ? `Publisher ${skill.publisher}` : null,
                      skill.license ? `License ${skill.license}` : "License No license declared",
                      skill.updatedAt ? `Updated ${formatDate(skill.updatedAt)}` : null
                    ].filter((bit): bit is string => Boolean(bit));

                    return (
                      <article key={skill.id} className="space-y-2">
                        <div className="flex flex-wrap items-start gap-x-2">
                          <span className="font-semibold text-text">{index + 1}.</span>
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
                        <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-text-muted">{skill.description}</p>
                        <p className="text-sm text-text-soft">{metadataBits.join(" · ")}</p>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <p className="min-w-0 break-all text-sm text-cyan-300">Install: {skill.npxCommand}</p>
                          <CopyButton text={skill.npxCommand} label="Copy" />
                        </div>
                      </article>
                    );
                  })}
                </div>

                {hasMoreResults ? (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center rounded-b-2xl bg-gradient-to-t from-bg via-bg/85 to-transparent pt-16">
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-text transition-colors duration-200 ease-glide hover:border-white/20 hover:bg-white/10"
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

function formatDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
