/**
 * basketball/src/adapters/fantasyPoints.ts
 *
 * Pure helper: compute fantasy points from a stats object given a weights
 * map. Production's SportAdapter.computeFantasyPoints calls this with the
 * basketball config's projectionWeights; calibration sims call it with the
 * same constants. Same function, same math — keeps the sim-production
 * parity rule satisfied without reimplementation.
 *
 * No side effects, no dataEngine import. Safe to call from any context
 * (browser, Node sim, test).
 */

export interface FpBreakdown {
  total: number;
  breakdown: Record<string, number>;
}

export function computeBasketballFp(
  stats: Record<string, any>,
  weights: Record<string, number>,
): number {
  return computeBasketballFpDetailed(stats, weights).total;
}

export function computeBasketballFpDetailed(
  stats: Record<string, any>,
  weights: Record<string, number>,
): FpBreakdown {
  const breakdown: Record<string, number> = {};
  let fp = 0;
  for (const [key, w] of Object.entries(weights)) {
    const weight = Number(w);
    if (!Number.isFinite(weight) || weight === 0) continue;
    const value = getStatValue(stats, key);
    const contrib = value * weight;
    if (Number.isFinite(contrib) && contrib !== 0) {
      breakdown[key] = contrib;
      fp += contrib;
    }
  }
  return { total: Number.isFinite(fp) ? fp : 0, breakdown };
}

function getStatValue(stats: Record<string, any>, key: string): number {
  if (stats[key] !== undefined) return coerceNumber(stats[key]);
  for (const v of [
    key.toLowerCase(),
    key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
    key.replace(/_/g, ""),
  ]) {
    if (stats[v] !== undefined) return coerceNumber(stats[v]);
  }
  return 0;
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
