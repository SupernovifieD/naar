import type { RepoFacts, SkillCandidate, SkillRecommendation } from "../types/index.js";
import { analyzeSkill, isInstallAllowed, type SecurityPolicy } from "../security/analyzeSkill.js";

export interface RecommendOptions extends SecurityPolicy {
  targetAssistants?: string[];
  maxResults?: number;
}

export function recommendSkills(
  repoFacts: RepoFacts,
  candidates: SkillCandidate[],
  options: RecommendOptions
): SkillRecommendation[] {
  const frameworkSet = new Set(repoFacts.frameworks.map((framework) => framework.id));
  const languageSet = new Set(repoFacts.languages);
  const missingSet = new Set(repoFacts.findings.map((finding) => finding.code));
  const assistantSet = new Set(
    repoFacts.aiAssistants.filter((assistant) => assistant.status === "found").map((assistant) => assistant.id)
  );

  const recommendations: SkillRecommendation[] = candidates.map((candidate) => {
    const reasons: string[] = [];
    let score = 0;

    const risk = analyzeSkill(candidate);
    candidate.risk = risk;

    const frameworkMatches = (candidate.compatibility.frameworks ?? []).filter((framework) => frameworkSet.has(framework));
    if (frameworkMatches.length > 0) {
      score += 30;
      reasons.push(`Matched stack: ${frameworkMatches.slice(0, 3).join(", ")}`);
    }

    const languageMatches = (candidate.compatibility.languages ?? []).filter((language) => languageSet.has(language));
    if (languageMatches.length > 0) {
      score += 20;
      reasons.push(`Matched language: ${languageMatches.join(", ")}`);
    }

    const missingCapabilityReason = matchMissingCapability(candidate, missingSet);
    if (missingCapabilityReason) {
      score += 15;
      reasons.push(`Addresses missing capability: ${missingCapabilityReason}`);
    }

    const assistantMatches = candidate.compatibility.assistants.filter((assistant) => assistantSet.has(assistant));
    if (assistantMatches.length > 0) {
      score += 10;
      reasons.push(`Compatible with detected assistants: ${assistantMatches.join(", ")}`);
    }

    if (candidate.metadata.trustLevel === "official") {
      score += 10;
      reasons.push("Publisher trust: official source");
    } else if (candidate.metadata.trustLevel === "trusted") {
      score += 6;
      reasons.push("Publisher trust: trusted community source");
    } else {
      score -= 30;
      reasons.push("Publisher trust: unknown publisher");
    }

    if (typeof candidate.metadata.popularity === "number") {
      score += Math.min(5, Math.floor(candidate.metadata.popularity / 20));
      reasons.push(`Popularity signal: ${candidate.metadata.popularity}`);
    }

    if (isStale(candidate.metadata.lastUpdatedIso)) {
      score -= 20;
      reasons.push("Freshness: skill appears stale");
    }

    if (candidate.metadata.hasScripts) {
      score -= 50;
      reasons.push("Safety: includes scripts");
    }

    if (risk.signals.some((signal) => signal.id === "suspicious_behavior")) {
      score -= 100;
      reasons.push("Safety: suspicious behavior signature detected");
    }

    score = Math.max(0, Math.min(100, score));

    const allowance = isInstallAllowed(risk, options, !!candidate.metadata.hasScripts);

    if (risk.signals.length === 0) {
      reasons.push("Safety profile: instruction-only and pinned source");
    }

    return {
      candidate,
      score,
      reasons,
      blocked: !allowance.allowed,
      blockReasons: allowance.reasons
    };
  });

  const sorted = recommendations.sort((left, right) => right.score - left.score);
  const maxResults = options.maxResults ?? 10;
  return sorted.slice(0, maxResults);
}

function matchMissingCapability(candidate: SkillCandidate, missingSet: Set<string>): string | null {
  const tags = new Set(candidate.tags.map((tag) => tag.toLowerCase()));

  if (missingSet.has("missing_copilot_instructions") && (tags.has("copilot") || tags.has("repo-instructions"))) {
    return "Copilot repository instructions";
  }
  if (missingSet.has("missing_testing_setup") && (tags.has("testing") || tags.has("pytest"))) {
    return "Testing guidance";
  }
  if (missingSet.has("missing_claude_config") && (tags.has("claude") || tags.has("agent-skills"))) {
    return "Claude project skill setup";
  }
  if (missingSet.has("missing_ci_or_container") && (tags.has("deploy-instructions") || tags.has("docker"))) {
    return "Deployment/run instructions";
  }
  if (tags.has("ui-design") || tags.has("components")) {
    return "UI/design instructions";
  }

  return null;
}

function isStale(lastUpdatedIso?: string): boolean {
  if (!lastUpdatedIso) return true;
  const date = new Date(lastUpdatedIso);
  if (Number.isNaN(date.getTime())) return true;
  const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > 365;
}
