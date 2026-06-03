import type {
  InstallTarget,
  ProviderSearchQuery,
  RepoFacts,
  RepoNeed,
  SkillCandidate,
  SkillProvider,
  SkillProviderResult
} from "../types/index.js";
import type { RecommendationQueryPlan } from "./queryPlan.js";

const MAX_CONCURRENT_PROVIDER_CALLS = 4;

export interface RecommendationRetrievalOptions {
  targets: InstallTarget[];
  baseLimit: number;
  queryLimit: number;
  maxProviderQueries: number;
}

export interface RecommendationRetrievalResult {
  providerResults: SkillProviderResult[];
  candidates: SkillCandidate[];
  warnings: string[];
}

interface ProviderCallOutcome {
  result: SkillProviderResult;
  success: boolean;
}

export async function retrieveRecommendationCandidates(
  providers: SkillProvider[],
  repoFacts: RepoFacts,
  _repoNeeds: RepoNeed[],
  plan: RecommendationQueryPlan,
  options: RecommendationRetrievalOptions
): Promise<RecommendationRetrievalResult> {
  const providerQueries = plan.providerQueries.slice(0, Math.max(0, options.maxProviderQueries));
  const tasks: Array<() => Promise<ProviderCallOutcome>> = [];

  for (const provider of providers) {
    tasks.push(() => runProviderSearch(provider, {
      mode: "recommend",
      repoFacts,
      targets: options.targets,
      limit: options.baseLimit
    }));

    for (const queryTerm of providerQueries) {
      tasks.push(() => runProviderSearch(provider, {
        mode: "search",
        term: queryTerm,
        targets: options.targets,
        limit: options.queryLimit
      }));
    }
  }

  const outcomes = await runWithConcurrency(tasks, MAX_CONCURRENT_PROVIDER_CALLS);
  const providerResults = outcomes.map((outcome) => outcome.result);
  const warnings = providerResults.flatMap((result) => result.warnings ?? []);
  const candidates = dedupeCandidates(providerResults.flatMap((result) => result.candidates));
  const successfulCalls = outcomes.filter((outcome) => outcome.success).length;

  if (providers.length > 0 && successfulCalls === 0 && candidates.length === 0) {
    throw new Error("All providers failed during recommendation retrieval.");
  }

  return {
    providerResults,
    candidates,
    warnings
  };
}

async function runProviderSearch(
  provider: SkillProvider,
  query: ProviderSearchQuery
): Promise<ProviderCallOutcome> {
  try {
    const result = await provider.search(query);
    return {
      success: true,
      result: {
        ...result,
        mode: result.mode ?? query.mode
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const queryLabel = query.mode === "search" && query.term ? ` for "${query.term}"` : "";
    return {
      success: false,
      result: {
        providerId: provider.id,
        fetchedAtIso: new Date().toISOString(),
        mode: query.mode === "search" && query.term ? `search:${query.term}` : query.mode,
        candidates: [],
        warnings: [`Provider ${provider.id} failed${queryLabel}: ${message}`]
      }
    };
  }
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  });

  await Promise.all(workers);
  return results;
}

function dedupeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const seen = new Set<string>();
  const output: SkillCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.providerScopedId ?? `${candidate.source.providerId}:${candidate.providerSkillId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }

  return output;
}
