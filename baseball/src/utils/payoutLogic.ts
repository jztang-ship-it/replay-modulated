/**
 * baseball/src/utils/payoutLogic.ts
 * Thresholds tuned via scripts/simulate.mjs for the 5-card baseball roster
 * (2P + 3BAT, 617 players, pyramid tiers). Blended bust rate 46.6%.
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
  GOAT:     { minFp: 280, multiplier: 50  },  // ~0.9%
  MVP:      { minFp: 240, multiplier: 15  },  // ~3.7%
  ALL_STAR: { minFp: 208, multiplier: 7   },  // ~8.9%
  STARTER:  { minFp: 178, multiplier: 2.5 },  // ~16.1%
  ROOKIE:   { minFp: 148, multiplier: 0.5 },  // ~23.7%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~46.6%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASEBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASEBALL_WIN_TIERS);
}
