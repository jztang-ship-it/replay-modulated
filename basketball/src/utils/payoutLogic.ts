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
  JACKPOT:  { minFp: 225, multiplier: 50  },  // ~0.1% — community pool
  MVP:      { minFp: 207, multiplier: 15  },  // ~1%
  ALL_STAR: { minFp: 183, multiplier: 7   },  // ~5%
  STARTER:  { minFp: 160, multiplier: 2.5 },  // ~13%
  ROOKIE:   { minFp: 133, multiplier: 0.5 },  // ~29%
  BUST:     { minFp: 0,   multiplier: 0   },  // rest
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, BASKETBALL_WIN_TIERS);
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, BASKETBALL_WIN_TIERS);
}