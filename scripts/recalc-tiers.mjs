#!/usr/bin/env node
/**
 * scripts/recalc-tiers.mjs
 *
 * Re-grade baseball player tiers by raw avgFP (salary-agnostic), ranked
 * separately within the P pool and the BAT pool. Percentile buckets:
 *   top 20%   → ORANGE
 *   20-40%    → PURPLE
 *   40-60%    → BLUE
 *   60-80%    → GREEN
 *   bottom 20%→ WHITE
 *
 * Writes updated baseball/public/data/players.json with new `tier` and
 * `avgFP` values. Nothing else is touched.
 *
 * FP weights are the "locked" spec:
 *   Batters : h×12 + doubles×5 + triples×10 + hr×20 + r×9 + rbi×9 + bb×6 + sb×12
 *   Pitchers: ip×3 + k×4 + er×-3 + w×6 + qs×8
 *
 * Qualifying log filter (EHLP):
 *   Pitchers : ip >= 4
 *   Batters  : pa >= 3 AND (h+hr+r+rbi+bb+sb+doubles+triples) >= 1
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PLAYERS_PATH = join(REPO_ROOT, "baseball/public/data/players.json");
const LOGS_PATH    = join(REPO_ROOT, "baseball/public/data/game-logs.json");

// ── Scoring ────────────────────────────────────────────────────────────────
const BAT_WEIGHTS = { h: 12, doubles: 5, triples: 10, hr: 20, r: 9, rbi: 9, bb: 6, sb: 12 };
const PIT_WEIGHTS = { ip: 3, k: 4, er: -3, w: 6, qs: 8 };

function num(v) { return Number(v ?? 0) || 0; }

function batterFp(s) {
  let fp = 0;
  for (const [k, w] of Object.entries(BAT_WEIGHTS)) fp += num(s[k]) * w;
  return fp;
}
function pitcherFp(s) {
  let fp = 0;
  for (const [k, w] of Object.entries(PIT_WEIGHTS)) fp += num(s[k]) * w;
  return fp;
}

// ── EHLP filters ───────────────────────────────────────────────────────────
function isQualifyingPitcherLog(s) {
  return num(s.ip) >= 4;
}
function isQualifyingBatterLog(s) {
  const pa = num(s.pa);
  const events = num(s.h) + num(s.hr) + num(s.r) + num(s.rbi) +
                 num(s.bb) + num(s.sb) + num(s.doubles) + num(s.triples);
  return pa >= 3 && events >= 1;
}

// ── Tier helpers ───────────────────────────────────────────────────────────
const TIER_ORDER = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];

/**
 * Assign tiers by percentile within a ranked (descending) player array.
 * Top 20% = ORANGE, next 20% = PURPLE, etc. Bottom 20% = WHITE.
 * Players with identical values keep stable order (sort is stable).
 */
function assignTiers(sortedDesc) {
  const n = sortedDesc.length;
  if (n === 0) return;
  // Cut points: index < n*0.2 → ORANGE, < n*0.4 → PURPLE, ...
  for (let i = 0; i < n; i++) {
    const pct = (i + 0.5) / n; // center of bucket
    let tier;
    if      (pct < 0.20) tier = "ORANGE";
    else if (pct < 0.40) tier = "PURPLE";
    else if (pct < 0.60) tier = "BLUE";
    else if (pct < 0.80) tier = "GREEN";
    else                 tier = "WHITE";
    sortedDesc[i]._newTier = tier;
  }
}

function tierAvgFpRange(players, tier) {
  const hits = players.filter(p => p._newTier === tier);
  if (!hits.length) return { count: 0, fpMin: 0, fpMax: 0 };
  const vs = hits.map(p => p._avgFp).sort((a, b) => a - b);
  return { count: hits.length, fpMin: vs[0], fpMax: vs[vs.length - 1] };
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const players = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
  const logs    = JSON.parse(readFileSync(LOGS_PATH, "utf8"));

  // Index logs by basePlayerId for O(1) lookup.
  const logsByPid = new Map();
  for (const log of logs) {
    const key = String(log.basePlayerId ?? log.playerId ?? "").trim();
    if (!key) continue;
    if (!logsByPid.has(key)) logsByPid.set(key, []);
    logsByPid.get(key).push(log);
  }

  // Score every player.
  let skippedZeroSalary = 0;
  const enriched = [];
  for (const p of players) {
    const pid = String(p.basePlayerId ?? p.id ?? "").trim();
    const salary = Number(p.salary ?? 0);
    if (!pid || salary <= 0) { skippedZeroSalary++; continue; }
    const isPitcher = String(p.position ?? "").toUpperCase() === "P";
    const plogs = logsByPid.get(pid) ?? [];
    const qualifying = plogs.filter(l => {
      const s = l.stats ?? {};
      return isPitcher ? isQualifyingPitcherLog(s) : isQualifyingBatterLog(s);
    });
    let avgFp = 0;
    if (qualifying.length > 0) {
      const total = qualifying.reduce((sum, l) => {
        const s = l.stats ?? {};
        return sum + (isPitcher ? pitcherFp(s) : batterFp(s));
      }, 0);
      avgFp = total / qualifying.length;
    }
    const value = avgFp / salary;
    enriched.push({
      _ref: p,
      _pid: pid,
      _salary: salary,
      _isPitcher: isPitcher,
      _avgFp: avgFp,
      _value: value,
      _qualLogs: qualifying.length,
      _prevTier: p.tier ?? null,
    });
  }

  // Rank separately within each pool (desc by raw avgFP).
  const pPool   = enriched.filter(e =>  e._isPitcher).sort((a, b) => b._avgFp - a._avgFp);
  const batPool = enriched.filter(e => !e._isPitcher).sort((a, b) => b._avgFp - a._avgFp);

  assignTiers(pPool);
  assignTiers(batPool);

  // Write back: update tier and avgFP on the original player objects.
  let changedCount = 0;
  for (const e of [...pPool, ...batPool]) {
    if (e._prevTier !== e._newTier) changedCount++;
    e._ref.tier = e._newTier;
    e._ref.avgFP = Math.round(e._avgFp * 10) / 10;
  }

  // Preserve original file ordering.
  writeFileSync(PLAYERS_PATH, JSON.stringify(players, null, 2) + "\n", "utf8");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  Baseball tier re-grade — raw avgFP (salary-agnostic)");
  console.log("════════════════════════════════════════════════════════════════\n");
  console.log("  Input:    " + players.length + " players, " + logs.length + " game logs");
  console.log("  Skipped:  " + skippedZeroSalary + " (zero/missing salary)");
  console.log("  Graded:   " + (pPool.length + batPool.length) + "  (P " + pPool.length + ", BAT " + batPool.length + ")\n");

  function printPool(name, pool) {
    console.log("─── " + name + " pool (" + pool.length + " players) ────────────────────────────");
    const zeroLog = pool.filter(p => p._qualLogs === 0).length;
    console.log("  Players with zero qualifying logs: " + zeroLog);
    const totalAvg = pool.reduce((s, p) => s + p._avgFp, 0) / Math.max(pool.length, 1);
    console.log("  Mean avgFP: " + totalAvg.toFixed(2) + "\n");
    for (const tier of TIER_ORDER) {
      const { count, fpMin, fpMax } = tierAvgFpRange(pool, tier);
      const bar = "#".repeat(Math.round(count / Math.max(pool.length, 1) * 40));
      console.log("    " + tier.padEnd(7) + " " + String(count).padStart(4) + "  " +
                  "avgFP " + fpMin.toFixed(1).padStart(6) + " – " + fpMax.toFixed(1).padStart(6) + "   " + bar);
    }
    console.log("");
  }

  printPool("P",   pPool);
  printPool("BAT", batPool);

  console.log("─── Tier change vs previous ───────────────────────────────────");
  console.log("  " + changedCount + " of " + (pPool.length + batPool.length) +
              " players changed tier  (" +
              (changedCount / Math.max(pPool.length + batPool.length, 1) * 100).toFixed(1) + "%)\n");

  // Transition matrix
  const matrix = {};
  for (const e of [...pPool, ...batPool]) {
    const key = (e._prevTier ?? "(none)") + " → " + e._newTier;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }
  console.log("  Transition counts (prev → new):");
  for (const k of Object.keys(matrix).sort()) {
    const marker = k.split(" → ")[0] === k.split(" → ")[1] ? "  " : "→ ";
    console.log("    " + marker + k.padEnd(24) + " " + matrix[k]);
  }
  console.log("\n  Wrote: " + PLAYERS_PATH);
  console.log("");
}

main();
