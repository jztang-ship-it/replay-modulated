/**
 * shared/utils/weightedSample.ts
 *
 * Weighted random selection without replacement. Used by slate selector
 * to draw rotating slate slots from the eligibility pool, weighted by
 * career FP.
 */

/**
 * Pick `count` distinct items from `items`, weighted by `weights`,
 * without replacement. If `count >= items.length`, returns all items.
 *
 * @param items   — items to choose from
 * @param weights — non-negative weight per item, same length as `items`
 * @param count   — number of items to draw
 * @param rng     — () => number in [0, 1), e.g. from mulberry32
 */
export function weightedSampleWithoutReplacement<T>(
  items: T[],
  weights: number[],
  count: number,
  rng: () => number,
): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];

  // Local mutable copies — we'll splice out picked items.
  const remainingItems = [...items];
  const remainingWeights = weights.map(w => Math.max(0, Number.isFinite(w) ? w : 0));
  const out: T[] = [];

  for (let pick = 0; pick < count; pick++) {
    const totalWeight = remainingWeights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) {
      // All remaining weights are zero; fall back to uniform random over remaining.
      const idx = Math.floor(rng() * remainingItems.length);
      out.push(remainingItems[idx]);
      remainingItems.splice(idx, 1);
      remainingWeights.splice(idx, 1);
      continue;
    }
    let target = rng() * totalWeight;
    let chosen = 0;
    for (let i = 0; i < remainingWeights.length; i++) {
      target -= remainingWeights[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    out.push(remainingItems[chosen]);
    remainingItems.splice(chosen, 1);
    remainingWeights.splice(chosen, 1);
  }

  return out;
}
