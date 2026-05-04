/**
 * football/src/utils/payoutLogic.ts
 *
 * Football win tier thresholds + payout multipliers.
 *
 * Football uses five display tiers (SUB / STARTER / CAPTAIN / MOTM / LEGEND).
 * Shared WinTierKey only has ROOKIE/STARTER/ALL_STAR/MVP/LEGEND so we map:
 *   ROOKIE   → SUB      (130+ FP, 0.5x)
 *   STARTER  → STARTER  (150+ FP, 1.5x)
 *   ALL_STAR → CAPTAIN  (167+ FP, 3x)
 *   MVP      → MOTM     (192+ FP, 8x)
 *   LEGEND   → LEGEND   (215+ FP, 50x)
 *
 * GameView display labels come from FOOTBALL_WIN_TIERS + LEGEND_DATA in
 * football/src/views/GameView.tsx — they show the football tier name
 * (SUB/CAPTAIN/MOTM) while the engine key stays in WinTierKey space.
 *
 * Thresholds: seed values for PR 1. PR 2 calibrates via 10k-hand simulator.
 * Must stay in sync with GAUGE_THRESHOLDS + WIN_TIERS in GameView.tsx.
 */
import {
  calculateWinTier         as _calculateWinTier,
  calculatePayout          as _calculatePayout,
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

/** Football win tier map. Keys are shared WinTierKey; display names live in GameView. */
export const FOOTBALL_WIN_TIERS: WinTierMap = {
  LEGEND:   { minFp: 215, multiplier: 50  },  // LEGEND tier
  MVP:      { minFp: 192, multiplier: 8   },  // MOTM tier
  ALL_STAR: { minFp: 167, multiplier: 3   },  // CAPTAIN tier
  STARTER:  { minFp: 150, multiplier: 1.5 },  // STARTER tier
  ROOKIE:   { minFp: 130, multiplier: 0.5 },  // SUB tier
  BUST:     { minFp: 0,   multiplier: 0   },
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, FOOTBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, FOOTBALL_WIN_TIERS);
}

export function calculatePayoutWithStreak(tier: WinTierKey, betAmount: number, streak: number): number {
  return _calculatePayoutWithStreak(tier, betAmount, FOOTBALL_WIN_TIERS, streak);
}