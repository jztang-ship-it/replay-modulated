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

import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from "fs";
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
const PACE_MS = 1200;
const MAX_RETRIES = 6;

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

  // Skip only if BOTH files exist AND players.json has actual content.
  // (Earlier runs of this script could silently write an empty players.json
  // when leaguedashplayerstats was rate-limited; treat empty as "needs redo".)
  if (skipExisting && existsSync(playersPath) && existsSync(logsPath)) {
    let playersOk = false;
    try {
      const arr = JSON.parse(readFileSync(playersPath, "utf8"));
      playersOk = Array.isArray(arr) && arr.length > 0;
    } catch { /* corrupt or empty — fall through and re-fetch */ }
    if (playersOk) {
      console.log(`⏩ ${seasonStr} — already exists, skipping`);
      continue;
    }
    console.log(`♻ ${seasonStr} — players file empty/corrupt, refetching`);
  }

  console.log(`\n📥 ${seasonStr} (key=${seasonKey})`);

  if (dryRun) {
    console.log(`   [dry-run] would fetch leagueGameLog, build aggregates, write to ${seasonDir}/`);
    continue;
  }

  try {
    // Single endpoint: leaguegamelog. It returns all per-game rows for every
    // player in the league for the season — and crucially includes PLAYER_NAME
    // and TEAM_ABBREVIATION on every row, which is enough to build the season
    // aggregate (name/team/avg stats) without a second API call.
    //
    // Why we don't use leaguedashplayerstats: stats.nba.com rate-limits it
    // far more aggressively than leaguegamelog (often persistent 500s for
    // 30+ minutes), and we don't actually need it — gamelogs carry all the
    // info needed to derive averages locally.
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

    // Filter out DNPs and map to internal log schema.
    const internalLogs = logRows
      .filter(r => Number(r.MIN ?? 0) > 0)
      .map(r => logRowToInternal(r, seasonKey));

    // Build per-player season aggregates from the same logs.
    const players = buildAggregatesFromRawLogs(logRows, seasonKey);

    if (!players.length) {
      throw new Error(`Aggregation produced 0 players from ${logRows.length} log rows — schema may have changed`);
    }

    mkdirSync(seasonDir, { recursive: true });
    writeFileSync(playersPath, JSON.stringify(players, null, 2));
    writeFileSync(logsPath, JSON.stringify(internalLogs, null, 2));

    console.log(
      `   ✅ wrote ${players.length} players (${(playersFileSize(playersPath) / 1024).toFixed(1)} KB) ` +
        `+ ${internalLogs.length} logs (${(playersFileSize(logsPath) / 1024 / 1024).toFixed(2)} MB)`
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
      // stats.nba.com signals rate-limiting via 429, but ALSO via 500/502/503/504
      // when their soft limiter trips harder. Treat the 5xx family as the same
      // signal — back off generously, don't fail the season early.
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        const wait = 15000 * attempt; // 15s, 30s, 45s, 60s, 75s, 90s
        console.warn(`   ${r.status} from ${endpoint} — backing off ${wait} ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(wait);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`);
      return await r.json();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const wait = 5000 * attempt;
      console.warn(`   transient error: ${e.message} — retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
  // Fell through all retries. Earlier this returned undefined, which let the
  // caller silently proceed with empty results — bug, fixed.
  throw new Error(`Exceeded ${MAX_RETRIES} retries on ${endpoint} (still rate-limited)`);
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
//
// Aggregate player rows directly from leaguegamelog output. Each log row
// carries PLAYER_NAME and TEAM_ABBREVIATION so we can build (name, team,
// avg stats) without a second API call. Matches the salary/tier curve used
// by buildSeason2324Aggregates.mjs and the runtime engine.
function buildAggregatesFromRawLogs(logRows, seasonKey) {
  // Group active rows (MIN > 0) by PLAYER_ID.
  const byPid = new Map();
  for (const r of logRows) {
    if (Number(r.MIN ?? 0) <= 0) continue;
    const pid = String(r.PLAYER_ID ?? "");
    if (!pid) continue;
    const arr = byPid.get(pid);
    if (arr) arr.push(r);
    else byPid.set(pid, [r]);
  }

  const out = [];
  for (const [pid, rows] of byPid) {
    if (rows.length < 3) continue; // min-games threshold (matches existing 2324 builder)
    const sum = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };
    for (const r of rows) {
      sum.pts += Number(r.PTS ?? 0);
      sum.reb += Number(r.REB ?? 0);
      sum.ast += Number(r.AST ?? 0);
      sum.stl += Number(r.STL ?? 0);
      sum.blk += Number(r.BLK ?? 0);
      sum.tov += Number(r.TOV ?? 0);
    }
    const n = rows.length;
    const avgFp =
      (sum.pts / n) * 1.0 +
      (sum.reb / n) * 1.2 +
      (sum.ast / n) * 1.5 +
      (sum.stl / n) * 2.0 +
      (sum.blk / n) * 2.0 +
      (sum.tov / n) * -1.0;
    const avgFpRounded = Math.round(avgFp * 10) / 10;
    const salary = Math.round(Math.min(90, Math.max(5, avgFpRounded * 1.45)));
    const tier = tierFromSalary(salary);

    // Latest team for this player (last row by date, since logs come back ASC).
    // Handles mid-season trades cleanly — most-recent team wins.
    const latest = rows[rows.length - 1];
    out.push({
      id: `${pid}_${seasonKey}`,
      basePlayerId: pid,
      season: seasonKey,
      name: String(latest.PLAYER_NAME ?? ""),
      team: String(latest.TEAM_ABBREVIATION ?? ""),
      position: "",     // not in leaguegamelog; merge from positions lookup later if needed
      positionFull: "",
      salary,
      tier,
      avgFP: avgFpRounded,
      projectedFp: avgFpRounded,
      photoCode: pid,
      active: true,
    });
  }
  return out.sort((a, b) => Number(b.salary) - Number(a.salary));
}

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
