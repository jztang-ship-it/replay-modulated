/**
 * shared/utils/dailyBonusPool.ts
 *
 * Sport-agnostic helper that builds the candidate pool fed into
 * `getDailyBonusPlayers` / `buildDailyBonusMap`. Each sport's gameAdapter
 * already owns: its player array, its own hasValidLogs predicate (with
 * sport-specific log thresholds), its `tierFromSalary` mapper, and its
 * salaryMin. This helper consolidates the shape so both adapters call
 * one entry point instead of forking the same `.filter().map()` block.
 *
 * Returns the canonical `{ basePlayerId, name, tier }` row consumed by
 * `dailyBonus.getDailyBonusPlayers`.
 */
export interface BonusPoolPlayer {
  basePlayerId: string;
  name: string;
  tier: string;
}

/** Single canonical key used everywhere player identity is compared. */
function playerKey(p: any): string {
  return String(p.basePlayerId ?? p.id ?? "").trim();
}

/**
 * Build the bonus-eligible pool.
 *
 * @param players        full player list (already loaded by dataEngine)
 * @param hasValidLogs   sport's predicate: returns true if this player has
 *                       at least one usable game log (sport-specific filter)
 * @param tierFromSalary maps a clamped salary → tier color
 * @param salaryMin      lower bound for clamping `Number(p.salary ?? 10)`
 * @param seasonFilter   optional id-substring filter (e.g. "_2425" for
 *                       basketball's season-suffixed ids). Pass undefined
 *                       for sports whose player list is already scoped to
 *                       the active season (e.g. baseball).
 */
export function buildBonusPoolFromPlayers(
  players: any[],
  hasValidLogs: (player: any) => boolean,
  tierFromSalary: (salary: number) => string,
  salaryMin: number,
  seasonFilter?: string,
): BonusPoolPlayer[] {
  const filtered = seasonFilter
    ? players.filter((p: any) => String(p.id ?? "").includes(seasonFilter))
    : players;
  return filtered
    .filter((p: any) => hasValidLogs(p))
    .map((p: any) => {
      const salary = Math.max(salaryMin, Number(p.salary ?? 10));
      return {
        basePlayerId: playerKey(p),
        name: String(p.name ?? ""),
        tier: tierFromSalary(salary),
      };
    });
}
