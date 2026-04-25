// shared/data/compositeCategories.ts
/**
 * compositeCategories.ts — Rule evaluators for composite categories used by
 * the Top Games detector. Each rule takes a stat line and returns true/false.
 *
 * Keep purely functional and safe against missing fields. Thresholds files
 * reference these codes by name via COMPOSITE_RULES keys.
 */

export type StatLine = Record<string, number | undefined>;

const safe = (v: number | undefined): number => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

export const COMPOSITE_RULES: Record<string, (s: StatLine) => boolean> = {
  // Basketball
  td_30_20_20: s => safe(s.pts) >= 30 && safe(s.reb) >= 20 && safe(s.ast) >= 20,
  td_40_20_20: s => safe(s.pts) >= 40 && safe(s.reb) >= 20 && safe(s.ast) >= 20,
  td_60_10_10: s => safe(s.pts) >= 60 && safe(s.reb) >= 10 && safe(s.ast) >= 10,
  fifty_plus_game: s => safe(s.pts) >= 50,
  quad_double: s => {
    const counts = [safe(s.pts), safe(s.reb), safe(s.ast), safe(s.stl), safe(s.blk)];
    return counts.filter(v => v >= 10).length >= 4;
  },
  five_by_five: s => {
    const counts = [safe(s.pts), safe(s.reb), safe(s.ast), safe(s.stl), safe(s.blk)];
    return counts.every(v => v >= 5);
  },
};

export function isCompositeCategory(category: string): boolean {
  return category in COMPOSITE_RULES;
}
