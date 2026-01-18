import type { Player, GameLog, HistoricalLogFilters } from "../models";
import type { DataProvider } from "./DataProvider";

export class LocalJsonProvider implements DataProvider {
  private players: Player[];
  private logs: GameLog[];

  constructor(players: Player[] = [], logs: GameLog[] = []) {
    this.players = players;
    this.logs = logs;
  }

  async getPlayers(_sport: string): Promise<Player[]> {
    return this.players;
  }

  async getGameLogs(_sport: string, _filters: HistoricalLogFilters): Promise<GameLog[]> {
    return this.logs;
  }

  getHeadshot(_playerId: string): string {
    return "";
  }
}
