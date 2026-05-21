/**
 * basketball/src/adapters/careerFp.ts
 *
 * Pure helper: compute a player's career FP from a logs map, with the
 * last-two-seasons × 2 weight. Production's SportAdapter.getCareerFPById
 * calls this with the active dataEngine's logsByKey; calibration sims call
 * it with their own per-season map. Same function, same math — keeps the
 * sim-production parity rule satisfied without reimplementation.
 *
 * The basketball-specific bit is the season-code decoder ("2425" → 2025
 * year). Other sports would need their own decoder if they ever needed a
 * career-FP helper of their own shape.
 *
 * No side effects, no dataEngine import. Safe to call from any context
 * (browser, Node sim, test).
 */

import type { RawLog } from "@shared/types";

export function computeBasketballCareerFp(
  playerId: string,
  logsByKey: Map<string, RawLog[]>,
  computeFp: (stats: Record<string, any>) => number,
): number {
  const id = String(playerId).trim();
  if (!id) return 0;
  // dataEngine indexes logs by basePlayerId (and basePlayerId|season). Use the
  // basePlayerId-only key to get all loaded seasons in one pass.
  const logs = logsByKey.get(id) ?? [];
  if (!logs.length) return 0;
  const currentYear = new Date().getUTCFullYear();
  let total = 0;
  for (const log of logs) {
    const stats = (log as any).stats ?? {};
    const fp = computeFp(stats);
    const seasonRaw = (log as any).season;
    // Basketball seasons are stored as concat 4-digit codes (e.g. 2425 → 2025).
    // Take the trailing 2 digits as YY (2-digit year) and resolve to 20YY.
    const seasonNum = Number(seasonRaw);
    let yearOfLog = currentYear;
    if (Number.isFinite(seasonNum) && seasonNum > 0) {
      const yy = Math.round(seasonNum) % 100;
      yearOfLog = 2000 + yy;
    }
    const seasonAge = currentYear - yearOfLog;
    const weight = seasonAge <= 1 ? 2.0 : 1.0;
    total += fp * weight;
  }
  return total;
}
