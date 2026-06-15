// shared/explanation/poolStats.ts
//
// RD7.2 — per-player gamelog-pool summary stats + percentile math.
// Sport-agnostic: the BUILDER (which reads a sport's gamelogs) lives in
// each sport (e.g. basketball/src/tools/playerPoolStats.ts) and re-exports
// these. The Resolution Engine wiring (shared) needs only this math.

export interface PoolStats {
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

/** Percentile (0..100) of a pulled FP within a player's pool stats, via the
 *  stored quantile anchors (no full pool needed at runtime). */
export function percentileFromStats(fp: number, s: PoolStats): number {
  if (s.n <= 1) return 50;
  const pts: Array<[number, number]> = [
    [s.min, 0], [s.p10, 10], [s.p50, 50], [s.p90, 90], [s.max, 100],
  ];
  if (fp <= pts[0][0]) return 0;
  if (fp >= pts[pts.length - 1][0]) return 100;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (fp <= x1) {
      if (x1 === x0) return y1;
      return Math.round(y0 + (y1 - y0) * ((fp - x0) / (x1 - x0)));
    }
  }
  return 50;
}
