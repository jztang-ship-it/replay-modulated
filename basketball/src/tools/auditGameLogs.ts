/// <reference types="node" />
import * as fs from "fs";
import * as path from "path";

const WEIGHTS: Record<string, number> = {
  pts: 1.0, reb: 1.2, ast: 1.5, stl: 2.0, blk: 2.0, turnovers: -1.0,
};

function g(stats: Record<string, any>, key: string): number {
  return Number(stats[key] ?? stats[key.toLowerCase()] ?? 0);
}

function computeBase(stats: Record<string, any>): number {
  return Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + g(stats, k) * w, 0);
}

function computeBadgeBonus(stats: Record<string, any>): number {
  const pts = g(stats, "pts"), reb = g(stats, "reb"), ast = g(stats, "ast");
  const stl = g(stats, "stl"), blk = g(stats, "blk"), to = g(stats, "turnovers");
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
  if ([pts, reb, ast, stl, blk].every(v => v >= 5)) bonus += 15;
  return bonus;
}

function findDataDir(): string {
  const candidates = [
    path.join(process.cwd(), "public", "data"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "src", "data"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "game-logs.json"))) return c;
  }
  throw new Error("Could not find game-logs.json. Run from basketball/ directory.");
}

function main() {
  const SAMPLE = parseInt(process.argv[2] ?? "200", 10);
  const TOLERANCE = 0.5;

  console.log("🏀 ReplayMod Live Game Log Audit");
  console.log(`Sampling ${SAMPLE} random game logs...\n`);

  const dataDir = findDataDir();
  const rawLogs: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "game-logs.json"), "utf8"));
  const players: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));

  const playerMap = new Map<string, string>();
  for (const p of players) {
    playerMap.set(String(p.basePlayerId ?? ""), p.name ?? "Unknown");
  }

  console.log(`Loaded ${rawLogs.length.toLocaleString()} game logs\n`);

  // Sample randomly
  const shuffled = [...rawLogs].sort(() => Math.random() - 0.5).slice(0, SAMPLE);

  let pass = 0, fail = 0, skip = 0;
  const failures: string[] = [];

  for (const log of shuffled) {
    const stats = log.stats ?? log;
    const declaredFp: number | undefined =
      log.fp ?? log.fantasyPoints ?? log.fantasy_points ?? log.actualFp ?? stats.fp;

    if (declaredFp === undefined || declaredFp === null) {
      skip++;
      continue;
    }

    const base = computeBase(stats);
    const badge = computeBadgeBonus(stats);
    const computed = Math.round((base + badge) * 10) / 10;
    const declared = Math.round(Number(declaredFp) * 10) / 10;
    const diff = Math.abs(computed - declared);

    if (diff <= TOLERANCE) {
      pass++;
    } else {
      fail++;
      const playerId = String(log.basePlayerId ?? log.personKey ?? "");
      const name = playerMap.get(playerId) ?? playerId;
      const date = log.date ?? log.gameDate ?? "?";
      const opp = log.opponent ?? log.opponentAbbrev ?? "?";
      failures.push(
        `  ❌ ${name} (${date} vs ${opp}): computed ${computed} ≠ declared ${declared} (diff ${diff.toFixed(1)}) | pts=${g(stats,"pts")} reb=${g(stats,"reb")} ast=${g(stats,"ast")} stl=${g(stats,"stl")} blk=${g(stats,"blk")} to=${g(stats,"turnovers")}`
      );
    }
  }

  const checked = pass + fail;
  console.log(`Results (tolerance ±${TOLERANCE} FP):`);
  console.log(`  ✅ Pass:    ${pass} / ${checked}`);
  console.log(`  ❌ Fail:    ${fail} / ${checked}`);
  console.log(`  ⏭  Skipped: ${skip} (no declared FP field)`);

  if (fail === 0 && checked > 0) {
    console.log("\n✅ All sampled logs pass internal FP consistency check.");
    console.log("Note: this verifies math consistency, not accuracy vs real box scores.");
    console.log("To verify accuracy, spot-check specific games at basketball-reference.com");
  } else if (fail > 0) {
    console.log(`\n⚠️  ${fail} logs failed internal consistency:`);
    failures.slice(0, 20).forEach(f => console.log(f));
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
    console.log("\nThese logs have a declared FP that doesn't match the stat line math.");
    console.log("Investigate whether the FP field was pre-computed differently or has stale data.");
  }

  if (skip > 0 && checked === 0) {
    console.log("\n⚠️  All logs skipped — no declared FP field found.");
    console.log("Your game-logs.json may store only raw stats without a pre-computed FP value.");
    console.log("That is FINE — it means FP is computed at runtime from raw stats, which is the correct architecture.");
    console.log("Run the simulator instead: npx tsx ../shared/tools/runSimulator.ts basketball 1000");
  }
}

main();
