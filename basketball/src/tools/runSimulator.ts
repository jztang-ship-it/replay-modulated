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
  const allFps: number[] = [];
  let   totalBadgeBonus  = 0;

  const start = Date.now();

  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 2000 === 0) process.stdout.write(`  ${i.toLocaleString()}/${N.toLocaleString()}...\n`);

    // Pick 6 unique players
    const lineup: any[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (lineup.length < 6 && attempts < 200) {
      const p = playablePool[Math.floor(rnd() * playablePool.length)];
      const key = String(p.basePlayerId ?? "");
      if (!used.has(key)) { used.add(key); lineup.push(p); }
      attempts++;
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
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  allFps.sort((a, b) => a - b);

  const avg    = allFps.reduce((s, v) => s + v, 0) / N;
  const avgBadge = totalBadgeBonus / N;

  console.log(`\n✅ Completed in ${elapsed}s`);
  console.log("\n=== FP DISTRIBUTION (Team FP per hand) ===");
  console.log(`  Hands:   ${N.toLocaleString()}`);
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
    { name: "BRONZE",  minFp: 115, payout: "1.5x" },
    { name: "GOLD",    minFp: 132, payout: "2.5x" },
    { name: "MVP",     minFp: 160, payout: "5x"   },
    { name: "JACKPOT", minFp: 180, payout: "15x"  },
  ];
  console.log("\n=== CURRENT THRESHOLDS — HIT RATES ===");
  for (const tier of CURRENT) {
    const rate = allFps.filter(f => f >= tier.minFp).length / N * 100;
    const flag = rate > 60 ? "⚠️  WAY TOO EASY"
               : rate > 35 ? "⚠️  TOO EASY"
               : rate < 0.5 ? "❌ NEARLY IMPOSSIBLE"
               : rate < 3 ? "⚠️  VERY RARE"
               : "✅ OK";
    console.log(`  ${tier.name.padEnd(10)} ≥${String(tier.minFp).padStart(4)} FP  ${payout(tier.payout)}  hit: ${rate.toFixed(1).padStart(5)}%  ${flag}`);
  }

  // ── Slot-machine targets ─────────────────────────────────────────────
  // Goal: BRONZE ~30-35%, GOLD ~12-15%, MVP ~4-6%, JACKPOT ~1%
  const targets = [
    { name: "BRONZE",  targetPct: 32, payout: "1.5x" },
    { name: "GOLD",    targetPct: 14, payout: "2.5x" },
    { name: "MVP",     targetPct: 5,  payout: "5x"   },
    { name: "JACKPOT", targetPct: 1,  payout: "15x"  },
  ];

  console.log("\n=== SUGGESTED THRESHOLDS (slot-machine feel) ===");
  console.log("  ~32% BRONZE, ~14% GOLD, ~5% MVP, ~1% JACKPOT\n");
  const suggested: number[] = [];
  for (const t of targets) {
    const threshold = pct(allFps, 100 - t.targetPct);
    const rounded   = Math.round(threshold / 5) * 5; // round to nearest 5
    const actual    = allFps.filter(f => f >= rounded).length / N * 100;
    suggested.push(rounded);
    console.log(`  ${t.name.padEnd(10)} ≥${String(rounded).padStart(4)} FP  ${payout(t.payout)}  → ~${actual.toFixed(1)}% of hands`);
  }

  console.log("\n=== COPY THIS INTO payoutLogic.ts + GameBar.tsx ===");
  console.log(`  BRONZE:  minFp: ${suggested[0]}`);
  console.log(`  GOLD:    minFp: ${suggested[1]}`);
  console.log(`  MVP:     minFp: ${suggested[2]}`);
  console.log(`  JACKPOT: minFp: ${suggested[3]}`);

  if (verbose) {
    console.log("\n=== SAMPLE TOP 10 HANDS ===");
    allFps.slice(-10).reverse().forEach((fp, i) =>
      console.log(`  #${i + 1}: ${fp.toFixed(1)} FP`)
    );
  }
}

function payout(s: string) { return `(${s})`.padEnd(7); }

main();