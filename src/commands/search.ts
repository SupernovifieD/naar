import pc from "picocolors";
import { loadConfig } from "../config/store.js";
import { loadInstalledState, toProviderScopedId } from "../installer/state.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import type { CliFlags, InstallTarget, SkillCandidate } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { renderRecommendationCards, warningHeader, warningLine } from "../utils/output.js";
import { rankSearchCandidates } from "../search/rank.js";
import { searchResultsToRecommendations } from "../search/results.js";
import type { SearchRankedCandidate } from "../search/types.js";
import { resolveRepoRoot } from "./shared.js";

export interface SearchCommandOptions {
  includeInstalled?: boolean;
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

  const providerResults = await queryProviders(providers, {
    mode: "search",
    term: normalizedQuery,
    targets: selectedTargets,
    limit: 80
  });

  const installedIds = options.includeInstalled === true
    ? new Set<string>()
    : await getInstalledSkillIds(repoRoot);
  const candidates = providerResults
    .flatMap((result) => result.candidates)
    .filter((candidate) => !installedIds.has(scopedId(candidate)));
  const ranked = rankSearchCandidates(candidates, normalizedQuery);
  const recommendations = searchResultsToRecommendations(ranked, selectedTargets);
  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const providerSummaries = providerResults.map((result) => ({
    providerId: result.providerId,
    mode: result.mode,
    candidateCount: result.candidates.length,
    warnings: result.warnings ?? []
  }));

  // TODO(search-install): connect selected search results to install flow in the follow-up task.
  if (flags.json) {
    printJson({
      query: normalizedQuery,
      providers: providerSummaries,
      warnings,
      results: ranked.map(toJsonResult)
    });
    return;
  }

  if (warnings.length > 0) {
    process.stdout.write(`\n${warningHeader("Provider notes")}:\n`);
    for (const warning of warnings) {
      process.stdout.write(`- ${warningLine(warning)}\n`);
    }
  }

  if (providerSummaries.length > 0) {
    process.stdout.write(`\n${pc.bold("Providers")}:\n`);
    for (const provider of providerSummaries) {
      const mode = provider.mode ? ` mode=${pc.cyan(provider.mode)}` : "";
      process.stdout.write(
        `- ${pc.bold(provider.providerId)}${mode} candidates=${pc.cyan(String(provider.candidateCount))}\n`
      );
    }
  }

  if (ranked.length === 0) {
    process.stdout.write(`\n${warningLine(`No skills found for "${normalizedQuery}".`)}\n`);
    process.stdout.write(`Try a broader term or search a specific provider with ${pc.cyan("--provider <id>")}.\n`);
    return;
  }

  process.stdout.write(`\n${pc.bold(`Search results for "${normalizedQuery}"`)}:\n`);
  process.stdout.write(renderRecommendationCards(recommendations, {
    indent: "  ",
    reasonLimit: 3,
    compact: flags.compact,
    verbose: flags.verbose,
    scoreLabel: "Search match"
  }));
}

async function getInstalledSkillIds(repoRoot: string): Promise<Set<string>> {
  const state = await loadInstalledState(repoRoot);
  return new Set(state.skills.map((skill) => skill.providerScopedId ?? toProviderScopedId(skill.providerId, skill.providerSkillId)));
}

function scopedId(candidate: SkillCandidate): string {
  return candidate.providerScopedId ?? toProviderScopedId(candidate.source.providerId, candidate.providerSkillId);
}

function toJsonResult(result: SearchRankedCandidate): object {
  return {
    candidate: result.candidate,
    searchScore: result.score,
    exact: result.exact,
    reasons: result.reasons
  };
}
