
import {
  calculateWinTier as _calculateWinTier,
} from "@shared/utils/scoreTiers";
import type { WinTierKey, WinTierMap } from "@shared/utils/scoreTiers";
import { getActiveSeason } from "@shared/engines/dataEngine";
import { getHandStatus, type HandStatus } from "@shared/utils/handStatus";
import { getSeasonThresholds } from "./seasonThresholds.js";

export const HEATER_MIN = 255;
export const COLD_NIGHT_MAX = 120;
export type { HandStatus };

/** Basketball hand-status — sport-bound wrapper over the shared mechanism. */
export function getBasketballHandStatus(totalFp: number): HandStatus | null {
  return getHandStatus(totalFp, HEATER_MIN, COLD_NIGHT_MAX);
}

import type { WinTierDisplay } from "@shared/components/GameBar";
import type { TierThreshold as GaugeTierThreshold } from "@shared/components/TierGauge";

export type { WinTierKey };
export type WinTier = WinTierKey;

/** Build the WinTierMap for the active season (or fallback if unset). */
export function getBasketballWinTiers(): WinTierMap {
  const season = getActiveSeason();
  const minFps = getSeasonThresholds(season);
  return {
    LEGEND:   { minFp: minFps.LEGEND },
    MVP:      { minFp: minFps.MVP },
    ALL_STAR: { minFp: minFps.ALL_STAR },
    STARTER:  { minFp: minFps.STARTER },
    ROOKIE:   { minFp: minFps.ROOKIE },
    BUST:     { minFp: 0 },
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
