import { kv } from '@vercel/kv';

/**
 * Atomically read and delete a pending hand using a KV pipeline (GET + DEL
 * in one round-trip). Returns the hand data or null.
 * Key pattern: hand:{userId}:{handId}
 */
export async function consumeHand(userId, handId) {
  const key = `hand:${userId}:${handId}`;
  const pipeline = kv.pipeline();
  pipeline.get(key);
  pipeline.del(key);
  const [handData] = await pipeline.exec();
  return handData ?? null;
}

/**
 * Store a pending hand with a 300s TTL.
 * Key pattern: hand:{userId}:{handId}
 */
export async function storePendingHand(userId, handId, handData) {
  const key = `hand:${userId}:${handId}`;
  await kv.set(key, handData, { ex: 300 });
}

/**
 * Scan KV for any existing pending hand for this user.
 * Returns the hand data or null.
 * Key pattern: hand:{userId}:* using kv.scan(0, { match: ..., count: 1 })
 */
export async function findPendingHand(userId) {
  const [, keys] = await kv.scan(0, { match: `hand:${userId}:*`, count: 1 });
  if (!keys || keys.length === 0) return null;
  return kv.get(keys[0]);
}

/**
 * Cache a draw result for idempotency with a 90s TTL.
 * Key pattern: result:{handId}
 */
export async function cacheResult(handId, result) {
  await kv.set(`result:${handId}`, result, { ex: 90 });
}

/**
 * Retrieve a cached draw result. Returns data or null.
 * Key pattern: result:{handId}
 */
export async function getCachedResult(handId) {
  return kv.get(`result:${handId}`);
}
