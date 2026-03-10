/**
 * worldcup/src/utils/payoutLogic.ts
 * Worldcup win tier thresholds + payout multipliers.
 * Thresholds from simulator output (6 players, worldcup FP scale).
 */
import {
  calculateWinTier as _calculateWinTier,
  calculatePayout  as _calculatePayout,
} from "@shared/utils/payoutLogic";
import type { WinTierKey, WinTierMap } from "@shared/utils/payoutLogic";

export type { WinTierKey };
export type WinTier = WinTierKey;

export const WORLDCUP_WIN_TIERS: WinTierMap = {
  MVP:      { minFp: 310, multiplier: 15  },
  ALL_STAR: { minFp: 255, multiplier: 5   },
  STARTER:  { minFp: 215, multiplier: 2.5 },
  ROOKIE:   { minFp: 170, multiplier: 1.5 },
  BUST:     { minFp: 0,   multiplier: 0   },
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, WORLDCUP_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, WORLDCUP_WIN_TIERS);
}