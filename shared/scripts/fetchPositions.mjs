/**
 * shared/scripts/fetchPositions.mjs — Sport-agnostic position enrichment
 *
 * Fetches player positions from the appropriate API for each sport
 * and saves to public/data/positions.json
 *
 * Usage (run from sport directory):
 *   node scripts/fetchPositions.mjs basketball
 *   node scripts/fetchPositions.mjs worldcup
 *   node scripts/fetchPositions.mjs football
 *
 * Output: public/data/positions.json
 *   { "playerId": { "id": "...", "name": "...", "position": "PG", "positionFull": "PG/SG" } }
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sport = process.argv[2] ?? "basketball";
const OUT = path.join(__dirname, "../public/data/positions.json");

// ── NBA position mapper ────────────────────────────────────────────────────
function mapNBAPosition(nbaPos) {
  const p = (nbaPos ?? "").toLowerCase().trim();
  const map = {
    "point guard":        "PG",
    "shooting guard":     "SG",
    "small forward":      "SF",
    "power forward":      "PF",
    "center":             "C",
    "guard":              "G",
    "forward":            "F",
    "guard-forward":      "G-F",
    "forward-guard":      "G-F",
    "forward-center":     "F-C",
    "center-forward":     "F-C",
  };
  return map[p] ?? null;
}

// ── NBA fetcher ────────────────────────────────────────────────────────────
async function fetchNBAPositions() {
  const seasons = ["2023-24", "2024-25"];
  const posMap = {};

  for (const season of seasons) {
    console.log(`  Fetching NBA ${season}...`);
    const url = `https://stats.nba.com/stats/leaguedashplayerstats?Season=${season}&SeasonType=Regular+Season&PerMode=PerGame&MeasureType=Base&PlayerExperience=&PlayerPosition=&StarterBench=&GameScope=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&PaceAdjust=N&PlusMinus=N&Rank=N&DateFrom=&DateTo=`;

    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://www.nba.com/",
          "Accept": "application/json",
          "x-nba-stats-origin": "stats",
          "x-nba-stats-token": "true",
        }
      });
    } catch (e) {
      console.warn(`  Network error for ${season}:`, e.message);
      continue;
    }

    if (!res.ok) { console.warn(`  Failed ${season}: HTTP ${res.status}`); continue; }

    const data = await res.json();
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    const idIdx    = headers.indexOf("PLAYER_ID");
    const posIdx   = headers.indexOf("PLAYER_POSITION");
    const nameIdx  = headers.indexOf("PLAYER_NAME");

    let count = 0;
    for (const row of rows) {
      const id   = String(row[idIdx]);
      const name = row[nameIdx] ?? "";
      const pos  = mapNBAPosition(row[posIdx] ?? "");
      if (!pos) continue;
      if (!posMap[id]) { posMap[id] = { id, name, position: pos, positionFull: pos }; count++; }
      else {
        // Add secondary position if different
        const existing = posMap[id].positionFull;
        if (!existing.includes(pos)) {
          posMap[id].positionFull = existing + "/" + pos;
        }
      }
    }
    console.log(`  Got ${count} new players from ${season}`);
    await new Promise(r => setTimeout(r, 1200)); // NBA rate limit
  }

  // Collapse G/F/C from positionFull for game engine use
  for (const p of Object.values(posMap)) {
    p.position = collapsePosition(p.positionFull);
  }

  return posMap;
}

// ── Collapse detailed position to G/F/C for game engine ───────────────────
function collapsePosition(pos) {
  const p = pos.toUpperCase();
  if (p.includes("PG") || p.includes("SG") || p === "G") return "G";
  if (p.includes("PF") || p.includes("SF") || p === "F") return "F";
  if (p.includes("C")) return "C";
  if (p.includes("G-F") || p.includes("F-G")) return "F";
  return "G"; // default
}

// ── Worldcup / football stubs ──────────────────────────────────────────────
// These sports get positions from StatsBomb data directly — no separate fetch needed
async function fetchWorldcupPositions() {
  console.log("  Worldcup positions come from StatsBomb lineup data.");
  console.log("  Run the StatsBomb extractor instead.");
  return {};
}

async function fetchFootballPositions() {
  console.log("  Football (FPL) positions are embedded in player data.");
  console.log("  Check buildPlayersFromFPL.mjs for position mapping.");
  return {};
}

// ── Fallback: build from existing players.raw.json ────────────────────────
function buildFromLocalRaw() {
  console.log("  Falling back to local players.raw.json...");
  try {
    const dataDir = process.env.DATA_DIR ?? path.join(__dirname, "../public/data");
const raw = JSON.parse(readFileSync(path.join(dataDir, "players.raw.json"), "utf8"));
    const posMap = {};
    for (const p of raw) {
      if (!p.pos) continue;
      const id = String(p.id);
      const mapped = mapNBAPosition(p.pos) ?? p.pos;
      posMap[id] = { id, name: p.name ?? id, position: collapsePosition(mapped), positionFull: mapped };
    }
    console.log(`  Got ${Object.keys(posMap).length} players from local raw data`);
    return posMap;
  } catch (e) {
    console.warn("  Could not read players.raw.json:", e.message);
    return {};
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nfetchPositions.mjs — sport: ${sport}`);

  let posMap = {};

  if (sport === "basketball") {
    posMap = await fetchNBAPositions();
    if (Object.keys(posMap).length < 100) {
      console.log("  NBA API returned too few results, merging with local raw...");
      const local = buildFromLocalRaw();
      posMap = { ...local, ...posMap }; // API takes precedence
    }
  } else if (sport === "worldcup") {
    posMap = await fetchWorldcupPositions();
  } else if (sport === "football") {
    posMap = await fetchFootballPositions();
  } else {
    console.error(`Unknown sport: ${sport}. Available: basketball, worldcup, football`);
    process.exit(1);
  }

  const count = Object.keys(posMap).length;
  if (!count) {
    console.error("No positions fetched. Check network or data files.");
    process.exit(1);
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(posMap, null, 2));
  console.log(`\n✅ Written ${count} players to ${OUT}`);

  // Sample output
  console.log("\nSample:");
  Object.values(posMap).slice(0, 8).forEach(p =>
    console.log(`  ${p.name.padEnd(25)} ${p.positionFull.padEnd(8)} → engine: ${p.position}`)
  );
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
