/**
 * shared/commentary/types.ts
 * Sport-agnostic commentary system types.
 *
 * Every sport produces a CommentaryInput in the same shape and a sport-specific
 * culture injector returns CommentaryCultureNugget[]. The generator and prompt
 * builder are then 100% sport-agnostic.
 */

export type WinTier = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "LEGEND";

export interface CommentaryRosterCard {
  name: string;
  salary: number;
  actualFp: number;
  projectedFp: number;
  /** Salary tier color: ORANGE / PURPLE / BLUE / GREEN / WHITE */
  cardTier?: string;
  statLine?: Record<string, any>;
  opponent?: string;
  /** ISO date of the source game — used for signature-game matching in culture commentary. */
  gameDate?: string;
  homeAway?: "H" | "A" | "";
  /** True if the card was held from a previous hand. */
  wasHeld?: boolean;
  /** Earned badges/achievements (e.g. TRIPLE_DBL, FIRE, DOUBLE_DBL) */
  achievements?: Array<{ id: string; label: string; icon?: string; fp?: number }>;
  /** Extreme game flags — outlier stat lines that deserve spotlight commentary */
  extremeFlags?: import("@shared/utils/extremeGames").ExtremeFlag[];
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

// ─── New commentary system types ─────────────────────────────────────────────

export type ToneId = "hype" | "warm" | "culture_wry" | "observational" | "analytical" | "deadpan";

export type StoryId =
  | "star_went_off"
  | "star_delivered"
  | "star_quiet_win"
  | "clean_win"
  | "star_no_showed"
  | "star_cold"
  | "star_carried_loss"
  | "everyone_flat"
  | "star_rare_badge";

export type Register = "win" | "loss";

export type Intensity =
  | "rookie"
  | "starter_barely"
  | "starter_normal"
  | "starter_dominant"
  | "all_star"
  | "mvp"
  | "goat"
  | "bust_close"
  | "bust_mid"
  | "bust_bad";

export type DetailId =
  | "record_event"
  | "rare_badge"
  | "common_badge"
  | "held_card_paid"
  | "high_stats"
  | "near_miss_win"
  | "near_miss_loss"
  | "streak_event"
  | "culture_hit"
  | "culture_loss"
  | "zero_card"
  | "turnover_problem"
  | "injury_cost"
  | "streak_proximity"
  | "streak_broken"
  | "extreme_game";

export interface RecordEvent {
  type: "record_broken" | "near_record" | "career_milestone";
  stat: string;
  value: number;
  record: number;
  holder: string;
  label: string;
}

export interface StoryResult {
  storyId: StoryId;
  details: DetailId[];
  recordEvents: RecordEvent[];
}

export interface CommentaryTemplate {
  register: Register;
  story: StoryId;
  tone: ToneId;
  templates: string[];
}

export interface ComposedCommentary {
  message: string;
  tone: ToneId;
  storyId: StoryId;
  register: Register;
  intensity: Intensity;
}

export interface TemplateData {
  name: string;
  last: string;
  first: string;
  nick: string;
  nick2: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  opp: string;
  badge: string;
  /** Highest stat with unit, e.g. "22 pt" — used in badge-focused templates */
  topStat: string;
  streak: number;
  gap: number;
  record: string;
  recordHolder: string;
  recordValue: number;
  /** Pre-built description of the most extreme game in the hand */
  extremeDescription: string;
}

// ─── Unified commentary engine types ────────────────────────────────────────

/** Master archetype system — exactly one per hand. Schema supports 32, ~13 active. */
export type CommentaryArchetype =
  // ── Active (populated with lines) ──
  | "star_carry"
  | "star_carry_big"
  | "star_delivered"
  | "balanced_win"
  | "badge_explosion"
  | "near_miss"
  | "star_failed"
  | "star_cold"
  | "star_carried_loss"
  | "everyone_flat"
  | "ugly_win"
  | "collapse"
  | "career_night"
  // ── Reserved (schema only, no lines yet) ──
  | "streak_first"
  | "streak_milestone"
  | "streak_broken"
  | "hold_rewarded"
  | "draw_rewarded"
  | "smart_hold_star"
  | "smart_hold_role_player"
  | "painful_near_miss"
  | "anchor_underperformed"
  | "one_player_threw"
  | "outlier_bench_hero"
  | "ice_cold"
  | "lucky_escape"
  | "comfortable_win"
  | "dominant_win"
  | "goat_clinch"
  | "mvp_clinch"
  | "bust_result"
  | "high_score_low_reward"
  | "wrong_star_wrong_night"
  | "clutch_finish"
  | "overperformance_shock"
  | "underperformance_shock";

/** Canonical input to the runtime commentary selector. Built once per hand. */
export interface CommentaryContext {
  sport: string;
  register: Register;
  archetype: CommentaryArchetype;
  intensity: Intensity;
  tone: ToneId;

  totalFp: number;
  tierReached: WinTier;
  deltaToNextTier: number;
  nearMiss: boolean;

  star: CommentaryRosterCard | null;
  starRatio: number;
  culprit: CommentaryRosterCard | null;

  highestBadge: { tier: number; commentaryLabel: string; multiStat?: boolean; id: string } | null;
  hasTier1Extreme: boolean;

  streak: number;
  prevStreak: number;

  seed: number;

  /** Pre-built template data for token resolution */
  templateData: TemplateData;
  /** Detail IDs from story assembly */
  details: DetailId[];
  recordEvents: RecordEvent[];
}

/** Single line in the commentary library. Grouped by archetype in the library file. */
export interface CommentaryLine {
  id: string;
  sport: "any" | "basketball" | "baseball";
  archetype: CommentaryArchetype;
  register: Register;
  tone: ToneId;
  intensity?: Intensity[];
  template: string;
  /** Tokens this template requires to be non-empty */
  requires?: string[];
  /** Context flags that must NOT be present */
  forbids?: string[];
  tags?: string[];
  humorStyle?: string[];
  qualityScore?: number;
  enabled: boolean;
}

/** Grouped library format — archetypes are top-level keys */
export interface CommentaryLibrary {
  [archetype: string]: CommentaryLine[];
}

/** Output of the runtime selector */
export interface CommentaryResult {
  mainLine: string;
  subLine?: string | null;
  stamp?: string | null;
  archetype: CommentaryArchetype;
  tone: ToneId;
  lineId: string;
}
