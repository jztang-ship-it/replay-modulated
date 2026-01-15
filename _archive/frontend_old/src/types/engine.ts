/**
 * Type definitions matching the backend engine
 * These should mirror the backend models
 */

export enum GameState {
  IDLE = 'IDLE',
  INITIAL_DEAL = 'INITIAL_DEAL',
  HOLD_PHASE = 'HOLD_PHASE',
  FINAL_DRAW = 'FINAL_DRAW',
  RESOLUTION = 'RESOLUTION',
  RESULT = 'RESULT',
}

export interface Player {
  id: string;
  name: string;
  position: string;
  salary: number;
  team: string;
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

export interface Resolution {
  playerId: string;
  actualStats: Record<string, number>;
  fantasyPoints: number;
}

export interface Projection {
  playerId: string;
  projectedStats: Record<string, number>;
  projectedPoints: number;
}

export type PlayerTier = 'orange' | 'purple' | 'blue' | 'green' | 'white';
