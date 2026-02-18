// ==================================================================
// COMPLETE FIXED types.ts - WITH CORRECT TIER COLORS
// ==================================================================

export type Position = "FW" | "MD" | "DE" | "GK";

// YOUR ACTUAL TIER COLORS (highest to lowest):
export type TierColor = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

export type GamePhase = "HOLD" | "RESULTS";

export interface GameInfo {
  date: string;
  opponent: string;
  homeAway?: "H" | "A";
}

export interface Achievement {
  id: string;
  label: string;
  // NEW: For emotional reveal badge drops
  icon?: string;  // Emoji or icon identifier
  fp?: number;    // Bonus FP from this achievement
}

export interface PlayerCard {
  cardId: string;
  basePlayerId: string;
  photoCode?: string;
  
  // Front of card:
  name: string;
  team: string;
  season: string;
  position: Position;
  tier: TierColor;
  salary: number;
  projectedFp: number;
  
  // Results-only:
  actualFp: number;
  fpDelta: number;
  
  // Back of card (results-only flip):
  gameInfo: GameInfo;
  statLine: Record<string, any>;
  achievements: Achievement[];
  
  // NEW FIELDS:
  slotIndex: number;
  wasHeld?: boolean;
}

export interface ResolveResult {
  cards: PlayerCard[];
  totalFp: number;
  winTierLabel: string;
  topContributors: Array<{ cardId: string; name: string; fp: number }>;
  mvpCardId: string;
}