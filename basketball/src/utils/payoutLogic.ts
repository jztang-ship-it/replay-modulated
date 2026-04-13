/**
 * basketball/src/utils/payoutLogic.ts
 * Thresholds calibrated for $250 cap + 6-tier system (RED/ORANGE/PURPLE/BLUE/GREEN/WHITE).
 * Salary = round(avgFP × 1.39), range $13-$89. Tier boundaries in economyEngine.ts.
 * Engine mode: RED+ORANGE anchor + salary² weighting + biased log sampling + $244 salary floor.
 * Win rate calibration pending after $200 → $250 cap raise.
 * MUST stay in sync with WIN_TIERS in GameBar.tsx.
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
  GOAT:     { minFp: 240, multiplier: 50  },  // ~0.3% sim / ~0.5% real
  MVP:      { minFp: 225, multiplier: 15  },  // ~1.1% sim / ~2% real
  ALL_STAR: { minFp: 210, multiplier: 7   },  // ~5.3% sim / ~8% real
  STARTER:  { minFp: 195, multiplier: 2.5 },  // ~15.7% sim / ~18% real
  ROOKIE:   { minFp: 180, multiplier: 0.5 },  // ~28.2% sim / ~27% real
  BUST:     { minFp: 0,   multiplier: 0   },  // ~49.5% sim / ~35% real (hold/redraw lifts)
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