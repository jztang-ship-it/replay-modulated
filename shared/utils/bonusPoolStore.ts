/**
 * shared/utils/bonusPoolStore.ts
 *
 * Progressive bonus pool — Vercel KV backed.
 *
 * SOURCES:
 *   - 1000 coins daily base inject
 *   - 5% rake from every bet placed
 *   - Passive time drip (~2000 coins/day, ~1.39 coins/min)
 *
 * DISTRIBUTION: Daily via leaderboard — NOT per-hand.
 *   Pool split 3 ways across lanes (Best Hand, Top 3, Avg Score).
 *   Top 10 per lane: 35/20/12/8/6/5/4/4/3/3%
 *
 * Three functions used by GameView:
 *   contributeBet(amount)     — call after each hand (5% rake)
 *   getBonusPool()            — call on mount + poll for live display
 *   invalidateBonusPoolCache() — force refresh
 */

export const BONUS_POOL_RAKE_RATE = 0.05;       // 5% of each bet
export const BONUS_POOL_DAILY_BASE = 1000;       // Injected daily
export const BONUS_POOL_SEED = 1_000;            // Starting/reset value
export const BONUS_POOL_DRIP_PER_MIN = 1.39;    // ~2000 coins/day passive

/** Leaderboard lanes for pool distribution. */
export const POOL_LANES = ["hand_best", "top3_combined", "hand_avg"] as const;
export type PoolLane = (typeof POOL_LANES)[number];

/** Top 10 payout distribution per lane (must sum to 100). */
export const POOL_DISTRIBUTION = [35, 20, 12, 8, 6, 5, 4, 4, 3, 3] as const;
export const POOL_TOP_N = POOL_DISTRIBUTION.length; // 10

/** Calculate prize amounts for a given lane's pool allocation. */
export function calculateLanePrizes(lanePool: number): number[] {
  return POOL_DISTRIBUTION.map(pct => Math.round(lanePool * pct / 100));
}

/** Calculate total pool split per lane (pool / 3). */
export function poolPerLane(totalPool: number): number {
  return Math.round(totalPool / POOL_LANES.length);
}

const API_BASE = "/api/bonus-pool";

// ── Local cache ─────────────────────────────────────────────────────────────
let _cachedPool: number | null = null;
let _cacheExpiry = 0;
const CACHE_MS = 30_000; // 30s poll interval

/**
 * Get current bonus pool from KV (cached 30s).
 * Falls back to BONUS_POOL_SEED if KV unavailable.
 */
export async function getBonusPool(): Promise<number> {
  const now = Date.now();
  if (_cachedPool !== null && now < _cacheExpiry) return _cachedPool;
  try {
    const res = await fetch(`${API_BASE}?action=get`);
    if (!res.ok) throw new Error(`${res.status}`);
    const { pool } = await res.json() as { pool: number };
    _cachedPool = pool;
    _cacheExpiry = now + CACHE_MS;
    return pool;
  } catch {
    return _cachedPool ?? BONUS_POOL_SEED;
  }
}

/**
 * Contribute 5% rake from a completed hand's bet to the pool.
 * Returns updated pool total.
 */
export async function contributeBet(betAmount: number): Promise<number> {
  const rake = parseFloat((betAmount * BONUS_POOL_RAKE_RATE).toFixed(2));
  if (rake <= 0) return _cachedPool ?? BONUS_POOL_SEED;
  // Optimistic update
  if (_cachedPool !== null) {
    _cachedPool = parseFloat((_cachedPool + rake).toFixed(2));
    _cacheExpiry = Date.now() + CACHE_MS;
  }
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contribute", amount: rake }),
    });
    const { pool } = await res.json() as { pool: number };
    _cachedPool = pool;
    return pool;
  } catch {
    return _cachedPool ?? BONUS_POOL_SEED;
  }
}

/** Force-refresh the cache on next getBonusPool() call */
export function invalidateBonusPoolCache() {
  _cachedPool = null;
  _cacheExpiry = 0;
}
