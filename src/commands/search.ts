import ora from "ora";
import { loadConfig } from "../config/store.js";
import { loadInstalledState, toProviderScopedId } from "../installer/state.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import type { CliFlags, InstallTarget, SkillCandidate } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { rankSearchCandidates } from "../search/rank.js";
import {
  providerResultsToSearchSummaries,
  renderSearchResults,
  toSearchJsonResult
} from "../search/render.js";
import { resolveRepoRoot } from "./shared.js";

const DEFAULT_SEARCH_DISPLAY_LIMIT = 20;
const PROVIDER_SEARCH_LIMIT = 200;

export interface SearchCommandOptions {
  includeInstalled?: boolean;
  limit?: number;
  all?: boolean;
}

export async function runSearch(flags: CliFlags, query: string, options: SearchCommandOptions = {}): Promise<void> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("Search query is required.");
  }

  const repoRoot = resolveRepoRoot(flags.repo);
  const config = await loadConfig(repoRoot);
  const providerIds = flags.provider.length > 0 ? flags.provider : config.defaultProviders;
  const selectedTargets: InstallTarget[] = flags.target.length > 0 ? flags.target : config.defaultTargets;
  const providers = buildProviders(providerIds);

  const spinner = flags.json ? null : ora(`Searching providers for "${normalizedQuery}"`).start();
  let providerResults: Awaited<ReturnType<typeof queryProviders>>;
  try {
    providerResults = await queryProviders(providers, {
      mode: "search",
      term: normalizedQuery,
      targets: selectedTargets,
      limit: PROVIDER_SEARCH_LIMIT
    });
    spinner?.succeed("Search complete");
  } catch (error) {
    spinner?.fail("Search failed");
    throw error;
  }

  const installedIds = options.includeInstalled === true
    ? new Set<string>()
    : await getInstalledSkillIds(repoRoot);
  const candidates = providerResults
    .flatMap((result) => result.candidates)
    .filter((candidate) => !installedIds.has(scopedId(candidate)));
  const allRanked = rankSearchCandidates(candidates, normalizedQuery);
  const displayLimit = resolveSearchDisplayLimit(options.limit);
  const ranked = options.all === true
    ? allRanked
    : allRanked.slice(0, displayLimit);
  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const providerSummaries = providerResultsToSearchSummaries(providerResults);

  if (flags.json) {
    printJson({
      query: normalizedQuery,
      limit: options.all === true ? null : displayLimit,
      all: options.all === true,
      totalResults: allRanked.length,
      providers: providerSummaries,
      warnings,
      results: ranked.map((result) => toSearchJsonResult(result))
    });
    return;
  }

  process.stdout.write(renderSearchResults({
    query: normalizedQuery,
    results: ranked,
    totalResults: allRanked.length,
    limit: options.all === true ? undefined : displayLimit,
    all: options.all === true,
    compact: flags.compact,
    verbose: flags.verbose,
    providerSummaries,
    warnings
  }));
}

async function getInstalledSkillIds(repoRoot: string): Promise<Set<string>> {
  const state = await loadInstalledState(repoRoot);
  return new Set(state.skills.map((skill) => skill.providerScopedId ?? toProviderScopedId(skill.providerId, skill.providerSkillId)));
}

function scopedId(candidate: SkillCandidate): string {
  return candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
}

function resolveSearchDisplayLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_DISPLAY_LIMIT;
  }
  return Math.max(1, Math.floor(value));
}
