#!/usr/bin/env node
/**
 * scripts/simulate.mjs — Universal ReplayMod economy simulator.
 *
 * Usage:
 *   node scripts/simulate.mjs --sport baseball
 *   node scripts/simulate.mjs --sport basketball
 *   node scripts/simulate.mjs --sport baseball --hands 20000
 *   node scripts/simulate.mjs --sport baseball --weights 30,25,15,30
 *
 * What this models that the old simulator didn't:
 *   1. Anchor logic                  — slot 0 always gets an ORANGE-tier player
 *   2. Salary cap + floor            — per-sport, min spend = cap - 6
 *   3. Hold mechanic                 — per-archetype hold rule, then redraw non-held
 *   4. Four player archetypes        — star chaser / middle safe / contrarian / pure random
 *
 * Target economy (global for all sports):
 *   BUST 45%  ROOKIE 25%  STARTER 15%  ALL-STAR 8%  MVP 5%  GOAT/LEGEND 2%
 *
 * Adding a new sport:
 *   - Add a block to SPORT_CONFIGS below.
 *   - Provide: dataDir, rosterSlots, cap, tierThresholds, scoring weights,
 *     badges, a `validateLog(log, slot)` filter, and payout tier thresholds.
 *   - No engine changes required.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ─── Sport configs ───────────────────────────────────────────────────────────
//
// Per-sport block. Scoring / tiers intentionally mirror the user-facing spec
// under test — not the current live config — so the simulator can answer
// "do the proposed numbers hit the target economy?"

const SPORT_CONFIGS = {
  basketball: {
    label: "Basketball (NBA)",
    dataDir: join(REPO_ROOT, "basketball", "public", "data"),

    cap: 200,
    minSpend: 200 - 6,
    rosterSlots: ["PG", "SG", "SF", "PF", "C", "FLEX"],
    positions: ["PG", "SG", "SF", "PF", "C"],
    // FLEX can be any position in basketball
    flexAllows: null,
    // Tier minimums match basketball/src/engines/economyEngine logic +
    // observed salary distribution in public/data/players.json.
    tierThresholds: {
      ORANGE: 72, // $72+  — star anchors
      PURPLE: 55, // $55-71 — mid-star
      BLUE:   37, // $37-54 — solid role
      GREEN:  22, // $22-36 — cheap
      WHITE:   0, // $0-21  — minimum
    },
    positionAliases: { G: "PG", F: "SF" },

    // Live basketballConfig.ts weights (spec did not override).
    scoring: {
      pts: 1.0, reb: 1.2, ast: 1.5, stl: 2.0, blk: 2.0, turnovers: -1.0,
    },
    // Live basketballConfig.ts badges, ported. Stackable.
    badges: [
      { id: "GOD_MODE",  fp: 10, test: s => (s.pts|0) >= 50 },
      { id: "FIRE",      fp: 5,  test: s => (s.pts|0) >= 40 && (s.pts|0) < 50 },
      { id: "BUCKET",    fp: 2,  test: s => (s.pts|0) >= 30 && (s.pts|0) < 40 },
      { id: "BEAST",     fp: 5,  test: s => (s.reb|0) >= 15 },
      { id: "GLASS",     fp: 3,  test: s => (s.reb|0) >= 10 && (s.reb|0) < 15 },
      { id: "WIZARD",    fp: 5,  test: s => (s.ast|0) >= 15 },
      { id: "DIME",      fp: 3,  test: s => (s.ast|0) >= 10 && (s.ast|0) < 15 },
      { id: "THIEF",     fp: 4,  test: s => (s.stl|0) >= 5 },
      { id: "PICKPOCKET",fp: 2,  test: s => (s.stl|0) >= 3 && (s.stl|0) < 5 },
      { id: "SWAT",      fp: 4,  test: s => (s.blk|0) >= 5 },
      { id: "REJECTION", fp: 2,  test: s => (s.blk|0) >= 3 && (s.blk|0) < 5 },
      { id: "MAESTRO",   fp: 8,  test: s => (s.ast|0) >= 10 && (s.turnovers|0) === 0 },
      { id: "PURE",      fp: 3,  test: s => (s.ast|0) >= 5  && (s.turnovers|0) === 0 },
      { id: "SLOPPY",    fp: -3, test: s => (s.turnovers|0) >= 4 && (s.turnovers|0) < 6 },
      { id: "TOV_MACH",  fp: -6, test: s => (s.turnovers|0) >= 6 },
      { id: "QUAD_DBL",  fp: 30, test: s => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => (v|0)>=10).length >= 4 },
      { id: "5X5",       fp: 15, test: s => [s.pts,s.reb,s.ast,s.stl,s.blk].every(v => (v|0)>=5) },
      { id: "TRIPLE_DBL",fp: 8,  test: s => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => (v|0)>=10).length >= 3 },
      { id: "DOUBLE_DBL",fp: 2,  test: s => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => (v|0)>=10).length >= 2 },
    ],

    // A log is usable for any basketball slot if the player actually played.
    // `min` (minutes) is the canonical gate matching historicalLogFilters in-game.
    validateLog(log, _slotReq) {
      const s = log.stats ?? {};
      return (s.min | 0) >= 10;
    },

    // Tuned via scripts/simulate.mjs to hit target economy.
    payoutTiers: [
      { tier: "BUST",     minFp:   0, mult: 0,    source: "tuned" },
      { tier: "ROOKIE",   minFp: 130, mult: 0.5,  source: "tuned" },
      { tier: "STARTER",  minFp: 155, mult: 2.5,  source: "tuned" },
      { tier: "ALL_STAR", minFp: 180, mult: 7.0,  source: "tuned" },
      { tier: "MVP",      minFp: 205, mult: 15.0, source: "tuned" },
      { tier: "GOAT",     minFp: 235, mult: 50.0, source: "tuned" },
    ],
  },

  baseball: {
    sportKey: "baseball",
    label: "Baseball (MLB)",
    dataDir: join(REPO_ROOT, "baseball", "public", "data"),

    cap: 180,
    minSpend: 180 - 6,
    // 2P + 3BAT — no FLEX.
    rosterSlots: ["P", "P", "BAT", "BAT", "BAT"],
    positions: ["P", "BAT"],

    // Fallback tier thresholds (only used when player.tier is missing).
    // Player tiers are authoritative — per-pool avgFP rank from
    // scripts/recalc-tiers.mjs: top 1.5% RED / 5% ORANGE / 12% PURPLE
    // / 25% BLUE / 35% GREEN / rest WHITE.
    tierThresholds: {
      RED:    58,
      ORANGE: 46,
      PURPLE: 39,
      BLUE:   32,
      GREEN:  23,
      WHITE:   0,
    },
    positionAliases: {
      SP: "P", RP: "P", LHP: "P", RHP: "P", PITCHER: "P",
      C: "BAT", "1B": "BAT", "2B": "BAT", "3B": "BAT", SS: "BAT",
      OF: "BAT", LF: "BAT", CF: "BAT", RF: "BAT", DH: "BAT",
    },

    // LOCKED per spec — overrides baseballConfig.ts which currently has
    // H=10, R=8, RBI=8. The simulator is evaluating the proposed numbers.
    scoring: {
      h: 12, doubles: 5, triples: 10, hr: 20,
      r: 9,  rbi: 9,     bb: 6,       sb: 12,
      ip: 3, k: 4,       er: -3,      w: 6, qs: 8,
    },
    // baseballConfig.ts badges — includes display metadata for fire-rate report.
    badges: [
      // Hitter badges
      { id: "HIT_MACHINE",   fp: 3,  type: "hitter",  label: "Hit Machine",    icon: "🎯", cond: "h>=2",         test: s => (s.h   ?? 0) >= 2 },
      { id: "GOING_YARD",    fp: 8,  type: "hitter",  label: "Going Yard",     icon: "⚾", cond: "hr>=1",        test: s => (s.hr  ?? 0) >= 1 },
      { id: "CLEANUP",       fp: 8,  type: "hitter",  label: "Cleanup Hitter", icon: "🧹", cond: "rbi>=3",       test: s => (s.rbi ?? 0) >= 3 },
      { id: "EYE_PLATE",     fp: 5,  type: "hitter",  label: "Eye at Plate",   icon: "👁️", cond: "bb>=2",        test: s => (s.bb  ?? 0) >= 2 },
      { id: "SPEEDSTER",     fp: 4,  type: "hitter",  label: "Speedster",      icon: "💨", cond: "sb>=1",        test: s => (s.sb  ?? 0) >= 1 },
      { id: "PERFECT_DAY",   fp: 15, type: "hitter",  label: "Perfect Day",    icon: "🌞", cond: "h>=2+hr>=1",   test: s => (s.h ?? 0) >= 2 && (s.hr ?? 0) >= 1 && (s.rbi ?? 0) >= 2 },
      { id: "CYCLE_WATCH",   fp: 25, type: "hitter",  label: "Cycle Watch",    icon: "🌀", cond: "h+2b+3b+hr",   test: s => (s.h ?? 0) >= 1 && (s.doubles ?? 0) >= 1 && (s.triples ?? 0) >= 1 && (s.hr ?? 0) >= 1 },
      // Pitcher badges
      { id: "QUALITY_START", fp: 6,  type: "pitcher", label: "Quality Start",  icon: "✅", cond: "ip>=6,er<=3",  test: s => (s.ip ?? 0) >= 6 && (s.er ?? 0) <= 3 },
      { id: "ACE",           fp: 10, type: "pitcher", label: "Ace",            icon: "👑", cond: "k>=10",        test: s => (s.k  ?? 0) >= 10 },
      { id: "SHUTDOWN",      fp: 8,  type: "pitcher", label: "Shutdown",       icon: "🛑", cond: "ip>=7,er=0",   test: s => (s.ip ?? 0) >= 7 && (s.er ?? 0) === 0 },
      { id: "MELTDOWN",      fp: -5, type: "pitcher", label: "Meltdown",       icon: "🌪️", cond: "er>=5",        test: s => (s.er ?? 0) >= 5 },
      { id: "WILD_THING",    fp: -5, type: "pitcher", label: "Wild Thing",     icon: "🎳", cond: "bb>=3",        test: s => (s.bb ?? 0) >= 3 },
      { id: "NO_NO_WATCH",   fp: 30, type: "pitcher", label: "No-No Watch",    icon: "🚫", cond: "ip>=7,h=0",    test: s => (s.ip ?? 0) >= 7 && (s.h ?? 0) === 0 && (s.er ?? 0) === 0 },
    ],

    // EHLP filter (spec): Hitters PA>=3 + >=1 scoring event. Pitchers IP>=4.
    // slotReq distinguishes which scoring channel is valid for this slot.
    validateLog(log, slotReq) {
      const s = log.stats ?? {};
      const pa = s.pa | 0;
      const events = (s.h|0) + (s.hr|0) + (s.r|0) + (s.rbi|0) + (s.bb|0) + (s.sb|0) + (s.doubles|0) + (s.triples|0);
      const isHit = pa >= 3 && events >= 1;
      const isPit = (s.ip | 0) >= 4;
      if (slotReq === "P")   return isPit;
      if (slotReq === "BAT") return isHit;
      return isHit || isPit; // FLEX — either side
    },

    // Tuned at cap $180, salary=avgFP. Even +30 spacing for ROOKIE→MVP,
    // LEGEND ceiling raised +50 from MVP to suppress LEGEND rate to ~2%.
    // 20k-hand random play: 47/21/15/9/6/2 vs target 45/25/15/8/5/2.
    payoutTiers: [
      { tier: "BUST",     minFp:   0, mult: 0,    source: "tuned" },
      { tier: "ROOKIE",   minFp: 170, mult: 0.5,  source: "tuned" },
      { tier: "STARTER",  minFp: 200, mult: 2.5,  source: "tuned" },
      { tier: "ALL_STAR", minFp: 230, mult: 7.0,  source: "tuned" },
      { tier: "MVP",      minFp: 260, mult: 15.0, source: "tuned" },
      { tier: "LEGEND",   minFp: 310, mult: 50.0, source: "tuned" },
    ],
  },
};

// ─── Generic helpers ─────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickRand(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function pct(sortedArr, p) {
  if (!sortedArr.length) return 0;
  return sortedArr[Math.min(Math.floor(sortedArr.length * p / 100), sortedArr.length - 1)];
}
function avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function fmtPct(n) { return (n * 100).toFixed(1).padStart(5) + "%"; }

// ─── Data load ───────────────────────────────────────────────────────────────

function loadSportData(cfg) {
  const playersPath = join(cfg.dataDir, "players.json");
  const logsPath    = join(cfg.dataDir, "game-logs.json");
  if (!existsSync(playersPath)) throw new Error(`Missing ${playersPath}`);
  if (!existsSync(logsPath))    throw new Error(`Missing ${logsPath}`);

  const rawPlayers = JSON.parse(readFileSync(playersPath, "utf8"));
  const rawLogs    = JSON.parse(readFileSync(logsPath, "utf8"));

  const normalizePos = (raw) => {
    const up = String(raw ?? "").trim().toUpperCase();
    if (cfg.positions.includes(up)) return up;
    return cfg.positionAliases[up] ?? cfg.positionAliases[raw] ?? cfg.positions[0];
  };

  // Tier lookup fallback: use baked-in tier first, else derive from salary.
  const tierFromSalary = (salary) => {
    const t = cfg.tierThresholds;
    if (salary >= t.ORANGE) return "ORANGE";
    if (salary >= t.PURPLE) return "PURPLE";
    if (salary >= t.BLUE)   return "BLUE";
    if (salary >= t.GREEN)  return "GREEN";
    return "WHITE";
  };

  // Group logs by basePlayerId.
  const logsByPlayer = new Map();
  for (const log of rawLogs) {
    const key = String(log.basePlayerId ?? log.playerId ?? "").trim();
    if (!key) continue;
    if (!logsByPlayer.has(key)) logsByPlayer.set(key, []);
    logsByPlayer.get(key).push(log);
  }

  // Filter: only players with at least one usable log (for ANY slot).
  // We'll re-filter per-slot at sim time.
  const pool = [];
  for (const p of rawPlayers) {
    const id = String(p.basePlayerId ?? p.id ?? "").trim();
    if (!id) continue;
    const logs = logsByPlayer.get(id) ?? [];
    if (!logs.length) continue;
    const position = normalizePos(p.position ?? "");
    const salary = Number(p.salary ?? 0) | 0;
    if (salary <= 0) continue;
    const tier = String(p.tier ?? tierFromSalary(salary)).toUpperCase();
    pool.push({ id, name: String(p.name ?? id), position, salary, tier, logs });
  }
  return pool;
}

// ─── Archetype definitions ──────────────────────────────────────────────────
//
// Each archetype is a pair of strategies:
//   selectInitial(pool, cfg, rng) → roster[]
//   shouldHold(card, cfg)        → boolean
//
// selectInitial must respect cap and slot requirements. We delegate the
// "fill remaining slots" mechanics to fillRemainingSlots() so each archetype
// only has to decide WHICH player(s) to lock in deliberately.

const ARCHETYPES = {
  "Star Chaser": {
    weightDefault: 30,
    blurb: "Drafts 1-2 ORANGE-tier anchors first. Holds ORANGE+ on redraw.",
    selectInitial(pool, cfg, rng) {
      const roster = new Array(cfg.rosterSlots.length).fill(null);
      const used = new Set();
      let budget = cfg.cap;

      // Pick 1-2 ORANGE anchors into the first compatible non-FLEX slots.
      const wantAnchors = rng() < 0.4 ? 2 : 1;
      let placed = 0;
      for (let slotIdx = 0; slotIdx < cfg.rosterSlots.length && placed < wantAnchors; slotIdx++) {
        const req = cfg.rosterSlots[slotIdx];
        if (req === "FLEX") continue;
        const candidates = pool.filter(p =>
          !used.has(p.id) &&
          p.tier === "ORANGE" &&
          p.salary <= budget - (cfg.rosterSlots.length - placed - 1) * minSalaryInPool(pool) &&
          slotFits(p, req, cfg)
        );
        if (!candidates.length) break;
        // Weighted toward higher salary within ORANGE bracket (matches rosterEngine).
        const pick = weightedPick(candidates, rng);
        roster[slotIdx] = pick;
        used.add(pick.id);
        budget -= pick.salary;
        placed++;
      }
      return fillRemainingSlots(roster, used, budget, pool, cfg, rng);
    },
    shouldHold(card, _cfg) { return card.tier === "ORANGE"; },
  },

  "Middle Safe": {
    weightDefault: 25,
    blurb: "Drafts PURPLE mids for floor consistency. Holds mid-tier on redraw.",
    selectInitial(pool, cfg, rng) {
      const roster = new Array(cfg.rosterSlots.length).fill(null);
      const used = new Set();
      let budget = cfg.cap;

      // Pick 2-3 PURPLE cards deliberately.
      const wantMids = 2 + (rng() < 0.5 ? 1 : 0);
      let placed = 0;
      for (let slotIdx = 0; slotIdx < cfg.rosterSlots.length && placed < wantMids; slotIdx++) {
        const req = cfg.rosterSlots[slotIdx];
        if (req === "FLEX") continue;
        const candidates = pool.filter(p =>
          !used.has(p.id) &&
          p.tier === "PURPLE" &&
          p.salary <= budget - (cfg.rosterSlots.length - placed - 1) * minSalaryInPool(pool) &&
          slotFits(p, req, cfg)
        );
        if (!candidates.length) break;
        const pick = pickRand(candidates, rng);
        roster[slotIdx] = pick;
        used.add(pick.id);
        budget -= pick.salary;
        placed++;
      }
      return fillRemainingSlots(roster, used, budget, pool, cfg, rng);
    },
    shouldHold(card, _cfg) {
      return card.tier === "ORANGE" || card.tier === "PURPLE";
    },
  },

  "Contrarian": {
    weightDefault: 15,
    blurb: "Drafts cheapest/lowest-tier first. Bets on overperformance.",
    selectInitial(pool, cfg, rng) {
      const roster = new Array(cfg.rosterSlots.length).fill(null);
      const used = new Set();
      let budget = cfg.cap;

      // Pick 2-3 cheap (WHITE/GREEN) cards deliberately.
      const wantCheap = 2 + (rng() < 0.5 ? 1 : 0);
      let placed = 0;
      for (let slotIdx = 0; slotIdx < cfg.rosterSlots.length && placed < wantCheap; slotIdx++) {
        const req = cfg.rosterSlots[slotIdx];
        if (req === "FLEX") continue;
        const candidates = pool.filter(p =>
          !used.has(p.id) &&
          (p.tier === "GREEN" || p.tier === "WHITE") &&
          slotFits(p, req, cfg)
        );
        if (!candidates.length) break;
        const pick = pickRand(candidates, rng);
        roster[slotIdx] = pick;
        used.add(pick.id);
        budget -= pick.salary;
        placed++;
      }
      return fillRemainingSlots(roster, used, budget, pool, cfg, rng);
    },
    shouldHold(card, _cfg) {
      return card.tier === "GREEN" || card.tier === "WHITE";
    },
  },

  "Pure Random": {
    weightDefault: 30,
    blurb: "No selection strategy. Holds nothing. Baseline for hold-mechanic gap.",
    selectInitial(pool, cfg, rng) {
      const roster = new Array(cfg.rosterSlots.length).fill(null);
      const used = new Set();
      return fillRemainingSlots(roster, used, cfg.cap, pool, cfg, rng, /*randomMode*/ true);
    },
    shouldHold() { return false; },
  },
};

// ─── Roster mechanics ────────────────────────────────────────────────────────

function slotFits(player, req, cfg) {
  if (req === "FLEX") {
    if (!cfg.flexAllows) return true; // any position
    return cfg.flexAllows.includes(player.position);
  }
  return player.position === req;
}

function minSalaryInPool(pool) {
  let m = Infinity;
  for (const p of pool) if (p.salary < m) m = p.salary;
  return m === Infinity ? 1 : m;
}

function weightedPick(candidates, rng) {
  // Mirrors rosterEngine.pickWeightedRandom — salary^2 weighting.
  const weights = candidates.map(p => p.salary * p.salary);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return candidates[Math.floor(rng() * candidates.length)];
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Fill empty slots in the given roster, respecting cap and slot requirements.
 * Replicates the meaningful parts of rosterEngine.generateRoster:
 *   - Anchor slot (first non-FLEX) gets an ORANGE-tier player if none yet placed.
 *   - Remaining position slots filled by weighted random within per-slot budget.
 *   - FLEX slots filled last from the full pool.
 *   - Final guarantee pass: at least 1 ORANGE OR 2 PURPLE. Min spend = cap - 6.
 *   - Per-sport constraints (e.g. baseball maxPitchers).
 *
 * When randomMode=true, anchor logic is skipped and picks are uniform — this
 * is the Pure Random archetype's "machine fill" path.
 */
function fillRemainingSlots(roster, used, budget, pool, cfg, rng, randomMode = false) {
  const minSal = minSalaryInPool(pool);
  const slots = cfg.rosterSlots;

  const emptyCount = () => roster.filter(c => c === null).length;
  const pitcherCount = () => roster.filter(c => c && c.position === "P").length;

  // Helper: budget ceiling per slot so later slots can still afford min salary.
  const maxForSlot = () => budget - (emptyCount() - 1) * minSal;

  // Pitcher cap constraint for baseball.
  const pitcherAllowed = (player) => {
    if (cfg.maxPitchers == null) return true;
    if (player.position !== "P") return true;
    return pitcherCount() < cfg.maxPitchers;
  };

  // Pass 1: required position slots.
  // Anchor logic: if no ORANGE-tier player is placed yet AND the first empty
  // non-FLEX slot can hold one, slam an ORANGE there before anything else.
  if (!randomMode) {
    const hasOrange = roster.some(c => c && c.tier === "ORANGE");
    if (!hasOrange) {
      const anchorSlot = roster.findIndex((c, i) => c === null && slots[i] !== "FLEX");
      if (anchorSlot >= 0) {
        const req = slots[anchorSlot];
        const cap = maxForSlot();
        const candidates = pool.filter(p =>
          !used.has(p.id) &&
          p.tier === "ORANGE" &&
          p.salary <= cap &&
          slotFits(p, req, cfg) &&
          pitcherAllowed(p)
        );
        if (candidates.length) {
          const pick = weightedPick(candidates, rng);
          roster[anchorSlot] = pick;
          used.add(pick.id);
          budget -= pick.salary;
        }
      }
    }
  }

  // Pass 2: fill remaining non-FLEX slots.
  for (let i = 0; i < slots.length; i++) {
    if (roster[i] !== null) continue;
    if (slots[i] === "FLEX") continue;
    const req = slots[i];
    const cap = maxForSlot();
    let candidates = pool.filter(p =>
      !used.has(p.id) &&
      p.salary <= cap &&
      slotFits(p, req, cfg) &&
      pitcherAllowed(p)
    );
    if (!candidates.length) {
      // Fallback: cheapest available at this position regardless of cap rails.
      candidates = pool.filter(p => !used.has(p.id) && slotFits(p, req, cfg) && pitcherAllowed(p));
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.salary - b.salary);
      const pick = candidates[0];
      roster[i] = pick; used.add(pick.id); budget -= pick.salary;
      continue;
    }
    const pick = randomMode ? pickRand(candidates, rng) : weightedPick(candidates, rng);
    roster[i] = pick;
    used.add(pick.id);
    budget -= pick.salary;
  }

  // Pass 3: FLEX slots (any allowed position).
  for (let i = 0; i < slots.length; i++) {
    if (roster[i] !== null) continue;
    const cap = maxForSlot();
    let candidates = pool.filter(p =>
      !used.has(p.id) &&
      p.salary <= cap &&
      slotFits(p, "FLEX", cfg) &&
      pitcherAllowed(p)
    );
    if (!candidates.length) {
      candidates = pool.filter(p => !used.has(p.id) && slotFits(p, "FLEX", cfg) && pitcherAllowed(p));
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.salary - b.salary);
    }
    const pick = randomMode ? pickRand(candidates, rng) : weightedPick(candidates, rng);
    roster[i] = pick;
    used.add(pick.id);
    budget -= pick.salary;
  }

  // Pass 4: guaranteeTierFloor — at least 1 ORANGE OR 2 PURPLE.
  guaranteeTierFloor(roster, pool, cfg, rng, new Set());

  // Pass 5: min-spend floor. Skipped for random mode (spec: pure random is
  // pure — no nudging the roster toward the cap).
  if (!randomMode) enforceMinSpend(roster, pool, cfg, rng, new Set());

  return roster.filter(Boolean);
}

function guaranteeTierFloor(roster, pool, cfg, rng, heldIdx) {
  const hasOrange = () => roster.some(c => c && c.tier === "ORANGE");
  const countPurple = () => roster.filter(c => c && (c.tier === "ORANGE" || c.tier === "PURPLE")).length;
  if (hasOrange()) return;

  const tryUpgradeTo = (targetTier) => {
    // Swap the lowest-salary non-held card for a player of targetTier if budget allows.
    const swappable = roster
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c && !heldIdx.has(i))
      .sort((a, b) => a.c.salary - b.c.salary);
    const totalNow = roster.reduce((s, c) => s + (c?.salary ?? 0), 0);
    const headroom = cfg.cap - totalNow;
    const used = new Set(roster.filter(Boolean).map(c => c.id));
    for (const { c, i } of swappable) {
      const slotReq = cfg.rosterSlots[i];
      const budget = c.salary + headroom;
      const upgrades = pool.filter(p =>
        !used.has(p.id) &&
        p.tier === targetTier &&
        p.salary <= budget &&
        slotFits(p, slotReq, cfg) &&
        (cfg.maxPitchers == null || p.position !== "P" ||
          roster.filter((r, ri) => ri !== i && r?.position === "P").length < cfg.maxPitchers)
      );
      if (!upgrades.length) continue;
      upgrades.sort((a, b) => b.salary - a.salary);
      const pick = pickRand(upgrades.slice(0, 8), rng);
      roster[i] = pick;
      return true;
    }
    return false;
  };

  if (!tryUpgradeTo("ORANGE")) {
    // Fallback: aim for 2 PURPLE-or-better.
    let guard = 0;
    while (countPurple() < 2 && guard++ < 4) {
      if (!tryUpgradeTo("PURPLE")) break;
    }
  }
}

function enforceMinSpend(roster, pool, cfg, rng, heldIdx) {
  let total = roster.reduce((s, c) => s + (c?.salary ?? 0), 0);
  if (total >= cfg.minSpend) return;
  const swappable = roster
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c && !heldIdx.has(i))
    .sort((a, b) => a.c.salary - b.c.salary);
  const used = new Set(roster.filter(Boolean).map(c => c.id));
  for (const { c, i } of swappable) {
    if (total >= cfg.minSpend) break;
    const gap = Math.min(cfg.minSpend - total, cfg.cap - total);
    if (gap <= 0) break;
    const slotReq = cfg.rosterSlots[i];
    const upgrades = pool.filter(p =>
      !used.has(p.id) &&
      p.salary > c.salary &&
      p.salary <= c.salary + gap &&
      slotFits(p, slotReq, cfg) &&
      (cfg.maxPitchers == null || p.position !== "P" ||
        roster.filter((r, ri) => ri !== i && r?.position === "P").length < cfg.maxPitchers)
    );
    if (!upgrades.length) continue;
    upgrades.sort((a, b) => b.salary - a.salary);
    const pick = upgrades[0];
    total += pick.salary - c.salary;
    used.delete(c.id);
    used.add(pick.id);
    roster[i] = pick;
  }
}

/**
 * Redraw: drop non-held cards, refill them. Respects cap + slot requirements.
 * Same floor-guarantee + min-spend passes as initial deal.
 */
function redrawRoster(current, heldIdxSet, pool, cfg, rng, randomMode) {
  const roster = current.map((c, i) => heldIdxSet.has(i) ? c : null);
  const used = new Set();
  let budget = cfg.cap;
  for (let i = 0; i < roster.length; i++) {
    if (roster[i]) { used.add(roster[i].id); budget -= roster[i].salary; }
  }
  return fillRemainingSlotsAfterHold(roster, used, budget, pool, cfg, rng, heldIdxSet, randomMode);
}

// Variant of fillRemainingSlots that preserves held slot indices (doesn't
// collapse the array) and skips the anchor-redistribution step.
function fillRemainingSlotsAfterHold(roster, used, budget, pool, cfg, rng, heldIdx, randomMode) {
  const minSal = minSalaryInPool(pool);
  const slots = cfg.rosterSlots;
  const emptyCount = () => roster.filter(c => c === null).length;
  const pitcherCount = () => roster.filter(c => c && c.position === "P").length;
  const maxForSlot = () => budget - (emptyCount() - 1) * minSal;
  const pitcherAllowed = (player) =>
    cfg.maxPitchers == null || player.position !== "P" || pitcherCount() < cfg.maxPitchers;

  for (let i = 0; i < slots.length; i++) {
    if (roster[i] !== null) continue;
    if (slots[i] === "FLEX") continue;
    const req = slots[i];
    const cap = maxForSlot();
    let candidates = pool.filter(p =>
      !used.has(p.id) && p.salary <= cap && slotFits(p, req, cfg) && pitcherAllowed(p)
    );
    if (!candidates.length) {
      candidates = pool.filter(p => !used.has(p.id) && slotFits(p, req, cfg) && pitcherAllowed(p));
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.salary - b.salary);
      const pick = candidates[0];
      roster[i] = pick; used.add(pick.id); budget -= pick.salary;
      continue;
    }
    const pick = randomMode ? pickRand(candidates, rng) : weightedPick(candidates, rng);
    roster[i] = pick; used.add(pick.id); budget -= pick.salary;
  }

  for (let i = 0; i < slots.length; i++) {
    if (roster[i] !== null) continue;
    const cap = maxForSlot();
    let candidates = pool.filter(p =>
      !used.has(p.id) && p.salary <= cap && slotFits(p, "FLEX", cfg) && pitcherAllowed(p)
    );
    if (!candidates.length) {
      candidates = pool.filter(p => !used.has(p.id) && slotFits(p, "FLEX", cfg) && pitcherAllowed(p));
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.salary - b.salary);
    }
    const pick = randomMode ? pickRand(candidates, rng) : weightedPick(candidates, rng);
    roster[i] = pick; used.add(pick.id); budget -= pick.salary;
  }

  guaranteeTierFloor(roster, pool, cfg, rng, heldIdx);
  if (!randomMode) enforceMinSpend(roster, pool, cfg, rng, heldIdx);
  return roster;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function fpFromStats(stats, cfg) {
  let fp = 0;
  for (const [k, w] of Object.entries(cfg.scoring)) {
    fp += Number(stats[k] ?? 0) * w;
  }
  for (const b of cfg.badges) {
    try { if (b.test(stats)) fp += b.fp; } catch { /* ignore */ }
  }
  return fp;
}

// Pick a usable log for the given slot. Loops a bounded number of times, then
// falls back to any log for that player. Returns { fp, stats }.
function rollPlayerFp(player, slotReq, cfg, rng) {
  const logs = player.logs;
  if (!logs.length) return { fp: 0, stats: {} };
  // Most logs are usable. Do up to 5 tries with validateLog, else fall back.
  for (let tries = 0; tries < 5; tries++) {
    const log = logs[Math.floor(rng() * logs.length)];
    if (cfg.validateLog(log, slotReq)) {
      const stats = log.stats ?? {};
      return { fp: fpFromStats(stats, cfg), stats };
    }
  }
  // Fallback: first log that validates; if none, score it anyway with zeroes
  // (rare — e.g. every log for a pitcher slotted into BAT will fail).
  const valid = logs.find(l => cfg.validateLog(l, slotReq));
  if (valid) {
    const stats = valid.stats ?? {};
    return { fp: fpFromStats(stats, cfg), stats };
  }
  return { fp: 0, stats: {} };
}

function scoreRoster(roster, cfg, rng) {
  let total = 0;
  const cardResults = [];
  for (let i = 0; i < roster.length; i++) {
    const card = roster[i];
    if (!card) { cardResults.push(null); continue; }
    const slotReq = cfg.rosterSlots[i] ?? "FLEX";
    const { fp, stats } = rollPlayerFp(card, slotReq, cfg, rng);
    total += fp;
    cardResults.push({ stats, slotReq, position: card.position });
  }
  return { total, cardResults };
}

// ─── Simulation ──────────────────────────────────────────────────────────────

function simulateHand(archetypeName, pool, cfg, rng) {
  const arch = ARCHETYPES[archetypeName];
  const randomMode = archetypeName === "Pure Random";

  const initial = arch.selectInitial(pool, cfg, rng);
  // Score initial hand (for reference/unused — we only report final)
  // We don't report pre-hold FP; the player's experience IS the post-hold result.

  // Decide holds based on archetype rule.
  const heldIdx = new Set();
  for (let i = 0; i < initial.length; i++) {
    if (arch.shouldHold(initial[i], cfg)) heldIdx.add(i);
  }

  // Redraw non-held. For Pure Random, redraw is also random with no holds.
  const final = redrawRoster(initial, heldIdx, pool, cfg, rng, randomMode);

  const { total, cardResults } = scoreRoster(final, cfg, rng);
  return { fp: total, cardResults };
}

function classify(fp, tiers) {
  let tier = "BUST";
  for (const t of tiers) if (fp >= t.minFp) tier = t.tier;
  return tier;
}

function runArchetype(archName, pool, cfg, hands, rng) {
  const fps = [];
  const tierCounts = Object.fromEntries(cfg.payoutTiers.map(t => [t.tier, 0]));
  // Badge tracking (populated only when cfg.badges have type metadata).
  const hasBadgeTypes = cfg.badges?.some(b => b.type);
  const badgeCounts = hasBadgeTypes ? Object.fromEntries(cfg.badges.map(b => [b.id, 0])) : null;
  let hitterCards = 0, pitcherCards = 0, totalBadgeFires = 0;

  for (let i = 0; i < hands; i++) {
    const { fp, cardResults } = simulateHand(archName, pool, cfg, rng);
    fps.push(fp);
    tierCounts[classify(fp, cfg.payoutTiers)]++;

    if (badgeCounts && cardResults) {
      for (const c of cardResults) {
        if (!c) continue;
        const isPitcher = c.slotReq === "P" || c.position === "P";
        if (isPitcher) pitcherCards++; else hitterCards++;
        for (const b of cfg.badges) {
          try { if (b.test(c.stats)) { badgeCounts[b.id]++; totalBadgeFires++; } } catch {}
        }
      }
    }
  }
  fps.sort((a, b) => a - b);
  return { fps, tierCounts, badgeCounts, hitterCards, pitcherCards, totalBadgeFires };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

const TARGET_ECONOMY = {
  BUST: 0.45, ROOKIE: 0.25, STARTER: 0.15, ALL_STAR: 0.08, MVP: 0.05, GOAT: 0.02, LEGEND: 0.02,
};
const BUST_TARGET_LOW = 0.40;
const BUST_TARGET_HIGH = 0.50;

function formatArchetypeReport(name, weightPct, blurb, result, cfg, hands) {
  const { fps, tierCounts } = result;
  const lines = [];
  lines.push("");
  lines.push(`─── ${name}  (weight ${weightPct}%) ──────────────────────────────`);
  lines.push(`    ${blurb}`);
  lines.push("");
  lines.push(`    FP percentiles:  p25=${pct(fps,25).toFixed(0)}  p50=${pct(fps,50).toFixed(0)}  p75=${pct(fps,75).toFixed(0)}  p90=${pct(fps,90).toFixed(0)}  p99=${pct(fps,99).toFixed(0)}`);
  lines.push(`    Mean FP: ${avg(fps).toFixed(1)}  min: ${fps[0]?.toFixed(0) ?? 0}  max: ${fps[fps.length-1]?.toFixed(0) ?? 0}`);
  lines.push("");
  lines.push("    Tier breakdown:");
  for (const t of cfg.payoutTiers) {
    const count = tierCounts[t.tier] ?? 0;
    const rate = count / hands;
    const bar = "#".repeat(Math.round(Math.min(rate, 0.5) / 0.5 * 24));
    lines.push(`      ${t.tier.padEnd(10)} >= ${String(t.minFp).padStart(3)} FP   ${fmtPct(rate)}  ${bar}`);
  }
  return lines.join("\n");
}

function blend(results, weights) {
  // Blend tier rates weighted by user archetype distribution.
  const blended = {};
  for (const archName of Object.keys(results)) {
    const w = weights[archName] / 100;
    const { tierCounts } = results[archName];
    const hands = Object.values(tierCounts).reduce((s, v) => s + v, 0);
    for (const [tier, count] of Object.entries(tierCounts)) {
      blended[tier] = (blended[tier] ?? 0) + (count / hands) * w;
    }
  }
  return blended;
}

function formatBlendedReport(blendedRates, cfg) {
  const lines = [];
  lines.push("");
  lines.push("═══ BLENDED RESULT (weighted by archetype %) ═══════════════════");
  lines.push("");
  lines.push(`    ${"TIER".padEnd(10)}  ${"RATE".padStart(7)}  ${"TARGET".padStart(7)}  ${"DELTA".padStart(7)}`);
  for (const t of cfg.payoutTiers) {
    const rate = blendedRates[t.tier] ?? 0;
    const target = TARGET_ECONOMY[t.tier] ?? 0;
    const delta = rate - target;
    const sign = delta >= 0 ? "+" : "";
    const bar = "#".repeat(Math.round(Math.min(rate, 0.5) / 0.5 * 24));
    lines.push(`    ${t.tier.padEnd(10)}  ${fmtPct(rate)}  ${fmtPct(target)}  ${sign}${(delta*100).toFixed(1)}%  ${bar}`);
  }
  const anyWin = 1 - (blendedRates.BUST ?? 0);
  const starterPlus = ["STARTER","ALL_STAR","MVP","GOAT","LEGEND"].reduce((s,k)=>s+(blendedRates[k]??0),0);
  lines.push("");
  lines.push(`    Total bust:     ${fmtPct(blendedRates.BUST ?? 0)}`);
  lines.push(`    Total any-win:  ${fmtPct(anyWin)}`);
  lines.push(`    STARTER+:       ${fmtPct(starterPlus)}`);

  // Bust flag + suggestion.
  const bustRate = blendedRates.BUST ?? 0;
  lines.push("");
  if (bustRate < BUST_TARGET_LOW || bustRate > BUST_TARGET_HIGH) {
    lines.push(`    !!  BUST RATE OUT OF TARGET BAND (${(BUST_TARGET_LOW*100)|0}-${(BUST_TARGET_HIGH*100)|0}%)`);
    const rookieTier = cfg.payoutTiers.find(t => t.tier === "ROOKIE");
    if (rookieTier) {
      if (bustRate > BUST_TARGET_HIGH) {
        const suggest = rookieTier.minFp - Math.ceil((bustRate - BUST_TARGET_HIGH) * 40);
        lines.push(`        Too many busts. Suggest lowering ROOKIE threshold from ${rookieTier.minFp} → ~${suggest} FP`);
      } else {
        const suggest = rookieTier.minFp + Math.ceil((BUST_TARGET_LOW - bustRate) * 40);
        lines.push(`        Too few busts. Suggest raising ROOKIE threshold from ${rookieTier.minFp} → ~${suggest} FP`);
      }
    }
  } else {
    lines.push(`    OK  bust rate inside target ${(BUST_TARGET_LOW*100)|0}-${(BUST_TARGET_HIGH*100)|0}% band`);
  }
  return lines.join("\n");
}

function formatBadgeReport(results, cfg, weights) {
  const hasBadgeTypes = cfg.badges?.some(b => b.type);
  if (!hasBadgeTypes) return "";

  // Aggregate across all archetypes (raw totals, not weighted — fire rate is per-card).
  const totalByBadge = {};
  let totalHitter = 0, totalPitcher = 0, totalBadgeFires = 0, totalHands = 0;
  for (const name of Object.keys(results)) {
    const r = results[name];
    if (!r.badgeCounts) continue;
    for (const [id, count] of Object.entries(r.badgeCounts)) {
      totalByBadge[id] = (totalByBadge[id] ?? 0) + count;
    }
    totalHitter += r.hitterCards;
    totalPitcher += r.pitcherCards;
    totalBadgeFires += r.totalBadgeFires;
    totalHands += r.fps.length;
  }

  const hitterBadges = cfg.badges.filter(b => b.type === "hitter");
  const pitcherBadges = cfg.badges.filter(b => b.type === "pitcher");

  const lines = [];
  lines.push("");
  lines.push(`═══ BADGE FIRE RATES (per card, ${cfg.sportKey ?? "baseball"}) ══════════════════════`);
  lines.push("");
  lines.push(`    HITTERS (per batter card dealt, n=${totalHitter})`);
  for (const b of hitterBadges) {
    const count = totalByBadge[b.id] ?? 0;
    const rate = totalHitter > 0 ? count / totalHitter : 0;
    lines.push(`    ${b.label.padEnd(16)} ${b.icon.padEnd(3)} ${b.cond.padEnd(14)} ${fmtPct(rate)}`);
  }
  lines.push("");
  lines.push(`    PITCHERS (per pitcher card dealt, n=${totalPitcher})`);
  for (const b of pitcherBadges) {
    const count = totalByBadge[b.id] ?? 0;
    const rate = totalPitcher > 0 ? count / totalPitcher : 0;
    lines.push(`    ${b.label.padEnd(16)} ${b.icon.padEnd(3)} ${b.cond.padEnd(14)} ${fmtPct(rate)}`);
  }

  const avgPerHand = totalHands > 0 ? totalBadgeFires / totalHands : 0;
  lines.push("");
  lines.push(`    Avg badges per hand: ${avgPerHand.toFixed(2)}`);

  return lines.join("\n");
}

function formatHoldGap(results) {
  const star = results["Star Chaser"];
  const rnd  = results["Pure Random"];
  if (!star || !rnd) return "";
  const starMedian = pct(star.fps, 50);
  const rndMedian  = pct(rnd.fps, 50);
  const gap = ((starMedian - rndMedian) / rndMedian) * 100;
  const lines = [];
  lines.push("");
  lines.push("═══ HOLD-MECHANIC GAP (archetype 1 vs 4) ═══════════════════════");
  lines.push(`    Star Chaser  median: ${starMedian.toFixed(0)} FP`);
  lines.push(`    Pure Random  median: ${rndMedian.toFixed(0)} FP`);
  lines.push(`    Skill edge:          ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}%  (expected +20-40% in real play)`);
  return lines.join("\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { sport: null, hands: 10000, weights: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sport")   { args.sport = argv[++i]; }
    else if (a === "--hands") { args.hands = parseInt(argv[++i], 10); }
    else if (a === "--weights") { args.weights = argv[++i]; }
    else if (a === "--help" || a === "-h") { args.help = true; }
    else { console.warn(`Unknown arg: ${a}`); }
  }
  return args;
}

function parseWeights(str, archNames) {
  if (!str) return Object.fromEntries(archNames.map(n => [n, ARCHETYPES[n].weightDefault]));
  const parts = str.split(",").map(s => parseFloat(s.trim()));
  if (parts.length !== archNames.length || parts.some(n => !isFinite(n))) {
    throw new Error(`--weights must be ${archNames.length} comma-separated numbers, got: ${str}`);
  }
  const sum = parts.reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 100) > 0.5) {
    console.warn(`[warn] --weights sum to ${sum}, normalizing to 100`);
  }
  const out = {};
  for (let i = 0; i < archNames.length; i++) out[archNames[i]] = parts[i] * 100 / sum;
  return out;
}

function printHelp() {
  console.log(`
ReplayMod universal simulator

Usage:
  node scripts/simulate.mjs --sport <baseball|basketball> [options]

Options:
  --sport <name>        Required. One of: ${Object.keys(SPORT_CONFIGS).join(", ")}
  --hands <n>           Number of hands per archetype (default 10000)
  --weights <a,b,c,d>   Archetype weights % (default 30,25,15,30 for
                        Star Chaser, Middle Safe, Contrarian, Pure Random)
  --help                This message
`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.sport) { printHelp(); process.exit(args.help ? 0 : 1); }

  const cfg = SPORT_CONFIGS[args.sport];
  if (!cfg) {
    console.error(`Unknown sport: ${args.sport}`);
    console.error(`Available: ${Object.keys(SPORT_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  const archNames = Object.keys(ARCHETYPES);
  const weights = parseWeights(args.weights, archNames);
  const hands = args.hands;

  console.log("═".repeat(65));
  console.log(`  ReplayMod Simulator  —  ${cfg.label}`);
  console.log("═".repeat(65));
  console.log(`  Hands per archetype: ${hands}`);
  console.log(`  Cap: $${cfg.cap}   Min spend: $${cfg.minSpend}   Slots: [${cfg.rosterSlots.join(", ")}]`);
  console.log(`  Payout source: ${cfg.payoutTiers[1]?.source ?? "?"}`);
  console.log(`  Archetype weights:`);
  for (const n of archNames) console.log(`    ${n.padEnd(14)} ${weights[n].toFixed(1)}%`);

  const pool = loadSportData(cfg);
  console.log(`  Player pool: ${pool.length}`);
  const byPos = {};
  for (const p of pool) byPos[p.position] = (byPos[p.position] ?? 0) + 1;
  console.log(`  By position: ${Object.entries(byPos).map(([k,v])=>`${k}=${v}`).join("  ")}`);
  const tiers = {};
  for (const p of pool) tiers[p.tier] = (tiers[p.tier] ?? 0) + 1;
  console.log(`  By tier:     ${Object.entries(tiers).map(([k,v])=>`${k}=${v}`).join("  ")}`);

  const rng = mulberry32(42);
  const results = {};
  const start = Date.now();
  for (const name of archNames) {
    process.stdout.write(`  Simulating ${name}... `);
    const t0 = Date.now();
    results[name] = runArchetype(name, pool, cfg, hands, rng);
    console.log(`done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  }
  console.log(`  Total: ${((Date.now()-start)/1000).toFixed(1)}s`);

  for (const name of archNames) {
    console.log(formatArchetypeReport(name, weights[name].toFixed(0), ARCHETYPES[name].blurb, results[name], cfg, hands));
  }

  const blended = blend(results, weights);
  console.log(formatBlendedReport(blended, cfg));
  console.log(formatHoldGap(results));
  console.log(formatBadgeReport(results, cfg, weights));
  console.log("");
}

main().catch(e => { console.error(e); process.exit(1); });
