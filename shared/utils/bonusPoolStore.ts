/**
 * shared/utils/bonusPoolStore.ts
 *
 * Per-sport progressive bonus pool — Vercel KV backed.
 *
 * SOURCES:
 *   - 1000 coins daily base inject
 *   - 5% rake from every bet placed
 *   - Passive time drip (~2000 coins/day, ~1.39 coins/min)
 *
 * DISTRIBUTION: Daily via leaderboard — NOT per-hand.
 *   Each sport's pool splits 60/40 across lanes (Session Score / Best Hand).
 *   Top 10 per lane: 35/20/12/8/6/5/4/4/3/3%
 *
 * Each sport has its own pool ledger. Win conditions and lane splits are
 * universal; the bucket of money is sport-local.
 *
 * Two functions used by each sport's bonus-pool widget:
 *   getBonusPool(sport)              — call on mount + poll for live display
 *   contributeBet(sport, betAmount)  — call after each hand (5% rake)
 *   invalidateBonusPoolCache(sport?) — force refresh (specific sport or all)
 */

export const BONUS_POOL_RAKE_RATE = 0.05;       // 5% of each bet
export const BONUS_POOL_DAILY_BASE = 1000;       // Injected daily
export const BONUS_POOL_SEED = 1_000;            // Starting/reset value

/** Leaderboard lanes for pool distribution. */
export const POOL_LANES = ["hand_best", "session_score"] as const;
export type PoolLane = (typeof POOL_LANES)[number];

/** Pool split: Best Hand 40%, Session Score 60% (rewards volume + quality). */
export const POOL_LANE_SPLIT: Record<PoolLane, number> = {
  hand_best: 0.40,
  session_score: 0.60,
};

/** Top 10 payout distribution per lane (must sum to 100). */
export const POOL_DISTRIBUTION = [35, 20, 12, 8, 6, 5, 4, 4, 3, 3] as const;
export const POOL_TOP_N = POOL_DISTRIBUTION.length; // 10

/** Calculate prize amounts for a given lane's pool allocation. */
export function calculateLanePrizes(lanePool: number): number[] {
  return POOL_DISTRIBUTION.map(pct => Math.round(lanePool * pct / 100));
}

/** Calculate pool allocation for a specific lane. */
export function poolForLane(totalPool: number, lane: PoolLane): number {
  return Math.round(totalPool * (POOL_LANE_SPLIT[lane] ?? 0));
}

const API_BASE = "/api/bonus-pool";
const CACHE_MS = 30_000; // 30s poll interval

// ── Per-sport local cache ───────────────────────────────────────────────────
type CacheEntry = { value: number; expiry: number };
const _cache = new Map<string, CacheEntry>();

/**
 * Get current bonus pool for a sport from KV (cached 30s).
 * Falls back to BONUS_POOL_SEED if KV unavailable.
 */
export async function getBonusPool(sport: string): Promise<number> {
  const now = Date.now();
  const cached = _cache.get(sport);
  if (cached && now < cached.expiry) return cached.value;
  try {
    const res = await fetch(`${API_BASE}?sport=${encodeURIComponent(sport)}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const { pool } = await res.json() as { pool: number };
    _cache.set(sport, { value: pool, expiry: now + CACHE_MS });
    return pool;
  } catch {
    return cached?.value ?? BONUS_POOL_SEED;
  }
}

/**
 * Contribute 5% rake from a completed hand's bet to the sport's pool.
 * Returns updated pool total.
 */
export async function contributeBet(sport: string, betAmount: number): Promise<number> {
  const rake = parseFloat((betAmount * BONUS_POOL_RAKE_RATE).toFixed(2));
  const cached = _cache.get(sport);
  if (rake <= 0) return cached?.value ?? BONUS_POOL_SEED;
  // Optimistic local update
  if (cached) {
    _cache.set(sport, {
      value: parseFloat((cached.value + rake).toFixed(2)),
      expiry: Date.now() + CACHE_MS,
    });
  }
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport, action: "contribute", amount: rake }),
    });
    const { pool } = await res.json() as { pool: number };
    _cache.set(sport, { value: pool, expiry: Date.now() + CACHE_MS });
    return pool;
  } catch {
    return _cache.get(sport)?.value ?? BONUS_POOL_SEED;
  }
}

/** Force-refresh the cache on next getBonusPool() call (specific sport or all). */
export function invalidateBonusPoolCache(sport?: string) {
  if (sport) _cache.delete(sport);
  else _cache.clear();
}
