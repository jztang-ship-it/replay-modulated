/**
 * baseball/src/utils/payoutLogic.ts
 * Thresholds tuned for baseball FP distribution.
 * 6-card hand typical range: 150–400 FP, median ~230 FP.
 * Targets: ~50% BUST, ~25% ROOKIE, ~13% STARTER, ~7% ALL_STAR, ~3% MVP, ~1% GOAT
 * MUST stay in sync with TierGauge GAUGE_THRESHOLDS in GameView.tsx.
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap } from "@shared/utils/payoutLogic";

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASEBALL_WIN_TIERS: WinTierMap = {
  GOAT:     { minFp: 315, multiplier: 50  },  // ~1%  — legendary hand
  MVP:      { minFp: 275, multiplier: 15  },  // ~3%
  ALL_STAR: { minFp: 235, multiplier: 8   },  // ~7%
  STARTER:  { minFp: 195, multiplier: 3   },  // ~13%
  ROOKIE:   { minFp: 155, multiplier: 0.5 },  // ~25% — consolation
  BUST:     { minFp: 0,   multiplier: 0   },  // ~50%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASEBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASEBALL_WIN_TIERS);
}
