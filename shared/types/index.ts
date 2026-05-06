/**
 * shared/types/index.ts
 * Single source of truth for all sport-agnostic types.
 */

export type TierColor = "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";
export type Position = string;

export type GamePhase =
  | "IDLE"
  | "DEALING"
  | "HOLD"
  | "DRAWING"
  | "REVEALING"
  | "WIN_CELEBRATION"
  | "RESULTS";

export interface GameInfo {
  date: string;
  opponent: string;
  homeAway?: "H" | "A";
}

export interface Achievement {
  id: string;
  label: string;
  icon?: string;
  fp?: number;
}

export interface PlayerCard {
  cardId: string;
  basePlayerId: string;
  photoCode?: string;
  headshotUrl?: string;
  name: string;
  team: string;
  season: string;
  position: Position;
  tier: TierColor;
  salary: number;
  projectedFp: number;
  actualFp: number;
  fpDelta: number;
  gameInfo: GameInfo;
  statLine: Record<string, any>;
  achievements: Achievement[];
  slotIndex: number;
  wasHeld?: boolean;
  fpBreakdown?: Record<string, number>;
  /** Daily bonus FP added to actualFp. 0 or undefined if not a hot player today. */
  dailyBonus?: number;
}

export interface ResolveResult {
  cards: PlayerCard[];
  totalFp: number;
  winTierLabel: string;
  topContributors: Array<{ cardId: string; name: string; fp: number }>;
  mvpCardId: string;
}

export type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  season: string | number;
  position: string;
  tier?: string;
  salary?: number | string;
  photoCode?: number | string;
  avgFP?: number;
  projectedFp?: number;
  active?: boolean;
};

export type RawLog = {
  id?: string;
  sport?: string;
  playerId?: string;
  basePlayerId?: string;
  season?: number | string;
  matchDate?: string;
  date?: string;
  opponent?: string;
  homeAway?: "H" | "A";
  meta?: {
    date?: string;
    opponent?: string;
    homeAway?: string;
    fixtureId?: number;
    score?: string;
  };
  stats: Record<string, any>;
  events?: Record<string, any>;
};

export interface TierThreshold {
  tier: TierColor;
  minSalary: number;
}

export interface EconomyConfig {
  capMax: number;
  salaryMin: number;
  salaryMax: number;
  tierThresholds: TierThreshold[];
  salaryRatioCeiling: number;
  salaryRatioFloor: number;
}

export type SlotRequirement = string | "FLEX";

export interface RosterConfig {
  rosterSize: number;
  slotRequirements: SlotRequirement[];
  excludeFromFlex?: string[];
}

export interface PlayerEval {
  id: string;
  basePlayerId: string;
  personKey: string;
  cardId: string;
  name: string;
  team: string;
  season: string;
  position: string;
  photoCode?: string;
  projectedFp: number;
  salary: number;
  tier: TierColor;
}

export interface GeneratedCard extends PlayerEval {
  slotIndex: number;
  wasHeld: boolean;
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: any[];
}

export interface ResolvedCard extends GeneratedCard {
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: Achievement[];
}

export interface WinTier {
  name: string;
  minFp: number;
  multiplier: number;
  color: string;
}

export interface SportConfigShape {
  sportKey: string;
  sportLabel?: string;
  /** Active competition (e.g. "world_cup", "epl"). Optional — sports with one
   *  competition (basketball/NBA, baseball/MLB) omit this. Football requires it. */
  competition?: string;
  displayName?: string;
  positions: string[];
  positionAliases?: Record<string, string>;
  rosterSlots?: readonly string[];
  rosterSize?: number;
  maxPlayers?: number;
  excludeFromFlex?: string[];
  salaryCap: number;
  economyConfig?: {
    capMax: number;
    capMin: number;
    salaryMin: number;
    salaryMax: number;
  };
  positionLimits?: Record<string, { min: number; max: number }>;
  projectionWeights: Record<string, number>;
  positionProjectionWeights?: Record<string, Record<string, number>>;
  /** Optional per-position FP multiplier applied AFTER weighted-stat sum,
   *  BEFORE badges. Used by sports where a single position's stat profile
   *  produces systemically lower raw FP than other positions and needs
   *  scaling to comparable ranges. Football: GK = 4.0 (saves are
   *  weighted realistically but cumulative FP underperforms outfield
   *  totals without scaling). Basketball/baseball omit. */
  positionMultipliers?: Record<string, number>;
  tierThresholds?: Array<{ tier: string; minSalary: number }>;
  statCategories?: readonly string[];
  statDisplay?: Record<string, Array<{ key: string; label: string }>>;
  badges?: Array<{
    id: string;
    icon: string;
    label: string;
    fp: number;
    test?: (stats: Record<string, any>) => boolean;
    trigger?: (stats: Record<string, any>) => boolean;
    position?: string;
    suppresses?: string[];
    suppressedBy?: string[];
  }>;
  winTiers?: WinTier[];
  headshotUrl?: (playerId: string) => string | null;

  /** Slate v2: total players in today's slate. Default = rosterSize × 10. */
  slateSize?: number;

  /** Slate v2: anchor players always present. Default = 10. */
  anchorCount?: number;

  /** Slate v2: career FP weighting exponent for rotating slots. Default = 1.0 (linear). */
  weightExponent?: number;

  /** Slate v2: manual exclusion list (player IDs to skip). Default = []. */
  exclusionList?: string[];

  /** Slate v2 phase 2: themed-day display metadata, keyed by theme key. */
  themes?: Record<string, { displayName: string; description: string; iconKey?: string }>;
}

export interface NormalizedPlayer {
  id: string;
  basePlayerId: string;
  name: string;
  team: string;
  position: string;
  season: string;
  salary: number;
  tier: TierColor;
  avgFP: number;
  projectedFp: number;
  active: boolean;
}

export interface NormalizedLog {
  basePlayerId: string;
  date: string;
  matchDate: string;
  season: string;
  opponent: string;
  homeAway: "H" | "A" | "";
  stats: Record<string, number>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    playerCount: number;
    logCount: number;
    positionCoverage: Record<string, number>;
    tierDistribution: Record<string, number>;
    playersWithLogs: number;
    avgLogsPerPlayer: number;
  };
}

export interface GameEvent {
  sessionId: string;
  sport: string;
  eventType: "GAME_STARTED" | "HAND_DEALT" | "CARDS_HELD" | "REDRAW" | "RESOLVE" | "WIN" | "SESSION_END";
  timestamp: number;
  data?: Record<string, any>;
}

export interface SessionMetrics {
  sessionId: string;
  sport: string;
  startTime: number;
  endTime?: number;
  handsPlayed: number;
  totalFpScored: number;
  winTierCounts: Record<string, number>;
  peakBalance: number;
}