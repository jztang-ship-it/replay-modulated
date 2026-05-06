/**
 * shared/utils/seededRng.ts — single source of truth for deterministic RNG.
 *
 * Replaces three previous duplicates:
 *   - shared/engines/rosterEngine.ts (mulberry32)
 *   - shared/utils/dailyRotation.ts (hashStr, seededRng)
 *   - shared/utils/dailyBonus.ts (hashStr, seededRng)
 */

/** FNV-1a 32-bit hash. Deterministic string → unsigned int. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. Returns a function producing values in [0, 1). */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
