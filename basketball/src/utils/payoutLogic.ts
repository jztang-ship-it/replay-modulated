/**
 * basketball/src/utils/payoutLogic.ts
 * Thresholds calibrated for biased engine (top-60% log sampling, March 2026).
 * Targets: ~55% BUST, ~25% ROOKIE, ~12% STARTER, ~5% ALL-STAR, ~2% MVP, ~0.5% GOAT
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
  GOAT:     { minFp: 235, multiplier: 0   },  // ~0.5% — bonus pool
  MVP:      { minFp: 215, multiplier: 15  },  // ~2%
  ALL_STAR: { minFp: 195, multiplier: 7   },  // ~5%
  STARTER:  { minFp: 175, multiplier: 2.5 },  // ~12%
  ROOKIE:   { minFp: 155, multiplier: 0.5 },  // ~25%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~55%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASKETBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASKETBALL_WIN_TIERS);
}