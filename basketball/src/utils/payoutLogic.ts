/**
 * basketball/src/utils/payoutLogic.ts
 *
 * "Slot-like" economy — calibrated via 10k-hand simulator with
 * salary-derived tiers. Targets ~48% bust, ~10% house edge pre-streak (~7-8% with streaks).
 *
 * MUST stay in sync with WIN_TIERS in GameBar.tsx and legend modal.
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
  calculatePayoutWithStreak as _calculatePayoutWithStreak,
  getStreakMultiplier,
  getNextStreakTier,
  STREAK_TIERS,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap, StreakTier } from "@shared/utils/payoutLogic";

export { getStreakMultiplier, getNextStreakTier, STREAK_TIERS };
export type { StreakTier };

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASKETBALL_WIN_TIERS: WinTierMap = {
  LEGEND:   { minFp: 255, multiplier: 50  },  // ~0.3% — top tier
  MVP:      { minFp: 235, multiplier: 8   },  // ~2%
  ALL_STAR: { minFp: 225, multiplier: 3   },  // ~4%
  STARTER:  { minFp: 205, multiplier: 1.5 },  // ~21%
  ROOKIE:   { minFp: 185, multiplier: 0.5 },  // ~28% — small return (MVP-test favorable; revert to 190 post-launch)
  BUST:     { minFp: 0,   multiplier: 0   },  // ~48%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASKETBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASKETBALL_WIN_TIERS);
}

export function calculatePayoutWithStreak(tier: WinTierKey, betAmount: number, streak: number): number {
  return _calculatePayoutWithStreak(tier, betAmount, BASKETBALL_WIN_TIERS, streak);
}
