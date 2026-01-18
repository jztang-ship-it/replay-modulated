import fs from 'fs';
import path from 'path';

import { Player, GameLog, HistoricalLogFilters } from '../../models';
import { DataProvider } from '../DataProvider';

/**
 * LocalDataProvider
 * - Loads processed JSON from disk
 * - Never crashes on missing/empty/corrupt JSON
 * - Matches DataProvider interface exactly
 */
export class LocalDataProvider implements DataProvider {
  private root = process.cwd();

  private processedDirForSport(sportId: string): string {
    // Allow overriding dataset directory for faster switching (no code rewiring).
    // Example:
    //   FOOTBALL_PROCESSED_DIR=processed-epl npx ts-node src/sandbox/runFootballSandbox.ts
    const footballOverride = process.env.FOOTBALL_PROCESSED_DIR; // e.g. "processed-epl"

    if (sportId === 'football') {
      const dirName =
        footballOverride && footballOverride.trim().length > 0
          ? footballOverride.trim()
          : 'processed-epl';

      return path.join(this.root, 'src', 'data', 'football', dirName);
    }

    // fallback for future sports
    return path.join(this.root, 'src', 'data', sportId, 'processed');
  }

  private safeReadJson<T>(filePath: string, fallback: T, label: string): T {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Missing ${label}: ${filePath}`);
        return fallback;
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || raw.trim().length === 0) {
        console.warn(`⚠️  Empty ${label}: ${filePath}`);
        return fallback;
      }

      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`⚠️  Invalid JSON for ${label}: ${filePath}`);
      if (e instanceof Error) console.warn(`   Reason: ${e.message}`);
      return fallback;
    }
  }

  async getPlayers(sport: string): Promise<Player[]> {
    const dir = this.processedDirForSport(sport);
    const fp = path.join(dir, 'players.json');
    
    const players = this.safeReadJson<Player[]>(fp, [], 'players.json');

    if (players.length === 0) {
      console.warn(
        `⚠️  No players loaded for sport="${sport}".\n` +
          `   If you expected data, regenerate processed files.\n` +
          `   Example: npx ts-node src/scripts/ingestFootballStatsBomb.ts`
      );
    }

    return players;
  }

  async getGameLogs(playerId: string, filters: HistoricalLogFilters): Promise<GameLog[]> {
    // Your current design: one big file for football logs
    // (we filter per playerId in memory)
    const dir = this.processedDirForSport('football');
    const fp = path.join(dir, 'game-logs.json');



    const allLogs = this.safeReadJson<GameLog[]>(fp, [], 'game-logs.json');

    let logs = allLogs.filter((l) => l.playerId === playerId);

    // Apply minMinutes defensively (supports logs.minutes OR stats.minutes)
    if (filters?.minMinutes !== undefined) {
      const minMin = filters.minMinutes;
      logs = logs.filter((l: any) => {
        const mins =
          l.minutes ??
          l.minutesPlayed ??
          l.stats?.minutes ??
          l.stats?.mins ??
          l.stats?.min ??
          0;
        return mins >= minMin;
      });
    }
    

    return logs;
  }

  getHeadshot(_playerId: string): string {
    return '';
  }
}
