import type { AssistantId, InstallTarget, RecommendationStatus, SkillRecommendation } from "../types/index.js";
import { dedupeAssistants, getTargetAssistantIds } from "../targets/index.js";
import type { SearchRankedCandidate } from "./types.js";

export function searchResultsToRecommendations(
  ranked: SearchRankedCandidate[],
  selectedTargets: InstallTarget[]
): SkillRecommendation[] {
  const targetAssistants = dedupeAssistants(selectedTargets.flatMap(getTargetAssistantIds));
  return ranked.map((result) => {
    const eligibility = buildEligibility(result, targetAssistants, selectedTargets);
    return {
      candidate: result.candidate,
      score: result.score,
      rawScore: result.score,
      relevanceRaw: result.score,
      qualityRaw: 0,
      status: eligibility.status,
      overrideable: false,
      hardBlocked: false,
      reasons: result.reasons,
      matchedNeeds: [],
      matchedFacts: [],
      eligibilityReasons: eligibility.reasons,
      penalties: [],
      scoreBreakdown: [{
        kind: result.exact ? "search_exact_match" : "search_fuzzy_match",
        points: result.score,
        detail: result.reasons[0] ?? "search match"
      }],
      blocked: false,
      blockReasons: []
    } satisfies SkillRecommendation;
  });
}

function buildEligibility(
  result: SearchRankedCandidate,
  targetAssistants: AssistantId[],
  selectedTargets: InstallTarget[]
): { status: RecommendationStatus; reasons: string[] } {
  const candidateAssistants = result.candidate.compatibility.assistants;
  if (targetAssistants.length === 0) {
    return {
      status: "eligible",
      reasons: [`Compatible assistants: ${candidateAssistants.join(", ") || "none"}`]
    };
  }

  const compatible = targetAssistants.some((assistant) => candidateAssistants.includes(assistant))
    || candidateAssistants.includes("generic");
  if (!compatible) {
    return {
      status: "incompatible",
      reasons: [`Not compatible with selected targets: ${selectedTargets.join(", ")}`]
    };
  }

  return {
    status: "eligible",
    reasons: [`Compatible with selected targets: ${selectedTargets.join(", ")}`]
  };
}
