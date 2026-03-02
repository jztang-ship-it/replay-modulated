/**
 * worldcup/scripts/transformWorldCupData.mjs
 *
 * Regenerates players.json and game-logs.json from raw StatsBomb data.
 * Uses position-specific FP weights (must match worldcupConfig.ts exactly).
 * Derives salary from avgFP using salaryFromProjection (matches gameAdapter).
 *
 * Usage (from ~/ReplayMod/worldcup/scripts/):
 *   node transformWorldCupData.mjs
 *
 * Reads:  ../public/data/players.raw.json
 *         ../public/data/game-logs.raw.json   (or game-logs.json if no raw)
 * Writes: ../public/data/players.json
 *         ../public/data/game-logs.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = join(__dirname, '..', 'public', 'data');

// ── Position-specific FP weights — MUST match worldcupConfig.ts exactly ──────
const POSITION_WEIGHTS = {
  GK: {
    saves:           20.0,
    goals_conceded:  -6.0,
    clearances:       4.0,
    goals:           60.0,
    yellow_cards:    -5.0,
    red_cards:      -15.0,
  },
  DEF: {
    goals:              18.0,
    assists:             7.0,
    tackles:             5.0,
    interceptions:       6.0,
    clearances:          1.5,
    blocked_shots:       3.0,
    pressures:           0.4,
    dribbles_completed:  2.0,
    shots_on_target:     2.0,
    key_passes:          3.0,
    yellow_cards:       -5.0,
    red_cards:         -15.0,
  },
  MID: {
    goals:              12.0,
    assists:             8.0,
    shots_on_target:     3.0,
    key_passes:          5.0,
    tackles:             4.0,
    interceptions:       5.0,
    clearances:          1.5,
    pressures:           0.6,
    dribbles_completed:  2.0,
    yellow_cards:       -5.0,
    red_cards:         -15.0,
  },
  FWD: {
    goals:              22.0,
    assists:             8.0,
    shots_on_target:     4.0,
    key_passes:          3.0,
    dribbles_completed:  2.0,
    pressures:           0.2,
    tackles:             2.0,
    yellow_cards:       -5.0,
    red_cards:         -15.0,
  },
};

// ── Economy config — MUST match worldcupConfig.ts economyConfig exactly ───────
const ECON = {
  salaryMin:          10,
  salaryMax:          60,
  salaryRatioFloor:   0.3,
  salaryRatioCeiling: 2.0,
};

// ── Tier thresholds — MUST match worldcupConfig.ts tierThresholds exactly ─────
const TIER_THRESHOLDS = [
  { tier: 'ORANGE', minSalary: 52 },
  { tier: 'PURPLE', minSalary: 40 },
  { tier: 'BLUE',   minSalary: 28 },
  { tier: 'GREEN',  minSalary: 16 },
  { tier: 'WHITE',  minSalary: 0  },
];

// ── Position aliases — MUST match worldcupConfig.ts positionAliases exactly ───
const POSITION_ALIASES = {
  'Goalkeeper':          'GK',
  'Center Back':         'DEF', 'Left Back':  'DEF', 'Right Back': 'DEF',
  'Left Wing Back':      'DEF', 'Right Wing Back': 'DEF',
  'Defensive Midfield':  'MID', 'Central Midfield': 'MID',
  'Left Midfield':       'MID', 'Right Midfield': 'MID',
  'Attacking Midfield':  'MID', 'Left Wing': 'MID', 'Right Wing': 'MID',
  'Center Forward':      'FWD', 'Left Center Forward': 'FWD',
  'Right Center Forward':'FWD', 'Secondary Striker': 'FWD',
};

// ── Non-scoring stats (excluded from scoring log filter) ──────────────────────
const NON_SCORING = new Set(['passes_attempted', 'passes_completed', 'minutes_played']);

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizePos(raw) {
  if (!raw) return 'MID';
  const up = String(raw).trim().toUpperCase();
  if (['GK','DEF','MID','FWD'].includes(up)) return up;
  return POSITION_ALIASES[String(raw).trim()] ?? 'MID';
}

function computeFp(stats, pos) {
  const weights = POSITION_WEIGHTS[pos] ?? POSITION_WEIGHTS.MID;
  let fp = 0;
  for (const [key, w] of Object.entries(weights)) {
    fp += Number(stats[key] ?? 0) * w;
  }
  return Math.max(0, fp);
}

function hasScoringStats(stats) {
  return Object.entries(stats ?? {}).some(
    ([k, v]) => !NON_SCORING.has(k) && typeof v === 'number' && v > 0
  );
}

function salaryFromProjection(proj, posMean) {
  const mean  = posMean > 0 ? posMean : 1;
  const ratio = proj / mean;
  const t     = Math.max(0, Math.min(1,
    (ratio - ECON.salaryRatioFloor) / (ECON.salaryRatioCeiling - ECON.salaryRatioFloor)
  ));
  const raw = ECON.salaryMin + t * (ECON.salaryMax - ECON.salaryMin);
  return Math.max(ECON.salaryMin, Math.min(ECON.salaryMax, Math.round(raw)));
}

function tierFromSalary(salary) {
  for (const { tier, minSalary } of TIER_THRESHOLDS) {
    if (salary >= minSalary) return tier;
  }
  return 'WHITE';
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Load data ─────────────────────────────────────────────────────────────────
function loadJson(primary, fallback) {
  const file = existsSync(primary) ? primary : (existsSync(fallback) ? fallback : null);
  if (!file) throw new Error(`Could not find: ${primary} or ${fallback}`);
  console.log(`📂 Loading: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

const rawPlayers = loadJson(
  join(dataDir, 'players.raw.json'),
  join(dataDir, 'players.json')
);
const rawLogs = loadJson(
  join(dataDir, 'game-logs.raw.json'),
  join(dataDir, 'game-logs.json')
);

console.log(`\nLoaded ${rawPlayers.length.toLocaleString()} players, ${rawLogs.length.toLocaleString()} logs`);

// ── Build scoring log map: basePlayerId → logs[] ──────────────────────────────
const logsByPlayerId = new Map();
for (const log of rawLogs) {
  const id = String(log.basePlayerId ?? log.playerId ?? '').trim();
  if (!id) continue;
  if (!logsByPlayerId.has(id)) logsByPlayerId.set(id, []);
  logsByPlayerId.get(id).push(log);
}

// Scoring logs only (strips passes-only entries)
const scoringLogsByPlayerId = new Map();
for (const [id, logs] of logsByPlayerId.entries()) {
  const scoring = logs.filter(l => hasScoringStats(l.stats ?? l));
  if (scoring.length > 0) scoringLogsByPlayerId.set(id, scoring);
}

console.log(`Players with scoring logs: ${scoringLogsByPlayerId.size.toLocaleString()}`);

// ── Compute avgFP per player using position-specific weights ──────────────────
const avgFpById = new Map();
for (const p of rawPlayers) {
  const id  = String(p.basePlayerId ?? p.id ?? '').trim();
  const pos = normalizePos(p.position);
  const logs = scoringLogsByPlayerId.get(id) ?? [];
  if (!logs.length) continue;

  const fps = logs.map(l => computeFp(l.stats ?? l, pos));
  const validFps = fps.filter(fp => fp > 0);
  if (!validFps.length) continue;

  avgFpById.set(id, validFps.reduce((s, v) => s + v, 0) / validFps.length);
}

// ── Compute per-position means (for salary normalisation) ─────────────────────
const posSums   = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

for (const p of rawPlayers) {
  const id  = String(p.basePlayerId ?? p.id ?? '').trim();
  const pos = normalizePos(p.position);
  const avg = avgFpById.get(id);
  if (avg === undefined) continue;
  posSums[pos]   = (posSums[pos]   ?? 0) + avg;
  posCounts[pos] = (posCounts[pos] ?? 0) + 1;
}

const posMeans = {};
for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
  posMeans[pos] = posCounts[pos] > 0 ? posSums[pos] / posCounts[pos] : 20;
}

console.log('\n=== POSITION MEANS (used for salary normalisation) ===');
for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
  console.log(`  ${pos}: avg ${posMeans[pos].toFixed(1)} FP  (${posCounts[pos]} players)`);
}

// ── Build players.json ────────────────────────────────────────────────────────
// Deduplicate: if same basePlayerId appears in multiple seasons, keep all
// (one entry per id field, which is `basePlayerId_season`)
const seenIds = new Set();
const players = [];

for (const p of rawPlayers) {
  const recordId  = String(p.id ?? '').trim();
  const baseId    = String(p.basePlayerId ?? p.id ?? '').trim();
  const pos       = normalizePos(p.position);
  const avgFP     = avgFpById.get(baseId);

  // Skip players with no computable FP
  if (avgFP === undefined || avgFP <= 0) continue;

  // Skip duplicate record IDs
  if (seenIds.has(recordId)) continue;
  seenIds.add(recordId);

  const salary = salaryFromProjection(avgFP, posMeans[pos]);
  const tier   = tierFromSalary(salary);

  players.push({
    id:           recordId || `${baseId}_${p.season ?? 'unknown'}`,
    basePlayerId: baseId,
    season:       String(p.season ?? ''),
    name:         String(p.name ?? ''),
    team:         String(p.team ?? ''),
    position:     pos,
    salary,
    tier,
    avgFP:        round1(avgFP),
    projectedFp:  round1(avgFP),
    active:       p.active !== false,
  });
}

// ── Build game-logs.json ──────────────────────────────────────────────────────
// Keep all scoring logs, ensure consistent field shape
const playableIds = new Set(players.map(p => p.basePlayerId));

const logs = [];
for (const log of rawLogs) {
  const id = String(log.basePlayerId ?? log.playerId ?? '').trim();
  if (!id || !playableIds.has(id)) continue;
  const stats = log.stats ?? log;
  if (!hasScoringStats(stats)) continue;

  logs.push({
    basePlayerId: id,
    season:       String(log.season ?? ''),
    matchDate:    String(log.matchDate ?? log.date ?? ''),
    date:         String(log.date ?? log.matchDate ?? ''),
    opponent:     String(log.opponent ?? log.meta?.opponent ?? ''),
    homeAway:     String(log.homeAway ?? log.meta?.homeAway ?? ''),
    stats: {
      goals:              Number(stats.goals              ?? 0),
      assists:            Number(stats.assists            ?? 0),
      shots:              Number(stats.shots              ?? 0),
      shots_on_target:    Number(stats.shots_on_target    ?? 0),
      key_passes:         Number(stats.key_passes         ?? 0),
      passes_attempted:   Number(stats.passes_attempted   ?? 0),
      passes_completed:   Number(stats.passes_completed   ?? 0),
      tackles:            Number(stats.tackles            ?? 0),
      interceptions:      Number(stats.interceptions      ?? 0),
      clearances:         Number(stats.clearances         ?? 0),
      blocked_shots:      Number(stats.blocked_shots      ?? 0),
      pressures:          Number(stats.pressures          ?? 0),
      saves:              Number(stats.saves              ?? 0),
      goals_conceded:     Number(stats.goals_conceded     ?? 0),
      yellow_cards:       Number(stats.yellow_cards       ?? 0),
      red_cards:          Number(stats.red_cards          ?? 0),
      minutes_played:     Number(stats.minutes_played     ?? 0),
      dribbles_completed: Number(stats.dribbles_completed ?? 0),
    },
  });
}

// ── Stats & validation ────────────────────────────────────────────────────────
const tierCounts = { ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
players.forEach(p => { tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1; });

const salaries = players.map(p => p.salary).sort((a, b) => a - b);
const avgSalary = salaries.reduce((s, v) => s + v, 0) / salaries.length;

const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
for (const p of players) { (byPos[p.position] ??= []).push(p); }

console.log('\n=== OUTPUT SUMMARY ===');
console.log(`Players: ${players.length.toLocaleString()}  (from ${rawPlayers.length.toLocaleString()} raw)`);
console.log(`Logs:    ${logs.length.toLocaleString()}  (scoring only, from ${rawLogs.length.toLocaleString()} raw)`);
console.log(`\nTier distribution:  ${Object.entries(tierCounts).map(([t,n])=>`${t}:${n}`).join('  ')}`);
console.log(`Salary range:       $${salaries[0]} – $${salaries[salaries.length-1]}  avg $${avgSalary.toFixed(1)}`);

console.log('\n=== PER-POSITION SUMMARY ===');
for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
  const ps = byPos[pos] ?? [];
  if (!ps.length) { console.log(`  ${pos}: 0 players`); continue; }
  const fps  = ps.map(p => p.avgFP).sort((a, b) => a - b);
  const sals = ps.map(p => p.salary).sort((a, b) => a - b);
  const p50fps = fps[Math.floor(fps.length * 0.5)];
  const p50sal = sals[Math.floor(sals.length * 0.5)];
  console.log(`  ${pos} (${ps.length}):  avgFP med:${p50fps.toFixed(1)}  salary med:$${p50sal}  range $${sals[0]}-$${sals[sals.length-1]}`);
}

// Correlation check: top salary players should have top FP
console.log('\n=== SALARY/PROJ CORRELATION CHECK ===');
for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
  const ps = (byPos[pos] ?? []).sort((a, b) => b.salary - a.salary);
  if (ps.length < 5) continue;
  const top5avgFp  = ps.slice(0, 5).reduce((s, p) => s + p.avgFP, 0) / 5;
  const bot5avgFp  = ps.slice(-5).reduce((s, p) => s + p.avgFP, 0) / 5;
  const top5avgSal = ps.slice(0, 5).reduce((s, p) => s + p.salary, 0) / 5;
  const bot5avgSal = ps.slice(-5).reduce((s, p) => s + p.salary, 0) / 5;
  const corr = top5avgFp > bot5avgFp ? '✅ correlated' : '❌ INVERTED';
  console.log(`  ${pos}  top-5: $${top5avgSal.toFixed(0)} → ${top5avgFp.toFixed(1)} FP   bot-5: $${bot5avgSal.toFixed(0)} → ${bot5avgFp.toFixed(1)} FP  ${corr}`);
}

// Top players per position
console.log('\n=== TOP 3 PER POSITION (sanity check) ===');
for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
  const top = (byPos[pos] ?? []).sort((a, b) => b.avgFP - a.avgFP).slice(0, 3);
  console.log(`  ${pos}:`);
  top.forEach(p => console.log(`    ${p.name.padEnd(35)} $${String(p.salary).padStart(2)} ${p.tier.padEnd(6)}  avgFP:${p.avgFP}`));
}

// ── Write output ──────────────────────────────────────────────────────────────
const playersOut  = join(dataDir, 'players.json');
const logsOut     = join(dataDir, 'game-logs.json');

writeFileSync(playersOut, JSON.stringify(players, null, 2));
writeFileSync(logsOut,    JSON.stringify(logs,    null, 2));

console.log(`\n✅ Written:`);
console.log(`   ${playersOut}`);
console.log(`   ${logsOut}`);
console.log('\n⚠️  Remember to also update worldcupConfig.ts winTiers if thresholds changed.');
console.log('   Run the simulator to verify: npx ts-node --project tsconfig.sim.json ../shared/tools/runSimulator.ts 10000');
