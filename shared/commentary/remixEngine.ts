/**
 * remixEngine.ts — Curated micro-remix for MVP/LEGEND hands.
 *
 * STRICTLY LIMITED:
 * - Allowed: verb swap, comparison swap, punctuation tweak
 * - Forbidden: adding new ideas, new clauses, changing narrative meaning
 * - Only applied to MVP/LEGEND and selected high-impact archetypes
 */

import type { CommentaryArchetype, Intensity } from "./types";

/** Archetypes eligible for remix */
const REMIX_ARCHETYPES: Set<CommentaryArchetype> = new Set([
  "star_carry_big",
  "career_night",
  "badge_explosion",
]);

/** Intensities eligible for remix */
const REMIX_INTENSITIES: Set<Intensity> = new Set(["mvp", "legend"]);

/** Verb swap table — source → alternatives */
const VERB_SWAPS: Record<string, string[]> = {
  "dropped": ["posted", "put up", "delivered"],
  "went off": ["erupted", "exploded", "caught fire"],
  "went for": ["put up", "posted", "delivered"],
  "handled business": ["took care of it", "got the job done"],
  "showed up": ["delivered", "brought it", "came through"],
  "carried": ["dragged", "lifted", "shouldered"],
  "cashed": ["hit", "connected", "landed"],
};

/** Comparison swap table */
const COMPARISON_SWAPS: Record<string, string[]> = {
  "like a personal vendetta": ["like it was personal", "with a point to prove"],
  "like it was batting practice": ["like a private workout", "like a scrimmage"],
  "from start to finish": ["wire to wire", "all night long"],
  "rode the wave": ["took the ride", "caught the momentum"],
};

function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/**
 * Apply curated micro-remix to a resolved line.
 * Returns the original line if remix is not applicable or no swaps match.
 */
export function applyRemix(
  line: string,
  archetype: CommentaryArchetype,
  intensity: Intensity,
  seed: number,
): string {
  // Gate: only remix eligible archetypes + intensities
  if (!REMIX_ARCHETYPES.has(archetype) && !REMIX_INTENSITIES.has(intensity)) {
    return line;
  }

  let remixed = line;
  let swapCount = 0;
  const maxSwaps = 1; // Never swap more than 1 element per line

  // Try verb swaps
  for (const [source, alts] of Object.entries(VERB_SWAPS)) {
    if (swapCount >= maxSwaps) break;
    if (remixed.includes(source)) {
      // Only swap ~50% of the time for variety
      if ((seed * 7919) % 100 < 50) {
        remixed = remixed.replace(source, seededPick(alts, seed));
        swapCount++;
      }
      break; // Only attempt one verb swap
    }
  }

  // Try comparison swaps (only if no verb swap was made)
  if (swapCount === 0) {
    for (const [source, alts] of Object.entries(COMPARISON_SWAPS)) {
      if (remixed.includes(source)) {
        if ((seed * 9301) % 100 < 40) {
          remixed = remixed.replace(source, seededPick(alts, seed));
        }
        break;
      }
    }
  }

  return remixed;
}
