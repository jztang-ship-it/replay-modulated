/**
 * buildPlayersFromFPL.mjs
 *
 * Builds players.json from FPL bootstrap API.
 *
 * Key design principle:
 * - FPL's points_per_game (PPG) is already normalized across positions.
 *   A GK with PPG=5 and an FW with PPG=5 are equally elite AND produce
 *   similar actual FP output — because FPL scoring accounts for position
 *   differences (clean sheets for GK/DE, goals for FW, etc.)
 * - Salary is based on PPG relative to ALL players (not per position),
 *   so same salary = same expected FP output regardless of position.
 * - Tier distribution is enforced per-position so each position has
 *   ORANGE/PURPLE/BLUE/GREEN/WHITE players for variety.
 *
 * Run from frontend/ directory:
 *   node scripts/buildPlayersFromFPL.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../public/data/players.json");
const FPL_BASE = "https://fantasy.premierleague.com/api";

// ── Economy config ─────────────────────────────────────────────────────────
const SALARY_MIN = 5;
const SALARY_MAX = 65;
const SALARY_MEAN = 25; // average player salary target

const TIER_THRESHOLDS = [
  { tier: "ORANGE", minSalary: 52 },
  { tier: "PURPLE", minSalary: 40 },
  { tier: "BLUE",   minSalary: 27 },
  { tier: "GREEN",  minSalary: 14 },
  { tier: "WHITE",  minSalary: 0  },
];

// Target tier distribution per position (approximate %)
// Each position should have representation at every tier
const TARGET_TIER_PCT = {
  ORANGE: 0.10, // top 10%
  PURPLE: 0.20, // next 20%
  BLUE:   0.30, // middle 30%
  GREEN:  0.25, // lower 25%
  WHITE:  0.15, // bottom 15%
};

const POSITION_MAP = { 1: "GK", 2: "DE", 3: "MD", 4: "FW" };

function tierFromSalary(salary) {
  for (const { tier, minSalary } of TIER_THRESHOLDS) {
    if (salary >= minSalary) return tier;
  }
  return "WHITE";
}

function stdDev(values, mean) {
  if (values.length < 2) return 1;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// ── Fetch FPL data ─────────────────────────────────────────────────────────
console.log("Fetching FPL bootstrap-static...");
const bootstrap = await fetch(`${FPL_BASE}/bootstrap-static/`).then(r => r.json());

const elements = bootstrap.elements ?? [];
const teams = bootstrap.teams ?? [];

const teamById = new Map();
for (const t of teams) teamById.set(t.id, t.name);

console.log(`Found ${elements.length} players, ${teams.length} teams`);

// Filter to active players (90+ mins this season)
const active = elements.filter(e => (e.minutes ?? 0) >= 90 && (e.element_type in POSITION_MAP));
console.log(`Active players: ${active.length}`);

// ── Step 1: Calculate GLOBAL PPG stats (all positions together) ────────────
// This is the key — PPG is already position-normalized by FPL scoring
const allPpg = active.map(e => Number(e.points_per_game ?? 0)).filter(v => v > 0);
const globalMean = allPpg.reduce((a, b) => a + b, 0) / allPpg.length;
const globalStdDev = stdDev(allPpg, globalMean);

console.log(`\nGlobal PPG stats:`);
console.log(`  mean: ${globalMean.toFixed(2)}, stdDev: ${globalStdDev.toFixed(2)}`);
console.log(`  range: ${Math.min(...allPpg).toFixed(2)} - ${Math.max(...allPpg).toFixed(2)}`);

// ── Step 2: Assign salary based on global PPG z-score ─────────────────────
// z=+2 (top ~2%) → $65 ORANGE
// z=0  (average) → $25
// z=-2 (bottom)  → $5
function salaryFromGlobalPpg(ppg) {
  const z = Math.max(-2.5, Math.min(2.5, (ppg - globalMean) / Math.max(0.1, globalStdDev)));
  if (z >= 0) {
    const t = z / 2.5;
    return Math.round(SALARY_MEAN + t * (SALARY_MAX - SALARY_MEAN));
  } else {
    const t = (z + 2.5) / 2.5;
    return Math.round(SALARY_MIN + t * (SALARY_MEAN - SALARY_MIN));
  }
}

// ── Step 3: Build raw player list ─────────────────────────────────────────
const currentSeason = 2024;
const rawPlayers = [];

for (const e of active) {
  const position = POSITION_MAP[e.element_type];
  const ppg = Number(e.points_per_game ?? 0);
  const salary = Math.max(SALARY_MIN, Math.min(SALARY_MAX, salaryFromGlobalPpg(ppg)));
  const tier = tierFromSalary(salary);
  const photoCode = e.photo ? e.photo.replace(".jpg", "") : null;

  rawPlayers.push({
    id: `${e.id}-${currentSeason}`,
    basePlayerId: String(e.id),
    season: currentSeason,
    name: `${e.first_name} ${e.second_name}`,
    position,
    team: teamById.get(e.team) ?? "Unknown",
    tier,
    salary,
    avgFP: ppg,
    matches: e.starts ?? 0,
    minutes: e.minutes ?? 0,
    photoCode,
    _ppg: ppg, // keep for sorting
  });
}

// ── Step 4: Enforce tier distribution per position ─────────────────────────
// Sort each position by PPG descending, then assign tiers by rank
// This ensures every position has ORANGE/PURPLE/BLUE/GREEN/WHITE players
const byPosition = { GK: [], DE: [], MD: [], FW: [] };
for (const p of rawPlayers) byPosition[p.position].push(p);

const players = [];

for (const [pos, group] of Object.entries(byPosition)) {
  // Sort by PPG descending
  group.sort((a, b) => b._ppg - a._ppg);
  const n = group.length;

  let cursor = 0;
  const tierOrder = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];

  for (const tier of tierOrder) {
    const pct = TARGET_TIER_PCT[tier];
    const count = tier === "WHITE"
      ? group.length - cursor // remainder goes to WHITE
      : Math.max(1, Math.round(n * pct)); // at least 1 per tier per position

    const tierPlayers = group.slice(cursor, cursor + count);
    cursor += count;

    // Now reassign salaries within this tier band to spread them out
    const [salMin, salMax] = getSalaryBand(tier);

    tierPlayers.forEach((p, i) => {
      // Spread evenly within band, highest PPG gets highest salary in band
      const t = tierPlayers.length > 1 ? (tierPlayers.length - 1 - i) / (tierPlayers.length - 1) : 0.5;
      const salary = Math.round(salMin + t * (salMax - salMin));
      const { _ppg, ...rest } = p;
      players.push({ ...rest, tier, salary });
    });
  }

  console.log(`${pos}: ${n} players processed`);
}

function getSalaryBand(tier) {
  switch (tier) {
    case "ORANGE": return [52, 65];
    case "PURPLE": return [40, 51];
    case "BLUE":   return [27, 39];
    case "GREEN":  return [14, 26];
    case "WHITE":  return [5,  13];
    default:       return [5,  13];
  }
}

// ── Validate ───────────────────────────────────────────────────────────────
console.log(`\nBuilt ${players.length} players\n`);

const posCounts = {};
const tierCounts = {};
const tierByPos = {};

for (const p of players) {
  posCounts[p.position] = (posCounts[p.position] ?? 0) + 1;
  tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1;
  if (!tierByPos[p.position]) tierByPos[p.position] = {};
  tierByPos[p.position][p.tier] = (tierByPos[p.position][p.tier] ?? 0) + 1;
}

console.log("Tier distribution per position:");
for (const pos of ["GK", "DE", "MD", "FW"]) {
  const tiers = tierByPos[pos] ?? {};
  const total = posCounts[pos] ?? 0;
  const line = ["ORANGE","PURPLE","BLUE","GREEN","WHITE"]
    .map(t => `${t}:${tiers[t]??0}`)
    .join(" ");
  console.log(`  ${pos} (${total}): ${line}`);
}

const avgSalary = players.reduce((s, p) => s + p.salary, 0) / players.length;
const allAvgFP = players.map(p => p.avgFP).filter(v => v > 0);
console.log(`\navgFP range: ${Math.min(...allAvgFP).toFixed(2)} - ${Math.max(...allAvgFP).toFixed(2)}`);
console.log(`avg salary: $${avgSalary.toFixed(1)} (6-card avg: $${(avgSalary*6).toFixed(0)} vs cap $180)`);

// Show top players per position
console.log("\nTop 2 ORANGE per position:");
for (const pos of ["GK", "DE", "MD", "FW"]) {
  const top = players
    .filter(p => p.position === pos && p.tier === "ORANGE")
    .sort((a, b) => b.salary - a.salary)
    .slice(0, 2);
  for (const p of top) {
    console.log(`  ${pos} ${p.name} avgFP=${p.avgFP.toFixed(2)} salary=$${p.salary}`);
  }
}

// ── Write ──────────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_PATH, JSON.stringify(players, null, 2));
console.log(`\n✅ Written ${players.length} players to ${OUT_PATH}`);
console.log("Next: run 'node scripts/buildFplLogsEnriched.mjs' to fetch game logs");
