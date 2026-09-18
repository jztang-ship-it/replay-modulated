/**
 * football/src/utils/scoreTiers.ts
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
  getStreakMultiplier      as _getStreakMultiplier,
  getNextStreakTier        as _getNextStreakTier,
} from "@shared/utils/scoreTiers";
import type { WinTierKey, WinTierMap } from "@shared/utils/scoreTiers";

// Football streak schedule — historical 3/5/10 → 1.3/1.7/2.5 values.


/** Football streak multiplier — sport-bound wrapper. */

/** Football next-streak-tier — sport-bound wrapper. */



export type { WinTierKey };
export type WinTier = WinTierKey;

/** Football win tier map. Keys are shared WinTierKey; display names live in GameView. */
export const FOOTBALL_WIN_TIERS: WinTierMap = {
  LEGEND:   { minFp: 215  },  // LEGEND tier
  MVP:      { minFp: 192   },  // MOTM tier
  ALL_STAR: { minFp: 167   },  // CAPTAIN tier
  STARTER:  { minFp: 150 },  // STARTER tier
  ROOKIE:   { minFp: 130 },  // SUB tier
  BUST:     { minFp: 0   },
};

export function calculateWinTier(totalFp: number): WinTierKey {
  return _calculateWinTier(totalFp, FOOTBALL_WIN_TIERS);
}



