/**
 * baseball/src/utils/payoutLogic.ts
 * Thresholds tuned via scripts/simulate.mjs for the 5-card baseball roster
 * (1P + 4BAT). Blended bust rate 45.1% at default archetype weights.
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
  GOAT:     { minFp: 209, multiplier: 50  },  // ~2%  — legendary hand
  MVP:      { minFp: 171, multiplier: 15  },  // ~5%
  ALL_STAR: { minFp: 150, multiplier: 7   },  // ~8%
  STARTER:  { minFp: 128, multiplier: 2.5 },  // ~15%
  ROOKIE:   { minFp: 102, multiplier: 0.5 },  // ~25% — consolation
  BUST:     { minFp: 0,   multiplier: 0   },  // ~45%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASEBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASEBALL_WIN_TIERS);
}
