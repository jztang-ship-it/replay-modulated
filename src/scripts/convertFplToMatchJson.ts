// src/scripts/convertFplToMatchJson.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

type OutLog = {
  id: string;
  sport: "football";
  playerId: string;
  season: string;          // keep as folder season for now
  matchDate: string;       // ISO string
  minutesPlayed: number;
  position?: string;
  team?: string;
  stats: Record<string, number>;
  events: Record<string, number>;
  playerName?: string;
};

const IN_ROOT = path.resolve(process.cwd(), "src/data/football/raw/epl_fpl");
const OUT_ROOT = path.resolve(process.cwd(), "src/data/football/raw/epl");

const SEASONS = [
  { urlSeason: "2022-23", folderSeason: "2022-2023" },
  { urlSeason: "2023-24", folderSeason: "2023-2024" },
  { urlSeason: "2024-25", folderSeason: "2024-2025" },
] as const;

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function toIsoDate(s: string): string {
  // kickoff_time should already be ISO-ish; normalize defensively
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function toNumber(x: any): number {
  if (x === null || x === undefined || x === "") return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// Keep these as metadata (not in stats), even if numeric.
const META_KEYS = new Set([
  "name",
  "position",
  "team",
  "kickoff_time",
  "GW",
  "season",
]);

// Keys that are identifiers (not stats)
const ID_KEYS = new Set([
  "element",
  "fixture",
  "opponent_team",
  "round",
  "was_home",
]);

function pickStats(row: Record<string, any>): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const [k, v] of Object.entries(row)) {
    if (META_KEYS.has(k)) continue;
    if (ID_KEYS.has(k)) continue;

    // Store ONLY numeric-like values as stats.
    // was_home is boolean-ish; ignore it or convert later if you want.
    const n = toNumber(v);
    // If column is truly non-numeric, n will be 0 — but we don't want
    // to accidentally include random strings as 0 stats.
    // So: include if value looks numeric.
    const looksNumeric =
      typeof v === "number" ||
      (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)));

    if (looksNumeric) stats[k] = n;
  }

  // Ensure minutes exists for downstream logic
  if (stats.minutes === undefined) stats.minutes = toNumber(row.minutes);

  return stats;
}

function buildId(playerId: string, fixture: any, kickoff: string): string {
  const f = String(fixture ?? "unknown");
  const k = kickoff ? kickoff : "unknown-date";
  return `${playerId}-${f}-${k}`;
}

async function main() {
  console.log(`[convertFplToMatchJson] inRoot=${IN_ROOT}`);
  console.log(`[convertFplToMatchJson] outRoot=${OUT_ROOT}`);

  let total = 0;

  for (const s of SEASONS) {
    const inCsv = path.join(IN_ROOT, s.folderSeason, "merged_gw.csv");
    if (!fs.existsSync(inCsv)) {
      console.warn(`[convertFplToMatchJson] missing ${inCsv} (skip)`);
      continue;
    }

    console.log(`[convertFplToMatchJson] reading ${inCsv}`);
    const raw = fs.readFileSync(inCsv, "utf8");

    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, any>[];

    console.log(`[convertFplToMatchJson] ${s.folderSeason} rows=${rows.length}`);

    const out: OutLog[] = rows.map((row) => {
      const playerId = String(row.element ?? "");
      const kickoff = String(row.kickoff_time ?? "");
      const fixture = row.fixture;

      const matchDate = toIsoDate(kickoff);
      const minutesPlayed = toNumber(row.minutes);

      const position = row.position ? String(row.position) : undefined;
      const team = row.team ? String(row.team) : undefined;
      const playerName = row.name ? String(row.name) : undefined;

      const stats = pickStats(row);

      // Optional: keep “event-like” stats duplicated in events for UI transparency.
      // Your engine can ignore events if unused.
      const events: Record<string, number> = {
        goals_scored: toNumber(row.goals_scored),
        assists: toNumber(row.assists),
        clean_sheets: toNumber(row.clean_sheets),
        saves: toNumber(row.saves),
        yellow_cards: toNumber(row.yellow_cards),
        red_cards: toNumber(row.red_cards),
        penalties_saved: toNumber(row.penalties_saved),
        penalties_missed: toNumber(row.penalties_missed),
        own_goals: toNumber(row.own_goals),
        goals_conceded: toNumber(row.goals_conceded),
        bonus: toNumber(row.bonus),
        bps: toNumber(row.bps),
        total_points: toNumber(row.total_points),
      };

      return {
        id: buildId(playerId, fixture, matchDate),
        sport: "football",
        playerId,
        season: s.folderSeason,
        matchDate,
        minutesPlayed,
        position,
        team,
        stats,
        events,
        playerName,
      };
    });

    const outDir = path.join(OUT_ROOT, s.folderSeason);
    ensureDir(outDir);

    const outPath = path.join(outDir, "game-logs.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

    console.log(`[convertFplToMatchJson] wrote ${out.length} logs -> ${outPath}`);
    total += out.length;
  }

  console.log(`[convertFplToMatchJson] DONE totalLogs=${total}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
