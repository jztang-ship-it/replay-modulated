import type { Player, GameLog, HistoricalLogFilters } from "../models";

export interface DataProvider {
  getPlayers(sport: string): Promise<Player[]>;
  getGameLogs(sport: string, filters: HistoricalLogFilters): Promise<GameLog[]>;
  getHeadshot(playerId: string): string;
}
