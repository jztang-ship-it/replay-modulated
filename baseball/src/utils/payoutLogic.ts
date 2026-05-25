/**
 * baseball/src/utils/payoutLogic.ts
 * Thresholds for the 5-card baseball roster (2P + 3BAT, 617-player pool,
 * $180 cap, salary = round(avgFP)). Even +30 spacing ROOKIE→MVP, LEGEND
 * ceiling raised +50 from MVP to keep LEGEND rate near target 2%.
 * 20k-hand random-play sim: 46.6/20.9/15.0/9.3/6.3/2.0.
 * MUST stay in sync with:
 *   - baseball/src/adapters/baseballConfig.ts winCondition.thresholds
 *   - baseball/src/views/GameView.tsx GAUGE_THRESHOLDS + WIN_TIERS + LEGEND_DATA
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
  calculatePayoutWithStreak as _calculatePayoutWithStreak,
  getStreakMultiplier as _getStreakMultiplier,
  getNextStreakTier as _getNextStreakTier,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap, StreakTier } from "@shared/utils/payoutLogic";

// Baseball streak schedule — historical 3/5/10 → 1.3/1.7/2.5 values.
// Per-sport so basketball can rebalance without affecting baseball.
export const STREAK_TIERS: StreakTier[] = [
  { wins: 10, multiplier: 2.5 },
  { wins: 5,  multiplier: 1.7 },
  { wins: 3,  multiplier: 1.3 },
];

/** Baseball streak multiplier — sport-bound wrapper. */
export function getStreakMultiplier(streak: number): number {
  return _getStreakMultiplier(streak, STREAK_TIERS);
}
/** Baseball next-streak-tier — sport-bound wrapper. */
export function getNextStreakTier(streak: number): StreakTier | null {
  return _getNextStreakTier(streak, STREAK_TIERS);
}
export type { StreakTier };

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASEBALL_WIN_TIERS: WinTierMap = {
  LEGEND:   { minFp: 310, multiplier: 50  },  // ~2%
  MVP:      { minFp: 260, multiplier: 15  },  // ~6%
  ALL_STAR: { minFp: 230, multiplier: 7   },  // ~9%
  STARTER:  { minFp: 200, multiplier: 2.5 },  // ~15%
  ROOKIE:   { minFp: 170, multiplier: 0.5 },  // ~21%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~47%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASEBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASEBALL_WIN_TIERS);
}

export function calculatePayoutWithStreak(tier: WinTierKey, betAmount: number, streak: number): number {
  return _calculatePayoutWithStreak(tier, betAmount, BASEBALL_WIN_TIERS, streak, STREAK_TIERS);
}
