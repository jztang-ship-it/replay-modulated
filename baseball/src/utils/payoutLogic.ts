/**
 * baseball/src/utils/payoutLogic.ts
 * Thresholds for the 5-card baseball roster (2P + 3BAT, 617-player pool,
 * $150 cap, salary = round(avgFP)). Even +30 FP spacing across all tiers.
 * 20k-hand random-play sim: 43.4/24.9/17.2/9.0/3.7/1.7.
 * MUST stay in sync with:
 *   - baseball/src/adapters/baseballConfig.ts winCondition.thresholds
 *   - baseball/src/views/GameView.tsx GAUGE_THRESHOLDS
 *   - baseball/src/components/GameBar.tsx WIN_TIERS / LEGEND.payoutRows
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap } from "@shared/utils/payoutLogic";

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASEBALL_WIN_TIERS: WinTierMap = {
  LEGEND:   { minFp: 260, multiplier: 50  },  // ~2%
  MVP:      { minFp: 230, multiplier: 15  },  // ~4%
  ALL_STAR: { minFp: 200, multiplier: 7   },  // ~9%
  STARTER:  { minFp: 170, multiplier: 2.5 },  // ~17%
  ROOKIE:   { minFp: 140, multiplier: 0.5 },  // ~25%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~43%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASEBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASEBALL_WIN_TIERS);
}
