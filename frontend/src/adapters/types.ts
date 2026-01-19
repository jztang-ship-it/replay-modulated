// apps/replay-ui/src/ui/engine/types.ts

export type Position = string;
export type TierColor = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";
export type GamePhase = "DEAL" | "HOLD" | "DRAW" | "RESULTS";

export type Achievement = { id: string; label: string };

export type GameInfo = {
  date: string; // e.g. "2024-03-10"
  opponent: string;
  homeAway?: "H" | "A";
  competition?: string;
};

export type PlayerCard = {
  // Internal only (DO NOT show):
  cardId: string;
  basePlayerId: string;

  photoCode?: string;


  // Front of card:
  name: string;
  team: string;
  season: string; // "2023-2024"
  position: Position;
  tier: TierColor;

  salary: number;       // shown
  projectedFp: number;  // shown

  // Results-only:
  actualFp?: number; // shown in results
  fpDelta?: number;  // actual - projected

  // Back of card (results-only flip):
  gameInfo?: GameInfo;
  statLine?: Record<string, number>;
  achievements?: Achievement[];
};

export type DealResult = {
  cards: PlayerCard[];
  capUsed: number;
  capMax: number;
};

export type ResolveResult = {
  cards: PlayerCard[];
  totalFp: number;
  winTierLabel: string;
  topContributors: Array<{ cardId: string; name: string; fp: number }>;
  mvpCardId: string;
};
