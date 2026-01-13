/**
 * GameLogFilterEngine - Filters historical game logs based on config rules
 * Sport-agnostic filtering based on SportConfig
 */

import { GameLog, SportConfig, Player } from '../models';

export class GameLogFilterEngine {
  /**
   * Filter game logs for a player based on config rules
   * Returns eligible logs that meet all criteria
   */
  static getEligibleLogs(
    player: Player,
    allLogs: GameLog[],
    config: SportConfig
  ): GameLog[] {
    const filters = config.historicalLogFilters;
    const playerLogs = allLogs.filter((log) => log.playerId === player.id);

    if (playerLogs.length === 0) {
      return [];
    }

    // Filter by date (seasonsBack)
    const cutoffDate = this.calculateCutoffDate(filters.seasonsBack);
    let eligible = playerLogs.filter((log) => {
      const logDate = new Date(log.gameDate);
      return logDate >= cutoffDate;
    });

    // Filter by minMinutes if specified
    if (filters.minMinutes !== undefined) {
      eligible = eligible.filter((log) => {
        const minutes = log.minutes ?? log.stats.minutes;
        // Only filter if minutes field exists, otherwise include the log
        return minutes === undefined || minutes >= filters.minMinutes!;
      });
    }

    // Filter by minSnaps if specified
    if (filters.minSnaps !== undefined) {
      eligible = eligible.filter((log) => {
        const snaps = log.snaps ?? log.stats.snaps;
        // Only filter if snaps field exists, otherwise include the log
        return snaps === undefined || snaps >= filters.minSnaps!;
      });
    }

    // Filter by minAttempts if specified
    if (filters.minAttempts !== undefined) {
      eligible = eligible.filter((log) => {
        const attempts = log.attempts ?? log.stats.attempts;
        // Only filter if attempts field exists, otherwise include the log
        return attempts === undefined || attempts >= filters.minAttempts!;
      });
    }

    return eligible;
  }

  /**
   * Calculate cutoff date based on seasonsBack
   * Uses approximate 6 months per season for date calculation
   */
  private static calculateCutoffDate(seasonsBack: number): Date {
    const now = new Date();
    const monthsBack = seasonsBack * 6; // Approximate 6 months per season
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    return cutoff;
  }

  /**
   * Get eligible logs for multiple players
   */
  static getEligibleLogsForPlayers(
    players: Player[],
    allLogs: GameLog[],
    config: SportConfig
  ): Map<string, GameLog[]> {
    const result = new Map<string, GameLog[]>();
    for (const player of players) {
      const eligible = this.getEligibleLogs(player, allLogs, config);
      result.set(player.id, eligible);
    }
    return result;
  }
}
