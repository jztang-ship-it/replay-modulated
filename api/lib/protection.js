/**
 * protection.js
 *
 * Server-side hand resolution: protection mode for early users (hands 2-30).
 * Biases deal outcomes by generating multiple candidate lineups and picking
 * the best one. NEVER exposed to the client.
 *
 * Floors are PROVISIONAL — needs tuning after testing with real 6-player
 * distributions before treating these values as final.
 */

// ---------------------------------------------------------------------------
// Config table
// ---------------------------------------------------------------------------

const PROTECTION_LEVELS = [
  // handsPlayed 1-4  → hands 2-5
  { minHands: 1, maxHands: 4,  level: 'strong',   floor: 210, maxCandidates: 6 },
  // handsPlayed 5-14 → hands 6-15
  { minHands: 5, maxHands: 14, level: 'moderate',  floor: 200, maxCandidates: 4 },
  // handsPlayed 15-29 → hands 16-30
  { minHands: 15, maxHands: 29, level: 'light',    floor: 192, maxCandidates: 3 },
]

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Returns a protection config for the given handsPlayed count, or null if
 * no protection applies.
 *
 * handsPlayed 0  → null (FTUE, handled by a separate system)
 * handsPlayed 30+ → null (protection window has ended)
 *
 * @param {number} handsPlayed
 * @returns {{ level: string, floor: number, maxCandidates: number } | null}
 */
export function getProtectionConfig(handsPlayed) {
  for (const entry of PROTECTION_LEVELS) {
    if (handsPlayed >= entry.minHands && handsPlayed <= entry.maxHands) {
      return { level: entry.level, floor: entry.floor, maxCandidates: entry.maxCandidates }
    }
  }
  return null
}

/**
 * Selects the best candidate from an array of deal candidates.
 *
 * Strategy:
 *   1. Return the FIRST candidate whose totalFp >= floor (early exit).
 *   2. If none clear the floor, return the candidate with the highest totalFp.
 *   3. Single candidate: returned as-is regardless of floor.
 *   4. Empty array: returns null.
 *
 * @param {Array<{ totalFp: number, roster: any[] }>} candidates
 * @param {number} floor
 * @returns {{ totalFp: number, roster: any[] } | null}
 */
export function selectBestCandidate(candidates, floor) {
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  let best = candidates[0]

  for (const candidate of candidates) {
    if (candidate.totalFp >= floor) {
      // Accept the first one that clears the floor — done.
      return candidate
    }
    if (candidate.totalFp > best.totalFp) {
      best = candidate
    }
  }

  // None cleared the floor — return the highest we found.
  return best
}
