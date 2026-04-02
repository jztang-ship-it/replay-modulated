/**
 * shared/utils/bonusPoolStore.ts
 *
 * Progressive bonus pool — Vercel KV backed.
 * Rake: 5% of each bet contributed to the pool.
 * Seed: $12,451.29 on reset.
 * Payout: streak-based (3 wins = 5%, 5 wins = 15%).
 * NOT a team-FP tier — GOAT is the top tier. This is a separate reward system.
 *
 * Three functions used by GameView:
 *   contributeBet(amount) — call after each hand resolves
 *   claimBonusPool()      — call when streak milestone hit
 *   getBonusPool()        — call on mount + every 30s for live display
 */

export const BONUS_POOL_RAKE_RATE = 0.05;      // 5% of each bet
export const BONUS_POOL_SEED      = 12_451.29; // Reset value

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

/**
 * Claim bonus pool — atomically reads pool value and resets to SEED.
 * Returns the amount won. Call when streak milestone is hit.
 */
export async function claimBonusPool(): Promise<number> {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    });
    const { won } = await res.json() as { won: number };
    _cachedPool = BONUS_POOL_SEED;
    _cacheExpiry = Date.now() + CACHE_MS;
    return won;
  } catch {
    const won = _cachedPool ?? BONUS_POOL_SEED;
    _cachedPool = BONUS_POOL_SEED;
    return won;
  }
}

/** Force-refresh the cache on next getBonusPool() call */
export function invalidateBonusPoolCache() {
  _cachedPool = null;
  _cacheExpiry = 0;
}
