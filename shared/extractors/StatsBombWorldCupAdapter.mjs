/**
 * StatsBombWorldCupAdapter.mjs
 * Extracts 2018 + 2022 World Cup data from StatsBomb open-data GitHub.
 *
 * FP weights are 5x scaled (baked in).
 * Salary is calculated WITHIN position pool so top GK = top FWD salary-wise.
 * Tier thresholds are absolute and apply globally across positions.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

// ── FP weights (5x scaled, baked in) ──────────────────────────────────────
const FP_WEIGHTS = {
  goals:            30.0,   // 6 * 5
  assists:          20.0,   // 4 * 5
  shots_on_target:   5.0,   // 1 * 5
  key_passes:        5.0,   // 1 * 5
  tackles:           6.0,   // 1.2 * 5
  interceptions:     7.5,   // 1.5 * 5
  clearances:        4.0,   // 0.8 * 5
  blocked_shots:     5.0,   // 1 * 5
  pressures:         0.6,   // 0.12 * 5
  saves:            12.5,   // 2.5 * 5
  goals_conceded:   -5.0,   // -1 * 5
  yellow_cards:     -5.0,   // -1 * 5
  red_cards:       -15.0,   // -3 * 5
  dribbles_completed: 3.0,  // bonus stat
};

// ── Salary config ──────────────────────────────────────────────────────────
// Salary is computed WITHIN each position pool.
// Top player in each position targets MAX_SALARY.
// Linear scale: bottom active player → MIN_SALARY.
const SALARY_CONFIG = {
  salaryMin: 10,
  salaryMax: 60,
  // Target avgFP for the very best player in each position
  // Calibrated so ORANGE tier ($52+) is achievable by top players at ALL positions
  positionTargetFP: {
    GK:  55,   // Courtois/De Gea level — many saves, clean sheets
    DEF: 55,   // Cancelo/Hernandez level — tackles + goals
    MID: 55,   // Modric/De Bruyne level — key passes + goals
    FWD: 55,   // Mbappe/Messi level — goals + assists
  },
};

// ── Tier thresholds (absolute, apply globally across all positions) ─────────
const TIER_THRESHOLDS = [
  { tier: "ORANGE", minSalary: 52 },
  { tier: "PURPLE", minSalary: 40 },
  { tier: "BLUE",   minSalary: 28 },
  { tier: "GREEN",  minSalary: 16 },
  { tier: "WHITE",  minSalary: 0  },
];

// ── Tournaments ────────────────────────────────────────────────────────────
const TOURNAMENTS = [
  { name: "2018 World Cup", competitionId: 43, seasonId: 3 },
  { name: "2022 World Cup", competitionId: 43, seasonId: 106 },
];

// ── Position normalization ─────────────────────────────────────────────────
function normalizePosition(statsbombPos) {
  if (!statsbombPos) return "MID";
  const p = statsbombPos.toLowerCase();
  if (p.includes("goalkeeper")) return "GK";
  if (p.includes("back") || p.includes("center back") || p.includes("wing back")) return "DEF";
  if (p.includes("midfield") || p.includes("defensive mid") || p.includes("attacking mid") || p.includes("left mid") || p.includes("right mid")) return "MID";
  if (p.includes("forward") || p.includes("striker") || p.includes("winger") || p.includes("centre forward") || p.includes("left wing") || p.includes("right wing")) return "FWD";
  if (p.includes("back")) return "DEF";
  return "MID";
}

// ── FP calculation ─────────────────────────────────────────────────────────
function computeFP(stats) {
  let fp = 0;
  for (const [key, weight] of Object.entries(FP_WEIGHTS)) {
    fp += (stats[key] ?? 0) * weight;
  }
  return Math.max(0, fp);
}

// ── Salary calculation (within-position) ──────────────────────────────────
function computeSalaries(playersByPosition) {
  const result = new Map();

  for (const [position, players] of Object.entries(playersByPosition)) {
    const targetFP = SALARY_CONFIG.positionTargetFP[position] ?? 55;
    const avgFPs = players.map(p => p.avgFP);
    const maxFP = Math.max(...avgFPs);
    const minFP = Math.min(...avgFPs.filter(v => v > 0));

    // Scale: minFP → salaryMin, maxFP → salaryMax
    // But cap the top at targetFP so we don't compress the scale if one player is extreme
    const effectiveMax = Math.min(maxFP, targetFP * 1.2);
    const effectiveMin = Math.max(minFP, 0.1);
    const range = effectiveMax - effectiveMin;

    for (const p of players) {
      let salary;
      if (p.avgFP <= 0) {
        salary = SALARY_CONFIG.salaryMin;
      } else {
        const ratio = range > 0 ? (Math.min(p.avgFP, effectiveMax) - effectiveMin) / range : 0;
        const raw = SALARY_CONFIG.salaryMin + ratio * (SALARY_CONFIG.salaryMax - SALARY_CONFIG.salaryMin);
        salary = Math.round(Math.max(SALARY_CONFIG.salaryMin, Math.min(SALARY_CONFIG.salaryMax, raw)));
      }
      result.set(p.basePlayerId + "_" + p.season, salary);
    }
  }

  return result;
}

function tierFromSalary(salary) {
  for (const t of TIER_THRESHOLDS) {
    if (salary >= t.minSalary) return t.tier;
  }
  return "WHITE";
}

// ── Fetch helpers ──────────────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function getMatches(competitionId, seasonId) {
  return fetchJson(`${BASE_URL}/matches/${competitionId}/${seasonId}.json`);
}

async function getLineups(matchId) {
  return fetchJson(`${BASE_URL}/lineups/${matchId}.json`);
}

async function getEvents(matchId) {
  return fetchJson(`${BASE_URL}/events/${matchId}.json`);
}

// ── Event aggregation ──────────────────────────────────────────────────────
function aggregatePlayerEvents(events, lineupsByTeam) {
  const playerStats = new Map();

  // Initialize from lineups
  for (const [teamName, lineup] of Object.entries(lineupsByTeam)) {
    for (const player of lineup) {
      playerStats.set(player.player_id, {
        playerId: player.player_id,
        name: player.player_name,
        team: teamName,
        position: normalizePosition(player.positions?.[0]?.position ?? ""),
        minutesPlayed: 0,
        goals: 0, assists: 0, shots: 0, shots_on_target: 0,
        key_passes: 0, passes_attempted: 0, passes_completed: 0,
        tackles: 0, interceptions: 0, clearances: 0,
        blocked_shots: 0, pressures: 0, saves: 0,
        goals_conceded: 0, yellow_cards: 0, red_cards: 0,
        dribbles_completed: 0,
      });
    }
  }

  // Aggregate events
  for (const event of events) {
    const pid = event.player?.id;
    if (!pid || !playerStats.has(pid)) continue;
    const s = playerStats.get(pid);
    const type = event.type?.name ?? "";

    if (type === "Shot") {
      s.shots++;
      const outcome = event.shot?.outcome?.name ?? "";
      if (outcome === "Goal") s.goals++;
      else if (["Saved", "Saved To Post", "Saved Off Target"].includes(outcome)) s.shots_on_target++;
      else if (outcome === "Blocked") s.blocked_shots++;
      if (outcome !== "Goal" && event.shot?.outcome?.name !== "Off T" && outcome !== "Wayward") s.shots_on_target++;
    }

    if (type === "Pass") {
      s.passes_attempted++;
      const outcome = event.pass?.outcome?.name;
      if (!outcome || outcome === "Unknown") s.passes_completed++;
      const technique = event.pass?.technique?.name ?? "";
      if (event.pass?.goal_assist) s.assists++;
      if (event.pass?.shot_assist || event.pass?.key_pass) s.key_passes++;
    }

    if (type === "Duel") {
      const duelType = event.duel?.type?.name ?? "";
      const duelOutcome = event.duel?.outcome?.name ?? "";
      if (duelType === "Tackle") {
        // Won tackle: outcome is "Won", "Success", "Success In Play", "Success Out"
        if (["Won", "Success", "Success In Play", "Success Out"].includes(duelOutcome)) {
          s.tackles++;
        }
      }
    }

    if (type === "Interception") {
      const outcome = event.interception?.outcome?.name ?? "";
      if (!["Lost", "Lost In Play", "Lost Out"].includes(outcome)) s.interceptions++;
    }

    if (type === "Clearance") s.clearances++;
    if (type === "Pressure") s.pressures++;
    if (type === "Dribble" && event.dribble?.outcome?.name === "Complete") s.dribbles_completed++;

    if (type === "Goal Keeper") {
      const outcome = event.goalkeeper?.outcome?.name ?? "";
      if (["Saved", "Saved To Post", "Touched Out"].includes(outcome)) s.saves++;
      if (["Goal Conceded", "Touched Out"].includes(outcome)) s.goals_conceded++;
    }

    if (type === "Bad Behaviour") {
      const card = event.bad_behaviour?.card?.name ?? "";
      if (card === "Yellow Card") s.yellow_cards++;
      if (card === "Red Card" || card === "Second Yellow") s.red_cards++;
    }
  }

  // Estimate minutes played from substitutions
  for (const event of events) {
    if (event.type?.name === "Substitution") {
      const pid = event.player?.id;
      if (pid && playerStats.has(pid)) {
        playerStats.get(pid).minutesPlayed = Math.round(event.minute + (event.second ?? 0) / 60);
      }
      const subOn = event.substitution?.replacement?.id;
      if (subOn && playerStats.has(subOn)) {
        playerStats.get(subOn).minutesPlayed = 90 - Math.round(event.minute);
      }
    }
  }

  // Players not substituted off played full match
  for (const [, s] of playerStats) {
    if (s.minutesPlayed === 0) s.minutesPlayed = 90;
  }

  // Fix shots_on_target — don't double count
  for (const [, s] of playerStats) {
    s.shots_on_target = Math.min(s.shots_on_target, s.shots);
  }

  return playerStats;
}

// ── Main extraction ────────────────────────────────────────────────────────
async function extractTournament(tournament) {
  console.log(`📥 Processing ${tournament.name}...`);
  const matches = await getMatches(tournament.competitionId, tournament.seasonId);
  console.log(`  Found ${matches.length} matches`);

  const playerLogs = new Map(); // playerId → [{ matchId, stats, team, position, matchDate, opponent, homeAway }]
  const playerMeta = new Map(); // playerId → { name, team, position }
  let processed = 0;

  for (const match of matches) {
    processed++;
    if (processed % 16 === 0 || processed === matches.length) {
      process.stdout.write(`\r  Processing match ${processed}/${matches.length}...`);
    }

    const matchId = match.match_id;
    const matchDate = match.match_date;
    const homeTeam = match.home_team?.home_team_name ?? "";
    const awayTeam = match.away_team?.away_team_name ?? "";

    let lineups, events;
    try {
      [lineups, events] = await Promise.all([getLineups(matchId), getEvents(matchId)]);
    } catch (e) {
      continue;
    }

    const lineupsByTeam = {};
    for (const team of lineups) {
      lineupsByTeam[team.team_name] = team.lineup;
    }

    const playerStats = aggregatePlayerEvents(events, lineupsByTeam);

    for (const [pid, stats] of playerStats) {
      const isHome = Object.keys(lineupsByTeam)[0] === homeTeam;
      const playerTeam = stats.team;
      const opponent = playerTeam === homeTeam ? awayTeam : homeTeam;
      const homeAway = playerTeam === homeTeam ? "H" : "A";

      if (!playerMeta.has(pid)) {
        playerMeta.set(pid, { name: stats.name, team: playerTeam, position: stats.position });
      }

      if (!playerLogs.has(pid)) playerLogs.set(pid, []);
      playerLogs.get(pid).push({
        matchDate,
        opponent,
        homeAway,
        minutesPlayed: stats.minutesPlayed,
        stats: {
          goals: stats.goals,
          assists: stats.assists,
          shots: stats.shots,
          shots_on_target: stats.shots_on_target,
          key_passes: stats.key_passes,
          passes_attempted: stats.passes_attempted,
          passes_completed: stats.passes_completed,
          tackles: stats.tackles,
          interceptions: stats.interceptions,
          clearances: stats.clearances,
          blocked_shots: stats.blocked_shots,
          pressures: stats.pressures,
          saves: stats.saves,
          goals_conceded: stats.goals_conceded,
          yellow_cards: stats.yellow_cards,
          red_cards: stats.red_cards,
          minutes_played: stats.minutesPlayed,
          dribbles_completed: stats.dribbles_completed,
        },
      });
    }
  }

  console.log(`\n  ✅ ${tournament.name} complete`);
  return { playerLogs, playerMeta };
}

// ── Build output records ───────────────────────────────────────────────────
function buildOutputs(allData, seasonKey) {
  const players = [];
  const logs = [];

  // Group by position for within-position salary scaling
  const playersByPosition = { GK: [], DEF: [], MID: [], FWD: [] };

  for (const [pid, { playerMeta, playerLogs }] of allData) {
    const meta = playerMeta;
    const matchLogs = playerLogs;

    if (!matchLogs.length) continue;

    // Only include players who played meaningful minutes
    const activeLogs = matchLogs.filter(l => l.minutesPlayed >= 20);
    if (!activeLogs.length) continue;

    const avgFP = activeLogs.reduce((s, l) => s + computeFP(l.stats), 0) / activeLogs.length;
    const pos = meta.position;

    const playerRecord = {
      basePlayerId: String(pid),
      name: meta.name,
      team: meta.team,
      position: pos,
      season: seasonKey,
      avgFP: Math.round(avgFP * 10) / 10,
      activeLogs,
    };

    if (playersByPosition[pos]) playersByPosition[pos].push(playerRecord);
    else playersByPosition["MID"].push(playerRecord);
  }

  // Compute salaries within each position pool
  const salaryMap = computeSalaries(playersByPosition);

  // Build final player + log records
  for (const [pos, posPlayers] of Object.entries(playersByPosition)) {
    for (const p of posPlayers) {
      const salaryKey = p.basePlayerId + "_" + p.season;
      const salary = salaryMap.get(salaryKey) ?? SALARY_CONFIG.salaryMin;
      const tier = tierFromSalary(salary);

      const playerId = `${p.basePlayerId}_${p.season}`;
      players.push({
        id: playerId,
        basePlayerId: p.basePlayerId,
        season: p.season,
        name: p.name,
        team: p.team,
        position: p.position,
        salary,
        tier,
        avgFP: p.avgFP,
        projectedFp: p.avgFP,
        active: true,
      });

      for (const log of p.activeLogs) {
        logs.push({
          basePlayerId: p.basePlayerId,
          season: p.season,
          matchDate: log.matchDate,
          date: log.matchDate,
          opponent: log.opponent,
          homeAway: log.homeAway,
          stats: log.stats,
        });
      }
    }
  }

  return { players, logs };
}

// ── Entry point ────────────────────────────────────────────────────────────
async function main() {
  console.log("⚽ StatsBomb World Cup Data Extractor (5x FP scale, position-balanced salaries)");
  console.log("=".repeat(70));

  const allPlayers = [];
  const allLogs = [];

  for (const tournament of TOURNAMENTS) {
    const seasonKey = tournament.seasonId === 3 ? "2018" : "2022";
    const { playerLogs, playerMeta } = await extractTournament(tournament);

    // Merge meta + logs by player
    const merged = new Map();
    for (const [pid, meta] of playerMeta) {
      merged.set(pid, { playerMeta: meta, playerLogs: playerLogs.get(pid) ?? [] });
    }

    const { players, logs } = buildOutputs(merged, seasonKey);
    allPlayers.push(...players);
    allLogs.push(...logs);
    console.log(`  ${seasonKey}: ${players.length} players, ${logs.length} logs`);
  }

  // Deduplicate players (same basePlayerId across seasons = separate entries, that's fine)
  console.log(`\n📊 Building player records...`);
  console.log(`✅ Built ${allPlayers.length} player-season entries`);
  console.log(`✅ Built ${allLogs.length} game logs`);

  // Tier distribution
  const tierDist = {};
  for (const p of allPlayers) tierDist[p.tier] = (tierDist[p.tier] ?? 0) + 1;
  console.log("Tier distribution:");
  for (const [tier, count] of Object.entries(tierDist)) console.log(`   ${tier}: ${count}`);

  // Position distribution
  const posDist = {};
  for (const p of allPlayers) posDist[p.position] = (posDist[p.position] ?? 0) + 1;
  console.log("Position distribution:");
  for (const [pos, count] of Object.entries(posDist)) console.log(`   ${pos}: ${count}`);

  // Salary sanity check per position
  console.log("\nSalary check (top 5 per position):");
  const byPos = {};
  for (const p of allPlayers) {
    if (!byPos[p.position]) byPos[p.position] = [];
    byPos[p.position].push(p);
  }
  for (const [pos, players] of Object.entries(byPos)) {
    const top5 = players.sort((a, b) => b.salary - a.salary).slice(0, 5);
    console.log(`   ${pos}: ${top5.map(p => `${p.name.split(" ").pop()}($${p.salary})`).join(", ")}`);
  }

  // Write output
  const outDir = join(process.cwd(), "worldcup", "public", "data");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "players.json"), JSON.stringify(allPlayers, null, 2));
  writeFileSync(join(outDir, "game-logs.json"), JSON.stringify(allLogs, null, 2));

  console.log(`\n📁 Written:`);
  console.log(`   ${join(outDir, "players.json")}`);
  console.log(`   ${join(outDir, "game-logs.json")}`);
  console.log(`\n⚽ Done! Run the simulator next:`);
  console.log(`   node --input-type=module -e "..." OR npx ts-node shared/tools/runSimulator.ts worldcup 10000`);
}

main().catch(e => { console.error("❌ Fatal:", e.message); process.exit(1); });
