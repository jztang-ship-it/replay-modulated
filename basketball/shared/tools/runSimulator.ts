/**
 * shared/tools/runSimulator.ts — Layer 1 (sport-agnostic)
 *
 * Validates win tier thresholds for any sport by simulating N hands.
 * Replaces the basketball-specific version. Works for any sport that
 * has players.json + game-logs.json in the standard format.
 *
 * Usage (from repo root):
 *   npx ts-node shared/tools/runSimulator.ts basketball 10000
 *   npx ts-node shared/tools/runSimulator.ts worldcup 10000
 *   npx ts-node shared/tools/runSimulator.ts worldcup 10000 --verbose
 */

/// <reference types="node" />

import * as path from "path";
import * as fs from "fs";

// ── Sport-specific FP formula registry ────────────────────────────────────
// Add a new sport here when you add it. Just needs computeFp + computeBadgeBonus.

const SPORT_CONFIGS: Record<string, {
  computeFp: (stats: Record<string, any>) => number;
  computeBadgeBonus: (stats: Record<string, any>) => number;
  positions?: string[];
}> = {
  basketball: {
    computeFp: (stats) => {
      const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
      return (
        g("pts") * 1.0 +
        g("reb") * 1.2 +
        g("ast") * 1.5 +
        g("stl") * 2.0 +
        g("blk") * 2.0 +
        g("turnovers") * -1.0
      );
    },
    computeBadgeBonus: (stats) => {
      const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
      const pts = g("pts"), reb = g("reb"), ast = g("ast"), stl = g("stl"), blk = g("blk");
      let bonus = 0;
      const doubleCats = [pts >= 10, reb >= 10, ast >= 10].filter(Boolean).length;
      if (doubleCats >= 3) bonus += 3;
      else if (doubleCats >= 2) bonus += 2;
      if (pts >= 30) bonus += 2;
      if (ast >= 7)  bonus += 2;
      if (reb >= 10) bonus += 1;
      if (stl + blk >= 3) bonus += 2;
      return bonus;
    },
    positions: ["G", "F", "C"],
  },

  worldcup: {
    computeFp: (stats) => {
      const g = (k: string) => Number(stats[k] ?? 0);
      return (
        g("goals") * 6.0 +
        g("assists") * 4.0 +
        g("shots_on_target") * 1.0 +
        g("key_passes") * 1.0 +
        g("tackles") * 1.2 +
        g("interceptions") * 1.5 +
        g("clearances") * 0.8 +
        g("pressures") * 0.12 +
        g("saves") * 2.5 +
        g("goals_conceded") * -1.0 +
        g("yellow_cards") * -1.0 +
        g("red_cards") * -3.0
      );
    },
    computeBadgeBonus: (stats) => {
      const g = (k: string) => Number(stats[k] ?? 0);
      let bonus = 0;
      if (g("goals") >= 2) bonus += 2; // Brace
      if (g("goals") >= 3) bonus += 3; // Hat trick
      if (g("assists") >= 2) bonus += 2; // Playmaker
      if (g("saves") >= 5) bonus += 2; // Wall (GK)
      return bonus;
    },
    positions: ["GK", "DEF", "MID", "FWD"],
  },
};

// ── Percentile helper ──────────────────────────────────────────────────────
function pct(sorted: number[], p: number): number {
  const i = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
  return sorted[i];
}

// ── Simple seeded RNG ──────────────────────────────────────────────────────
function makeRng(seed = 12345) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  const sport  = process.argv[2] ?? "basketball";
  const N      = parseInt(process.argv[3] ?? "1000", 10);
  const verbose = process.argv.includes("--verbose");

  const sportCfg = SPORT_CONFIGS[sport];
  if (!sportCfg) {
    console.error(`❌ Unknown sport: "${sport}". Available: ${Object.keys(SPORT_CONFIGS).join(", ")}`);
    process.exit(1);
  }

  console.log(`🎮 ReplayMod Economy Simulator — ${sport}`);
  console.log(`Running ${N.toLocaleString()} simulated hands...\n`);

  // Find data files
  const bases = [
    path.join(process.cwd(), sport, "public", "data"),
    path.join(process.cwd(), "public", "data"),
    path.join(process.cwd(), "data"),
  ];

  let playersFile = "", logsFile = "";
  for (const base of bases) {
    if (!playersFile && fs.existsSync(path.join(base, "players.json"))) {
      playersFile = path.join(base, "players.json");
    }
    if (!logsFile && fs.existsSync(path.join(base, "game-logs.json"))) {
      logsFile = path.join(base, "game-logs.json");
    }
    if (playersFile && logsFile) break;
  }

  if (!playersFile || !logsFile) {
    console.error("❌ Could not find players.json + game-logs.json.");
    console.error("   Run the data extractor first.");
    bases.forEach(b => console.error("   Tried: " + b));
    process.exit(1);
  }

  console.log(`📂 Players: ${playersFile}`);
  console.log(`📂 Logs:    ${logsFile}\n`);

  const players: any[] = JSON.parse(fs.readFileSync(playersFile, "utf8"));
  const rawLogs: any[] = JSON.parse(fs.readFileSync(logsFile, "utf8"));
  console.log(`Loaded ${players.length.toLocaleString()} players, ${rawLogs.length.toLocaleString()} logs`);

  // Build log map: basePlayerId → logs[]
  const logMap = new Map<string, any[]>();
  for (const log of rawLogs) {
    const key = String(log.basePlayerId ?? "");
    if (!key) continue;
    if (!logMap.has(key)) logMap.set(key, []);
    logMap.get(key)!.push(log);
  }
  console.log(`Built log map: ${logMap.size.toLocaleString()} players with logs`);

  // Per-position stats
  if (sportCfg.positions && verbose) {
    console.log("\nPosition breakdown in player pool:");
    for (const pos of sportCfg.positions) {
      const count = players.filter(p => p.position === pos).length;
      console.log(`  ${pos}: ${count}`);
    }
  }

  // Filter playable pool
  const playablePool = players.filter(p => {
    const key = String(p.basePlayerId ?? "");
    return (p.salary ?? 0) > 0 && logMap.has(key) && (logMap.get(key)?.length ?? 0) > 0;
  });
  console.log(`Playable pool: ${playablePool.length.toLocaleString()} players\n`);

  if (playablePool.length < 6) {
    console.error("❌ Not enough playable players. Run the extractor first.");
    process.exit(1);
  }

  const rnd = makeRng(42);
  const allFps: number[] = [];
  let totalBadgeBonus = 0;
  const start = Date.now();

  // ── Simulate N hands ────────────────────────────────────────────────────
  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 2000 === 0) process.stdout.write(`  ${i.toLocaleString()}/${N.toLocaleString()}...\n`);

    // Pick 6 unique players
    const lineup: any[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (lineup.length < 6 && attempts < 300) {
      const p = playablePool[Math.floor(rnd() * playablePool.length)];
      const key = String(p.basePlayerId ?? "");
      if (!used.has(key)) { used.add(key); lineup.push(p); }
      attempts++;
    }

    let handFp = 0;
    for (const player of lineup) {
      const key = String(player.basePlayerId ?? "");
      const logs = logMap.get(key) ?? [];
      if (!logs.length) continue;

      const log = logs[Math.floor(rnd() * logs.length)];
      const stats = log.stats ?? log;

      // Skip all-zero logs (DNP equivalent)
      const statSum = Object.values(stats)
        .filter(v => typeof v === "number")
        .reduce((s: number, v) => s + Math.abs(v as number), 0);
      if (statSum === 0) continue;

      const fp = sportCfg.computeFp(stats);
      const bonus = sportCfg.computeBadgeBonus(stats);
      handFp += fp + bonus;
      totalBadgeBonus += bonus;
    }

    allFps.push(handFp);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  allFps.sort((a, b) => a - b);

  const avg = allFps.reduce((s, v) => s + v, 0) / N;
  const avgBadge = totalBadgeBonus / N;

  // ── Results ──────────────────────────────────────────────────────────────
  console.log(`\n✅ Completed in ${elapsed}s`);
  console.log(`\n=== FP DISTRIBUTION (${sport} — team FP per 6-card hand) ===`);
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

  // ── Suggested thresholds ─────────────────────────────────────────────────
  // Target: ROOKIE ~34%, STARTER ~13%, ALL_STAR ~5%, MVP ~1%
  const targets = [
    { name: "ROOKIE",   targetPct: 34, multiplier: "1.5x" },
    { name: "STARTER",  targetPct: 13, multiplier: "2.5x" },
    { name: "ALL_STAR", targetPct: 5,  multiplier: "5x"   },
    { name: "MVP",      targetPct: 1,  multiplier: "15x"  },
  ];

  console.log("\n=== SUGGESTED WIN TIER THRESHOLDS ===");
  console.log("  ~34% ROOKIE, ~13% STARTER, ~5% ALL_STAR, ~1% MVP\n");

  const suggested: number[] = [];
  for (const t of targets) {
    const threshold = pct(allFps, 100 - t.targetPct);
    const rounded = Math.round(threshold / 5) * 5;
    const actual = allFps.filter(f => f >= rounded).length / N * 100;
    suggested.push(rounded);
    console.log(`  ${t.name.padEnd(10)} ≥${String(rounded).padStart(4)} FP  (${t.multiplier})  → ~${actual.toFixed(1)}% of hands`);
  }

  console.log(`\n=== COPY INTO ${sport}Config.ts winTiers ===`);
  console.log(`  { name: "ROOKIE",   minFp: ${suggested[0]}, multiplier: 1.5,  color: "#10B981" },`);
  console.log(`  { name: "STARTER",  minFp: ${suggested[1]}, multiplier: 2.5,  color: "#3B82F6" },`);
  console.log(`  { name: "ALL_STAR", minFp: ${suggested[2]}, multiplier: 5,    color: "#8B5CF6" },`);
  console.log(`  { name: "MVP",      minFp: ${suggested[3]}, multiplier: 15,   color: "#F59E0B" },`);

  if (verbose) {
    console.log("\n=== SAMPLE TOP 10 HANDS ===");
    allFps.slice(-10).reverse().forEach((fp, i) =>
      console.log(`  #${i + 1}: ${fp.toFixed(1)} FP`)
    );
  }
}

main();
