/**
 * GameLogFilterEngine - Select eligible historical logs for a player
 * Sport-agnostic filtering using SportConfig.historicalLogFilters
 *
 * IMPORTANT:
 * - Some datasets store minutes/snaps/attempts as top-level fields
 * - Others store them inside log.stats (e.g. stats.minutes)
 * This engine supports BOTH to prevent "all logs filtered out" bugs.
 */

import { Player, GameLog, SportConfig } from '../models';

export class GameLogFilterEngine {
  static getEligibleLogs(player: Player, allLogs: GameLog[], config: SportConfig): GameLog[] {
    const filters = config.historicalLogFilters;

    // Pull logs for this player
    let logs = allLogs.filter((l) => l.playerId === player.id);

    if (logs.length === 0) return [];

    // Min minutes
    if (filters?.minMinutes !== undefined) {
      const minMins = filters.minMinutes;
      logs = logs.filter((l) => {
        const mins = (l.minutes ?? l.stats?.minutes ?? 0);
        return mins >= minMins;
      });
    }

    // Min snaps (football/american football)
    if (filters?.minSnaps !== undefined) {
      const minSnaps = filters.minSnaps;
      logs = logs.filter((l) => {
        const snaps = (l.snaps ?? l.stats?.snaps ?? 0);
        return snaps >= minSnaps;
      });
    }

    // Min attempts (baseball, etc.)
    if (filters?.minAttempts !== undefined) {
      const minAtt = filters.minAttempts;
      logs = logs.filter((l) => {
        const att = (l.attempts ?? l.stats?.attempts ?? 0);
        return att >= minAtt;
      });
    }

    // Seasons-back filter (safe + optional)
    // If gameDate isn't parseable, we keep the log (do NOT accidentally drop everything).
    if (filters?.seasonsBack !== undefined && filters.seasonsBack > 0) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - filters.seasonsBack);

      logs = logs.filter((l) => {
        if (!l.gameDate) return true;
        const d = new Date(l.gameDate);
        if (Number.isNaN(d.getTime())) return true;
        return d >= cutoff;
      });
    }

    return logs;
  }
}
