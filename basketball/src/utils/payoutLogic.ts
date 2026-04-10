/**
 * basketball/src/utils/payoutLogic.ts
 * Thresholds tuned for 362-player pool (2425 only, avgMin>=15, pyramid tiers).
 * Bust 43.6%, ROOKIE 25.7%, STARTER 17.9%, ALL_STAR 8.8%, MVP 3.4%, GOAT 0.6%
 * MUST stay in sync with TierGauge thresholds in GameView.tsx.
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap } from "@shared/utils/payoutLogic";

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASKETBALL_WIN_TIERS: WinTierMap = {
  GOAT:     { minFp: 235, multiplier: 50  },  // ~0.4%
  MVP:      { minFp: 205, multiplier: 15  },  // ~2.5%
  ALL_STAR: { minFp: 180, multiplier: 7   },  // ~6.5%
  STARTER:  { minFp: 155, multiplier: 2.5 },  // ~18%
  ROOKIE:   { minFp: 130, multiplier: 0.5 },  // ~25%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~47%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASKETBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASKETBALL_WIN_TIERS);
}