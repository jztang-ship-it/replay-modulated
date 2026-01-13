/**
 * LocalDataProvider - Loads data from local JSON files
 * Implements DataProvider interface for offline data access
 */

import { DataProvider } from '../DataProvider';
import { Player as SchemaPlayer, GameLog as SchemaGameLog } from '../schema';
import { Player, GameLog, HistoricalLogFilters } from '../../models';
import playersData from '../football/processed/players.json';
import gameLogsData from '../football/processed/game-logs.json';

export class LocalDataProvider implements DataProvider {
  private players: SchemaPlayer[];
  private gameLogs: SchemaGameLog[];

  constructor() {
    // Normalize data - ensure events field exists
    this.players = (playersData as any[]) as SchemaPlayer[];
    const rawLogs = gameLogsData as any[];
    this.gameLogs = rawLogs.map((log) => ({
      ...log,
      events: log.events || {},
    })) as SchemaGameLog[];
  }

  async getPlayers(sport: string): Promise<Player[]> {
    return this.players
      .filter((p) => p.sport === sport)
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        salary: p.salary,
        team: p.team,
        tier: p.tier,
      }));
  }

  async getGameLogs(
    playerId: string,
    filters: HistoricalLogFilters
  ): Promise<GameLog[]> {
    // Filter by playerId
    let playerLogs = this.gameLogs.filter((log) => log.playerId === playerId);

    // Apply date filter (seasonsBack)
    if (filters.seasonsBack) {
      const currentYear = new Date().getFullYear();
      const minSeason = currentYear - filters.seasonsBack;
      playerLogs = playerLogs.filter((log) => log.season >= minSeason);
    }

    // Apply minutes filter
    if (filters.minMinutes !== undefined) {
      playerLogs = playerLogs.filter((log) => log.minutesPlayed >= filters.minMinutes!);
    }

    // Convert from schema format to engine GameLog format
    return playerLogs.map((log) => ({
      playerId: log.playerId,
      stats: log.stats,
      events: log.events,
      gameDate: log.matchDate,
      minutes: log.minutesPlayed,
    }));
  }

  getHeadshot(playerId: string): string {
    const player = this.players.find((p) => p.id === playerId);
    return player?.headshotUrl || '';
  }
}
