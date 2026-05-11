/**
 * enrichPlayerTeams.mjs
 *
 * Sidecar enrichment: for every per-season players.json, fetch that season's
 * leaguegamelog from stats.nba.com, compute the distinct teams each player
 * appeared on, and write a `teams: [...]` field into players.json.
 *
 * Why: extractNbaSeason.mjs only stored each player's LATEST team per season
 * (most-recent TEAM_ABBREVIATION at the time of extract). That's wrong for
 * mid-season trades — Harden 2020-21 reads "BKN" for his HOU games too.
 * This script enriches in-place without re-running the full pipeline.
 *
 * Output: each player entry gains
 *   "teams": ["HOU", "BKN"]       // chronological by first appearance
 * The existing `team` field is preserved for back-compat (latest team).
 *
 * Usage:
 *   node basketball/scripts/enrichPlayerTeams.mjs                  # all 29 seasons
 *   node basketball/scripts/enrichPlayerTeams.mjs --season=2020-21 # one season
 *   node basketball/scripts/enrichPlayerTeams.mjs --skip-existing  # skip seasons that already have teams[]
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const STATS_BASE = "https://stats.nba.com/stats";
const HEADERS = {
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

const args = parseArgs(process.argv.slice(2));
const skipExisting = args["skip-existing"] === true;

const ALL_SEASONS = [
  "1996-97","1997-98","1998-99","1999-00",
  "2000-01","2001-02","2002-03","2003-04","2004-05","2005-06","2006-07","2007-08","2008-09","2009-10",
  "2010-11","2011-12","2012-13","2013-14","2014-15","2015-16","2016-17","2017-18","2018-19","2019-20",
  "2020-21","2021-22","2022-23","2023-24","2024-25",
];

const seasons = args.season ? [args.season] : ALL_SEASONS;

console.log(`📋 Enriching teams[] for ${seasons.length} season(s)`);

for (const seasonStr of seasons) {
  const seasonKey = seasonStrToKey(seasonStr);
  const playersPath = join(SEASONS_DIR, seasonKey, "players.json");
  if (!existsSync(playersPath)) {
    console.warn(`⚠ ${seasonStr} — players.json missing, skipping`);
    continue;
  }
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  if (skipExisting && players.length > 0 && Array.isArray(players[0].teams)) {
    console.log(`⏩ ${seasonStr} — teams[] already present, skipping`);
    continue;
  }

  console.log(`\n📥 ${seasonStr}`);
  try {
    const raw = await callStatsApi("leaguegamelog", {
      Season: seasonStr,
      SeasonType: "Regular Season",
      PlayerOrTeam: "P",
      Counter: 1000,
      Sorter: "DATE",
      Direction: "ASC",
      LeagueID: "00",
    });
    const logRows = rowsToObjects(raw);
    console.log(`   fetched ${logRows.length} log rows`);

    // Map PLAYER_ID → ordered distinct teams
    const teamsByPid = new Map();
    for (const r of logRows) {
      const pid = String(r.PLAYER_ID ?? "");
      const tm = String(r.TEAM_ABBREVIATION ?? "").trim();
      if (!pid || !tm) continue;
      if (Number(r.MIN ?? 0) <= 0) continue;
      const arr = teamsByPid.get(pid) ?? [];
      if (arr[arr.length - 1] !== tm && !arr.includes(tm)) arr.push(tm);
      teamsByPid.set(pid, arr);
    }

    // Enrich players in-place
    let traded = 0;
    for (const p of players) {
      const bid = String(p.basePlayerId ?? "");
      const teams = teamsByPid.get(bid) ?? (p.team ? [String(p.team)] : []);
      p.teams = teams;
      if (teams.length > 1) traded++;
    }
    writeFileSync(playersPath, JSON.stringify(players, null, 2));
    console.log(`   ✅ wrote ${players.length} players (${traded} traded mid-season)`);
  } catch (e) {
    console.error(`   ❌ ${seasonStr} failed: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\n🏁 Done.");

// ── helpers ─────────────────────────────────────────────────────────────────
async function callStatsApi(endpoint, params) {
  const url = new URL(`${STATS_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sleep(PACE_MS);
      const r = await fetch(url, { headers: HEADERS });
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        const wait = 15000 * attempt;
        console.warn(`   ${r.status} from ${endpoint} — backing off ${wait}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(wait);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`);
      return await r.json();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const wait = 5000 * attempt;
      console.warn(`   transient error: ${e.message} — retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`Exceeded ${MAX_RETRIES} retries on ${endpoint}`);
}

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

function seasonStrToKey(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Bad season string: ${s}`);
  return `${m[1].slice(-2)}${m[2]}`;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
