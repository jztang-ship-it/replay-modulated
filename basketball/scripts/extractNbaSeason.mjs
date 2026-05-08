/**
 * extractNbaSeason.mjs
 *
 * Extracts ONE NBA season from stats.nba.com (the official-but-undocumented
 * stats API used by nba.com itself) and writes per-season files in the
 * canonical layout:
 *
 *   basketball/public/data/seasons/{seasonKey}/players.json
 *   basketball/public/data/seasons/{seasonKey}/gamelogs.json
 *
 * Output schema mirrors what the existing 2324/2425 data uses, so the
 * runtime engine doesn't need to change to consume it.
 *
 * ────────────────────────────────────────────────────────────────────────
 * IMPORTANT — RUN ENVIRONMENT
 * ────────────────────────────────────────────────────────────────────────
 * stats.nba.com blocks most cloud IPs (incl. CI, Vercel, Codespaces). Run
 * this from your local laptop on a residential/home network. If you get
 * 403/timeout, fall back to balldontlie (paid tier — see
 * scripts/EXTRACTION.md for adapter).
 *
 * No API key required for stats.nba.com — but it inspects User-Agent and
 * Referer headers and rate-limits aggressively. We pace requests at 600 ms
 * minimum between calls and back off on 429.
 *
 * ────────────────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────────────────
 *
 *   # One season:
 *   node basketball/scripts/extractNbaSeason.mjs --season=2022-23
 *
 *   # Range:
 *   node basketball/scripts/extractNbaSeason.mjs --from=2010-11 --to=2024-25
 *
 *   # Resume — skips seasons whose output files already exist:
 *   node basketball/scripts/extractNbaSeason.mjs --from=1996-97 --to=2024-25 --skip-existing
 *
 *   # Dry run — log what would be fetched, don't write:
 *   node basketball/scripts/extractNbaSeason.mjs --season=2024-25 --dry-run
 *
 * ────────────────────────────────────────────────────────────────────────
 * NOTES
 * ────────────────────────────────────────────────────────────────────────
 * - Pre-1979-80 seasons have no 3-point line. The fantasy formula still
 *   evaluates correctly (3PM contribution is just 0). Don't try to extract
 *   pre-1973-74 (no blocks/steals tracked — formula would systematically
 *   under-credit defensive stars).
 * - Season key encoding: "2023-24" (input) → "2324" (output, 4-digit).
 *   Pre-2000 example: "1979-80" → "7980". 2-digit pairs throughout — the
 *   splitIntoPerSeasonFiles.mjs label helper handles century display.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data");
const SEASONS_DIR = join(DATA_DIR, "seasons");

// ── Config ──────────────────────────────────────────────────────────────────
const STATS_BASE = "https://stats.nba.com/stats";
const HEADERS = {
  // A real-browser UA stops the simplest server-side filters.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "x-nba-stats-token": "true",
  "x-nba-stats-origin": "stats",
  Connection: "keep-alive",
};
const PACE_MS = 600;
const MAX_RETRIES = 4;

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;
const skipExisting = args["skip-existing"] === true;

let seasons;
if (args.season) {
  seasons = [args.season];
} else if (args.from && args.to) {
  seasons = enumerateSeasons(args.from, args.to);
} else {
  console.error("Usage: node extractNbaSeason.mjs --season=YYYY-YY");
  console.error("   or: node extractNbaSeason.mjs --from=YYYY-YY --to=YYYY-YY [--skip-existing] [--dry-run]");
  process.exit(2);
}

console.log(`📋 Plan: extract ${seasons.length} season(s): ${seasons.join(", ")}`);

// ── Main ────────────────────────────────────────────────────────────────────
for (const seasonStr of seasons) {
  const seasonKey = seasonStrToKey(seasonStr); // "2023-24" -> "2324"
  const seasonDir = join(SEASONS_DIR, seasonKey);
  const playersPath = join(seasonDir, "players.json");
  const logsPath = join(seasonDir, "gamelogs.json");

  if (skipExisting && existsSync(playersPath) && existsSync(logsPath)) {
    console.log(`⏩ ${seasonStr} — already exists, skipping`);
    continue;
  }

  console.log(`\n📥 ${seasonStr} (key=${seasonKey})`);

  if (dryRun) {
    console.log(`   [dry-run] would fetch playerStats + leagueGameLog, write to ${seasonDir}/`);
    continue;
  }

  try {
    // Player season aggregates — average stats, used to compute salary/tier.
    const rawStats = await callStatsApi("leaguedashplayerstats", {
      Season: seasonStr,
      SeasonType: "Regular Season",
      PerMode: "PerGame",
      LeagueID: "00",
      MeasureType: "Base",
      LastNGames: 0,
      Month: 0,
      OpponentTeamID: 0,
      PaceAdjust: "N",
      PlusMinus: "N",
      Rank: "N",
    });
    const playerRows = rowsToObjects(rawStats);
    console.log(`   playerStats: ${playerRows.length}`);

    // Per-game logs for every player in the league this season.
    const rawLogs = await callStatsApi("leaguegamelog", {
      Season: seasonStr,
      SeasonType: "Regular Season",
      PlayerOrTeam: "P",
      Counter: 1000,
      Sorter: "DATE",
      Direction: "ASC",
      LeagueID: "00",
    });
    const logRows = rowsToObjects(rawLogs);
    console.log(`   gameLogs: ${logRows.length}`);

    // Map to our internal schema.
    const players = playerRows
      .filter(r => Number(r.GP ?? 0) >= 3) // >= 3 games to qualify
      .map(r => playerRowToInternal(r, seasonKey))
      .sort((a, b) => Number(b.salary ?? 0) - Number(a.salary ?? 0));

    const logs = logRows
      .filter(r => Number(r.MIN ?? 0) > 0) // skip DNPs
      .map(r => logRowToInternal(r, seasonKey));

    mkdirSync(seasonDir, { recursive: true });
    writeFileSync(playersPath, JSON.stringify(players, null, 2));
    writeFileSync(logsPath, JSON.stringify(logs, null, 2));

    console.log(
      `   ✅ wrote ${players.length} players (${(playersFileSize(playersPath) / 1024).toFixed(1)} KB) ` +
        `+ ${logs.length} logs (${(playersFileSize(logsPath) / 1024 / 1024).toFixed(2)} MB)`
    );
  } catch (e) {
    console.error(`   ❌ ${seasonStr} failed: ${e.message}`);
    console.error("      Re-run with --skip-existing to resume.");
    process.exitCode = 1;
  }
}

console.log("\n🏁 Done.");

// ── stats.nba.com client ───────────────────────────────────────────────────
async function callStatsApi(endpoint, params) {
  const url = new URL(`${STATS_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sleep(PACE_MS);
      const r = await fetch(url, { headers: HEADERS });
      if (r.status === 429) {
        const wait = 5000 * attempt;
        console.warn(`   429 Too Many Requests — backing off ${wait} ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(wait);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`);
      return await r.json();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const wait = 2000 * attempt;
      console.warn(`   transient error: ${e.message} — retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
}

// stats.nba.com returns columnar data. Convert to row objects.
function rowsToObjects(payload) {
  const rs = payload?.resultSets?.[0];
  if (!rs) return [];
  const { headers, rowSet } = rs;
  return rowSet.map(row => {
    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = row[i];
    return o;
  });
}

// ── Schema mappers ─────────────────────────────────────────────────────────
function playerRowToInternal(r, seasonKey) {
  // Use NBA's PerGame avgs for projection — matches existing salary curve.
  const avgFp =
    Number(r.PTS ?? 0) * 1.0 +
    Number(r.REB ?? 0) * 1.2 +
    Number(r.AST ?? 0) * 1.5 +
    Number(r.STL ?? 0) * 2.0 +
    Number(r.BLK ?? 0) * 2.0 +
    Number(r.TOV ?? 0) * -1.0;
  const avgFpRounded = Math.round(avgFp * 10) / 10;
  // Salary curve must match buildSeason2324Aggregates.mjs and runtime engine.
  const salary = Math.round(Math.min(90, Math.max(5, avgFpRounded * 1.45)));
  const tier = tierFromSalary(salary);
  const bid = String(r.PLAYER_ID);
  return {
    id: `${bid}_${seasonKey}`,
    basePlayerId: bid,
    season: seasonKey,
    name: String(r.PLAYER_NAME ?? ""),
    team: String(r.TEAM_ABBREVIATION ?? ""),
    position: "", // NBA stats doesn't include position; merge from positions lookup later
    positionFull: "",
    salary,
    tier,
    avgFP: avgFpRounded,
    projectedFp: avgFpRounded,
    photoCode: bid,
    active: true,
  };
}

function logRowToInternal(r, seasonKey) {
  const matchup = String(r.MATCHUP ?? "");
  const isAway = matchup.includes("@");
  const opp = matchup.replace("vs.", "vs").replace("@", "vs").split("vs")[1]?.trim() ?? "";
  return {
    basePlayerId: String(r.PLAYER_ID),
    date: String(r.GAME_DATE ?? ""),
    matchDate: String(r.GAME_DATE ?? ""),
    season: seasonKey,
    opponent: opp,
    homeAway: isAway ? "A" : "H",
    stats: {
      pts: Number(r.PTS ?? 0),
      reb: Number(r.REB ?? 0),
      ast: Number(r.AST ?? 0),
      stl: Number(r.STL ?? 0),
      blk: Number(r.BLK ?? 0),
      turnovers: Number(r.TOV ?? 0),
      min: Number(r.MIN ?? 0),
      fg_pct: Number(r.FG_PCT ?? 0),
      fg3m: Number(r.FG3M ?? 0),
      fga: Number(r.FGA ?? 0),
    },
  };
}

function tierFromSalary(salary) {
  if (salary >= 73) return "RED";
  if (salary >= 58) return "ORANGE";
  if (salary >= 44) return "PURPLE";
  if (salary >= 30) return "BLUE";
  if (salary >= 23) return "GREEN";
  return "WHITE";
}

// ── Utilities ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}

function enumerateSeasons(from, to) {
  const fromYear = parseSeasonStartYear(from);
  const toYear = parseSeasonStartYear(to);
  const out = [];
  for (let y = fromYear; y <= toYear; y++) {
    const yy1 = String(y).slice(-2).padStart(2, "0");
    const yy2 = String(y + 1).slice(-2).padStart(2, "0");
    out.push(`${y}-${yy2}`);
  }
  return out;
}

function parseSeasonStartYear(s) {
  // "2023-24" -> 2023
  const m = String(s).match(/^(\d{4})-\d{2}$/);
  if (!m) throw new Error(`Bad season string: ${s}`);
  return Number(m[1]);
}

function seasonStrToKey(s) {
  // "2023-24" -> "2324"; "1979-80" -> "7980"
  const m = String(s).match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Bad season string: ${s}`);
  return `${m[1].slice(-2)}${m[2]}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function playersFileSize(path) {
  return readFileSync(path).length;
}
