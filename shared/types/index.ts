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
  /** Optional external player IDs for image resolution. Football uses
   *  apiFootballId to construct API-Football CDN URLs. Other sports
   *  may add their own IDs here without breaking existing data. */
  externalIds?: {
    apiFootballId?: string | number;
    theSportsDbId?: string | number;
  };
  name: string;
  team: string;
  /** Distinct teams a player was on this season, in chronological order.
   *  Populated for sports whose data captures mid-season trades (basketball
   *  via enrichPlayerTeams.mjs). Single-team players: same as [team]. Used
   *  to render multi-team notch (e.g. "HOU/BKN") and to trigger former-team
   *  commentary when opponent ∈ teams. */
  teams?: string[];
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
  /** Optional external player IDs for image resolution. See
   *  shared/media/playerImages.ts for resolution strategy. */
  externalIds?: {
    apiFootballId?: string | number;
    theSportsDbId?: string | number;
  };
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
  /** True if the player suffered a within-game injury that limited or ended
   *  their participation in this specific game. Default false / treated as
   *  false when absent. Today's ingestion (extractNbaSeason.mjs → stats.nba.com
   *  leaguegamelog) doesn't populate this flag — sub-10-min outcomes default
   *  to "ambiguous" and the coach-DNP commentary path fires. Will be plumbed
   *  through once playbyplayv2 ingestion + injury-source enrichment lands. */
  injured?: boolean;
  /** True if the player was ejected from this specific game. Default false /
   *  treated as false when absent. Today's ingestion doesn't populate this
   *  flag — see `injured` note above. Will be plumbed via playbyplayv2 in a
   *  follow-up workstream (event type 11 ejection events). */
  ejected?: boolean;
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
  /** Whether the sport enforces positional roster slots. Default true.
   *  Set false on sports whose positions accumulate the same stat
   *  categories (basketball). Position-agnostic sports skip the
   *  per-position pool logic in generateRoster + redrawRoster; the
   *  rest of the pipeline (anchor pick, cap enforcement, tier-floor
   *  guarantee) still runs against the full eval pool. See
   *  CLAUDE.md "Positional requirements rule". */
  positionAware?: boolean;
}

export interface PlayerEval {
  id: string;
  basePlayerId: string;
  personKey: string;
  cardId: string;
  name: string;
  team: string;
  /** Distinct teams a player was on this season (chronological). See
   *  PlayerCard.teams. Optional — single-team players omit it. */
  teams?: string[];
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
  /** Whether the sport enforces positional roster slots. Default true.
   *  Basketball sets this to false (all positions accumulate the same
   *  stat categories — see CLAUDE.md "Positional requirements rule"). */
  positionAware?: boolean;
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
  /** Optional list of seasons currently in the active player pool. When
   *  set, the runtime adapter AND the simulator filter players + logs to
   *  these seasons only. Football ships with ["2022"] at launch (WC '22
   *  squads, ~622 players, ~1648 logs); 2018 data stays in source files
   *  but is dormant. Sports with one active season (basketball, baseball)
   *  omit and see no filter. */
  activeSeasons?: string[];
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