/**
 * scoringRubric.ts — Commentary line quality scoring.
 *
 * Used by the offline workshop to grade candidate lines and by the
 * gradeLibrary tool to audit the existing production library.
 *
 * Each line is scored on 7 dimensions (1-10), weighted into an overall score.
 * Lines below threshold are flagged for revision or disabling.
 */

export interface LineScore {
  humanSounding: number;
  oneMessage: number;
  humor: number;
  specificity: number;
  factualFit: number;
  nonGeneric: number;
  sportsVoice: number;
  overall: number;
  rejectReasons: string[];
}

const WEIGHTS = {
  humanSounding: 0.20,
  oneMessage: 0.15,
  humor: 0.15,
  specificity: 0.15,
  factualFit: 0.10,
  nonGeneric: 0.15,
  sportsVoice: 0.10,
};

export function computeOverall(scores: Omit<LineScore, "overall" | "rejectReasons">): number {
  return Math.round(
    (scores.humanSounding * WEIGHTS.humanSounding +
     scores.oneMessage * WEIGHTS.oneMessage +
     scores.humor * WEIGHTS.humor +
     scores.specificity * WEIGHTS.specificity +
     scores.factualFit * WEIGHTS.factualFit +
     scores.nonGeneric * WEIGHTS.nonGeneric +
     scores.sportsVoice * WEIGHTS.sportsVoice) * 10
  ) / 10;
}

export function autoReject(template: string): string[] {
  const reasons: string[] = [];
  const lower = template.toLowerCase();

  const sentences = template.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 2) reasons.push("multi_idea");

  // Merged from the original quality gate (generateCommentary.ts) + workshop rules.
  // These phrases leak game mechanics, sound robotic, or are generic sports filler.
  const genericPhrases = [
    "strong performance", "stepped up", "came to play",
    "big night", "huge game", "great effort", "really delivered",
    "got the job done", "solid effort", "nice work", "great job",
    "clutch performance",
    // From original quality gate — game-mechanic language
    "every card", "full bust", "avoided zero", "the minimum",
    "came up short", "couldn't overcome", "went nuclear",
    "carry the load", "carried the load", "pick up the slack",
    "fantasy points", "reflected it",
  ];
  for (const phrase of genericPhrases) {
    if (lower.includes(phrase)) {
      reasons.push(`generic_filler: "${phrase}"`);
      break;
    }
  }

  if (template.length > 180) reasons.push("too_long");

  // Game-mechanic terms that should never appear in commentary
  const mechanics = [
    "fp", "fantasy points", "projection", "projected",
    "rookie tier", "starter tier", "all-star tier", "mvp tier", "legend tier",
    "rookie money", "starter money", "all-star money",
    "bust tier", "payout tier", "payout threshold",
  ];
  for (const term of mechanics) {
    if (lower.includes(term)) {
      reasons.push(`mechanic_leak: "${term}"`);
      break;
    }
  }

  if (!template.includes("{") && template.length > 30) {
    reasons.push("no_tokens_generic");
  }

  return reasons;
}

export function scoreLine(
  template: string,
  manualScores: Omit<LineScore, "overall" | "rejectReasons">,
): LineScore {
  const rejectReasons = autoReject(template);
  let overall = computeOverall(manualScores);
  if (rejectReasons.length > 0) overall = Math.min(overall, 3.0);
  return { ...manualScores, overall, rejectReasons };
}

export const PRODUCTION_THRESHOLD = 6.0;
export const REVISION_THRESHOLD = 4.5;
