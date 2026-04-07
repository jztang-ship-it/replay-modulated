/// <reference types="node" />
/**
 * runSimulator.ts — Basketball Economy Simulator
 *
 * Usage (from ~/ReplayMod/basketball/):
 *   npx ts-node --project tsconfig.sim.json src/tools/runSimulator.ts 1000
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
    g("turnovers") * -1.0 + (g("tov") + g("turnovers")) * -1.0
  );
}

// ── Badge bonus — mirrors basketballConfig.ts badges exactly ─────────────
function computeBadgeBonus(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  const pts = g("pts"), reb = g("reb"), ast = g("ast");
  const stl = g("stl"), blk = g("blk"), to = g("turnovers");
  let bonus = 0;
  // Scoring
  if (pts >= 50) bonus += 10;
  else if (pts >= 40) bonus += 5;
  else if (pts >= 30) bonus += 2;
  // Rebounds
  if (reb >= 15) bonus += 5;
  else if (reb >= 10) bonus += 3;
  // Assists
  if (ast >= 15) bonus += 5;
  else if (ast >= 10) bonus += 3;
  // Steals
  if (stl >= 5) bonus += 4;
  else if (stl >= 3) bonus += 2;
  // Blocks
  if (blk >= 5) bonus += 4;
  else if (blk >= 3) bonus += 2;
  // Efficiency
  if (ast >= 10 && to === 0) bonus += 8;
  else if (ast >= 5 && to === 0) bonus += 3;
  if (to >= 6) bonus -= 6;
  else if (to >= 4) bonus -= 3;
  // Milestones
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

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const N       = parseInt(process.argv[2] ?? "1000", 10);
  const verbose = process.argv.includes("--verbose");

  console.log("🏀 ReplayMod Basketball Economy Simulator");
  console.log(`Running ${N.toLocaleString()} simulated hands...\n`);

  // Find data directory
  const bases = [
    path.join(process.cwd(), "public", "data"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "src", "data"),
  ];

  let playersFile = "", logsFile = "";
  for (const base of bases) {
    // Try both naming conventions
    for (const pf of ["players.json", "players.raw.json"]) {
      if (fs.existsSync(path.join(base, pf))) { playersFile = path.join(base, pf); break; }
    }
    for (const lf of ["game-logs.json", "game-logs.json", "game-logs.raw.json"]) {
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

  // Build log map: personId → logs[]
  const logMap = new Map<string, any[]>();
  for (const log of rawLogs) {
    const key = String(log.basePlayerId ?? "");
    if (!key || key === "0") continue;
    if (!logMap.has(key)) logMap.set(key, []);
    logMap.get(key)!.push(log);
  }
  console.log(`Built log map: ${logMap.size.toLocaleString()} unique players with logs\n`);

  // Filter players that have logs and salary
  const playablePool = players.filter(p => {
    const key = String(p.basePlayerId ?? "");
    const hasSalary = (p.salary ?? 0) > 0;
    const hasLogs   = logMap.has(key) && (logMap.get(key)?.length ?? 0) > 0;
    return hasSalary && hasLogs;
  });

  console.log(`Playable pool: ${playablePool.length.toLocaleString()} players (have salary + logs)`);

  if (playablePool.length < 6) {
    console.error("❌ Not enough playable players. Check your data.");
    process.exit(1);
  }

  const rnd    = makeRng(42);
  const CAP_MAX = 200;
  const ROSTER_SIZE = 6;
  const MIN_SALARY = 5; // assume floor for skip checks
  const allFps: number[] = [];
  const allSalaries: number[] = [];
  let   totalBadgeBonus  = 0;
  let   skippedHands     = 0;

  const start = Date.now();

  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 2000 === 0) process.stdout.write(`  ${i.toLocaleString()}/${N.toLocaleString()}...\n`);

    // Build a valid lineup respecting the $200 cap.
    // Greedy: pick a random player; if adding them keeps the cap reachable, take them.
    // Try up to 300 attempts; skip the hand if no valid lineup forms.
    let lineup: any[] = [];
    let lineupSalary = 0;
    let buildAttempts = 0;
    let built = false;

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
        // Reject if adding this player makes it impossible to fill remaining slots within cap
        if (lineupSalary + sal + (slotsLeft - 1) * MIN_SALARY > CAP_MAX) continue;
        used.add(key);
        lineup.push(p);
        lineupSalary += sal;
      }
      if (lineup.length === ROSTER_SIZE && lineupSalary <= CAP_MAX) {
        built = true;
        break;
      }
    }

    if (!built) {
      skippedHands++;
      if (skippedHands <= 5) {
        console.warn(`  ⚠ Could not build valid lineup after 300 attempts (hand ${i + 1})`);
      }
      continue;
    }

    let handFp = 0;
    for (const player of lineup) {
      const key  = String(player.basePlayerId ?? "");
      const logs = logMap.get(key) ?? [];
      if (!logs.length) continue;
      const log   = logs[Math.floor(rnd() * logs.length)];
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

  const handsBuilt = allFps.length;
  const avg    = allFps.reduce((s, v) => s + v, 0) / handsBuilt;
  const avgBadge = totalBadgeBonus / handsBuilt;
  const avgSalary = allSalaries.reduce((s, v) => s + v, 0) / handsBuilt;

  console.log(`\n✅ Completed in ${elapsed}s`);
  if (skippedHands > 0) {
    console.log(`⚠ Skipped ${skippedHands.toLocaleString()} hands (no valid lineup within $${CAP_MAX} cap after 300 attempts)`);
  }

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
  // Tiers (BUST is implicit — anything below ROOKIE)
  const CURRENT = [
    { name: "ROOKIE",   minFp: 133, payout: "0.5x" },
    { name: "STARTER",  minFp: 160, payout: "3x"   },
    { name: "ALL_STAR", minFp: 183, payout: "8x"   },
    { name: "MVP",      minFp: 207, payout: "15x"  },
    { name: "GOAT",     minFp: 235, payout: "50x"  },
  ];
  console.log("\n=== CURRENT THRESHOLDS — HIT RATES ===");
  // BUST = anything below the lowest tier (ROOKIE)
  const bustRate = allFps.filter(f => f < CURRENT[0].minFp).length / handsBuilt * 100;
  const bustFlag = bustRate > 70 ? "⚠️  TOO PUNISHING"
                 : bustRate < 35 ? "⚠️  TOO GENEROUS"
                 : "✅ OK";
  console.log(`  BUST       <${String(CURRENT[0].minFp).padStart(4)} FP  ${payout("0x")}  hit: ${bustRate.toFixed(1).padStart(5)}%  ${bustFlag}`);
  for (const tier of CURRENT) {
    // "Hit rate" for a tier = lands in this tier exactly (>= this min, < next min)
    const nextIdx = CURRENT.indexOf(tier) + 1;
    const nextMin = nextIdx < CURRENT.length ? CURRENT[nextIdx].minFp : Infinity;
    const inTier = allFps.filter(f => f >= tier.minFp && f < nextMin).length / handsBuilt * 100;
    const cumRate = allFps.filter(f => f >= tier.minFp).length / handsBuilt * 100;
    const flag = inTier > 60 ? "⚠️  WAY TOO EASY"
               : inTier > 35 ? "⚠️  TOO EASY"
               : cumRate < 0.2 ? "❌ NEARLY IMPOSSIBLE"
               : "✅ OK";
    console.log(`  ${tier.name.padEnd(10)} ≥${String(tier.minFp).padStart(4)} FP  ${payout(tier.payout)}  in tier: ${inTier.toFixed(1).padStart(5)}%  (cum: ${cumRate.toFixed(1).padStart(5)}%)  ${flag}`);
  }

  // ── Slot-machine targets ─────────────────────────────────────────────
  // Target distribution: BUST ~50%, ROOKIE ~25%, STARTER ~15%, ALL_STAR ~7%, MVP ~2.5%, GOAT ~0.5%
  // Cumulative: ROOKIE+ 50%, STARTER+ 25%, ALL_STAR+ 10%, MVP+ 3%, GOAT+ 0.5%
  const targets = [
    { name: "ROOKIE",   cumPct: 50,  payout: "0.5x" },
    { name: "STARTER",  cumPct: 25,  payout: "3x"   },
    { name: "ALL_STAR", cumPct: 10,  payout: "8x"   },
    { name: "MVP",      cumPct: 3,   payout: "15x"  },
    { name: "GOAT",     cumPct: 0.5, payout: "50x"  },
  ];

  console.log("\n=== SUGGESTED THRESHOLDS (slot-machine feel) ===");
  console.log("  Target: BUST ~50%, ROOKIE ~25%, STARTER ~15%, ALL_STAR ~7%, MVP ~2.5%, GOAT ~0.5%\n");
  const suggested: Record<string, number> = {};
  for (const t of targets) {
    const threshold = pct(allFps, 100 - t.cumPct);
    const rounded   = Math.round(threshold / 1); // round to nearest int
    suggested[t.name] = rounded;
  }
  // Compute in-tier % for the suggested thresholds
  const tierOrder = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];
  const suggBust = allFps.filter(f => f < suggested["ROOKIE"]).length / handsBuilt * 100;
  console.log(`  BUST       <${String(suggested["ROOKIE"]).padStart(4)} FP  ${payout("0x")}     → ~${suggBust.toFixed(1)}% in tier`);
  for (let i = 0; i < tierOrder.length; i++) {
    const name = tierOrder[i];
    const minFp = suggested[name];
    const nextMin = i + 1 < tierOrder.length ? suggested[tierOrder[i + 1]] : Infinity;
    const inTier = allFps.filter(f => f >= minFp && f < nextMin).length / handsBuilt * 100;
    const tier = targets.find(t => t.name === name)!;
    console.log(`  ${name.padEnd(10)} ≥${String(minFp).padStart(4)} FP  ${payout(tier.payout)}  → ~${inTier.toFixed(1)}% in tier`);
  }

  console.log("\n=== COPY THIS INTO payoutLogic.ts + GameBar.tsx ===");
  console.log(`  ROOKIE:   minFp: ${suggested["ROOKIE"]}`);
  console.log(`  STARTER:  minFp: ${suggested["STARTER"]}`);
  console.log(`  ALL_STAR: minFp: ${suggested["ALL_STAR"]}`);
  console.log(`  MVP:      minFp: ${suggested["MVP"]}`);
  console.log(`  GOAT:     minFp: ${suggested["GOAT"]}`);

  if (verbose) {
    console.log("\n=== SAMPLE TOP 10 HANDS ===");
    allFps.slice(-10).reverse().forEach((fp, i) =>
      console.log(`  #${i + 1}: ${fp.toFixed(1)} FP`)
    );
  }
}

function payout(s: string) { return `(${s})`.padEnd(7); }

main();