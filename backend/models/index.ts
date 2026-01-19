/**
 * Core type definitions for iReplay fantasy sports engine
 * These types are sport-agnostic and form the foundation of the system
 */

export type GameState = 'IDLE' | 'INITIAL_DEAL' | 'HOLD_PHASE' | 'FINAL_DRAW' | 'RESOLUTION' | 'RESULT';

export interface Player {
  id: string;
  name: string;
  position: string;
  salary: number;
  team: string;
  tier?: 'ORANGE' | 'PURPLE' | 'BLUE' | 'GREEN' | 'WHITE';
  
  /**
   * NEW: basePlayerId
   * Used to identify the "human" across different season cards.
   * If missing, the validation/generation engines will fall back to using 'id'.
   */
  basePlayerId?: string;
}

export interface GameLog {
  playerId: string;
  stats: Record<string, number>;
  events: Record<string, number>;
  gameDate: string;
  minutes?: number;
  snaps?: number;
  attempts?: number;
}

export interface Lineup {
  players: Player[];
  totalSalary: number;
}

export interface HistoricalLogFilters {
  seasonsBack: number;
  minMinutes?: number;
  minSnaps?: number;
  minAttempts?: number;
}

export type WinConditionType = 'FIXED_THRESHOLD' | 'HEAD_TO_HEAD';

export interface FixedThresholdWinCondition {
  type: 'FIXED_THRESHOLD';
  thresholds: Array<{
    tier: string;
    minFP: number;
  }>;
}

export interface HeadToHeadWinCondition {
  type: 'HEAD_TO_HEAD';
}

export type WinCondition = FixedThresholdWinCondition | HeadToHeadWinCondition;

export interface SportConfig {
  name: string;
  positions: string[];
  salaryCap: number;
  minPlayers: number;
  maxPlayers: number;
  positionLimits: Record<string, { min: number; max: number }>;
  statCategories: string[];
  projectionWeights: Record<string, number>;
  historicalLogFilters: HistoricalLogFilters;
  winCondition: WinCondition;
  achievements: AchievementRule[];
  lineupGenerationMode?: 'STRICT' | 'RELAXED';
  requiredPositions?: string[];
  anchorStrategy?: {
    mode: 'ONE_ORANGE_OR_TWO_PURPLE';
    minTotalSalary?: number;
  };
}

export interface Projection {
  playerId: string;
  projectedStats: Record<string, number>;
  projectedPoints: number;
}

export interface Resolution {
  playerId: string;
  actualStats: Record<string, number>;
  actualEvents: Record<string, number>;
  baseFantasyPoints: number;
  achievementBonus: number;
  fantasyPoints: number;
  triggeredAchievements: TriggeredAchievement[];
}

export interface GameResult {
  lineup: Lineup;
  projections: Projection[];
  resolution: Resolution[];
  totalPoints: number;
}

export interface RosterSlot {
  index: number;
  player: Player | null;
  held: boolean;
}

export interface GameSession {
  sessionId: string;
  sportId: string;
  seed: number;
  state: GameState;
  roster: RosterSlot[];
  remainingCap: number;
  resolvedTeamFP: number | null;
  winResult: boolean | null;
}

export type TriggerCondition =
  | { type: 'STAT_THRESHOLD'; stat: string; operator: '>=' | '<=' | '>'; value: number }
  | { type: 'EVENT_COUNT'; event: string; operator: '>='; value: number }
  | { type: 'COMPOSITE'; all: TriggerCondition[] };

export type RewardEffect =
  | { type: 'BONUS_FP'; value: number }
  | { type: 'PENALTY_FP'; value: number }
  | { type: 'MULTIPLIER'; value: number };

export interface VisualEffect {
  badgeId: string;
  animation: 'burst' | 'flash' | 'shake';
  sound: string;
}

export interface AchievementRule {
  id: string;
  name: string;
  trigger: TriggerCondition;
  reward: RewardEffect;
  visual: VisualEffect;
}

export interface TriggeredAchievement {
  ruleId: string;
  playerId: string;
  reward: RewardEffect;
  visual: VisualEffect;
}

export interface EngineContext {
  sportConfig: SportConfig;
  players: Player[];
  gameLogs: GameLog[];
  seed?: number;
}
