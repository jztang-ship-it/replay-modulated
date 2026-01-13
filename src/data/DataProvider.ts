/**
 * DataProvider - Abstract interface for data access
 * Allows engine to work with different data sources (local JSON, API, etc.)
 */

import { Player, GameLog, HistoricalLogFilters } from '../models';

export interface DataProvider {
  getPlayers(sport: string): Promise<Player[]>;
  getGameLogs(
    playerId: string,
    filters: HistoricalLogFilters
  ): Promise<GameLog[]>;
  getHeadshot(playerId: string): string;
}
