export type AchievementTier = "bronze" | "silver" | "gold";

export interface CardScore {
  fp: number;
  stats: Record<string, unknown>;
  position: string;   // normalized (e.g. "PG", "C", "SF")
  name: string;
  team: string;
  tier: string;       // "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE"
  season: string;     // compact 4-char format: "2425", "9900", "7980"
  photoCode?: string;
}

export interface AchievementContext {
  sport: string;
  season: string;                     // slate season (matches all cards in a standard hand)
  handId: string;
  totalFp: number;
  fpTier: string;                     // "BUST"|"ROOKIE"|"STARTER"|"ALL_STAR"|"MVP"|"LEGEND"
  isWin: boolean;                     // true = STARTER+
  rosterIds: string[];
  cards: CardScore[];
  streak: number;                     // current streak after this hand
  handsPlayed: number;                // total hands including this one
  existingAchievementIds: string[];   // already-unlocked — prevents re-awarding
}

export interface AchievementDef {
  id: string;
  tier: AchievementTier;
  sport: string;           // "basketball" | "baseball" | "all"
  title: string;
  description: string;
  predicate: (ctx: AchievementContext) => boolean;
}

export interface AchievementResult {
  achievementId: string;
  unlockedAt: string;      // ISO timestamp
  sourceHandId: string;
  sport: string;
}
