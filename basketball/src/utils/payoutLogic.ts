/**
 * basketball/src/utils/payoutLogic.ts
 * Basketball win tier thresholds + payout multipliers.
 * Thresholds calibrated from simulator output.
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap } from "@shared/utils/payoutLogic";

export type { WinTierKey };
export type WinTier = WinTierKey;

export const BASKETBALL_WIN_TIERS: WinTierMap = {
  MVP:      { minFp: 200, multiplier: 15  },  // ~1%
  ALL_STAR: { minFp: 170, multiplier: 5   },  // ~5%
  STARTER:  { minFp: 150, multiplier: 2.5 },  // ~13%
  ROOKIE:   { minFp: 125, multiplier: 1.5 },  // ~34%
  BUST:     { minFp: 0,   multiplier: 0   },  // ~47%
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASKETBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASKETBALL_WIN_TIERS);
}