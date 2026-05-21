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

export type WinTierKey = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "LEGEND";

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
  if (tiers.LEGEND     && fp >= tiers.LEGEND.minFp)     return "LEGEND";
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

// ── Streak multiplier system ────────────────────────────────────────────────
// Consecutive non-bust wins boost payouts. Losing resets streak to 0.
//
// The STREAK_TIERS array is sport-specific (basketball / baseball / football
// each define their own in their per-sport payoutLogic.ts). The shape and
// the helpers below are shared infrastructure; pass the sport's tiers in.

export interface StreakTier {
  wins: number;
  multiplier: number;
}

/** Get the active streak multiplier for a given win count.
 *  streakTiers must be sorted descending by wins. */
export function getStreakMultiplier(streak: number, streakTiers: StreakTier[]): number {
  for (const tier of streakTiers) {
    if (streak >= tier.wins) return tier.multiplier;
  }
  return 1.0;
}

/** Get the next streak tier the player is working toward (null if at max). */
export function getNextStreakTier(streak: number, streakTiers: StreakTier[]): StreakTier | null {
  // streakTiers is sorted descending; find the lowest tier not yet reached
  for (let i = streakTiers.length - 1; i >= 0; i--) {
    if (streak < streakTiers[i].wins) return streakTiers[i];
  }
  return null; // at max
}

/** Calculate payout with streak multiplier applied. */
export function calculatePayoutWithStreak(
  tier: WinTierKey,
  betAmount: number,
  tiers: WinTierMap,
  streak: number,
  streakTiers: StreakTier[],
): number {
  const basePayout = calculatePayout(tier, betAmount, tiers);
  return Math.round(basePayout * getStreakMultiplier(streak, streakTiers));
}