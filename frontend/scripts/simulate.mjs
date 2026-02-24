#!/usr/bin/env node
/**
 * simulate.mjs — ReplayMod win threshold simulator
 *
 * Reads the real players.json and game-logs.enriched.json,
 * simulates N hands using the same logic as the game engines,
 * and outputs FP distribution so we can set thresholds correctly.
 *
 * Usage:
 *   node scripts/simulate.mjs
 *   node scripts/simulate.mjs --hands 5000
 *   node scripts/simulate.mjs --hands 1000 --held 2
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};

const NUM_HANDS     = getArg("--hands", 2000);
const AVG_HELD      = getArg("--held", 1.5); // average cards held per hand (0 = no holds)
const FP_SCALE      = 5;
const CAP_MAX       = 180;
const ROSTER_SIZE   = 6;
const MIN_SALARY    = 5;

// Tier thresholds — must match economyEngine.ts
const TIER_THRESHOLDS = [
  { tier: "ORANGE", minSalary: 52 },
  { tier: "PURPLE", minSalary: 40 },
  { tier: "BLUE",   minSalary: 27 },
  { tier: "GREEN",  minSalary: 14 },
  { tier: "WHITE",  minSalary: 5  },
];

// ── Load data ──────────────────────────────────────────────────────────────
const dataDir = resolve(__dirname, "../public/data");

let players, logs;
try {
  players = JSON.parse(readFileSync(resolve(dataDir, "players.json"), "utf8"));
  logs    = JSON.parse(readFileSync(resolve(dataDir, "game-logs.enriched.json"), "utf8"));
} catch (e) {
  console.error("Could not load data files. Make sure you're running from ~/ReplayMod/");
  console.error(e.message);
  process.exit(1);
}

console.log(`Loaded ${players.length} players, ${logs.length} logs`);

// ── Build lookup maps ──────────────────────────────────────────────────────
const logsByPlayer = new Map(); // basePlayerId → RawLog[]
for (const log of logs) {
  const key = String(log.basePlayerId ?? log.playerId ?? "");
  if (!key) continue;
  if (!logsByPlayer.has(key)) logsByPlayer.set(key, []);
  logsByPlayer.get(key).push(log);
}

// Filter to players that have logs
const evalPool = players.filter(p => logsByPlayer.has(String(p.basePlayerId)));
console.log(`Players with logs: ${evalPool.length}`);

// ── Helpers ────────────────────────────────────────────────────────────────
function rng() { return Math.random(); }

function tierFromSalary(salary) {
  for (const t of TIER_THRESHOLDS) {
    if (salary >= t.minSalary) return t.tier;
  }
  return "WHITE";
}

function pickWeighted(pool) {
  const weights = pool.map(p => Math.pow(p.salary, 2));
  const total   = weights.reduce((s, w) => s + w, 0);
  let rand = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function buildRoster() {
  const usedIds = new Set();
  const roster  = [];
  let budget    = CAP_MAX;

  // Position slots: FW, MD, DE, GK, FLEX, FLEX
  const slots = ["FW", "MD", "DE", "GK", "FLEX", "FLEX"];

  // Step 1: Pick one ORANGE/PURPLE anchor first
  const anchors = evalPool.filter(p => p.salary >= 40 && p.salary <= budget - 5 * MIN_SALARY);
  if (anchors.length) {
    const anchor = pickWeighted(anchors);
    usedIds.add(anchor.basePlayerId);
    budget -= anchor.salary;
    roster.push(anchor);
  }

  // Step 2: Fill required positions then FLEX
  const byPos = {};
  for (const p of evalPool) {
    const pos = p.position.toUpperCase();
    (byPos[pos] ??= []).push(p);
  }

  for (let i = roster.length; i < ROSTER_SIZE; i++) {
    const slotsLeft = ROSTER_SIZE - i;
    const maxForSlot = budget - (slotsLeft - 1) * MIN_SALARY;

    const req = slots[i] ?? "FLEX";
    const posPool = req === "FLEX"
      ? evalPool.filter(p => p.position.toUpperCase() !== "GK")
      : (byPos[req.toUpperCase()] ?? evalPool);

    const candidates = posPool.filter(p =>
      !usedIds.has(p.basePlayerId) && p.salary <= maxForSlot
    );

    if (!candidates.length) continue;
    const picked = pickWeighted(candidates);
    usedIds.add(picked.basePlayerId);
    budget -= picked.salary;
    roster.push(picked);
  }

  return roster;
}

function pickBiasedLog(player) {
  const key  = String(player.basePlayerId);
  const all  = logsByPlayer.get(key) ?? [];
  if (!all.length) return null;

  const tier = tierFromSalary(player.salary);
  const sorted = [...all].sort((a, b) => {
    const fpA = a.stats?.total_points ?? 0;
    const fpB = b.stats?.total_points ?? 0;
    return fpB - fpA;
  });

  const n = sorted.length;
  let lo, hi;
  if      (tier === "ORANGE") { lo = 0;                    hi = Math.ceil(n * 0.40); }
  else if (tier === "PURPLE") { lo = 0;                    hi = Math.ceil(n * 0.55); }
  else if (tier === "BLUE")   { lo = Math.floor(n * 0.20); hi = Math.ceil(n * 0.70); }
  else if (tier === "GREEN")  { lo = Math.floor(n * 0.30); hi = Math.ceil(n * 0.80); }
  else                        { lo = Math.floor(n * 0.40); hi = n; }

  lo = Math.max(0, lo);
  hi = Math.min(n, Math.max(lo + 1, hi));

  const window = sorted.slice(lo, hi);
  return window[Math.floor(rng() * window.length)];
}

function resolveRoster(roster) {
  let totalFp = 0;
  for (const player of roster) {
    const log = pickBiasedLog(player);
    const rawFp = log?.stats?.total_points ?? 0;
    totalFp += rawFp * FP_SCALE;
  }
  return totalFp;
}

// ── Run simulation ─────────────────────────────────────────────────────────
console.log(`\nSimulating ${NUM_HANDS} hands (avg ${AVG_HELD} held cards)...\n`);

const allFp = [];

for (let h = 0; h < NUM_HANDS; h++) {
  const roster = buildRoster();
  if (roster.length < ROSTER_SIZE) continue;
  const fp = resolveRoster(roster);
  allFp.push(fp);
}

allFp.sort((a, b) => a - b);

// ── Stats ──────────────────────────────────────────────────────────────────
const mean = allFp.reduce((s, v) => s + v, 0) / allFp.length;
const median = allFp[Math.floor(allFp.length / 2)];
const p10  = allFp[Math.floor(allFp.length * 0.10)];
const p25  = allFp[Math.floor(allFp.length * 0.25)];
const p50  = allFp[Math.floor(allFp.length * 0.50)];
const p70  = allFp[Math.floor(allFp.length * 0.70)];
const p85  = allFp[Math.floor(allFp.length * 0.85)];
const p93  = allFp[Math.floor(allFp.length * 0.93)];
const p98  = allFp[Math.floor(allFp.length * 0.98)];
const max  = allFp[allFp.length - 1];
const min  = allFp[0];

console.log("═══════════════════════════════════════");
console.log("  FP DISTRIBUTION");
console.log("═══════════════════════════════════════");
console.log(`  Min:    ${min.toFixed(1)}`);
console.log(`  P10:    ${p10.toFixed(1)}`);
console.log(`  P25:    ${p25.toFixed(1)}`);
console.log(`  Median: ${p50.toFixed(1)}`);
console.log(`  Mean:   ${mean.toFixed(1)}`);
console.log(`  P70:    ${p70.toFixed(1)}`);
console.log(`  P85:    ${p85.toFixed(1)}`);
console.log(`  P93:    ${p93.toFixed(1)}`);
console.log(`  P98:    ${p98.toFixed(1)}`);
console.log(`  Max:    ${max.toFixed(1)}`);
console.log("");

// ── Win rate at current thresholds ────────────────────────────────────────
const CURRENT = { BRONZE: 120, GOLD: 132, MVP: 160, JACKPOT: 180 };
console.log("═══════════════════════════════════════");
console.log("  WIN RATES — CURRENT THRESHOLDS");
console.log("═══════════════════════════════════════");
for (const [tier, threshold] of Object.entries(CURRENT).reverse()) {
  const count = allFp.filter(fp => fp >= threshold).length;
  const pct   = (count / allFp.length * 100).toFixed(1);
  console.log(`  ${tier.padEnd(10)} (≥${String(threshold).padStart(4)} FP): ${pct.padStart(6)}%  [${count}/${allFp.length}]`);
}
console.log(`  ${"BUST".padEnd(10)}               : ${(allFp.filter(fp => fp < CURRENT.BRONZE).length / allFp.length * 100).toFixed(1).padStart(6)}%`);

// ── Suggest slot-machine thresholds ───────────────────────────────────────
// Target feel: BRONZE ~40% (keeps people playing), GOLD ~20%, MVP ~8%, JACKPOT ~2%
const targetBronze  = allFp[Math.floor(allFp.length * 0.60)]; // bottom 60% = bust
const targetGold    = allFp[Math.floor(allFp.length * 0.80)];
const targetMvp     = allFp[Math.floor(allFp.length * 0.92)];
const targetJackpot = allFp[Math.floor(allFp.length * 0.98)];

console.log("");
console.log("═══════════════════════════════════════");
console.log("  SUGGESTED THRESHOLDS (slot-machine feel)");
console.log("  Target: BRONZE 40% | GOLD 20% | MVP 8% | JACKPOT 2%");
console.log("═══════════════════════════════════════");
console.log(`  BRONZE  ≥ ${Math.round(targetBronze)}`);
console.log(`  GOLD    ≥ ${Math.round(targetGold)}`);
console.log(`  MVP     ≥ ${Math.round(targetMvp)}`);
console.log(`  JACKPOT ≥ ${Math.round(targetJackpot)}`);
console.log("");
console.log("  Copy these into payoutLogic.ts then re-run to verify.");
console.log("═══════════════════════════════════════\n");

// ── Histogram ─────────────────────────────────────────────────────────────
console.log("  HISTOGRAM (each █ = ~1%)");
console.log("─────────────────────────────────────");
const bucketSize = 10;
const buckets = {};
for (const fp of allFp) {
  const b = Math.floor(fp / bucketSize) * bucketSize;
  buckets[b] = (buckets[b] ?? 0) + 1;
}
const bucketKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
for (const b of bucketKeys) {
  const count = buckets[b];
  const pct   = count / allFp.length * 100;
  const bar   = "█".repeat(Math.round(pct));
  console.log(`  ${String(b).padStart(4)}-${String(b + bucketSize - 1).padEnd(4)} ${bar} ${pct.toFixed(1)}%`);
}
console.log("");
