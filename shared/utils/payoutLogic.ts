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
//   3 wins → 1.3x | 5 wins → 1.7x | 10 wins → 2.5x

export interface StreakTier {
  wins: number;
  multiplier: number;
}

// Streak multipliers — rewarding win runs without over-subsidizing.
// Bumped from 1.2/1.5/2.0 → 1.3/1.7/2.5 to make streaks feel substantial
// for MVP-test retention. Aggregate edge impact ~1-2pt; perceived
// big-moment reward is much larger.
export const STREAK_TIERS: StreakTier[] = [
  { wins: 10, multiplier: 2.5 },
  { wins: 5,  multiplier: 1.7 },
  { wins: 3,  multiplier: 1.3 },
];

/** Get the active streak multiplier for a given win count. */
export function getStreakMultiplier(streak: number): number {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.wins) return tier.multiplier;
  }
  return 1.0;
}

/** Get the next streak tier the player is working toward (null if at max). */
export function getNextStreakTier(streak: number): StreakTier | null {
  // STREAK_TIERS is sorted descending; find the lowest tier not yet reached
  for (let i = STREAK_TIERS.length - 1; i >= 0; i--) {
    if (streak < STREAK_TIERS[i].wins) return STREAK_TIERS[i];
  }
  return null; // at max
}

/** Calculate payout with streak multiplier applied. */
export function calculatePayoutWithStreak(
  tier: WinTierKey,
  betAmount: number,
  tiers: WinTierMap,
  streak: number,
): number {
  const basePayout = calculatePayout(tier, betAmount, tiers);
  return Math.round(basePayout * getStreakMultiplier(streak));
}