/**
 * shared/utils/dailyRotation.ts — Sport-agnostic daily ORANGE rotation.
 *
 * Each day, a subset of ORANGE-tier players is "active" (eligible to appear).
 * The selection is deterministic — seeded by date so all users see the same pool.
 *
 * Usage:
 *   const activeIds = getDailyOrangePool(allOrangeBaseIds, 4);
 *   const filtered = evalPool.filter(p => p.tier !== "ORANGE" || activeIds.has(p.basePlayerId));
 */

/** Simple deterministic hash from a string → 32-bit integer. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG seeded from a number. */
function seededRng(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns today's date string (YYYY-MM-DD) in local time. */
export function getRotationDateKey(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pick `count` ORANGE player IDs for the given day.
 * Deterministic: same date + same pool = same result for all users.
 *
 * @param allOrangeIds - all ORANGE-tier basePlayerIds in the pool
 * @param count - how many to activate per day (default 4)
 * @param date - override date (defaults to today)
 * @returns Set of active basePlayerIds
 */
export function getDailyOrangePool(
  allOrangeIds: string[],
  count = 4,
  date?: Date,
): Set<string> {
  const dateKey = getRotationDateKey(date);
  console.log(`[rotation] input=${allOrangeIds.length} ids count=${count} date=${dateKey}`);
  if (allOrangeIds.length <= count) {
    // If pool is <= count, all are active every day
    console.log(`[rotation] BYPASS: pool size ${allOrangeIds.length} <= count ${count} — all active`);
    return new Set(allOrangeIds);
  }

  const dateKey = getRotationDateKey(date);
  const seed = hashStr(`orange-rotation-${dateKey}`);
  const rng = seededRng(seed);

  // Fisher-Yates shuffle with seeded RNG, then take first `count`
  const shuffled = [...allOrangeIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const chosen = new Set(shuffled.slice(0, count));
  console.log(`[rotation] picked ${chosen.size} of ${allOrangeIds.length}: ${[...chosen].join(",")}`);
  return chosen;
}
