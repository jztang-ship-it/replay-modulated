import * as fs from 'fs';
import * as path from 'path';

type RawLog = {
  id?: string;
  sport?: string;
  playerId: string;
  season?: number | string;
  matchDate?: string;
  minutesPlayed?: number;
  stats?: Record<string, number>;
  events?: Record<string, number>;
};

type NormalizedLog = {
  id: string;
  sport: string;
  playerId: string;
  season: string;     // "2022-2023"
  gameDate: string;   // ISO date string
  minutes: number;
  stats: Record<string, number>;
  events: Record<string, number>;
};

function seasonNumberToLabel(season: number | string, fallbackLabel: string): string {
  // If already looks like "2022-2023", keep it
  if (typeof season === 'string' && season.includes('-')) return season;

  const n = typeof season === 'number' ? season : Number(season);
  if (!Number.isFinite(n)) return fallbackLabel;

  // If user gives 2022, assume 2022-2023 (EPL season)
  return `${n}-${n + 1}`;
}

function main() {
  const seasonLabel = process.env.EPL_SEASON ?? '2022-2023';
  const inFile =
    process.env.EPL_IN ?? `src/data/football/raw/epl/${seasonLabel}/game-logs.json`;

  const outFile =
    process.env.EPL_OUT ?? `src/data/football/raw/epl/${seasonLabel}/normalized-game-logs.json`;

  if (!fs.existsSync(inFile)) {
    console.error(`Missing input file: ${inFile}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(inFile, 'utf-8');
  const parsed = JSON.parse(rawText);

  if (!Array.isArray(parsed)) {
    console.error(`Expected top-level array in ${inFile}`);
    process.exit(1);
  }

  const normalized: NormalizedLog[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i] as RawLog;

    const playerId = r.playerId;
    const gameDate = r.matchDate;
    const minutes = r.minutesPlayed;
    const stats = r.stats;
    const events = r.events ?? {};

    if (!playerId || !gameDate || typeof minutes !== 'number' || !stats) {
      continue;
    }

    const season = seasonNumberToLabel(r.season ?? seasonLabel, seasonLabel);

    normalized.push({
      id: r.id ?? `${playerId}-${gameDate}`,
      sport: r.sport ?? 'football',
      playerId: String(playerId),
      season,
      gameDate: String(gameDate),
      minutes,
      stats,
      events,
    });
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(normalized, null, 2));

  console.log(`Input:  ${inFile}`);
  console.log(`Output: ${outFile}`);
  console.log(`Raw logs: ${parsed.length}`);
  console.log(`Normalized logs: ${normalized.length}`);

  if (normalized.length > 0) {
    console.log(`Sample normalized keys:`, Object.keys(normalized[0]));
  } else {
    console.log(`WARNING: Normalized logs = 0. That means required fields are missing.`);
  }
}

main();
