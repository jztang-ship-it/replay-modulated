/**
 * basketball/src/adapters/badges.ts
 *
 * Pure helper: compute basketball achievements from a stats object given a
 * badge-definition array. Production's SportAdapter.computeBadges calls
 * this with the basketball config's badges[]; calibration sims call it
 * with the same constants. Same function, same math — keeps the
 * sim-production parity rule satisfied without reimplementation.
 *
 * Dedupe rule: TD (triple-double) and DD (double-double) collapse into a
 * single DOUBLE category so a single hand can only earn one milestone
 * badge from that family. All other badges dedupe by id.
 *
 * No side effects, no dataEngine import. Safe to call from any context
 * (browser, Node sim, test).
 */

import type { Achievement } from "@shared/types/index";

export interface BadgeDef {
  id: string;
  icon: string;
  label: string;
  fp: number;
  test: (stats: Record<string, any>) => boolean;
}

export function computeBasketballBadges(
  stats: Record<string, any>,
  badges: readonly BadgeDef[],
): Achievement[] {
  const earned: Achievement[] = [];
  for (const badge of badges) {
    try {
      if (badge.test(stats)) {
        earned.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp });
      }
    } catch {
      // Bad badge test — swallow, don't take down resolve over one broken predicate.
    }
  }
  const seen = new Set<string>();
  return earned.filter(b => {
    const cat = b.id === "TD" || b.id === "DD" ? "DOUBLE" : b.id;
    if (seen.has(cat)) return false;
    seen.add(cat);
    return true;
  });
}
