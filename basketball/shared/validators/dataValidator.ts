/**
 * shared/validators/dataValidator.ts — Layer 1 (sport-agnostic)
 *
 * Validates that extracted players.json + game-logs.json meet the
 * minimum requirements for the game engine to function correctly.
 *
 * Run this after any data extraction to catch problems before they
 * surface as confusing runtime bugs in the game.
 *
 * Usage (Node):
 *   npx ts-node shared/validators/dataValidator.ts worldcup
 *   npx ts-node shared/validators/dataValidator.ts basketball
 */

import type { ValidationResult, NormalizedPlayer, NormalizedLog } from "../types";

export type { ValidationResult };

// ── Validation rules ───────────────────────────────────────────────────────

const REQUIRED_PLAYER_FIELDS = [
  "id", "basePlayerId", "name", "team", "position",
  "season", "salary", "tier", "avgFP", "projectedFp",
] as const;

const VALID_TIERS = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as const;

const REQUIRED_LOG_FIELDS = [
  "basePlayerId", "date", "matchDate", "season", "opponent", "homeAway", "stats",
] as const;

// ── Main validator ─────────────────────────────────────────────────────────

export function validateDataset(
  players: NormalizedPlayer[],
  logs: NormalizedLog[],
  options: {
    validPositions?: string[];   // If provided, validates all positions are in this list
    minPlayers?: number;         // Minimum player count required
    minLogsPerPlayer?: number;   // Minimum avg logs per player
    sport?: string;              // Just for reporting
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { validPositions, minPlayers = 20, minLogsPerPlayer = 3, sport = "unknown" } = options;

  // ── Player validation ──────────────────────────────────────────────────

  if (players.length === 0) {
    errors.push("No players found — players.json is empty or missing");
  } else if (players.length < minPlayers) {
    errors.push(`Only ${players.length} players found — minimum is ${minPlayers}`);
  }

  const playerIds = new Set<string>();
  const basePlayerIds = new Set<string>();
  const positionCoverage: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};

  for (let i = 0; i < players.length; i++) {
    const p = players[i];

    // Required fields
    for (const field of REQUIRED_PLAYER_FIELDS) {
      if (p[field] === undefined || p[field] === null || p[field] === "") {
        errors.push(`Player[${i}] "${p.name ?? "??"}" missing required field: ${field}`);
      }
    }

    // ID uniqueness
    if (playerIds.has(p.id)) {
      errors.push(`Duplicate player id: "${p.id}"`);
    }
    playerIds.add(p.id);
    basePlayerIds.add(p.basePlayerId);

    // Salary sanity
    if (typeof p.salary !== "number" || p.salary <= 0) {
      errors.push(`Player "${p.name}" has invalid salary: ${p.salary}`);
    } else if (p.salary < 5 || p.salary > 100) {
      warnings.push(`Player "${p.name}" has unusual salary: $${p.salary}`);
    }

    // Tier validity
    if (!VALID_TIERS.includes(p.tier as any)) {
      errors.push(`Player "${p.name}" has invalid tier: "${p.tier}"`);
    }
    tierDistribution[p.tier] = (tierDistribution[p.tier] ?? 0) + 1;

    // Position validity
    if (validPositions && !validPositions.includes(p.position)) {
      errors.push(`Player "${p.name}" has invalid position "${p.position}" — valid: ${validPositions.join(", ")}`);
    }
    positionCoverage[p.position] = (positionCoverage[p.position] ?? 0) + 1;

    // avgFP sanity
    if (typeof p.avgFP !== "number" || p.avgFP < 0) {
      warnings.push(`Player "${p.name}" has suspicious avgFP: ${p.avgFP}`);
    }
  }

  // ── Position balance check ─────────────────────────────────────────────

  if (validPositions && validPositions.length > 0) {
    for (const pos of validPositions) {
      const count = positionCoverage[pos] ?? 0;
      if (count === 0) {
        errors.push(`No players found for required position: ${pos}`);
      } else if (count < 5) {
        warnings.push(`Very few players (${count}) for position: ${pos}`);
      }
    }
  }

  // ── Tier distribution check ────────────────────────────────────────────
  // Warn if distribution is extreme (all one tier = bad for game variety)

  const totalPlayers = players.length;
  if (totalPlayers > 0) {
    const orangeCount = tierDistribution["ORANGE"] ?? 0;
    const whiteCount = tierDistribution["WHITE"] ?? 0;
    const orangePct = (orangeCount / totalPlayers) * 100;
    const whitePct = (whiteCount / totalPlayers) * 100;

    if (orangePct > 40) {
      warnings.push(`${orangePct.toFixed(0)}% of players are ORANGE tier — salary scale may be too compressed`);
    }
    if (whitePct > 50) {
      warnings.push(`${whitePct.toFixed(0)}% of players are WHITE tier — may lack variety`);
    }
    if (orangeCount === 0) {
      warnings.push(`No ORANGE tier players — salary scale may be too low`);
    }
  }

  // ── Log validation ─────────────────────────────────────────────────────

  if (logs.length === 0) {
    errors.push("No game logs found — game-logs.json is empty or missing");
  }

  let logsMissingStats = 0;
  let logsZeroStats = 0;
  const logsPerPlayer = new Map<string, number>();

  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];

    // Required fields
    for (const field of REQUIRED_LOG_FIELDS) {
      if ((l as any)[field] === undefined || (l as any)[field] === null) {
        if (i < 10) { // Only report first 10 to avoid spam
          errors.push(`Log[${i}] missing required field: ${field}`);
        }
      }
    }

    if (!l.stats || typeof l.stats !== "object") {
      logsMissingStats++;
    } else {
      const statSum = Object.values(l.stats).filter(v => typeof v === "number").reduce((s: number, v) => s + (v as number), 0);
      if (statSum === 0) logsZeroStats++;
    }

    const key = l.basePlayerId;
    logsPerPlayer.set(key, (logsPerPlayer.get(key) ?? 0) + 1);
  }

  if (logsMissingStats > 0) {
    errors.push(`${logsMissingStats} logs are missing stats object`);
  }

  const zeroPct = (logsZeroStats / Math.max(logs.length, 1)) * 100;
  if (zeroPct > 20) {
    warnings.push(`${zeroPct.toFixed(0)}% of logs have all-zero stats — DNP filtering may be needed`);
  }

  // ── Cross-reference: players with no logs ──────────────────────────────

  let playersWithLogs = 0;
  let playersWithNoLogs = 0;

  for (const p of players) {
    const count = logsPerPlayer.get(p.basePlayerId) ?? 0;
    if (count > 0) {
      playersWithLogs++;
    } else {
      playersWithNoLogs++;
      if (playersWithNoLogs <= 5) {
        warnings.push(`Player "${p.name}" (${p.basePlayerId}) has no game logs`);
      } else if (playersWithNoLogs === 6) {
        warnings.push(`...and more players with no logs (run with --verbose to see all)`);
      }
    }
  }

  if (playersWithNoLogs > totalPlayers * 0.3) {
    errors.push(`${playersWithNoLogs}/${totalPlayers} players have no game logs — data pipeline may be broken`);
  }

  const avgLogsPerPlayer = logs.length / Math.max(basePlayerIds.size, 1);
  if (avgLogsPerPlayer < minLogsPerPlayer) {
    warnings.push(`Average ${avgLogsPerPlayer.toFixed(1)} logs/player — recommend at least ${minLogsPerPlayer}`);
  }

  // ── Result ─────────────────────────────────────────────────────────────

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      playerCount: players.length,
      logCount: logs.length,
      positionCoverage,
      tierDistribution,
      playersWithLogs,
      avgLogsPerPlayer: Math.round(avgLogsPerPlayer * 10) / 10,
    },
  };
}

// ── Pretty print validation result ────────────────────────────────────────

export function printValidationResult(result: ValidationResult, sport = "unknown"): void {
  console.log(`\n=== Data Validation: ${sport} ===`);
  console.log(`Status: ${result.valid ? "✅ VALID" : "❌ INVALID"}`);
  console.log(`Players: ${result.stats.playerCount}`);
  console.log(`Logs: ${result.stats.logCount}`);
  console.log(`Players with logs: ${result.stats.playersWithLogs}`);
  console.log(`Avg logs/player: ${result.stats.avgLogsPerPlayer}`);

  console.log("\nPosition coverage:");
  for (const [pos, count] of Object.entries(result.stats.positionCoverage)) {
    console.log(`  ${pos}: ${count}`);
  }

  console.log("\nTier distribution:");
  for (const [tier, count] of Object.entries(result.stats.tierDistribution)) {
    const pct = ((count / result.stats.playerCount) * 100).toFixed(0);
    console.log(`  ${tier}: ${count} (${pct}%)`);
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.valid) {
    console.log("\n✅ Data is ready for the game engine.");
  } else {
    console.log("\n❌ Fix errors before running the simulator or game.");
  }
}

// ── CLI runner ─────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes("dataValidator")) {
  import("fs").then(async ({ readFileSync, existsSync }) => {
    import("path").then(({ join }) => {
      const sport = process.argv[2] ?? "basketball";
      const base = join(process.cwd(), sport, "public", "data");

      const playersPath = join(base, "players.json");
      const logsPath = join(base, "game-logs.json");

      if (!existsSync(playersPath)) {
        console.error(`❌ Not found: ${playersPath}`);
        console.error(`   Run the extractor first.`);
        process.exit(1);
      }
      if (!existsSync(logsPath)) {
        console.error(`❌ Not found: ${logsPath}`);
        process.exit(1);
      }

      const players = JSON.parse(readFileSync(playersPath, "utf8"));
      const logs = JSON.parse(readFileSync(logsPath, "utf8"));

      const positions = sport === "worldcup"
        ? ["GK", "DEF", "MID", "FWD"]
        : sport === "basketball"
        ? ["G", "F", "C"]
        : undefined;

      const result = validateDataset(players, logs, { validPositions: positions, sport });
      printValidationResult(result, sport);
      process.exit(result.valid ? 0 : 1);
    });
  });
}
