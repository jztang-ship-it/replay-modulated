/**
 * shared/utils/payoutLogic.ts
 *
 * Sport-agnostic payout logic. Win tier thresholds and multipliers
 * are injected per sport — every sport can have completely different
 * FP ranges, tier counts, and payout multipliers.
 *
 * Usage:
 *   import { calculateWinTier, calculatePayout, type WinTierConfig } from "@shared/utils/payoutLogic";
 */

export type WinTierKey = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "JACKPOT" | "GOAT";

export interface WinTierConfig {
  /** Minimum FP to reach this tier (BUST has no minimum — it's the fallback) */
  minFp: number;
  /** Payout multiplier on bet amount (BUST = 0) */
  multiplier: number;
}

export type WinTierMap = Partial<Record<WinTierKey, WinTierConfig>>;

/**
 * Calculate which win tier a total FP score lands in.
 * Tiers are evaluated highest-first; first match wins.
 */
export function calculateWinTier(totalFp: number, tiers: WinTierMap): WinTierKey {
  // Round to 1 decimal to avoid floating point edge cases (e.g. 174.9999 vs 175.0)
  const fp = Math.round(totalFp * 10) / 10;
  if (tiers.GOAT     && fp >= tiers.GOAT.minFp)     return "GOAT";
  if (tiers.JACKPOT  && fp >= tiers.JACKPOT.minFp)  return "JACKPOT";
  if (tiers.MVP      && fp >= tiers.MVP.minFp)      return "MVP";
  if (tiers.ALL_STAR && fp >= tiers.ALL_STAR.minFp) return "ALL_STAR";
  if (tiers.STARTER  && fp >= tiers.STARTER.minFp)  return "STARTER";
  if (tiers.ROOKIE   && fp >= tiers.ROOKIE.minFp)   return "ROOKIE";
  return "BUST";
}

/**
 * Calculate payout amount for a given tier and bet.
 */
export function calculatePayout(tier: WinTierKey, betAmount: number, tiers: WinTierMap): number {
  return betAmount * (tiers[tier]?.multiplier ?? 0);
}