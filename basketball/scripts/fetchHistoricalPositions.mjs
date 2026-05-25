/**
 * fetchHistoricalPositions.mjs
 *
 * Fetches nba.com playerindex with Historical=1 → returns every NBA player
 * (active + retired) and their POSITION. Writes a fresh
 * basketball/public/data/nba-positions.json keyed by PLAYER_LAST_NAME +
 * PLAYER_FIRST_NAME (matching the existing lookup format).
 *
 * Why: the prior nba-positions.json was only active rosters → ~568 names,
 * which left pre-2010 stars (Kobe, Duncan, KG, etc.) with no position
 * info, causing the runtime to fall back to "PG" for everyone in old
 * seasons. Historical playerindex covers everyone.
 *
 * Usage:
 *   node basketball/scripts/fetchHistoricalPositions.mjs
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "data", "nba-positions.json");

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

// Default required params for playerindex. Historical=1 returns retired
// players in addition to active. Empty params are accepted; missing
// params cause HTTP 400.
const ENDPOINT = new URL("https://stats.nba.com/stats/playerindex");
const PARAMS = {
  LeagueID: "00",
  Season: "2024-25",
  Historical: "1",
  Active: "",
  AllStar: "",
  College: "",
  Country: "",
  DraftPick: "",
  DraftRound: "",
  DraftYear: "",
  Height: "",
  Weight: "",
  TeamID: "0",
};
for (const [k, v] of Object.entries(PARAMS)) ENDPOINT.searchParams.set(k, v);

const MAX_RETRIES = 6;

async function fetchWithRetry() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(ENDPOINT.toString(), { headers: HEADERS });
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        const wait = 15000 * attempt;
        console.warn(`${r.status} — backing off ${wait}ms (${attempt}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const wait = 5000 * attempt;
      console.warn(`error: ${e.message} — retrying in ${wait}ms`);
      await new Promise(res => setTimeout(res, wait));
    }
  }
}

console.log("📥 Fetching nba.com playerindex (Historical=1) …");
const json = await fetchWithRetry();
const rs = json?.resultSets?.[0];
if (!rs) throw new Error("Unexpected response shape");
const headers = rs.headers;
const idx = (name) => headers.indexOf(name);
const personIdIdx = idx("PERSON_ID");
const lastNameIdx = idx("PLAYER_LAST_NAME");
const firstNameIdx = idx("PLAYER_FIRST_NAME");
const positionIdx = idx("POSITION");
if (positionIdx < 0) throw new Error("POSITION column missing");
console.log(`   got ${rs.rowSet.length} player rows`);

// Existing lookup (we'll merge — preserve any name not in the new fetch
// so cards keep working for fringe spellings the API doesn't return).
const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : {};
const out = { ...existing };
let added = 0, updated = 0;
for (const row of rs.rowSet) {
  const first = String(row[firstNameIdx] ?? "").trim();
  const last = String(row[lastNameIdx] ?? "").trim();
  const rawPos = String(row[positionIdx] ?? "").trim();
  if (!first || !last || !rawPos) continue;
  const name = `${first} ${last}`;
  // Convert NBA's position strings to our PG/SG/SF/PF/C taxonomy.
  // playerindex returns e.g. "F", "G", "C", "F-G", "G-F", "F-C", "C-F", "PG", "SG", "SF", "PF"
  const POS_MAP = {
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
    "G": "PG",   // pure guard → PG fallback (rare)
    "F": "SF",   // pure forward → SF fallback
    // Hyphenated positions: primary letter wins.
    // NBA convention is "primary-secondary"; pre-2026-05-22 map collapsed
    // both sides to the secondary, mis-categorizing 195 players across all
    // seasons (e.g. Embiid C-F → PF, Pippen G-F → SG). Acknowledged residual
    // errors for ~5 high-salience players where canonical position contradicts
    // NBA hyphenation tracked in docs/open-followups.md as a path-2 override-map
    // followup.
    "G-F": "SF", "F-G": "SG",
    "F-C": "PF", "C-F": "C",
  };
  const position = POS_MAP[rawPos] ?? "SF";
  const positionFull = rawPos;
  const prev = out[name];
  if (!prev) {
    out[name] = { position, positionFull, personId: row[personIdIdx] };
    added++;
  } else if (prev.position !== position) {
    out[name] = { position, positionFull, personId: row[personIdIdx] };
    updated++;
  }
}

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`\n✅ Wrote ${OUT_PATH}`);
console.log(`   total entries: ${Object.keys(out).length}`);
console.log(`   added: ${added}, updated: ${updated}`);
