/**
 * shared/utils/jackpotStore.ts
 *
 * Progressive jackpot pool — Vercel KV backed.
 *
 * Architecture:
 *   - Every bet seeds RAKE_RATE (3%) into a shared KV key "jackpot:pool"
 *   - On JACKPOT tier hit (≥225 FP): winner claims the pool, it resets to SEED
 *   - UI polls getPool() every 30s for live community total
 *   - contributeBet() and claimJackpot() hit /api/jackpot endpoint
 *
 * The API endpoint (basketball/api/jackpot.ts) handles:
 *   GET  → returns current pool amount
 *   POST { action: "contribute", amount } → adds rake, returns new total
 *   POST { action: "claim" }              → atomically claims + resets pool
 */

export const JACKPOT_RAKE_RATE = 0.03;   // 3% of each bet seeds the pool
export const JACKPOT_SEED      = 500;    // Pool resets to $500 after a hit
export const JACKPOT_MIN_FP    = 225;    // FP threshold to hit jackpot

const API_BASE = "/api/jackpot";

export interface JackpotState {
  pool: number;
  lastUpdated: number;
}

// ── Client-side cache to avoid hammering the API ──────────────────────────
let _cache: JackpotState | null = null;
let _cacheExpiry = 0;
const CACHE_MS = 30_000; // 30s

/**
 * Get current jackpot pool amount.
 * Returns cached value if fresh, otherwise fetches from KV.
 */
export async function getJackpotPool(): Promise<number> {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache.pool;

  try {
    const res = await fetch(API_BASE, { method: "GET" });
    if (!res.ok) throw new Error(`Jackpot GET failed: ${res.status}`);
    const data = await res.json() as { pool: number };
    _cache = { pool: data.pool, lastUpdated: now };
    _cacheExpiry = now + CACHE_MS;
    return data.pool;
  } catch (e) {
    console.warn("[jackpotStore] getPool failed, using seed:", e);
    return _cache?.pool ?? JACKPOT_SEED;
  }
}

/**
 * Contribute rake from a bet to the jackpot pool.
 * Call after each bet is placed.
 * Returns the new pool total.
 */
export async function contributeBet(betAmount: number): Promise<number> {
  const contribution = parseFloat((betAmount * JACKPOT_RAKE_RATE).toFixed(2));
  if (contribution <= 0) return _cache?.pool ?? JACKPOT_SEED;

  // Optimistically update local cache
  if (_cache) {
    _cache.pool = parseFloat((_cache.pool + contribution).toFixed(2));
    _cacheExpiry = Date.now() + CACHE_MS;
  }

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contribute", amount: contribution }),
    });
    if (!res.ok) throw new Error(`Jackpot contribute failed: ${res.status}`);
    const data = await res.json() as { pool: number };
    if (_cache) _cache.pool = data.pool;
    return data.pool;
  } catch (e) {
    console.warn("[jackpotStore] contribute failed:", e);
    return _cache?.pool ?? JACKPOT_SEED;
  }
}

/**
 * Claim the jackpot — atomically reads pool value and resets to SEED.
 * Returns the won amount. Call only when JACKPOT tier is confirmed.
 */
export async function claimJackpot(): Promise<number> {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    });
    if (!res.ok) throw new Error(`Jackpot claim failed: ${res.status}`);
    const data = await res.json() as { won: number };
    // Reset local cache to seed
    _cache = { pool: JACKPOT_SEED, lastUpdated: Date.now() };
    _cacheExpiry = Date.now() + CACHE_MS;
    return data.won;
  } catch (e) {
    console.warn("[jackpotStore] claim failed:", e);
    return _cache?.pool ?? JACKPOT_SEED;
  }
}

/** Invalidate local cache — call after any known pool change */
export function invalidateJackpotCache() {
  _cache = null;
  _cacheExpiry = 0;
}
