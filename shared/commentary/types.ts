/**
 * shared/commentary/types.ts
 * Sport-agnostic commentary system types.
 *
 * Every sport produces a CommentaryInput in the same shape and a sport-specific
 * culture injector returns CommentaryCultureNugget[]. The generator and prompt
 * builder are then 100% sport-agnostic.
 */

export type WinTier = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "GOAT";

export interface CommentaryRosterCard {
  name: string;
  salary: number;
  actualFp: number;
  projectedFp: number;
  /** Salary tier color: ORANGE / PURPLE / BLUE / GREEN / WHITE */
  cardTier?: string;
  statLine?: Record<string, any>;
  opponent?: string;
  homeAway?: "H" | "A" | "";
}

export interface CommentaryLeaderboard {
  rank?: number;
  /** FP needed to gain a position. Positive = currently behind. */
  gapToNext?: number;
  /** FP cushion above the next person below. Positive = currently ahead. */
  gapToPrev?: number;
}

export interface CommentaryInput {
  sport: string;
  totalFp: number;
  winTier: WinTier;
  nextTier?: WinTier | null;
  /** Floor FP for the achieved tier. */
  tierFloor?: number;
  /** Minimum FP for the next tier (used for near-miss math). */
  nextTierMin?: number;
  streak: number;
  prevStreak: number;
  isBust: boolean;
  handCount: number;
  roster: CommentaryRosterCard[];
  leaderboard?: CommentaryLeaderboard;
}

/**
 * Per-card culture context. Sport-specific injectors return a list of these.
 * The injector pre-filters tone arrays so only relevant phrasing reaches the model.
 */
export interface CommentaryCultureNugget {
  /** Must match input.roster[i].name exactly so the model can correlate. */
  playerName: string;
  knownFor?: string;
  nicknames?: string[];
  /** Tone-relevant lines pre-filtered for this card's actual performance. */
  relevantTones?: string[];
  /** Optional opponent-specific flavor (e.g. Harden vs OKC). */
  opponentFlavor?: string;
  /** Signature real games with date, opponent, FP, and teaser line. */
  signatureGames?: { date: string; opponent: string; fp: number; line: string }[];
  /** Opinionated salary value takes. */
  salaryNarrative?: string[];
  /** Hot/cold streak context lines. */
  streakLines?: string[];
  /** How they landed on their team + teammate chemistry. */
  teamContext?: string[];
  /** Draft story and career trajectory. */
  draftAndPath?: string[];
  /** Former team flavor lines. */
  formerTeam?: string[];
  /** Rivalry flavor lines. */
  rivalry?: string[];
  /** Career milestone lines. */
  milestones?: string[];
}

export interface CommentaryOutput {
  /** 1-2 sentences, max ~150 chars, single integrated thought. */
  commentary: string;
  /** Self-reported tone register. Used for client-side tone-history avoidance. */
  tone: string;
  /** Provenance — for debugging and metrics. */
  source: "claude" | "template" | "static";
}
