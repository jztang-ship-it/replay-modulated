// src/scripts/ingestEplSeasons.ts
/**
 * ingestEplSeasons.ts — SAFE EPL 3-season ingestion (REAL DATA / FPL-converted)
 *
 * Reads:
 *   src/data/football/raw/epl/<seasonDir>/game-logs.json
 *
 * Where each item (RawLog) looks like:
 *   {
 *     id: string,
 *     sport: "football",
 *     playerId: string,
 *     season: "2022-2023",
 *     matchDate: "2022-08-06T14:00:00.000Z",
 *     minutesPlayed: number,
 *     position: "GK"|"DEF"|"MID"|"FWD",
 *     team: string,
 *     playerName: string,
 *     stats: { ...numbers... },
 *     events: { ...numbers... }
 *   }
 *
 * Writes SAFELY to:
 *   src/data/football/processed-epl/players.json
 *   src/data/football/processed-epl/game-logs.json
 *
 * Safety:
 * - Will NOT overwrite src/data/football/processed unless:
 *     WRITE_TO_PROCESSED=1 FORCE_OVERWRITE=1
 */

import fs from "fs";
import path from "path";

type RawLog = {
  id?: string;
  sport?: string;
  playerId?: string;
  season?: number | string;
  matchDate?: string;
  minutesPlayed?: number;
  stats?: Record<string, number>;
  events?: Record<string, number>;
  playerName?: string;
  name?: string;
  position?: string;
  team?: string;
};

type PlayerOut = {
  id: string;
  name: string;
  position: string;
  team: string;
  salary: number;
  tier?: "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";
};

type LogOut = {
  id: string;
  sport: "football";
  playerId: string;
  season?: number;
  matchDate: string;
  minutesPlayed?: number;
  stats: Record<string, number>;
  events: Record<string, number>;
};

const SEASONS = [
  { urlSeason: "2022-23", folderSeason: "2022-2023" },
  { urlSeason: "2023-24", folderSeason: "2023-2024" },
  { urlSeason: "2024-25", folderSeason: "2024-2025" },
] as const;

const SEASONS_DEFAULT = SEASONS.map((s) => s.folderSeason);

const RAW_ROOT = path.resolve(process.cwd(), "src/data/football/raw/epl");
const PROCESSED_ROOT_DEFAULT = path.resolve(process.cwd(), "src/data/football/processed-epl");
const PROCESSED_ROOT_MAIN = path.resolve(process.cwd(), "src/data/football/processed");

const envNum = (key: string, fallback: number) => {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const envBool = (key: string, fallback = false) => {
  const v = process.env[key];
  if (!v) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
};

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

function safeJsonParse<T>(raw: string, sourceLabel: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`⚠️  Invalid JSON, skipping: ${sourceLabel}`);
    return null;
  }
}

function pickNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSeason(season: RawLog["season"]): number | undefined {
  if (season === undefined || season === null) return undefined;
  if (typeof season === "number" && Number.isFinite(season)) return season;
  if (typeof season === "string") {
    const m = season.trim().match(/(\d{4})/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function normPos(p?: string): string {
  const x = (p ?? "").trim().toUpperCase();
  if (x === "GK" || x.startsWith("GKP") || x.includes("GOAL")) return "GK";
  if (x === "DEF" || x.startsWith("D")) return "DEF";
  if (x === "MID" || x.startsWith("M")) return "MID";
  if (x === "FWD" || x.startsWith("F") || x.includes("FOR")) return "FWD";
  // safe default
  return "MID";
}

function getMinutesFromLog(l: RawLog): number {
  const candidates = [
    l?.minutesPlayed,
    l?.stats?.minutes,
    (l as any)?.minutes, // just in case
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

async function loadExistingProcessedPlayers(): Promise<PlayerOut[] | null> {
  const p = path.join(PROCESSED_ROOT_MAIN, "players.json");
  if (!(await exists(p))) return null;
  const raw = await fs.promises.readFile(p, "utf8");
  const parsed = safeJsonParse<unknown>(raw, p);
  if (!parsed || !Array.isArray(parsed)) return null;

  return (parsed as any[]).map((x) => ({
    id: String(x.id),
    name: String(x.name ?? x.playerName ?? x.id),
    position: String(x.position ?? "UNK"),
    team: String(x.team ?? "UNK"),
    salary: pickNumber(x.salary, 0),
    tier: x.tier,
  }));
}

function buildPlayerIndex(players: PlayerOut[]): Map<string, PlayerOut> {
  const m = new Map<string, PlayerOut>();
  for (const p of players) m.set(p.id, p);
  return m;
}

async function main() {
  const seasons =
    process.env.EPL_SEASONS?.split(",").map((s) => s.trim()).filter(Boolean) ?? SEASONS_DEFAULT;

  const minMinutesTotal = envNum("EPL_MIN_MINUTES_TOTAL", 180);
  const minMatches = envNum("EPL_MIN_MATCHES", 3);

  const writeToProcessed = envBool("WRITE_TO_PROCESSED", false);
  const forceOverwrite = envBool("FORCE_OVERWRITE", false);

  const processedRoot = writeToProcessed ? PROCESSED_ROOT_MAIN : PROCESSED_ROOT_DEFAULT;

  console.log(`\n=== EPL 3-Season Ingestion (REAL DATA / FPL-converted) ===\n`);
  console.log(`Seasons: ${seasons.join(", ")}`);
  console.log(`Raw root: ${RAW_ROOT}`);
  console.log(`Qualification:`);
  console.log(`  minMinutesTotal: ${minMinutesTotal}`);
  console.log(`  minMatches:      ${minMatches}\n`);

  if (writeToProcessed && !forceOverwrite) {
    console.error(
      `ERROR: Refusing to overwrite ${PROCESSED_ROOT_MAIN} without FORCE_OVERWRITE=1.\n` +
        `If you REALLY intend to overwrite processed/, run:\n` +
        `  WRITE_TO_PROCESSED=1 FORCE_OVERWRITE=1 npx ts-node src/scripts/ingestEplSeasons.ts\n`
    );
    process.exit(1);
  }

  const existingPlayers = (await loadExistingProcessedPlayers()) ?? [];
  if (existingPlayers.length > 0) {
    console.log(`Loaded existing processed players.json: ${existingPlayers.length} players\n`);
  }
  const playerIndex = buildPlayerIndex(existingPlayers);

  const usableLogs: RawLog[] = [];

  for (const seasonDir of seasons) {
    const filePath = path.join(RAW_ROOT, seasonDir, "game-logs.json");

    if (!(await exists(filePath))) {
      console.warn(`⚠️  Missing: ${filePath}`);
      continue;
    }

    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = safeJsonParse<unknown>(raw, filePath);

    if (!parsed || !Array.isArray(parsed)) {
      console.warn(`⚠️  Not an array: ${filePath}`);
      continue;
    }

    const rows = parsed as RawLog[];
    console.log(`Loaded ${rows.length.toLocaleString()} raw rows from ${filePath}`);

    for (const r of rows) {
      if (!r?.playerId) continue;
      if (!r?.stats || typeof r.stats !== "object") continue;

      usableLogs.push({
        ...r,
        sport: "football",
        playerId: String(r.playerId),
        matchDate: String(r.matchDate ?? new Date(0).toISOString()),
        minutesPlayed: pickNumber(r.minutesPlayed ?? r.stats?.minutes, 0),
        position: normPos(r.position),
      });
    }
  }

  console.log(`\nUsable logs parsed: ${usableLogs.length.toLocaleString()}\n`);

  if (usableLogs.length === 0) {
    console.error(
      `ERROR: 0 usable logs. Check that raw/epl/<season>/game-logs.json exists and is an array.\n`
    );
    process.exit(1);
  }

  const totals = new Map<string, { minutes: number; matches: number; meta?: Partial<PlayerOut> }>();

  for (const l of usableLogs) {
    const pid = String(l.playerId);
    const minutes = getMinutesFromLog(l);

    const entry = totals.get(pid) ?? { minutes: 0, matches: 0 };
    entry.minutes += minutes;
    entry.matches += 1;

    entry.meta = {
      id: pid,
      name: (l.playerName ?? l.name) ? String(l.playerName ?? l.name) : undefined,
      team: l.team ? String(l.team) : undefined,
      position: l.position ? String(l.position) : undefined,
    };

    totals.set(pid, entry);
  }

  console.log(`Unique players in logs: ${totals.size.toLocaleString()}`);

  const qualifiedIds: string[] = [];
  for (const [pid, t] of totals.entries()) {
    if (t.minutes >= minMinutesTotal && t.matches >= minMatches) qualifiedIds.push(pid);
  }

  console.log(`Qualified players: ${qualifiedIds.length.toLocaleString()}\n`);

  const MIN_QUALIFIED_PLAYERS_SAFETY = envNum("EPL_MIN_QUALIFIED_PLAYERS_SAFETY", 50);
  if (!forceOverwrite && qualifiedIds.length < MIN_QUALIFIED_PLAYERS_SAFETY) {
    console.error(
      `ERROR: Safety stop — only ${qualifiedIds.length} qualified players.\n` +
        `If you REALLY want to write anyway:\n` +
        `  FORCE_OVERWRITE=1 npx ts-node src/scripts/ingestEplSeasons.ts\n` +
        `Or lower threshold:\n` +
        `  EPL_MIN_QUALIFIED_PLAYERS_SAFETY=0 ...\n`
    );
    process.exit(1);
  }

  const qualifiedSet = new Set(qualifiedIds);

  const outLogs: LogOut[] = [];
  for (const l of usableLogs) {
    const pid = String(l.playerId);
    if (!qualifiedSet.has(pid)) continue;

    const season = normalizeSeason(l.season);
    const matchDate = String(l.matchDate ?? new Date(0).toISOString());
    const minutesPlayed = pickNumber(l.minutesPlayed ?? l.stats?.minutes, 0);

    const stats = (l.stats ?? {}) as Record<string, number>;
    const events = (l.events ?? {}) as Record<string, number>;

    const statsWithMinutes = stats.minutes === undefined ? { ...stats, minutes: minutesPlayed } : stats;

    outLogs.push({
      id: typeof l.id === "string" && l.id.length > 0 ? l.id : `${pid}-${matchDate}`,
      sport: "football",
      playerId: pid,
      season,
      matchDate,
      minutesPlayed,
      stats: Object.fromEntries(Object.entries(statsWithMinutes).map(([k, v]) => [k, pickNumber(v, 0)])),
      events: Object.fromEntries(Object.entries(events).map(([k, v]) => [k, pickNumber(v, 0)])),
    });
  }

  const outPlayers: PlayerOut[] = [];
  for (const pid of qualifiedIds) {
    const existing = playerIndex.get(pid);
    const meta = totals.get(pid)?.meta;

    const name = meta?.name ?? existing?.name ?? `Player ${pid}`;
    const team = meta?.team ?? existing?.team ?? "Unknown";
    const position = normPos(meta?.position ?? existing?.position ?? "MID");

    const salary = existing?.salary && existing.salary > 0 ? existing.salary : 20;
    const tier = existing?.tier;

    outPlayers.push({ id: pid, name, position, team, salary, tier });
  }

  await ensureDir(processedRoot);

  const playersPath = path.join(processedRoot, "players.json");
  const logsPath = path.join(processedRoot, "game-logs.json");

  await fs.promises.writeFile(playersPath, JSON.stringify(outPlayers, null, 2), "utf8");
  await fs.promises.writeFile(logsPath, JSON.stringify(outLogs, null, 2), "utf8");

  console.log(`Wrote processed players: ${playersPath} (${outPlayers.length.toLocaleString()})`);
  console.log(`Wrote processed logs:    ${logsPath} (${outLogs.length.toLocaleString()})\n`);
  console.log(`DONE\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
