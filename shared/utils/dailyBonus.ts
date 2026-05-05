/**
 * shared/utils/dailyBonus.ts — Daily bonus player system.
 *
 * Every day, 3 players are selected to receive an FP bonus when they
 * resolve inside a user's roster. Selection is deterministic (same 3 for
 * all users worldwide) and rotates at midnight UTC.
 *
 * Bonus values:
 *   Player 1 → +20 FP (★★★)
 *   Player 2 → +10 FP (★★)
 *   Player 3 → +5  FP (★)
 *
 * Eligibility: ORANGE, PURPLE, BLUE, GREEN tiers only.
 *   - RED excluded (already top tier, doesn't need help)
 *   - WHITE excluded (users don't recognize these deep-bench players)
 *
 * Strategic intent: reward users who deliberately build around the hot
 * players. Creates day-to-day meta variety and shared conversation
 * ("did you see Jrue is +20 today?").
 */

import { hashStr, mulberry32 as seededRng } from "./seededRng";

/** Today's date key in UTC (YYYY-MM-DD) — global rotation, not local. */
export function getDailyBonusDateKey(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Milliseconds until next UTC midnight — for countdown display. */
export function getMsUntilNextBonusRotation(now?: Date): number {
  const n = now ?? new Date();
  const next = new Date(Date.UTC(
    n.getUTCFullYear(),
    n.getUTCMonth(),
    n.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return next.getTime() - n.getTime();
}

/** Human-readable countdown string, e.g. "14h 23m" or "3m 12s". */
export function formatBonusCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export type DailyBonusPlayer = {
  basePlayerId: string;
  name: string;
  tier: string;
  bonus: 5 | 10 | 20;
};

/** Tiers eligible for the daily bonus. RED and WHITE excluded by design. */
const ELIGIBLE_TIERS = new Set(["ORANGE", "PURPLE", "BLUE", "GREEN"]);

/**
 * Pick today's 3 bonus players from the pool.
 * Deterministic: same date + same pool = same result for every user worldwide.
 *
 * @param pool    list of candidate players with { basePlayerId, name, tier }
 * @param date    override for testing (defaults to today UTC)
 * @returns       3-element array, [0]=+20, [1]=+10, [2]=+5 (or fewer if pool too small)
 */
export function getDailyBonusPlayers(
  pool: Array<{ basePlayerId: string; name: string; tier: string }>,
  date?: Date,
): DailyBonusPlayer[] {
  // Filter to eligible tiers only
  const eligible = pool.filter(p => {
    const t = String(p.tier ?? "").toUpperCase();
    return ELIGIBLE_TIERS.has(t);
  });

  if (eligible.length < 3) {
    // Degenerate: pool too small to support 3 bonuses. Return what we can.
    return eligible.slice(0, 3).map((p, i) => ({
      basePlayerId: p.basePlayerId,
      name: p.name,
      tier: String(p.tier ?? "").toUpperCase(),
      bonus: (i === 0 ? 20 : i === 1 ? 10 : 5) as 5 | 10 | 20,
    }));
  }

  // Deterministic seeded shuffle based on UTC date
  const dateKey = getDailyBonusDateKey(date);
  const seed = hashStr(`daily-bonus-${dateKey}`);
  const rng = seededRng(seed);
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take the first 3 — assign bonuses in descending order
  const bonuses: Array<5 | 10 | 20> = [20, 10, 5];
  return shuffled.slice(0, 3).map((p, i) => ({
    basePlayerId: p.basePlayerId,
    name: p.name,
    tier: String(p.tier ?? "").toUpperCase(),
    bonus: bonuses[i],
  }));
}

/**
 * Build a lookup map: basePlayerId → bonus FP value.
 * Used by resolveEngine to inject bonus onto actualFp at resolve time.
 */
export function buildDailyBonusMap(
  pool: Array<{ basePlayerId: string; name: string; tier: string }>,
  date?: Date,
): Map<string, number> {
  const players = getDailyBonusPlayers(pool, date);
  const map = new Map<string, number>();
  for (const p of players) {
    map.set(p.basePlayerId, p.bonus);
  }
  return map;
}
