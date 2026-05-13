// shared/adapters/challengeTypes.ts
import type { GeneratedCard } from "../types/index";

export interface ShareCardConfig {
  sport: string;
  rosterSize: number;
  cardLayout: "3+2" | "2+3" | "2+2+1";
  statLabel: (card: GeneratedCard) => string;
  tierAccentColor: (tier: string) => string;
  tierLabel: (tier: string) => string;
  tierBgColor: (tier: string) => string;
}

export interface HandResult {
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
}

export interface ChallengeCtx {
  challengeId: string;
  initialRoster: GeneratedCard[];
  targetScore: number;
  challengerName: string;
  sport: string;
  season: string;
}
