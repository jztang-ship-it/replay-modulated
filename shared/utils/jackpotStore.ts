/**
 * shared/utils/jackpotStore.ts
 *
 * Progressive jackpot pool — Vercel KV backed.
 * Rake: 5% of each bet (matches JACKPOT_BET_RAKE in GameView)
 * Seed: $12,451.29 on reset (matches JACKPOT_SEED in GameView)
 * Hit threshold: 225+ FP (JACKPOT tier)
 *
 * Three functions used by GameView:
 *   contributeBet(amount) — call after each hand resolves
 *   claimJackpot()        — call when JACKPOT tier hit
 *   getJackpotPool()      — call on mount + every 30s for live display
 *
 * The existing JackpotRow component in GameView handles the UI display.
 * This store handles persistence to Vercel KV via /api/jackpot endpoint.
 */

export const JACKPOT_RAKE_RATE = 0.05;      // 5% — matches GameView constant
export const JACKPOT_SEED      = 12_451.29; // Reset value — matches GameView constant
export const JACKPOT_MIN_FP    = 225;       // Tier threshold — matches payoutLogic

const API_BASE = "/api/jackpot";

// ── Local cache ─────────────────────────────────────────────────────────────
let _cachedPool: number | null = null;
let _cacheExpiry = 0;
const CACHE_MS = 30_000; // 30s poll interval

/**
 * Get current jackpot pool from KV (cached 30s).
 * Falls back to JACKPOT_SEED if KV unavailable.
 */
export async function getJackpotPool(): Promise<number> {
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
    return _cachedPool ?? JACKPOT_SEED;
  }
}

/**
 * Contribute 5% rake from a completed hand's bet to the pool.
 * Returns updated pool total.
 */
export async function contributeBet(betAmount: number): Promise<number> {
  const rake = parseFloat((betAmount * JACKPOT_RAKE_RATE).toFixed(2));
  if (rake <= 0) return _cachedPool ?? JACKPOT_SEED;
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
    return _cachedPool ?? JACKPOT_SEED;
  }
}

/**
 * Claim jackpot — atomically reads pool value and resets to SEED.
 * Returns the amount won. Call only when JACKPOT tier is confirmed.
 */
export async function claimJackpot(): Promise<number> {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    });
    const { won } = await res.json() as { won: number };
    _cachedPool = JACKPOT_SEED;
    _cacheExpiry = Date.now() + CACHE_MS;
    return won;
  } catch {
    const won = _cachedPool ?? JACKPOT_SEED;
    _cachedPool = JACKPOT_SEED;
    return won;
  }
}

/** Force-refresh the cache on next getJackpotPool() call */
export function invalidateJackpotCache() {
  _cachedPool = null;
  _cacheExpiry = 0;
}
