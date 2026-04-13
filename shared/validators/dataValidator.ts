/**
 * shared/validators/dataValidator.ts — Layer 1 (sport-agnostic)
 * Run after extraction to confirm data is game-engine ready.
 *
 * Usage:
 *   npx ts-node shared/validators/dataValidator.ts worldcup
 *   npx ts-node shared/validators/dataValidator.ts basketball
 */

import type { ValidationResult, NormalizedPlayer, NormalizedLog } from "../types";
export type { ValidationResult };

const VALID_TIERS = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as const;

export function validateDataset(players: NormalizedPlayer[], logs: NormalizedLog[], options: { validPositions?: string[]; minPlayers?: number; minLogsPerPlayer?: number; sport?: string } = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { validPositions, minPlayers = 20, minLogsPerPlayer = 3, sport = "unknown" } = options;
  const positionCoverage: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};

  if (players.length === 0) errors.push("No players found");
  else if (players.length < minPlayers) errors.push(`Only ${players.length} players — minimum is ${minPlayers}`);

  const playerIds = new Set<string>();
  const basePlayerIds = new Set<string>();

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    for (const field of ["id","basePlayerId","name","team","position","season","salary","tier","avgFP","projectedFp"] as const) {
      if ((p as any)[field] === undefined || (p as any)[field] === null || (p as any)[field] === "") errors.push(`Player[${i}] "${p.name}" missing: ${field}`);
    }
    if (playerIds.has(p.id)) errors.push(`Duplicate player id: "${p.id}"`);
    playerIds.add(p.id);
    basePlayerIds.add(p.basePlayerId);
    if (typeof p.salary !== "number" || p.salary <= 0) errors.push(`Player "${p.name}" invalid salary: ${p.salary}`);
    if (!VALID_TIERS.includes(p.tier as any)) errors.push(`Player "${p.name}" invalid tier: "${p.tier}"`);
    tierDistribution[p.tier] = (tierDistribution[p.tier] ?? 0) + 1;
    if (validPositions && !validPositions.includes(p.position)) errors.push(`Player "${p.name}" invalid position "${p.position}"`);
    positionCoverage[p.position] = (positionCoverage[p.position] ?? 0) + 1;
  }

  if (validPositions) {
    for (const pos of validPositions) {
      if (!positionCoverage[pos]) errors.push(`No players for position: ${pos}`);
      else if (positionCoverage[pos] < 5) warnings.push(`Few players (${positionCoverage[pos]}) for: ${pos}`);
    }
  }

  if (logs.length === 0) errors.push("No game logs found");

  const logsPerPlayer = new Map<string, number>();
  let logsZeroStats = 0;
  for (const l of logs) {
    const statSum = Object.values(l.stats ?? {}).filter(v => typeof v === "number").reduce((s: number, v) => s + (v as number), 0);
    if (statSum === 0) logsZeroStats++;
    logsPerPlayer.set(l.basePlayerId, (logsPerPlayer.get(l.basePlayerId) ?? 0) + 1);
  }

  if ((logsZeroStats / Math.max(logs.length, 1)) * 100 > 20) warnings.push(`${logsZeroStats} logs have all-zero stats`);

  let playersWithLogs = 0;
  let playersWithNoLogs = 0;
  for (const p of players) {
    if ((logsPerPlayer.get(p.basePlayerId) ?? 0) > 0) playersWithLogs++;
    else { playersWithNoLogs++; if (playersWithNoLogs <= 3) warnings.push(`"${p.name}" has no logs`); }
  }
  if (playersWithNoLogs > players.length * 0.3) errors.push(`${playersWithNoLogs}/${players.length} players have no logs`);

  const avgLogsPerPlayer = logs.length / Math.max(basePlayerIds.size, 1);
  if (avgLogsPerPlayer < minLogsPerPlayer) warnings.push(`Avg ${avgLogsPerPlayer.toFixed(1)} logs/player — recommend ${minLogsPerPlayer}+`);

  return { valid: errors.length === 0, errors, warnings, stats: { playerCount: players.length, logCount: logs.length, positionCoverage, tierDistribution, playersWithLogs, avgLogsPerPlayer: Math.round(avgLogsPerPlayer * 10) / 10 } };
}

export function printValidationResult(result: ValidationResult, sport = "unknown"): void {
  console.log(`\n=== Data Validation: ${sport} ===`);
  console.log(`Status: ${result.valid ? "✅ VALID" : "❌ INVALID"}`);
  console.log(`Players: ${result.stats.playerCount} | Logs: ${result.stats.logCount} | With logs: ${result.stats.playersWithLogs} | Avg logs/player: ${result.stats.avgLogsPerPlayer}`);
  console.log("\nPosition coverage:", result.stats.positionCoverage);
  console.log("Tier distribution:", result.stats.tierDistribution);
  if (result.errors.length) { console.log(`\n❌ Errors:`); result.errors.forEach(e => console.log(`  - ${e}`)); }
  if (result.warnings.length) { console.log(`\n⚠️  Warnings:`); result.warnings.forEach(w => console.log(`  - ${w}`)); }
  console.log(result.valid ? "\n✅ Ready for game engine." : "\n❌ Fix errors before proceeding.");
}
