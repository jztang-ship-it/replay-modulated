/**
 * LocalJsonProvider - Default implementation using local JSON files
 * No logic leaks into engine - pure data access
 */

import { Player, GameLog, HistoricalLogFilters } from '../models';
import { DataProvider } from './DataProvider';
import { BasketballPlayers, BasketballGameLogs } from './index';

export class LocalJsonProvider implements DataProvider {
  private players: Player[];
  private gameLogs: GameLog[];

  constructor(players: Player[], gameLogs: GameLog[]) {
    this.players = players;
    this.gameLogs = gameLogs;
  }

  async getPlayers(sport: string): Promise<Player[]> {
    // For MVP, return all players regardless of sport
    // In production, filter by sport
    return this.players;
  }

  async getGameLogs(
    playerId: string,
    filters: HistoricalLogFilters
  ): Promise<GameLog[]> {
    // Filter logs by playerId
    const playerLogs = this.gameLogs.filter((log) => log.playerId === playerId);

    // Apply filters (date filtering would go here)
    // For MVP, just return all logs for the player
    // In production, apply historicalLogFilters

    return playerLogs;
  }

  getHeadshot(playerId: string): string {
    // Placeholder - return empty string or default image path
    return '';
  }
}

/**
 * Create a default LocalJsonProvider with basketball data
 */
export function createBasketballDataProvider(): LocalJsonProvider {
  return new LocalJsonProvider(BasketballPlayers, BasketballGameLogs);
}
