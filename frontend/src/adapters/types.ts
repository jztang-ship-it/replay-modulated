// ==================================================================
// frontend/src/adapters/types.ts
// Single source of truth for UI + adapter types
// ==================================================================

export type Position = "FW" | "MD" | "DE" | "GK";

// Tier colors (highest to lowest)
export type TierColor = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

// IMPORTANT: Must match the UI state machine used in GameView + reveal flow
export type GamePhase =
  | "IDLE"
  | "DEALING"
  | "HOLD"
  | "DRAWING"
  | "REVEALING"
  | "WIN_CELEBRATION"
  | "RESULTS";

export interface GameInfo {
  date: string; // ISO string preferred
  opponent: string; // short code or name (SUN / ARS / etc.)
  homeAway?: "H" | "A";
}

export interface Achievement {
  id: string;
  label: string;
  icon?: string; // emoji/icon identifier
  fp?: number; // optional bonus FP
}

export interface PlayerCard {
  cardId: string;
  basePlayerId: string;

  // Optional presentation fields
  photoCode?: string;
  headshotUrl?: string; // optional if you ever attach it

  // Front of card
  name: string;
  team: string;
  season: string;
  position: Position;
  tier: TierColor;
  salary: number;
  projectedFp: number;

  // Results-only
  actualFp: number;
  fpDelta: number;

  // Back of card
  gameInfo: GameInfo;
  statLine: Record<string, any>;
  achievements: Achievement[];

  // Slot / hold metadata
  slotIndex: number;
  wasHeld?: boolean;

  // Optional: attach scoring breakdown if adapter provides it
  fpBreakdown?: Record<string, number>;
}

export interface ResolveResult {
  cards: PlayerCard[];
  totalFp: number;
  winTierLabel: string;

  // UI uses these (WinCelebration / recap)
  topContributors: Array<{ cardId: string; name: string; fp: number }>;
  mvpCardId: string;
}
