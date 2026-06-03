import type { SkillCandidate } from "../types/index.js";

export interface SearchRankedCandidate {
  candidate: SkillCandidate;
  score: number;
  exact: boolean;
  reasons: string[];
}
