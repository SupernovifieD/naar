import type { SkillCandidate } from "../types/index.js";
import { toProviderScopedId } from "../installer/state.js";
import type { SearchRankedCandidate } from "./types.js";

const MAX_FUZZY_RESULTS = 3;
const MIN_MEANINGFUL_SCORE = 18;

interface CandidateSearchText {
  name: string;
  canonicalSkillId: string;
  providerSkillId: string;
  providerScopedId: string;
  tags: string[];
  summary: string;
  description: string;
  publisher: string;
}

export function rankSearchCandidates(candidates: SkillCandidate[], query: string): SearchRankedCandidate[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryTokens = tokenizeSearchText(query);
  const deduped = dedupeCandidates(candidates);
  const ranked = deduped
    .map((candidate) => scoreCandidate(candidate, normalizedQuery, queryTokens))
    .filter((result) => result.score >= MIN_MEANINGFUL_SCORE || result.exact)
    .sort(compareRankedCandidates);

  const exact = ranked.filter((result) => result.exact);
  if (exact.length === 1) {
    return exact;
  }

  return ranked.slice(0, MAX_FUZZY_RESULTS);
}

export function filterCandidatesForSearchTerm(candidates: SkillCandidate[], query: string, limit?: number): SkillCandidate[] {
  const ranked = rankSearchCandidates(candidates, query);
  const selected = typeof limit === "number" ? ranked.slice(0, Math.max(0, limit)) : ranked;
  return selected.map((result) => result.candidate);
}

export function normalizeSearchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s_\-/:]+/g, " ")
    .replace(/[^a-z0-9.+# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: string | undefined): string[] {
  return [...new Set(normalizeSearchText(value).split(" ").filter((token) => token.length > 0))];
}

function scoreCandidate(candidate: SkillCandidate, normalizedQuery: string, queryTokens: string[]): SearchRankedCandidate {
  const text = candidateSearchText(candidate);
  const reasons: string[] = [`Matched search term: "${normalizedQuery}"`];
  let score = 0;
  let exact = false;

  if (text.canonicalSkillId === normalizedQuery) {
    score += 100;
    exact = true;
    reasons.push(`Exact canonical skill id: ${candidate.canonicalSkillId}`);
  }
  if (text.providerSkillId === normalizedQuery) {
    score += 98;
    exact = true;
    reasons.push(`Exact provider skill id: ${candidate.providerSkillId}`);
  }
  if (text.name === normalizedQuery) {
    score += 96;
    exact = true;
    reasons.push(`Exact skill name: ${candidate.name}`);
  }
  if (text.providerScopedId === normalizedQuery) {
    score += 95;
    exact = true;
    reasons.push(`Exact provider scoped id: ${candidate.providerScopedId ?? scopedId(candidate)}`);
  }

  if (!exact) {
    if (text.name.includes(normalizedQuery)) {
      score += 75;
      reasons.push(`Matched skill name: ${candidate.name}`);
    }
    if (text.canonicalSkillId.includes(normalizedQuery) || text.providerSkillId.includes(normalizedQuery)) {
      score += 70;
      reasons.push(`Matched skill id: ${candidate.canonicalSkillId}`);
    }
    if (text.name.startsWith(normalizedQuery) || text.canonicalSkillId.startsWith(normalizedQuery) || text.providerSkillId.startsWith(normalizedQuery)) {
      score += 68;
      reasons.push(`Matched prefix: ${candidate.name}`);
    }

    const nameAndId = `${text.name} ${text.canonicalSkillId} ${text.providerSkillId} ${text.providerScopedId}`;
    const nameIdTokenCount = countTokenMatches(queryTokens, nameAndId);
    if (nameIdTokenCount > 0) {
      score += nameIdTokenCount * 30;
      reasons.push(`Matched name/id tokens: ${queryTokens.filter((token) => includesToken(nameAndId, token)).join(", ")}`);
    }

    const tagTokenCount = countTokenMatches(queryTokens, text.tags.join(" "));
    if (tagTokenCount > 0) {
      score += tagTokenCount * 20;
      reasons.push(`Matched tags: ${queryTokens.filter((token) => includesToken(text.tags.join(" "), token)).join(", ")}`);
    }

    const body = `${text.summary} ${text.description}`;
    const bodyTokenCount = countTokenMatches(queryTokens, body);
    if (bodyTokenCount > 0) {
      score += bodyTokenCount * 16;
      reasons.push(`Matched description: ${queryTokens.filter((token) => includesToken(body, token)).join(", ")}`);
    }
  }

  if (text.publisher && text.publisher.includes(normalizedQuery)) {
    score += 12;
    reasons.push(`Matched publisher: ${text.publisher}`);
  }

  const trust = candidate.metadata.trustLevel;
  if (trust === "official") {
    score += 4;
    reasons.push("Publisher trust: official source");
  } else if (trust === "trusted") {
    score += 2;
    reasons.push("Publisher trust: trusted community source");
  }

  const popularity = candidate.metadata.popularity ?? 0;
  if (popularity > 0) {
    score += Math.min(4, Math.log10(popularity + 1));
  }

  return {
    candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    exact,
    reasons: dedupeReasons(reasons)
  };
}

function candidateSearchText(candidate: SkillCandidate): CandidateSearchText {
  return {
    name: normalizeSearchText(candidate.name),
    canonicalSkillId: normalizeSearchText(candidate.canonicalSkillId),
    providerSkillId: normalizeSearchText(candidate.providerSkillId),
    providerScopedId: normalizeSearchText(candidate.providerScopedId ?? scopedId(candidate)),
    tags: candidate.tags.map(normalizeSearchText),
    summary: normalizeSearchText(candidate.summary),
    description: normalizeSearchText(candidate.metadata.description),
    publisher: normalizeSearchText(candidate.metadata.publisher ?? candidate.source.publisher)
  };
}

function dedupeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const byScopedId = new Map<string, SkillCandidate>();
  for (const candidate of candidates) {
    const key = scopedId(candidate);
    if (!byScopedId.has(key)) {
      byScopedId.set(key, candidate);
    }
  }
  return [...byScopedId.values()];
}

function compareRankedCandidates(left: SearchRankedCandidate, right: SearchRankedCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.exact !== right.exact) return left.exact ? -1 : 1;
  const trustDelta = trustRank(right.candidate) - trustRank(left.candidate);
  if (trustDelta !== 0) return trustDelta;
  return left.candidate.name.localeCompare(right.candidate.name);
}

function countTokenMatches(tokens: string[], text: string): number {
  return tokens.filter((token) => includesToken(text, token)).length;
}

function includesToken(text: string, token: string): boolean {
  return text.split(" ").includes(token);
}

function scopedId(candidate: SkillCandidate): string {
  return candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
}

function trustRank(candidate: SkillCandidate): number {
  if (candidate.metadata.trustLevel === "official") return 2;
  if (candidate.metadata.trustLevel === "trusted") return 1;
  return 0;
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)].slice(0, 5);
}
