import { checkbox } from "@inquirer/prompts";
import pc from "picocolors";
import { loadConfig } from "../config/store.js";
import { loadInstalledState, toProviderScopedId } from "../installer/state.js";
import { buildProviders, queryProviders } from "../providers/orchestrator.js";
import type { CliFlags, InstallTarget, SkillCandidate, SkillRecommendation } from "../types/index.js";
import { printJson } from "../utils/json.js";
import { renderRecommendationCards, warningHeader, warningLine } from "../utils/output.js";
import { rankSearchCandidates } from "../search/rank.js";
import { searchResultsToRecommendations } from "../search/results.js";
import type { SearchRankedCandidate } from "../search/types.js";
import { runInstallFlowFromRecommendations } from "./installFlow.js";
import { resolveRepoRoot } from "./shared.js";

export interface SearchCommandOptions {
  includeInstalled?: boolean;
  install?: boolean;
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

  if (flags.json && !options.install) {
    printJson({
      query: normalizedQuery,
      providers: providerSummaries,
      warnings,
      results: ranked.map(toJsonResult)
    });
    return;
  }

  if (flags.json && options.install && ranked.length === 0) {
    printJson({
      query: normalizedQuery,
      providers: providerSummaries,
      warnings,
      results: [],
      installSkipped: true,
      error: `No skills found for "${normalizedQuery}".`
    });
    return;
  }

  if (flags.json && options.install && !hasExplicitJsonInstallConfirmation(flags)) {
    printJson({
      query: normalizedQuery,
      providers: providerSummaries,
      warnings,
      results: ranked.map(toJsonResult),
      installSkipped: true,
      installSkippedDueToMissingConfirmation: true,
      error: "Search installation in JSON mode requires --apply and --yes."
    });
    return;
  }

  if (flags.json && options.install) {
    const selected = selectSearchResultsForAutomation(flags, ranked, recommendations);
    if (!selected.ok) {
      printJson({
        query: normalizedQuery,
        providers: providerSummaries,
        warnings,
        results: ranked.map(toJsonResult),
        installSkipped: true,
        error: selected.error
      });
      return;
    }
    await runInstallFlowFromRecommendations(flags, selected.recommendations, {
      source: "search",
      printHeader: false
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

  if (!options.install) {
    return;
  }

  if (isAutomatedInstallContext(flags) && !flags.dryRun && (!flags.apply || !flags.yes)) {
    process.stdout.write(
      `\n${warningLine("Search installation in automated mode requires --apply and --yes. No files were written.")}\n`
    );
    return;
  }

  const selected = isAutomatedInstallContext(flags)
    ? selectSearchResultsForAutomation(flags, ranked, recommendations)
    : await selectSearchResultsInteractively(ranked, recommendations);

  if (!selected.ok) {
    process.stdout.write(`\n${warningLine(selected.error)}\n`);
    return;
  }

  if (selected.recommendations.length === 0) {
    process.stdout.write(`\n${warningLine("No search result selected for installation.")}\n`);
    return;
  }

  await runInstallFlowFromRecommendations(flags, selected.recommendations, {
    source: "search",
    printHeader: false
  });
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

type SearchInstallSelection =
  | { ok: true; recommendations: SkillRecommendation[] }
  | { ok: false; error: string };

function hasExplicitJsonInstallConfirmation(flags: CliFlags): boolean {
  return flags.apply && flags.yes;
}

function isAutomatedInstallContext(flags: CliFlags): boolean {
  return flags.nonInteractive || flags.yes;
}

function selectSearchResultsForAutomation(
  flags: CliFlags,
  ranked: SearchRankedCandidate[],
  recommendations: SkillRecommendation[]
): SearchInstallSelection {
  if (ranked.length === 0) {
    return { ok: false, error: "No search results are available to install." };
  }

  if (flags.from) {
    const match = selectSearchResultFromReference(flags.from, recommendations);
    if (!match) {
      return {
        ok: false,
        error: `No search result matched --from ${flags.from}.`
      };
    }
    return { ok: true, recommendations: [match] };
  }

  const exact = recommendations.filter((_recommendation, index) => ranked[index]?.exact === true);
  if (exact.length === 1) {
    return { ok: true, recommendations: exact };
  }

  const [best, second] = ranked;
  if (best && best.score >= 80 && (!second || best.score - second.score >= 15)) {
    const recommendation = recommendations.find((item) => scopedId(item.candidate) === scopedId(best.candidate));
    if (recommendation) {
      return { ok: true, recommendations: [recommendation] };
    }
  }

  return {
    ok: false,
    error: "Search returned multiple possible matches. Re-run with a more specific query or use --from <provider:skill@version>."
  };
}

async function selectSearchResultsInteractively(
  ranked: SearchRankedCandidate[],
  recommendations: SkillRecommendation[]
): Promise<SearchInstallSelection> {
  const preselected = preselectedSearchResultIds(ranked);
  let selectedIds: string[] = [];
  try {
    selectedIds = await checkbox<string>({
      message: "Select search results to install",
      choices: recommendations.map((recommendation) => {
        const id = scopedId(recommendation.candidate);
        return {
          name: `${recommendation.candidate.name} (${recommendation.candidate.source.providerId}) search-match=${recommendation.score}%`,
          value: id,
          checked: preselected.has(id)
        };
      })
    });
  } catch {
    return { ok: false, error: "Search installation canceled." };
  }

  return {
    ok: true,
    recommendations: recommendations.filter((recommendation) => selectedIds.includes(scopedId(recommendation.candidate)))
  };
}

function preselectedSearchResultIds(ranked: SearchRankedCandidate[]): Set<string> {
  const selected = new Set<string>();
  const exact = ranked.filter((result) => result.exact);
  if (exact.length === 1) {
    selected.add(scopedId(exact[0].candidate));
    return selected;
  }

  const [best, second] = ranked;
  if (best && best.score >= 80 && (!second || best.score - second.score >= 15)) {
    selected.add(scopedId(best.candidate));
  }
  return selected;
}

function selectSearchResultFromReference(
  fromRef: string,
  recommendations: SkillRecommendation[]
): SkillRecommendation | undefined {
  const [providerAndSkill, requestedVersion] = fromRef.split("@", 2);
  const [providerId, skillId] = providerAndSkill.includes(":")
    ? providerAndSkill.split(":", 2)
    : ["", providerAndSkill];

  return recommendations.find((recommendation) => {
    const candidate = recommendation.candidate;
    if (providerId && candidate.source.providerId !== providerId) return false;
    if (requestedVersion && !matchesVersion(candidate, requestedVersion)) return false;
    return candidate.providerSkillId === skillId
      || candidate.canonicalSkillId === skillId
      || scopedId(candidate) === providerAndSkill
      || candidate.providerSkillId.endsWith(`/${skillId}`);
  });
}

function matchesVersion(candidate: SkillCandidate, requestedVersion: string): boolean {
  return [
    candidate.source.version,
    candidate.source.ref,
    candidate.metadata.pinnedRef
  ].filter(Boolean).includes(requestedVersion);
}
