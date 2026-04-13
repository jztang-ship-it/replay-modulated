/**
 * shared/utils/mysteryScore.ts
 *
 * Daily mystery score target — a single FP number randomly generated each day.
 * Uses the same UTC date rotation as daily bonus players.
 * If a player hits this exact score (rounded to 1 decimal), they win an instant bonus.
 *
 * The target is deterministic from the date seed so all players see the same number.
 */

import { getDailyBonusDateKey } from "./dailyBonus";

/** Fixed instant bonus for hitting the mystery score. */
export const MYSTERY_SCORE_BONUS = 200;

/** FP range for mystery score targets — must be achievable but not trivial. */
const MIN_TARGET = 170;
const MAX_TARGET = 235;

/** Simple hash from date string → number in [0,1). */
function dateHash(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) - h + dateKey.charCodeAt(i)) | 0;
  }
  // Mix bits for better distribution
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return Math.abs(h) / 0x7fffffff;
}

/** Get today's mystery score target (rounded to 1 decimal). */
export function getDailyMysteryScore(date?: Date): number {
  const key = getDailyBonusDateKey(date);
  // Use a different seed offset so it's not correlated with bonus player selection
  const hash = dateHash(key + ":mystery");
  const raw = MIN_TARGET + hash * (MAX_TARGET - MIN_TARGET);
  return Math.round(raw * 10) / 10;
}

/** Check if a hand's total FP hits the mystery score (within 0.05 tolerance). */
export function checkMysteryScore(totalFp: number, date?: Date): boolean {
  const target = getDailyMysteryScore(date);
  return Math.abs(totalFp - target) < 0.05;
}
