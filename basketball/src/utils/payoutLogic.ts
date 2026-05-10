/**
 * basketball/src/utils/payoutLogic.ts
 *
 * Per-season win-tier thresholds + payout multipliers.
 *
 * Thresholds are calibrated per season via `basketball/scripts/calibrateWinTiers.mjs`
 * so each season feels equally winnable for a balanced player. The threshold
 * data lives in `basketball/src/data/winThresholds.json`. Re-run the script
 * after data refresh or scoring-formula changes.
 *
 * Multipliers are static across seasons — they control payout, not difficulty.
 *
 * `BASKETBALL_WIN_TIERS` was the legacy static export. Use
 * `getBasketballWinTiers()` instead — it returns the active season's tiers.
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
import { getActiveSeason } from "@shared/engines/dataEngine";
import perSeasonThresholds from "../data/winThresholds.json";

export { getStreakMultiplier, getNextStreakTier, STREAK_TIERS };
export type { StreakTier };

import type { WinTierDisplay } from "@shared/components/GameBar";
import type { TierThreshold as GaugeTierThreshold } from "@shared/components/TierGauge";

export type { WinTierKey };
export type WinTier = WinTierKey;

const MULTIPLIERS: Record<WinTierKey, number> = {
  LEGEND: 50, MVP: 8, ALL_STAR: 3, STARTER: 1.5, ROOKIE: 0.5, BUST: 0,
};

// Fallback thresholds — used when active season is unset (e.g. unit tests,
// FTUE bypass before reel runs). Match the pre-per-season static design so
// existing tests don't shift behavior unexpectedly.
const FALLBACK_MIN_FP: Record<Exclude<WinTierKey, "BUST">, number> = {
  LEGEND: 255, MVP: 235, ALL_STAR: 225, STARTER: 205, ROOKIE: 185,
};

type SeasonThresholds = Record<Exclude<WinTierKey, "BUST">, number>;
const SEASON_TABLE = perSeasonThresholds as Record<string, SeasonThresholds>;

/** Build the WinTierMap for the active season (or fallback if unset). */
export function getBasketballWinTiers(): WinTierMap {
  const season = getActiveSeason();
  const minFps = (season && SEASON_TABLE[season]) ? SEASON_TABLE[season] : FALLBACK_MIN_FP;
  return {
    LEGEND:   { minFp: minFps.LEGEND,   multiplier: MULTIPLIERS.LEGEND },
    MVP:      { minFp: minFps.MVP,      multiplier: MULTIPLIERS.MVP },
    ALL_STAR: { minFp: minFps.ALL_STAR, multiplier: MULTIPLIERS.ALL_STAR },
    STARTER:  { minFp: minFps.STARTER,  multiplier: MULTIPLIERS.STARTER },
    ROOKIE:   { minFp: minFps.ROOKIE,   multiplier: MULTIPLIERS.ROOKIE },
    BUST:     { minFp: 0,                multiplier: MULTIPLIERS.BUST },
  };
}

/** Legacy export — alias for getBasketballWinTiers(). Kept for callers that
 *  destructure or reference the old name. New code should prefer the getter. */
export const BASKETBALL_WIN_TIERS: WinTierMap = new Proxy({} as WinTierMap, {
  get(_t, prop: string) { return (getBasketballWinTiers() as any)[prop]; },
  ownKeys() { return Object.keys(getBasketballWinTiers()); },
  getOwnPropertyDescriptor(_t, prop: string) {
    return { configurable: true, enumerable: true, value: (getBasketballWinTiers() as any)[prop] };
  },
});

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, getBasketballWinTiers());
}

export function calculatePayout(tier: WinTierKey, betAmount: number): number {
  return _calculatePayout(tier, betAmount, getBasketballWinTiers());
}

export function calculatePayoutWithStreak(tier: WinTierKey, betAmount: number, streak: number): number {
  return _calculatePayoutWithStreak(tier, betAmount, getBasketballWinTiers(), streak);
}

// Display arrays — derived from the same per-season thresholds so the gauge
// bar and GameBar tier rows always match what calculateWinTier() returns.
const TIER_COLORS: Record<Exclude<WinTierKey, "BUST">, { color: string; glow: string; label: string }> = {
  ROOKIE:   { label: "ROOKIE",   color: "#22C55E", glow: "rgba(34,197,94,0.6)"   },
  STARTER:  { label: "STARTER",  color: "#3B82F6", glow: "rgba(59,130,246,0.6)"  },
  ALL_STAR: { label: "ALL-STAR", color: "#C084FC", glow: "rgba(192,132,252,0.7)" },
  MVP:      { label: "MVP",      color: "#FB923C", glow: "rgba(251,146,60,0.7)"  },
  LEGEND:   { label: "LEGEND",   color: "#EF4444", glow: "rgba(239,68,68,0.9)"   },
};

export function getGaugeThresholds(): GaugeTierThreshold[] {
  const t = getBasketballWinTiers();
  return [
    { tier: "ROOKIE",   minFP: t.ROOKIE.minFp },
    { tier: "STARTER",  minFP: t.STARTER.minFp },
    { tier: "ALL_STAR", minFP: t.ALL_STAR.minFp },
    { tier: "MVP",      minFP: t.MVP.minFp },
    { tier: "LEGEND",   minFP: t.LEGEND.minFp },
  ];
}

export function getGameBarWinTiers(): WinTierDisplay[] {
  const t = getBasketballWinTiers();
  const order: Array<Exclude<WinTierKey, "BUST">> = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  return order.map(k => ({
    label: TIER_COLORS[k].label,
    minFp: t[k].minFp,
    color: TIER_COLORS[k].color,
    glow: TIER_COLORS[k].glow,
  }));
}
