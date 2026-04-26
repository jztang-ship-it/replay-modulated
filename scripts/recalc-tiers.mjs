#!/usr/bin/env node
/**
 * scripts/recalc-tiers.mjs
 *
 * Recompute baseball player salaries and tiers from raw game logs.
 *
 *   salary = round(avgFP)         where avgFP = mean per-game FP (incl. badges)
 *   tier   = per-pool avgFP rank  (top 1.5% RED, 5% ORANGE, 12% PURPLE,
 *                                  25% BLUE, 35% GREEN, rest WHITE)
 *
 * Pool inclusion floor: MIN_QUAL_LOGS = 10 qualifying games. Anyone below
 * that is dropped from the pool entirely.
 *
 * Two-way handling: a player with ≥10 P-qual logs AND ≥10 BAT-qual logs
 * gets two entries (id `{pid}-B` and `{pid}-P`) sharing the same
 * `personKey` so the draw layer can enforce mutex. Right now only Ohtani
 * has ≥10 BAT logs; his 6 pitching starts fall under the floor and the
 * P-variant is correctly suppressed. The splitter is intentionally
 * general so future seasons re-include him without code changes.
 *
 * FP weights (locked spec):
 *   Batters : h×12 + 2B×5 + 3B×10 + HR×20 + R×9 + RBI×9 + BB×6 + SB×12
 *   Pitchers: IP×3 + K×4 + ER×-3 + W×6 + QS×8
 *
 * Badges (locked spec, included in avgFP since they're part of realized FP):
 *   Hitters : HIT_MACHINE +3, GOING_YARD +8, CLEANUP +8, EYE_PLATE +5,
 *             SPEEDSTER +4, PERFECT_DAY +15, CYCLE_WATCH +25
 *   Pitchers: QUALITY_START +6, ACE +10, SHUTDOWN +8, MELTDOWN -5,
 *             WILD_THING -5, NO_NO_WATCH +30
 *
 * Qualifying log filter (EHLP):
 *   Pitchers : ip ≥ 4
 *   Batters  : pa ≥ 3 AND (h+hr+r+rbi+bb+sb+2b+3b) ≥ 1
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PLAYERS_PATH = join(REPO_ROOT, "baseball/public/data/players.json");
const LOGS_PATH    = join(REPO_ROOT, "baseball/public/data/game-logs.json");

const MIN_QUAL_LOGS = 10;

// ── Scoring (must match baseballConfig.ts + scripts/simulate.mjs) ──────────
const BAT_W = { h: 12, doubles: 5, triples: 10, hr: 20, r: 9, rbi: 9, bb: 6, sb: 12 };
const PIT_W = { ip: 3, k: 4, er: -3, w: 6, qs: 8 };

const HITTER_BADGES = [
  { fp:  3, test: s => (s.h   |0) >= 2 },                                                                   // HIT_MACHINE
  { fp:  8, test: s => (s.hr  |0) >= 1 },                                                                   // GOING_YARD
  { fp:  8, test: s => (s.rbi |0) >= 3 },                                                                   // CLEANUP
  { fp:  5, test: s => (s.bb  |0) >= 2 },                                                                   // EYE_PLATE
  { fp:  4, test: s => (s.sb  |0) >= 1 },                                                                   // SPEEDSTER
  { fp: 15, test: s => (s.h   |0) >= 2 && (s.hr |0) >= 1 && (s.rbi |0) >= 2 },                              // PERFECT_DAY
  { fp: 25, test: s => (s.h   |0) >= 1 && (s.doubles |0) >= 1 && (s.triples |0) >= 1 && (s.hr |0) >= 1 },   // CYCLE_WATCH
];

const PITCHER_BADGES = [
  { fp:  6, test: s => (s.ip |0) >= 6 && (s.er |0) <= 3 },                          // QUALITY_START
  { fp: 10, test: s => (s.k  |0) >= 10 },                                           // ACE
  { fp:  8, test: s => (s.ip |0) >= 7 && (s.er |0) === 0 },                         // SHUTDOWN
  { fp: -5, test: s => (s.er |0) >= 5 },                                            // MELTDOWN
  { fp: -5, test: s => (s.bb |0) >= 3 },                                            // WILD_THING
  { fp: 30, test: s => (s.ip |0) >= 7 && (s.h |0) === 0 && (s.er |0) === 0 },       // NO_NO_WATCH
];

const num = v => Number(v ?? 0) || 0;

function batterFp(s) {
  let fp = 0;
  for (const [k, w] of Object.entries(BAT_W)) fp += num(s[k]) * w;
  for (const b of HITTER_BADGES) if (b.test(s)) fp += b.fp;
  return fp;
}
function pitcherFp(s) {
  let fp = 0;
  for (const [k, w] of Object.entries(PIT_W)) fp += num(s[k]) * w;
  for (const b of PITCHER_BADGES) if (b.test(s)) fp += b.fp;
  return fp;
}

// ── EHLP filters ───────────────────────────────────────────────────────────
function isQualifyingPitcherLog(s) { return num(s.ip) >= 4; }
function isQualifyingBatterLog(s) {
  const pa = num(s.pa);
  const ev = num(s.h) + num(s.hr) + num(s.r) + num(s.rbi) + num(s.bb) + num(s.sb) + num(s.doubles) + num(s.triples);
  return pa >= 3 && ev >= 1;
}

// ── Per-pool tier rank (top X% of pool by avgFP) ───────────────────────────
const TIERS = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];
const TIER_PCTS = [1.5, 5, 12, 25, 35]; // cumulative slot widths; remainder → WHITE

function assignPoolTiers(pool) {
  const sorted = [...pool].sort((a, b) => b._avgFp - a._avgFp);
  const n = sorted.length;
  const widths = TIER_PCTS.map(p => Math.round(n * p / 100));
  let cursor = 0;
  for (let t = 0; t < TIERS.length; t++) {
    const end = t < widths.length ? Math.min(cursor + widths[t], n) : n;
    for (let i = cursor; i < end; i++) sorted[i]._newTier = TIERS[t];
    cursor = end;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const players = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
  const logs    = JSON.parse(readFileSync(LOGS_PATH, "utf8"));

  // Index logs by basePlayerId.
  const logsByPid = new Map();
  for (const l of logs) {
    const key = String(l.basePlayerId ?? l.playerId ?? "").trim();
    if (!key) continue;
    if (!logsByPid.has(key)) logsByPid.set(key, []);
    logsByPid.get(key).push(l);
  }

  // Build new pool. For each source player, emit zero, one, or two entries
  // depending on which qualifying-log floors they pass.
  const newPool = [];
  let dropped = 0;
  let twoWayCount = 0;

  for (const src of players) {
    const pid = String(src.basePlayerId ?? src.id ?? "").trim();
    if (!pid) continue;
    const all = logsByPid.get(pid) ?? [];
    const pLogs = all.filter(l => isQualifyingPitcherLog(l.stats ?? {}));
    const bLogs = all.filter(l => isQualifyingBatterLog(l.stats ?? {}));
    const declaredP = String(src.position ?? "").toUpperCase() === "P";

    // Possible variants: "P" if pLogs ≥ floor, "B" if bLogs ≥ floor.
    const variants = [];
    if (pLogs.length >= MIN_QUAL_LOGS) variants.push("P");
    if (bLogs.length >= MIN_QUAL_LOGS) variants.push("B");

    if (variants.length === 0) { dropped++; continue; }

    // Single-variant players keep their original id.
    // Two-way (both ≥ floor) get suffixed ids; share personKey.
    const isTwoWay = variants.length === 2;
    if (isTwoWay) twoWayCount++;

    for (const v of variants) {
      const isP = v === "P";
      const variantLogs = isP ? pLogs : bLogs;
      const fps = variantLogs.map(l => isP ? pitcherFp(l.stats ?? {}) : batterFp(l.stats ?? {}));
      const avgFp = fps.reduce((a, b) => a + b, 0) / fps.length;

      // Preserve declared position for the dominant variant; flip for the other.
      // For Ohtani (declared BAT) two-way: B keeps "BAT", P becomes "P".
      // For a hypothetical declared-P two-way: P keeps "P", B becomes "BAT".
      let position;
      if (isTwoWay) {
        position = isP ? "P" : "BAT";
      } else {
        // Single variant: use the variant's natural position regardless of declaration.
        position = isP ? "P" : "BAT";
      }

      const entryId = isTwoWay ? `${pid}-${v}` : pid;
      newPool.push({
        _src: src,
        _pid: pid,
        _entryId: entryId,
        _isP: isP,
        _isTwoWay: isTwoWay,
        _qualLogs: variantLogs.length,
        _avgFp: avgFp,
        _prevTier: src.tier ?? null,
        _prevSalary: Number(src.salary ?? 0),
        _position: position,
        _personKey: pid,
      });
    }
  }

  // Per-pool tier ranks.
  const pPool   = newPool.filter(e =>  e._isP);
  const batPool = newPool.filter(e => !e._isP);
  assignPoolTiers(pPool);
  assignPoolTiers(batPool);

  // Build the new players.json shape.
  const out = newPool.map(e => {
    const src = e._src;
    return {
      id: e._entryId,
      basePlayerId: e._pid,
      personKey: e._personKey,
      season: src.season ?? "2425",
      name: src.name,
      team: src.team,
      position: e._position,
      salary: Math.max(1, Math.round(e._avgFp)),
      tier: e._newTier,
      avgFP: Math.round(e._avgFp * 10) / 10,
      photoCode: src.photoCode ?? e._pid,
    };
  });

  writeFileSync(PLAYERS_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  console.log("  Baseball recalc — salary = round(avgFP), per-pool tier rank");
  console.log("═".repeat(72));
  console.log("  Source players: " + players.length);
  console.log("  Pool floor:     " + MIN_QUAL_LOGS + " qualifying logs");
  console.log("  Dropped:        " + dropped + " (below floor)");
  console.log("  Two-way splits: " + twoWayCount + " players → " + (twoWayCount * 2) + " entries");
  console.log("  Final pool:     " + out.length + "  (P " + pPool.length + ", BAT " + batPool.length + ")");
  console.log("");

  function printPool(label, pool) {
    console.log("  ─── " + label + " (" + pool.length + ") " + "─".repeat(50 - label.length));
    for (const t of TIERS) {
      const hits = pool.filter(p => p._newTier === t);
      if (!hits.length) { console.log("    " + t.padEnd(7) + " 0"); continue; }
      const fps = hits.map(p => p._avgFp).sort((a, b) => a - b);
      const sals = hits.map(p => Math.round(p._avgFp));
      const bar = "#".repeat(Math.round(hits.length / pool.length * 30));
      console.log("    " + t.padEnd(7) + String(hits.length).padStart(4) +
        "  avgFP " + fps[0].toFixed(1).padStart(5) + "–" + fps[fps.length-1].toFixed(1).padStart(5) +
        "  $" + Math.min(...sals) + "–$" + Math.max(...sals) + "   " + bar);
    }
    console.log("");
  }
  printPool("PITCHERS", pPool);
  printPool("BATTERS",  batPool);

  // Two-way report.
  const twoWay = newPool.filter(e => e._isTwoWay);
  if (twoWay.length) {
    console.log("  Two-way entries:");
    for (const e of twoWay) {
      console.log("    " + e._entryId.padEnd(14) + " " + e._position.padEnd(4) + " $" + Math.round(e._avgFp) + " " + e._newTier + "  avgFP=" + e._avgFp.toFixed(1) + "  (" + e._qualLogs + " logs)");
    }
    console.log("");
  }

  // Tier change vs previous.
  let changed = 0;
  for (const e of newPool) {
    if (!e._isTwoWay && e._prevTier && e._prevTier !== e._newTier) changed++;
  }
  console.log("  Wrote: " + PLAYERS_PATH);
  console.log("");
}

main();
