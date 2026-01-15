/**
 * Football Sandbox Runner - End-to-end validation test (FAST)
 * Loads players + logs ONCE (no per-player file re-reads)
 */

import fs from "fs";
import path from "path";

import { FantasyEngine } from "../engine/FantasyEngine";
import { EngineContext, GameLog } from "../models";
import { FootballDemoSportConfig } from "../sports/footballDemo";
import { computeSeed, SeedMode } from "../utils/seed";

const SEED_MODE: SeedMode = "TIME"; // change to FIXED when debugging
const FIXED_SEED = 12345;
const SESSION_ID = "sandbox-test-1";

function processedDirForSport(sportId: string): string {
  const root = process.cwd();

  // Sports-agnostic pattern, but supports football override (like your LocalDataProvider)
  if (sportId === "football") {
    const footballOverride = process.env.FOOTBALL_PROCESSED_DIR; // e.g. "processed-epl-cards"
    const dirName =
      footballOverride && footballOverride.trim().length > 0
        ? footballOverride.trim()
        : "processed";

    return path.join(root, "src", "data", "football", dirName);
  }

  // fallback for future sports
  return path.join(root, "src", "data", sportId, "processed");
}

function safeReadJson<T>(filePath: string, fallback: T, label: string): T {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Missing ${label}: ${filePath}`);
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || raw.trim().length === 0) {
      console.warn(`⚠️  Empty ${label}: ${filePath}`);
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`⚠️  Invalid JSON for ${label}: ${filePath}`);
    if (e instanceof Error) console.warn(`   Reason: ${e.message}`);
    return fallback;
  }
}

async function runFootballSandbox() {
  const seedNumber = computeSeed(SEED_MODE, FIXED_SEED, SESSION_ID);
  console.log(`Seed Mode: ${SEED_MODE} | Seed: ${seedNumber}`);
  console.log("=== Football Sandbox Test ===\n");

  // Load players + logs ONCE
  const dataDir = processedDirForSport("football");
  const playersPath = path.join(dataDir, "players.json");
  const logsPath = path.join(dataDir, "game-logs.json");

  const players = safeReadJson<any[]>(playersPath, [], "players.json");
  const allLogs = safeReadJson<GameLog[]>(logsPath, [], "game-logs.json");

  console.log(`Loaded ${players.length} players and ${allLogs.length} game logs`);
  console.log(`Data dir: ${dataDir}\n`);

  // Create engine context
  const context: EngineContext = {
    sportConfig: FootballDemoSportConfig,
    players,
    gameLogs: allLogs,
    seed: seedNumber,
  };

  // Create engine (no provider needed for sandbox speed)
  const engine = new FantasyEngine(context);

  try {
    // Step 1: Create session
    console.log("1. Creating session...");
    const session = engine.createSession(SESSION_ID, "football", seedNumber);
    console.log(`   Session ID: ${session.sessionId}`);
    console.log(`   State: ${session.state}\n`);

    // Step 2: Initial deal
    console.log("2. Initial deal...");
    const dealSession = engine.initialDeal();
    console.log(`   State: ${dealSession.state}`);
    console.log(`   Roster size: ${dealSession.roster.length}`);
    console.log(`   Remaining cap: $${dealSession.remainingCap}\n`);

    // Display initial lineup
    const initialPlayerCount = dealSession.roster.filter((s) => s.player).length;
    if (initialPlayerCount < FootballDemoSportConfig.maxPlayers) {
      console.log(
        `   ⚠️  Sandbox note: partial lineup (${initialPlayerCount}/${FootballDemoSportConfig.maxPlayers}) due to cap/constraints feasibility`
      );
    }
    console.log("   Initial Lineup:");
    dealSession.roster.forEach((slot, idx) => {
      if (slot.player) {
        console.log(
          `     Slot ${idx + 1}: ${slot.player.name} (${slot.player.position}) - $${slot.player.salary}`
        );
      }
    });
    console.log("");

    // Step 3: Hold phase
    console.log("3. Hold phase (holding ZERO players)...");

    // Step 4: Final draw
    console.log("4. Final draw...");
    const drawSession = engine.finalDraw();
    console.log(`   State: ${drawSession.state}`);
    console.log(`   Remaining cap: $${drawSession.remainingCap}\n`);

    // Display final lineup
    const finalPlayerCount = drawSession.roster.filter((s) => s.player).length;
    if (finalPlayerCount < FootballDemoSportConfig.maxPlayers) {
      console.log(
        `   ⚠️  Sandbox note: partial lineup (${finalPlayerCount}/${FootballDemoSportConfig.maxPlayers}) due to cap/constraints feasibility`
      );
    }

    console.log("   Final Lineup:");
    drawSession.roster.forEach((slot, idx) => {
      if (slot.player) {
        console.log(
          `     Slot ${idx + 1}: ${slot.player.name} (${slot.player.position}) - $${slot.player.salary} ${slot.held ? "[HELD]" : ""}`
        );
      }
    });
    console.log("");

    // Step 5: Resolution
    console.log("5. Resolution...");
    const resolvedSession = engine.resolve();
    console.log(`   State: ${resolvedSession.state}`);
    console.log(`   Team FP (Engine): ${resolvedSession.resolvedTeamFP?.toFixed(2)}`);
    console.log(`   Win Result: ${resolvedSession.winResult}\n`);

    // Get detailed resolutions
    const resolutions = engine.getResolutions();
    console.log("   Player Resolutions:");
    resolutions.forEach((res) => {
      const player = drawSession.roster.find((s) => s.player?.id === res.playerId)?.player;
      console.log(`     ${player?.name}:`);
      console.log(`       Base FP: ${res.baseFantasyPoints.toFixed(2)}`);
      console.log(`       Achievement Bonus: ${res.achievementBonus.toFixed(2)}`);
      console.log(`       Total FP: ${res.fantasyPoints.toFixed(2)}`);

      if (res.triggeredAchievements.length > 0) {
        console.log(`       Achievements: ${res.triggeredAchievements.length}`);
        res.triggeredAchievements.forEach((ach) => {
          console.log(`         - ${ach.ruleId} (${ach.reward.type})`);
        });
      }
    });
    console.log("");

    // Validation checks
    console.log("=== Validation ===");
    const totalSalary = drawSession.roster.reduce((sum, slot) => sum + (slot.player?.salary || 0), 0);

    // MATHEMATICAL CONSISTENCY CHECK
    const playerTotalSum = resolutions.reduce((sum, r) => sum + r.fantasyPoints, 0);
    const isMathematicallyValid =
      Math.abs((resolvedSession.resolvedTeamFP ?? 0) - playerTotalSum) < 0.001;

    console.log(`Total Salary: $${totalSalary} (Cap: $${FootballDemoSportConfig.salaryCap})`);
    console.log(`Salary Cap Valid: ${totalSalary <= FootballDemoSportConfig.salaryCap}`);
    console.log(
      `Team FP Valid: ${isMathematicallyValid} (Engine Total: ${resolvedSession.resolvedTeamFP?.toFixed(
        2
      )}, Player Sum: ${playerTotalSum.toFixed(2)})`
    );
    console.log(`Determinism: reproducible with Seed=${seedNumber}`);

    console.log("\n=== Sandbox Test Complete ===");
  } catch (error) {
    console.error("Error during sandbox test:", error);
    process.exit(1);
  }
}

runFootballSandbox().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
