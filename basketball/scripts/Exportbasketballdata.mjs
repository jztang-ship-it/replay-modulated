/**
 * exportBasketballData.mjs
 * 
 * Pulls both NBA seasons from Supabase and builds:
 *   - public/data/players.json       (all players, both seasons, with salary + tier + avgFP)
 *   - public/data/game-logs.json     (all logs, with season label 2324 or 2425)
 * 
 * Usage:
 *   node scripts/exportBasketballData.mjs
 * 
 * Season date ranges:
 *   2324 = 2023-10-01 to 2024-06-30
 *   2425 = 2024-10-01 to 2025-06-30
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, "..", "public", "data");

const SUPABASE_URL = "https://hnhrpwwznzokkfagfumb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";

if (!SUPABASE_KEY) {
  console.error("❌ Set SUPABASE_KEY env var first:");
  console.error("   SUPABASE_KEY=your_key node scripts/exportBasketballData.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Season definitions ────────────────────────────────────────────────────
const SEASONS = [
  { label: "2324", from: "2023-10-01", to: "2024-06-30" },
  { label: "2425", from: "2024-10-01", to: "2025-06-30" },
];

// ── FP formula (must match resolveEngine.ts) ─────────────────────────────
function computeFp(row) {
  return (
    (row.pts       ?? 0) * 1.0 +
    (row.reb       ?? 0) * 1.2 +
    (row.ast       ?? 0) * 1.5 +
    (row.stl       ?? 0) * 2.0 +
    (row.blk       ?? 0) * 2.0 +
    (row.turnovers ?? 0) * -1.0
  );
}

// ── Salary + tier from avgFP ──────────────────────────────────────────────
// Scale: avgFP maps to salary on a curve
// Tier thresholds (salary-based, must match economyEngine.ts)
function salaryFromAvgFp(avgFp) {
  const raw = avgFp * 1.45;
  return Math.round(Math.min(90, Math.max(5, raw)));
}
function tierFromSalary(salary) {
  if (salary >= 72) return "ORANGE";
  if (salary >= 55) return "PURPLE";
  if (salary >= 37) return "BLUE";
  if (salary >= 22) return "GREEN";
  return "WHITE";
}

// ── Fetch all rows from a table with pagination ───────────────────────────
async function fetchAll(table, query) {
  const PAGE = 1000;
  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(table, from, from + PAGE - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    rows = rows.concat(data ?? []);
    console.log(`  fetched ${rows.length} rows...`);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Load static positions lookup (keyed by player name)
  const posLookup = JSON.parse(
    readFileSync(join(OUT_DIR, "nba-positions.json"), "utf8")
  );
  console.log(`📋 Loaded ${Object.keys(posLookup).length} position entries`);

  // 1. Fetch all players
  console.log("\n📥 Fetching players...");
  const allPlayers = await fetchAll("players", (t, from, to) =>
    supabase.from(t).select("*").range(from, to)
  );
  console.log(`✅ ${allPlayers.length} players`);

  // 2. Fetch all game logs
  console.log("\n📥 Fetching game logs...");
  const allLogs = await fetchAll("game_logs", (t, from, to) =>
    supabase.from(t).select("*").order("game_date", { ascending: true }).range(from, to)
  );
  console.log(`✅ ${allLogs.length} logs`);

  // 3. Label each log with season
  const labeledLogs = allLogs.map(log => {
    const d = log.game_date;
    let season = "unknown";
    for (const s of SEASONS) {
      if (d >= s.from && d <= s.to) { season = s.label; break; }
    }

    // Parse opponent and home/away from matchup e.g. "MIL vs. DEN" or "MIL @ DEN"
    const matchup  = log.matchup ?? "";
    const isAway   = matchup.includes("@");
    const parts    = matchup.replace("vs.", "vs").replace("@", "vs").split("vs").map(s => s.trim());
    const opponent = parts[1] ?? "";

    return {
      basePlayerId: String(log.player_id),
      date:         log.game_date,
      matchDate:    log.game_date,
      season,
      opponent,
      homeAway:     isAway ? "A" : "H",
      stats: {
        pts:       log.pts       ?? 0,
        reb:       log.reb       ?? 0,
        ast:       log.ast       ?? 0,
        stl:       log.stl       ?? 0,
        blk:       log.blk       ?? 0,
        turnovers: log.turnovers ?? 0,
        min:       log.min       ?? 0,
      },
    };
  });

  // 4. Build per-player per-season stats
  // playerSeasonMap: { playerId_season: { logs[], avgFp } }
  const playerSeasonMap = new Map();

  for (const log of labeledLogs) {
    if (log.season === "unknown") continue;
    const key = `${log.basePlayerId}_${log.season}`;
    if (!playerSeasonMap.has(key)) {
      playerSeasonMap.set(key, { playerId: log.basePlayerId, season: log.season, logs: [] });
    }
    // Skip DNPs — no minutes played or all-zero stats
    if (Number(log.min || 0) === 0) continue;
    const s = log.stats ?? {};
    if ((Number(s.pts||0) + Number(s.reb||0) + Number(s.ast||0) + Number(s.stl||0) + Number(s.blk||0)) === 0) continue;
    playerSeasonMap.get(key).logs.push(log);
  }

  // 5. Build players array — one entry per player per season
  const playerMap = new Map(allPlayers.map(p => [String(p.id), p]));
  const players = [];

  for (const [key, entry] of playerSeasonMap) {
    const { playerId, season, logs: seasonLogs } = entry;
    if (seasonLogs.length < 3) continue; // skip players with < 3 games

    const rawPlayer = playerMap.get(playerId);
    if (!rawPlayer) continue;

    // Calculate avgFP from this season's logs
    const totalFp = seasonLogs.reduce((sum, l) => sum + computeFp(l.stats), 0);
    const avgFP   = Math.round((totalFp / seasonLogs.length) * 10) / 10;

    const salary  = salaryFromAvgFp(avgFP);
    const tier    = tierFromSalary(salary);

    // Build projected FP = avgFP (simple projection)
    players.push({
      id:           `${playerId}_${season}`,
      basePlayerId: playerId,
      season,
      name:         rawPlayer.name,
      team:         rawPlayer.team,
      position:     (rawPlayer.pos && !["G","F"].includes(rawPlayer.pos)) ? rawPlayer.pos : (posLookup[rawPlayer.name]?.position ?? rawPlayer.pos ?? "G"),
      positionFull: (rawPlayer.pos && !["G","F"].includes(rawPlayer.pos)) ? rawPlayer.pos : (posLookup[rawPlayer.name]?.positionFull ?? rawPlayer.pos ?? "G"),
      salary,
      tier,
      avgFP,
      projectedFp:  avgFP,
      active:       rawPlayer.active,
    });
  }

  // Sort by salary desc
  players.sort((a, b) => b.salary - a.salary);

  console.log(`\n✅ Built ${players.length} player-season entries`);

  // Season breakdown
  for (const s of SEASONS) {
    const count = players.filter(p => p.season === s.label).length;
    const logCount = labeledLogs.filter(l => l.season === s.label).length;
    console.log(`   ${s.label}: ${count} players, ${logCount} logs`);
  }

  // Tier breakdown
  const tiers = ["ORANGE","PURPLE","BLUE","GREEN","WHITE"];
  for (const t of tiers) {
    console.log(`   ${t}: ${players.filter(p => p.tier === t).length} player-seasons`);
  }

  // 6. Write files
  const playersPath = join(OUT_DIR, "players.json");
  const logsPath    = join(OUT_DIR, "game-logs.json");

  writeFileSync(playersPath, JSON.stringify(players, null, 2));
  writeFileSync(logsPath,    JSON.stringify(labeledLogs, null, 2));

  console.log(`\n📁 Written:`);
  console.log(`   ${playersPath}`);
  console.log(`   ${logsPath}`);
  console.log(`\n🏀 Done! Both seasons ready.`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
