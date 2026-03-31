#!/usr/bin/env node
/**
 * Pragmatic MLB import for local testing:
 * - Active rosters for a season → player metadata
 * - Per-player game logs (hitting + pitching) for that season → normalized logs + EHLP filter
 * - Headshots cached under public/data/mlb/headshots/
 *
 * Env:
 *   SEASON=2024          Calendar year of the MLB season (default: 2024)
 *   LIMIT=               Optional max players to process for game logs + headshots (debug)
 *   FETCH_DELAY_MS=120   Pause between HTTP calls (light rate limiting)
 *   SKIP_GAME_LOGS=0     Set to 1 to only refresh players + headshots
 *
 * Requires: Node 18+ (global fetch)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASEBALL_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(BASEBALL_ROOT, "public", "data", "mlb");
const HEADSHOTS_DIR = path.join(DATA_DIR, "headshots");
const PLAYERS_FILE = path.join(DATA_DIR, "players.json");
const LOGS_FILE = path.join(DATA_DIR, "game-logs.json");

const MLB = "https://statsapi.mlb.com/api/v1";

// Most recent completed MLB season (easy single-point update).
const TARGET_SEASON = "2025";
const SEASON = String(process.env.SEASON || TARGET_SEASON);
const LIMIT_RAW = process.env.LIMIT;
const LIMIT = LIMIT_RAW ? Math.max(0, parseInt(LIMIT_RAW, 10)) : 0;
const FETCH_DELAY_MS = Math.max(0, parseInt(process.env.FETCH_DELAY_MS || "120", 10));
const SKIP_GAME_LOGS = process.env.SKIP_GAME_LOGS === "1" || process.env.SKIP_GAME_LOGS === "true";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let _fetchSeq = 0;
async function fetchJson(url, label) {
  const id = ++_fetchSeq;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const ms = Date.now() - t0;
    if (!res.ok) {
      console.error(`[fetch #${id}] FAIL ${label} ${res.status} ${res.statusText} (${ms}ms)\n  ${url}`);
      throw new Error(`HTTP ${res.status}: ${label}`);
    }
    const data = await res.json();
    console.log(`[fetch #${id}] OK ${label} (${ms}ms)`);
    if (FETCH_DELAY_MS) await sleep(FETCH_DELAY_MS);
    return data;
  } catch (e) {
    console.error(`[fetch #${id}] ERROR ${label}: ${e.message}`);
    throw e;
  }
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function readJsonIfExists(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn(`[warn] Could not read ${p}: ${e.message}`);
  }
  return fallback;
}

function writeJson(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function validateOutputFiles(playersPath, logsPath) {
  let players;
  let logs;

  try {
    const pRaw = fs.readFileSync(playersPath, "utf8");
    players = JSON.parse(pRaw);
  } catch (e) {
    console.error(`[validate] FAILED to read/parse players.json: ${e.message}`);
    throw e;
  }

  try {
    const lRaw = fs.readFileSync(logsPath, "utf8");
    logs = JSON.parse(lRaw);
  } catch (e) {
    console.error(`[validate] FAILED to read/parse game-logs.json: ${e.message}`);
    throw e;
  }

  if (!Array.isArray(players)) players = [];
  if (!Array.isArray(logs)) logs = [];

  let badPositionCount = 0;
  let badLogPlayerRefCount = 0;
  let missingPlayerIdInLogsCount = 0;

  const playerIds = new Set();
  for (const p of players) {
    const id = Number(p?.playerId);
    if (Number.isFinite(id)) playerIds.add(id);

    const pos = String(p?.position ?? "");
    if (pos !== "P" && pos !== "BAT") badPositionCount++;
  }

  for (const row of logs) {
    const pid = Number(row?.playerId);
    if (!Number.isFinite(pid)) {
      missingPlayerIdInLogsCount++;
      continue;
    }
    if (!playerIds.has(pid)) badLogPlayerRefCount++;
  }

  const warningCount = badPositionCount + badLogPlayerRefCount + missingPlayerIdInLogsCount;
  console.log("\n=== Validation ===");
  console.log(`- players.json parse/read: OK (${players.length} rows)`);
  console.log(`- game-logs.json parse/read: OK (${logs.length} rows)`);
  console.log(`- bad player positions (not P/BAT): ${badPositionCount}`);
  console.log(`- logs with missing/invalid playerId: ${missingPlayerIdInLogsCount}`);
  console.log(`- logs referencing unknown playerId: ${badLogPlayerRefCount}`);
  console.log(`- validation warning count: ${warningCount}`);

  return {
    warningCount,
    badPositionCount,
    missingPlayerIdInLogsCount,
    badLogPlayerRefCount,
  };
}

/** MLB innings string e.g. "6.1" → outs (6*3+1) */
function ipStringToOuts(ip) {
  const s = String(ip ?? "0").trim();
  const m = s.match(/^(\d+)(?:\.([12]))?$/);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 3) : 0;
  }
  const whole = Number(m[1]);
  const thirds = m[2] ? Number(m[2]) : 0;
  return whole * 3 + thirds;
}

/** Outs → decimal IP for export (6.1 style) */
function outsToIpDisplay(outs) {
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? whole : Number(`${whole}.${rem}`);
}

function isPitcherAbbrev(abbr) {
  const a = String(abbr ?? "").toUpperCase();
  if (!a) return false;
  if (a === "P" || a === "SP" || a === "RP" || a === "LHP" || a === "RHP") return true;
  if (a.includes("PITCH")) return true;
  return false;
}

function normalizePersonPosition(person) {
  const p = person?.primaryPosition?.abbreviation ?? person?.primaryPosition?.code ?? "";
  return isPitcherAbbrev(p) ? "P" : "BAT";
}

function headshotUrlsForPlayer(playerId) {
  const id = Number(playerId);
  return [
    `https://img.mlbstatic.com/mlb-photos/image/upload/w_400,q_auto:best/v1/people/${id}/headshot/silo/current`,
    `https://midfield.mlbstatic.com/v1/people/${id}/headshot/current`,
  ];
}

async function downloadHeadshot(playerId, destPath) {
  const BETWEEN_URL_MS = 40;
  const REQUEST_TIMEOUT_MS = 10000;

  try {
    const urls = headshotUrlsForPlayer(playerId);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
          res = await fetch(url, { redirect: "follow", signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!res.ok) {
          if (i < urls.length - 1) await sleep(BETWEEN_URL_MS);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) {
          if (i < urls.length - 1) await sleep(BETWEEN_URL_MS);
          continue;
        }
        ensureDir(path.dirname(destPath));
        fs.writeFileSync(destPath, buf);
        return url;
      } catch (_) {
        if (i < urls.length - 1) await sleep(BETWEEN_URL_MS);
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Best-effort opponent name from a gameLog split */
function opponentFromSplit(split) {
  const og = split?.opponent?.team?.name ?? split?.opponent?.name;
  if (og) return String(og);
  const g = split?.game;
  const teams = g?.teams;
  if (teams?.away?.team?.name && teams?.home?.team?.name) {
    const isHome = split?.isHome === true;
    return isHome ? String(teams.away.team.name) : String(teams.home.team.name);
  }
  return null;
}

/** YYYY-MM-DD from split */
function dateFromSplit(split) {
  const d = split?.date ?? split?.game?.gameDate ?? split?.gameDate;
  if (!d) return null;
  const iso = String(d).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  } catch (_) {}
  return null;
}

function hitterMeaningful(stats) {
  const sum =
    Number(stats.h || 0) +
    Number(stats.doubles || 0) +
    Number(stats.triples || 0) +
    Number(stats.hr || 0) +
    Number(stats.r || 0) +
    Number(stats.rbi || 0) +
    Number(stats.bb || 0) +
    Number(stats.sb || 0);
  return sum > 0;
}

function passesHitterEhlp(stats) {
  const pa = Number(stats.pa ?? 0);
  if (pa < 3) return false;
  return hitterMeaningful(stats);
}

function passesPitcherEhlp(stats) {
  const outs = ipStringToOuts(stats.ipRaw);
  return outs >= 12; // 4 IP
}

function mapHitterStats(stat) {
  const out = {
    h: Number(stat?.hits ?? 0),
    doubles: Number(stat?.doubles ?? 0),
    triples: Number(stat?.triples ?? 0),
    hr: Number(stat?.homeRuns ?? 0),
    r: Number(stat?.runs ?? 0),
    rbi: Number(stat?.rbi ?? 0),
    bb: Number(stat?.baseOnBalls ?? stat?.walks ?? 0),
    sb: Number(stat?.stolenBases ?? 0),
    pa: Number(stat?.plateAppearances ?? 0),
  };
  return out;
}

function mapPitcherStats(stat) {
  const ipRaw = stat?.inningsPitched ?? "0";
  const outs = ipStringToOuts(ipRaw);
  const er = Number(stat?.earnedRuns ?? 0);
  const ip = outsToIpDisplay(outs);
  const w = Number(stat?.wins ?? 0); // often 0/1 in game row
  const qs = outs >= 18 && er <= 3 ? 1 : 0;
  return {
    ip,
    k: Number(stat?.strikeOuts ?? 0),
    er,
    w,
    qs,
  };
}

async function getTeamsForSeason(season) {
  const url = `${MLB}/teams?sportId=1&season=${encodeURIComponent(season)}`;
  const data = await fetchJson(url, `teams season=${season}`);
  return data?.teams ?? [];
}

async function getActiveRosterPlayerIds(teamId, season) {
  const url = `${MLB}/teams/${teamId}/roster?season=${encodeURIComponent(season)}&rosterType=active`;
  const data = await fetchJson(url, `roster team=${teamId}`);
  const roster = data?.roster ?? [];
  const rows = [];
  for (const entry of roster) {
    const pid = entry?.person?.id;
    if (pid == null) continue;
    rows.push({ playerId: Number(pid) });
  }
  return rows;
}

async function fetchPeopleBatch(ids) {
  if (!ids.length) return [];
  const url = `${MLB}/people?personIds=${ids.join(",")}&hydrate=currentTeam`;
  const data = await fetchJson(url, `people batch n=${ids.length}`);
  return data?.people ?? [];
}

async function fetchGameLogGroup(playerId, season, group) {
  const url = `${MLB}/people/${playerId}/stats?stats=gameLog&season=${encodeURIComponent(
    season,
  )}&group=${group}`;
  const data = await fetchJson(url, `gameLog player=${playerId} group=${group}`);
  const stats = data?.stats?.[0]?.splits ?? [];
  return stats;
}

function logKey(playerId, date, position) {
  return `${playerId}|${date}|${position}`;
}

async function main() {
  console.log("=== MLB import (pragmatic test) ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Output: ${DATA_DIR}`);
  if (LIMIT) console.log(`LIMIT players (game logs + headshots): ${LIMIT}`);
  console.log(`FETCH_DELAY_MS: ${FETCH_DELAY_MS}`);
  console.log(`SKIP_GAME_LOGS: ${SKIP_GAME_LOGS}`);

  ensureDir(DATA_DIR);
  ensureDir(HEADSHOTS_DIR);

  const existingPlayers = readJsonIfExists(PLAYERS_FILE, []);
  const existingLogs = readJsonIfExists(LOGS_FILE, []);

  const playersById = new Map();
  for (const p of existingPlayers) {
    if (p?.playerId != null) playersById.set(Number(p.playerId), p);
  }
  const logKeys = new Set();
  for (const row of existingLogs) {
    if (row?.playerId != null && row?.date && row?.position) {
      logKeys.add(logKey(row.playerId, row.date, row.position));
    }
  }

  console.log(`\n[1/5] Loading active rosters for ${SEASON}...`);
  const teams = await getTeamsForSeason(SEASON);
  console.log(`      Teams: ${teams.length}`);

  const rosterRows = [];
  const seenRoster = new Set();
  for (const t of teams) {
    const tid = t?.id;
    if (tid == null) continue;
    const rows = await getActiveRosterPlayerIds(tid, SEASON);
    for (const r of rows) {
      if (seenRoster.has(r.playerId)) continue;
      seenRoster.add(r.playerId);
      rosterRows.push(r);
    }
    console.log(`      ... team ${t?.abbreviation ?? tid}: +${rows.length} roster entries (unique total ${seenRoster.size})`);
  }
  console.log(`      Unique player IDs from active rosters: ${rosterRows.length}`);

  console.log(`\n[2/5] Fetching player metadata (batched)...`);
  const playerIds = rosterRows.map((r) => r.playerId);
  const BATCH = 45;
  let metaCount = 0;
  for (let i = 0; i < playerIds.length; i += BATCH) {
    const chunk = playerIds.slice(i, i + BATCH);
    const people = await fetchPeopleBatch(chunk);
    for (const person of people) {
      const id = Number(person?.id);
      if (!Number.isFinite(id)) continue;
      const teamName =
        person?.currentTeam?.name ??
        person?.currentTeam?.teamName ??
        person?.currentTeam?.abbreviation ??
        "";
      const name =
        (person?.fullName && String(person.fullName).trim()) ||
        [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim() ||
        String(id);
      const position = normalizePersonPosition(person);
      const headshotUrl = headshotUrlsForPlayer(id)[0];
      const prev = playersById.get(id) ?? {};
      playersById.set(id, {
        ...prev,
        playerId: id,
        name,
        position,
        mlbTeam: String(teamName || prev.mlbTeam || ""),
        headshotUrl,
        headshotLocal: prev.headshotLocal ?? null,
      });
      metaCount++;
    }
    console.log(`      ... metadata ${Math.min(i + BATCH, playerIds.length)}/${playerIds.length}`);
  }
  console.log(`      Player records merged: ${metaCount}`);

  console.log(`\n[3/5] Downloading headshots (skip if file exists)...`);
  let headOk = 0;
  let headSkip = 0;
  let headFail = 0;
  const hsList = LIMIT ? playerIds.slice(0, LIMIT) : playerIds;
  const HEADSHOT_CONCURRENCY = 6;
  let headProcessed = 0;
  let headCursor = 0;
  const headProgressEvery = 25;
  const headProgress = () => {
    console.log(
      `      ... headshots ${headProcessed}/${hsList.length} | ok ${headOk} | skipped ${headSkip} | failed ${headFail}`,
    );
  };

  const headshotWorker = async () => {
    while (true) {
      const idx = headCursor++;
      if (idx >= hsList.length) return;

      const id = hsList[idx];
      const localAbs = path.join(DATA_DIR, "headshots", `${id}.png`);
      const rec = playersById.get(id);

      try {
        if (fs.existsSync(localAbs) && fs.statSync(localAbs).size > 500) {
          headSkip++;
          if (rec) {
            rec.headshotLocal = `/${["data", "mlb", "headshots", `${id}.png`].join("/")}`;
            playersById.set(id, rec);
          }
        } else {
          const usedUrl = await downloadHeadshot(id, localAbs);
          if (usedUrl && fs.existsSync(localAbs)) {
            headOk++;
            if (rec) {
              rec.headshotLocal = `/${["data", "mlb", "headshots", `${id}.png`].join("/")}`;
              playersById.set(id, rec);
            }
          } else {
            headFail++;
            console.warn(`[headshot] FAILED playerId=${id}`);
            if (rec) {
              rec.headshotLocal = null;
              playersById.set(id, rec);
            }
          }
        }
      } catch (_) {
        headFail++;
        console.warn(`[headshot] FAILED playerId=${id}`);
        if (rec) {
          rec.headshotLocal = null;
          playersById.set(id, rec);
        }
      } finally {
        headProcessed++;
        if (headProcessed % headProgressEvery === 0 || headProcessed === hsList.length) {
          headProgress();
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(HEADSHOT_CONCURRENCY, hsList.length) }, () => headshotWorker());
  await Promise.all(workers);
  console.log(`      Headshots: new/refreshed=${headOk}, skipped existing=${headSkip}, failed=${headFail}`);

  let finalLogs = existingLogs;
  let totalLogsFetched = existingLogs.length;

  if (!SKIP_GAME_LOGS) {
    console.log(`\n[4/5] Fetching game logs (hitting + pitching per player)...`);
    let logsAdded = 0;
    let logsSkippedDup = 0;
    const logsOut = [...existingLogs];
    const idList = LIMIT ? playerIds.slice(0, LIMIT) : playerIds;
    let pi = 0;
    for (const playerId of idList) {
      pi++;

      try {
        const hitSplits = await fetchGameLogGroup(playerId, SEASON, "hitting");
        for (const split of hitSplits) {
          const date = dateFromSplit(split);
          if (!date) continue;
          const stat = split?.stat ?? {};
          const stats = mapHitterStats(stat);
          if (!passesHitterEhlp(stats)) continue;
          const key = logKey(playerId, date, "BAT");
          if (logKeys.has(key)) {
            logsSkippedDup++;
            continue;
          }
          logKeys.add(key);
          logsOut.push({
            playerId,
            date,
            opponent: opponentFromSplit(split),
            position: "BAT",
            stats,
          });
          logsAdded++;
        }
      } catch (e) {
        console.warn(`[gameLog] hitting FAIL playerId=${playerId}: ${e.message}`);
      }

      try {
        const pitchSplits = await fetchGameLogGroup(playerId, SEASON, "pitching");
        for (const split of pitchSplits) {
          const date = dateFromSplit(split);
          if (!date) continue;
          const stat = split?.stat ?? {};
          const stats = mapPitcherStats(stat);
          stats.ipRaw = String(stat?.inningsPitched ?? "0");
          if (!passesPitcherEhlp(stats)) continue;
          delete stats.ipRaw;
          const key = logKey(playerId, date, "P");
          if (logKeys.has(key)) {
            logsSkippedDup++;
            continue;
          }
          logKeys.add(key);
          logsOut.push({
            playerId,
            date,
            opponent: opponentFromSplit(split),
            position: "P",
            stats,
          });
          logsAdded++;
        }
      } catch (e) {
        console.warn(`[gameLog] pitching FAIL playerId=${playerId}: ${e.message}`);
      }

      if (pi % 25 === 0 || pi === idList.length) {
        console.log(
          `      ... players ${pi}/${idList.length} | new logs +${logsAdded} | dup skip ${logsSkippedDup}`,
        );
      }
    }
    console.log(`      Game logs total in file: ${logsOut.length} (new this run: ${logsAdded})`);
    totalLogsFetched = logsOut.length;

    console.log(`\n[5/5] Writing game-logs.json...`);
    finalLogs = logsOut.filter(
      (r) => r?.playerId != null && playersById.has(Number(r.playerId)),
    );
    console.log(`      Retained log rows (usable / in player set): ${finalLogs.length}`);
    writeJson(LOGS_FILE, finalLogs);
  } else {
    console.log(`\n[4/5] SKIP_GAME_LOGS=1 — leaving game-logs.json unchanged`);
    finalLogs = existingLogs.filter(
      (r) => r?.playerId != null && playersById.has(Number(r.playerId)),
    );
  }

  const retainedIds = new Set(finalLogs.map((r) => Number(r.playerId)));
  console.log(`\nWriting players.json (only players with ≥1 retained log: ${retainedIds.size})...`);
  const playersOut = Array.from(playersById.values())
    .filter((p) => retainedIds.has(Number(p.playerId)))
    .sort((a, b) => a.playerId - b.playerId);
  writeJson(PLAYERS_FILE, playersOut);

  console.log("\n=== Done ===");
  console.log(`Players file: ${PLAYERS_FILE} (${playersOut.length} rows)`);
  console.log(`Logs file:    ${LOGS_FILE}${SKIP_GAME_LOGS ? " (unchanged)" : ""}`);
  console.log(`Headshots:    ${HEADSHOTS_DIR}/`);

  console.log("\n=== Final Summary ===");
  console.log(`- target season: ${SEASON}`);
  console.log(`- total players fetched: ${playerIds.length}`);
  console.log(`- retained players written: ${playersOut.length}`);
  console.log(`- total logs fetched: ${totalLogsFetched}`);
  console.log(`- retained logs written: ${finalLogs.length}`);
  console.log(`- successful headshot downloads: ${headOk}`);
  console.log(`- skipped existing headshots: ${headSkip}`);
  console.log(`- failed headshot downloads: ${headFail}`);
  console.log(`- output folder path: ${DATA_DIR}`);

  validateOutputFiles(PLAYERS_FILE, LOGS_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
