/// <reference types="node" />
/**
 * runSimulator.ts — Basketball Economy Simulator
 *
 * Two modes:
 *   --random   Pure random selection + uniform log sampling (theoretical baseline)
 *   --engine   Models actual rosterEngine: ORANGE anchor, salary² weighting,
 *              biased log sampling, $194 salary floor (default)
 *
 * Usage (from ~/ReplayMod/basketball/):
 *   npx ts-node --project tsconfig.sim.json src/tools/runSimulator.ts 5000
 *   npx ts-node --project tsconfig.sim.json src/tools/runSimulator.ts 5000 --random
 *   npx ts-node --project tsconfig.sim.json src/tools/runSimulator.ts 10000 --verbose
 */

import * as path from "path";
import * as fs from "fs";

// ── FP formula — must match resolveEngine exactly ─────────────────────────
function computeFp(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  return (
    g("pts") * 1.0 +
    g("reb") * 1.2 +
    g("ast") * 1.5 +
    g("stl") * 2.0 +
    g("blk") * 2.0 +
    g("turnovers") * -1.0
  );
}

// ── Badge bonus — mirrors basketballConfig.ts badges exactly ─────────────
function computeBadgeBonus(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  const pts = g("pts"), reb = g("reb"), ast = g("ast");
  const stl = g("stl"), blk = g("blk"), to = g("turnovers");
  let bonus = 0;
  if (pts >= 50) bonus += 10;
  else if (pts >= 40) bonus += 5;
  else if (pts >= 30) bonus += 2;
  if (reb >= 15) bonus += 5;
  else if (reb >= 10) bonus += 3;
  if (ast >= 15) bonus += 5;
  else if (ast >= 10) bonus += 3;
  if (stl >= 5) bonus += 4;
  else if (stl >= 3) bonus += 2;
  if (blk >= 5) bonus += 4;
  else if (blk >= 3) bonus += 2;
  if (ast >= 10 && to === 0) bonus += 8;
  else if (ast >= 5 && to === 0) bonus += 3;
  if (to >= 6) bonus -= 6;
  else if (to >= 4) bonus -= 3;
  const cats = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
  if (cats >= 4) bonus += 30;
  else if (cats >= 3) bonus += 8;
  else if (cats >= 2) bonus += 2;
  if ([pts,reb,ast,stl,blk].every(v => v >= 5)) bonus += 15;
  return bonus;
}

// ── Percentile ────────────────────────────────────────────────────────────
function pct(sorted: number[], p: number): number {
  const i = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
  return sorted[i];
}

// ── Simple seeded RNG ─────────────────────────────────────────────────────
function makeRng(seed = 12345) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Uniform log sampling — mirrors resolveEngine.pickBiasedLog ───────────
// Card tier no longer constrains the log window. The tier/isProtected/top80
// params are retained to keep the existing CLI flag plumbing compatible, but
// they're no-ops after the production sampler shift. --protected and --top80
// flags are kept callable so existing scripts don't break; they no longer
// alter behavior. Remove together with the resolveEngine sampler change
// rationale in a follow-up cleanup.
function pickBiasedLog(logs: any[], _tier: string, rnd: () => number, minMinutes = 10, _isProtected = false, _top80 = false): any {
  // Filter out garbage: must have positive stats and meet minute threshold
  const filtered = logs.filter(l => {
    const stats = l.stats ?? l;
    const hasPositive = Object.values(stats).some(v => typeof v === "number" && (v as number) > 0);
    if (!hasPositive) return false;
    const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN;
    if (mp !== undefined && mp !== null) {
      const mins = String(mp).includes(":") ? parseFloat(String(mp).split(":")[0]) : parseFloat(String(mp));
      if (Number.isFinite(mins) && mins < minMinutes) return false;
    }
    return true;
  });
  if (!filtered.length) return logs[Math.floor(rnd() * logs.length)];
  return filtered[Math.floor(rnd() * filtered.length)];
}

// ── Weighted random by salary² ────────────────────────────────────────────
function pickWeighted(pool: any[], rnd: () => number): any {
  const weights = pool.map(p => Math.pow(Number(p.salary ?? 1), 2));
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = rnd() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const N             = parseInt(process.argv[2] ?? "1000", 10);
  const verbose       = process.argv.includes("--verbose");
  const randomMode    = process.argv.includes("--random");
  const protectedMode = process.argv.includes("--protected");  // mirrors hands 2-30 (top 60% all tiers)
  const top80Mode     = process.argv.includes("--top80");       // no protection, but nobody gets bottom 20% of logs

  const modeName = randomMode ? "RANDOM (baseline)" : protectedMode ? "ENGINE + PROTECTED (hands 2-30)" : top80Mode ? "ENGINE + TOP-80% FLOOR (no protection period)" : "ENGINE (regular play, no protection)";
  console.log(`🏀 ReplayMod Basketball Economy Simulator — ${modeName}`);
  console.log(`Running ${N.toLocaleString()} simulated hands...\n`);

  // Find data directory
  const bases = [
    path.join(process.cwd(), "public", "data"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "src", "data"),
  ];

  let playersFile = "", logsFile = "";
  for (const base of bases) {
    for (const pf of ["players.json", "players.raw.json"]) {
      if (fs.existsSync(path.join(base, pf))) { playersFile = path.join(base, pf); break; }
    }
    for (const lf of ["game-logs.json", "game-logs.raw.json"]) {
      if (fs.existsSync(path.join(base, lf))) { logsFile = path.join(base, lf); break; }
    }
    if (playersFile && logsFile) break;
  }

  if (!playersFile || !logsFile) {
    console.error("❌ Could not find data files. Tried:");
    bases.forEach(b => console.error("   " + b));
    process.exit(1);
  }

  console.log(`📂 Players: ${playersFile}`);
  console.log(`📂 Logs:    ${logsFile}\n`);

  const players: any[] = JSON.parse(fs.readFileSync(playersFile, "utf8"));
  const rawLogs: any[] = JSON.parse(fs.readFileSync(logsFile, "utf8"));
  console.log(`Loaded ${players.length.toLocaleString()} players, ${rawLogs.length.toLocaleString()} game logs`);

  // Season under simulation. Overridable via SIMULATE_SEASON env var
  // (e.g. SIMULATE_SEASON=2324) so calibration jobs can iterate seasons.
  // Default 2425 preserves the legacy behavior for unflagged invocations.
  const SEASON = process.env.SIMULATE_SEASON ?? "2425";

  // Build log map: basePlayerId → logs[] for the target season
  const logMap = new Map<string, any[]>();
  const logMapSeason = new Map<string, any[]>();
  for (const log of rawLogs) {
    const key = String(log.basePlayerId ?? "");
    if (!key || key === "0") continue;
    if (!logMap.has(key)) logMap.set(key, []);
    logMap.get(key)!.push(log);
    const season = String(log.season ?? log.seasonId ?? "");
    if (season === SEASON) {
      if (!logMapSeason.has(key)) logMapSeason.set(key, []);
      logMapSeason.get(key)!.push(log);
    }
  }
  console.log(`Built log map: ${logMap.size.toLocaleString()} unique players with logs (season=${SEASON})`);

  // ── Player pool: only target-season players with salary ─────────────────
  const seasonSuffix = `_${SEASON}`;
  const playablePool = players.filter(p => {
    const key = String(p.basePlayerId ?? "");
    const hasSalary = (p.salary ?? 0) > 0;
    const hasSeason = String(p.id ?? "").includes(seasonSuffix);
    const hasLogs = (logMapSeason.get(key)?.length ?? logMap.get(key)?.length ?? 0) > 0;
    return hasSalary && hasSeason && hasLogs;
  });
  console.log(`Playable pool: ${playablePool.length.toLocaleString()} players (season ${SEASON}, have salary + logs)`);

  if (playablePool.length < 6) {
    console.error("❌ Not enough playable players. Check your data.");
    process.exit(1);
  }

  // Premium anchor pool = RED + ORANGE (treated interchangeably — RED is a visual tier).
  const redPool    = playablePool.filter(p => Number(p.salary) >= 73);
  const orangePool = playablePool.filter(p => Number(p.salary) >= 58);  // includes RED
  const purplePool = playablePool.filter(p => Number(p.salary) >= 44 && Number(p.salary) < 58);
  const otherPool  = playablePool.filter(p => Number(p.salary) < 44);
  console.log(`  RED ($73+): ${redPool.length}  ORANGE ($58-72): ${orangePool.length - redPool.length}  PURPLE ($44-57): ${purplePool.length}  Other: ${otherPool.length}\n`);

  const rnd     = makeRng(42);
  const CAP_MAX = 250;   // matches sportAdapter.salaryCap (basketballConfig.salaryCap)
  const MIN_SPEND = CAP_MAX - 6;  // guaranteeTierFloor ensures salary >= cap - 6
  const ROSTER_SIZE = 6;
  const MIN_SALARY = 5;
  const allFps: number[] = [];
  const allSalaries: number[] = [];
  let   totalBadgeBonus = 0;
  let   skippedHands    = 0;

  const start = Date.now();

  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 2000 === 0) process.stdout.write(`  ${i.toLocaleString()}/${N.toLocaleString()}...\n`);

    let lineup: any[] = [];
    let lineupSalary = 0;
    let built = false;

    if (randomMode) {
      // ── RANDOM MODE: pure random selection ────────────────────────────
      let buildAttempts = 0;
      while (buildAttempts < 300) {
        buildAttempts++;
        lineup = [];
        lineupSalary = 0;
        const used = new Set<string>();
        let pickAttempts = 0;
        while (lineup.length < ROSTER_SIZE && pickAttempts < 500) {
          pickAttempts++;
          const p = playablePool[Math.floor(rnd() * playablePool.length)];
          const key = String(p.basePlayerId ?? "");
          if (used.has(key)) continue;
          const sal = Number(p.salary ?? 0);
          const slotsLeft = ROSTER_SIZE - lineup.length;
          if (lineupSalary + sal + (slotsLeft - 1) * MIN_SALARY > CAP_MAX) continue;
          used.add(key);
          lineup.push(p);
          lineupSalary += sal;
        }
        if (lineup.length === ROSTER_SIZE && lineupSalary <= CAP_MAX) { built = true; break; }
      }
    } else {
      // ── ENGINE MODE: models actual rosterEngine behavior ──────────────
      const maxAnchor = CAP_MAX - (ROSTER_SIZE - 1) * MIN_SALARY;
      const anchorCandidates = orangePool.filter(p => Number(p.salary) <= maxAnchor);
      if (!anchorCandidates.length) { skippedHands++; continue; }

      // Retry up to 100 times to build a valid roster
      for (let retry = 0; retry < 100 && !built; retry++) {
        lineup = [];
        lineupSalary = 0;
        const used = new Set<string>();

        // 1. Pick ORANGE anchor (salary² weighted)
        const anchor = pickWeighted(anchorCandidates, rnd);
        used.add(String(anchor.basePlayerId ?? ""));
        lineup.push(anchor);
        lineupSalary = Number(anchor.salary);

        // 2. Fill remaining slots — salary²-weighted, fall back to cheapest on budget crunch
        let stuckCount = 0;
        while (lineup.length < ROSTER_SIZE && stuckCount < 20) {
          const slotsLeft = ROSTER_SIZE - lineup.length;
          const maxForSlot = CAP_MAX - lineupSalary - (slotsLeft - 1) * MIN_SALARY;
          const candidates = playablePool.filter(p =>
            !used.has(String(p.basePlayerId ?? "")) && Number(p.salary) <= maxForSlot
          );
          if (!candidates.length) { stuckCount++; break; }
          const picked = pickWeighted(candidates, rnd);
          used.add(String(picked.basePlayerId ?? ""));
          lineup.push(picked);
          lineupSalary += Number(picked.salary);
        }

        if (lineup.length < ROSTER_SIZE) continue; // retry

        // 3. Enforce $194 salary floor: upgrade cheapest swappable player
        for (let s = 0; s < 50 && lineupSalary < MIN_SPEND; s++) {
          const gap = CAP_MAX - lineupSalary;
          const swappable = lineup
            .map((p, idx) => ({ p, idx }))
            .sort((a, b) => Number(a.p.salary) - Number(b.p.salary));
          let upgraded = false;
          for (const { p: cur, idx } of swappable) {
            const upgrades = playablePool.filter(u =>
              !used.has(String(u.basePlayerId ?? "")) &&
              Number(u.salary) > Number(cur.salary) &&
              Number(u.salary) <= Number(cur.salary) + gap
            ).sort((a, b) => Number(b.salary) - Number(a.salary));
            if (!upgrades.length) continue;
            used.delete(String(cur.basePlayerId ?? ""));
            const upg = pickWeighted(upgrades.slice(0, 5), rnd);
            used.add(String(upg.basePlayerId ?? ""));
            lineupSalary += Number(upg.salary) - Number(cur.salary);
            lineup[idx] = upg;
            upgraded = true;
            break;
          }
          if (!upgraded) break;
        }

        built = true;
      }
    }

    if (!built) {
      skippedHands++;
      if (skippedHands <= 5) console.warn(`  ⚠ Could not build valid lineup (hand ${i + 1})`);
      continue;
    }

    // Score the hand
    let handFp = 0;
    for (const player of lineup) {
      const key  = String(player.basePlayerId ?? "");
      // Derive tier from salary — must match gameAdapter.toPlayerEval (not stale JSON tier field)
      const sal = Number(player.salary ?? 0);
      const tier = sal >= 73 ? "RED" : sal >= 58 ? "ORANGE" : sal >= 44 ? "PURPLE" : sal >= 30 ? "BLUE" : sal >= 23 ? "GREEN" : "WHITE";
      const allLogs = logMapSeason.get(key) ?? logMap.get(key) ?? [];
      if (!allLogs.length) continue;

      let log: any;
      if (randomMode) {
        log = allLogs[Math.floor(rnd() * allLogs.length)];
      } else {
        log = pickBiasedLog(allLogs, tier, rnd, 10, protectedMode, top80Mode);
      }

      const stats = log.stats ?? log;
      const fp    = computeFp(stats);
      const bonus = computeBadgeBonus(stats);
      handFp += fp + bonus;
      totalBadgeBonus += bonus;
    }

    allFps.push(handFp);
    allSalaries.push(lineupSalary);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  allFps.sort((a, b) => a - b);
  allSalaries.sort((a, b) => a - b);

  // Optional FP-array dump for calibration. Sets DUMP_FPS=<filename> to
  // write the full sorted FP array as JSON for downstream threshold derivation.
  const dumpFps = process.env.DUMP_FPS;
  if (dumpFps) {
    fs.writeFileSync(dumpFps, JSON.stringify(allFps));
    console.log(`Dumped ${allFps.length} sorted FPs → ${dumpFps}`);
  }

  const handsBuilt = allFps.length;
  const avg    = allFps.reduce((s, v) => s + v, 0) / handsBuilt;
  const avgBadge = totalBadgeBonus / handsBuilt;
  const avgSalary = allSalaries.reduce((s, v) => s + v, 0) / handsBuilt;

  console.log(`\n✅ Completed in ${elapsed}s`);
  if (skippedHands > 0) console.log(`⚠ Skipped ${skippedHands.toLocaleString()} hands`);

  console.log("\n=== SALARY STATS (per hand) ===");
  console.log(`  Hands built:  ${handsBuilt.toLocaleString()} / ${N.toLocaleString()}`);
  console.log(`  Avg salary:   $${avgSalary.toFixed(1)} / $${CAP_MAX}`);
  console.log(`  Min:          $${allSalaries[0]}`);
  console.log(`  Max:          $${allSalaries[allSalaries.length - 1]}`);
  console.log(`  Cap violations: ${allSalaries.filter(s => s > CAP_MAX).length} (must be 0)`);

  console.log("\n=== FP DISTRIBUTION (Team FP per hand) ===");
  console.log(`  Hands:   ${handsBuilt.toLocaleString()}`);
  console.log(`  Min:     ${allFps[0].toFixed(1)}`);
  console.log(`  P10:     ${pct(allFps, 10).toFixed(1)}`);
  console.log(`  P25:     ${pct(allFps, 25).toFixed(1)}`);
  console.log(`  Median:  ${pct(allFps, 50).toFixed(1)}`);
  console.log(`  Avg:     ${avg.toFixed(1)}`);
  console.log(`  P75:     ${pct(allFps, 75).toFixed(1)}`);
  console.log(`  P90:     ${pct(allFps, 90).toFixed(1)}`);
  console.log(`  P95:     ${pct(allFps, 95).toFixed(1)}`);
  console.log(`  P99:     ${pct(allFps, 99).toFixed(1)}`);
  console.log(`  Max:     ${allFps[allFps.length - 1].toFixed(1)}`);
  console.log(`  Avg badge bonus/hand: ${avgBadge.toFixed(2)}`);

  // ── Current threshold check ──────────────────────────────────────────
  const CURRENT = [
    { name: "ROOKIE",   minFp: 190, payout: "0.5x" },
    { name: "STARTER",  minFp: 205, payout: "1.5x" },
    { name: "ALL_STAR", minFp: 225, payout: "3x"   },
    { name: "MVP",      minFp: 235, payout: "8x"   },
    { name: "LEGEND",   minFp: 255, payout: "50x"  },
  ];
  console.log("\n=== CURRENT THRESHOLDS — HIT RATES ===");
  const bustRate = allFps.filter(f => f < CURRENT[0].minFp).length / handsBuilt * 100;
  const bustFlag = bustRate > 65 ? "⚠️  TOO PUNISHING"
                 : bustRate < 30 ? "⚠️  TOO GENEROUS"
                 : "✅ OK";
  console.log(`  BUST       <${String(CURRENT[0].minFp).padStart(4)} FP  (0x)     hit: ${bustRate.toFixed(1).padStart(5)}%  ${bustFlag}`);
  for (const tier of CURRENT) {
    const nextIdx = CURRENT.indexOf(tier) + 1;
    const nextMin = nextIdx < CURRENT.length ? CURRENT[nextIdx].minFp : Infinity;
    const inTier = allFps.filter(f => f >= tier.minFp && f < nextMin).length / handsBuilt * 100;
    const cumRate = allFps.filter(f => f >= tier.minFp).length / handsBuilt * 100;
    const flag = cumRate > 85 ? "⚠️  WAY TOO EASY" : cumRate > 65 ? "⚠️  TOO EASY" : cumRate < 0.2 ? "❌ NEARLY IMPOSSIBLE" : "✅ OK";
    console.log(`  ${tier.name.padEnd(10)} ≥${String(tier.minFp).padStart(4)} FP  (${tier.payout.padEnd(5)})  in tier: ${inTier.toFixed(1).padStart(5)}%  (cum: ${cumRate.toFixed(1).padStart(5)}%)  ${flag}`);
  }

  // ── Suggested thresholds for target distribution ──────────────────────
  // Target: BUST ~48%, ROOKIE ~25%, STARTER ~21%, ALL_STAR ~4%, MVP ~2%, LEGEND ~0.5%
  const targets = [
    { name: "ROOKIE",   cumPct: 52,  payout: "0.5x" },
    { name: "STARTER",  cumPct: 27,  payout: "1.5x" },
    { name: "ALL_STAR", cumPct: 6,   payout: "3x"   },
    { name: "MVP",      cumPct: 2.5, payout: "8x"   },
    { name: "LEGEND",   cumPct: 0.5, payout: "50x"  },
  ];

  console.log("\n=== SUGGESTED THRESHOLDS (target: BUST~45%, WIN~55%) ===");
  const suggested: Record<string, number> = {};
  for (const t of targets) {
    suggested[t.name] = Math.round(pct(allFps, 100 - t.cumPct));
  }
  const tierOrder = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const suggBust = allFps.filter(f => f < suggested["ROOKIE"]).length / handsBuilt * 100;
  console.log(`  BUST       <${String(suggested["ROOKIE"]).padStart(4)} FP  (0x)        → ~${suggBust.toFixed(1)}% bust`);
  for (let i = 0; i < tierOrder.length; i++) {
    const name = tierOrder[i];
    const minFp = suggested[name];
    const nextMin = i + 1 < tierOrder.length ? suggested[tierOrder[i + 1]] : Infinity;
    const inTier = allFps.filter(f => f >= minFp && f < nextMin).length / handsBuilt * 100;
    const tier = targets.find(t => t.name === name)!;
    console.log(`  ${name.padEnd(10)} ≥${String(minFp).padStart(4)} FP  (${tier.payout.padEnd(5)}) → ~${inTier.toFixed(1)}% in tier`);
  }

  console.log("\n=== COPY THIS INTO payoutLogic.ts / GameBar.tsx / basketballConfig.ts ===");
  console.log(`  ROOKIE:   minFp: ${suggested["ROOKIE"]}`);
  console.log(`  STARTER:  minFp: ${suggested["STARTER"]}`);
  console.log(`  ALL_STAR: minFp: ${suggested["ALL_STAR"]}`);
  console.log(`  MVP:      minFp: ${suggested["MVP"]}`);
  console.log(`  LEGEND:     minFp: ${suggested["LEGEND"]}`);

  // ── EV comparison across threshold options ───────────────────────────
  const OPTIONS = [
    { label: "CURRENT (185/205/225/235/255) 50x", offsets: [185, 205, 225, 235, 255], mults: [0.5, 1.5, 3, 8, 50] },
    { label: "OLD     (190/205/225/235/255) 50x", offsets: [190, 205, 225, 235, 255], mults: [0.5, 1.5, 3, 8, 50] },
  ];
  const MULTS_DEFAULT = [0.5, 1.5, 3, 8, 50];
  const TIER_NAMES = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];

  console.log("\n=== EV COMPARISON ===");
  for (const opt of OPTIONS) {
    const thresholds = opt.offsets;
    const mults = opt.mults ?? MULTS_DEFAULT;
    const bustPct = allFps.filter(f => f < thresholds[0]).length / handsBuilt;
    let ev = 0;
    const tierPcts: number[] = [];
    for (let i = 0; i < thresholds.length; i++) {
      const lo = thresholds[i];
      const hi = i + 1 < thresholds.length ? thresholds[i + 1] : Infinity;
      const rate = allFps.filter(f => f >= lo && f < hi).length / handsBuilt;
      tierPcts.push(rate);
      ev += rate * mults[i];
    }
    const houseEdge = (1 - ev) * 100;
    console.log(`\n  ${opt.label}`);
    console.log(`    BUST       <${thresholds[0]}  →  ${(bustPct * 100).toFixed(1)}%`);
    for (let i = 0; i < TIER_NAMES.length; i++) {
      const gap = i + 1 < TIER_NAMES.length ? `  gap:${thresholds[i+1] - thresholds[i]}` : "";
      console.log(`    ${TIER_NAMES[i].padEnd(10)} ≥${String(thresholds[i]).padStart(3)}  →  ${(tierPcts[i] * 100).toFixed(1).padStart(5)}%  (${mults[i]}x)${gap}`);
    }
    console.log(`    EV: $${(ev * 100).toFixed(1)} per $100  |  House edge: ${houseEdge.toFixed(1)}%${houseEdge < 0 ? " ⚠️  PLAYER FAVORED" : ""}`);
  }

  if (verbose) {
    console.log("\n=== SAMPLE TOP 10 HANDS ===");
    allFps.slice(-10).reverse().forEach((fp, i) => console.log(`  #${i + 1}: ${fp.toFixed(1)} FP`));
  }
}

function payout(s: string) { return `(${s})`.padEnd(7); }

main();
