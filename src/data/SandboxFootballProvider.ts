/**
 * SandboxFootballProvider - Data provider for football sandbox testing
 * Loads data from football-sandbox JSON files
 */

import { Player, GameLog, HistoricalLogFilters } from '../models';
import { DataProvider } from './DataProvider';
import footballPlayers from './football-sandbox/players.json';
import footballGameLogs from './football-sandbox/game-logs.json';

export class SandboxFootballProvider implements DataProvider {
  private players: Player[];
  private gameLogs: GameLog[];

  constructor() {
    this.players = footballPlayers as Player[];
    // Ensure all game logs have events field
    const rawLogs = footballGameLogs as any[];
    this.gameLogs = rawLogs.map((log) => ({
      ...log,
      events: log.events || {},
    }));
  }

  async getPlayers(sport: string): Promise<Player[]> {
    // Return all sandbox players regardless of sport parameter
    return this.players;
  }

  async getGameLogs(
    playerId: string,
    filters: HistoricalLogFilters
  ): Promise<GameLog[]> {
    // Filter logs by playerId
    const playerLogs = this.gameLogs.filter((log) => log.playerId === playerId);

    // Apply filters (simplified for sandbox - just return all logs)
    // In production, apply historicalLogFilters

    return playerLogs;
  }

  getHeadshot(playerId: string): string {
    // Placeholder - return empty string
    return '';
  }
}
