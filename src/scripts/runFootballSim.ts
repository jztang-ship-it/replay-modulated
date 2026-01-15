/**
 * runFootballSim.ts
 * 10k simulation CLI using existing SimulationRunner report output (HHI, unique lineups, RTP, etc.)
 *
 * Usage:
 *   FOOTBALL_PROCESSED_DIR=processed-epl-cards npx ts-node --transpile-only src/scripts/runFootballSim.ts
 *   RUNS=20000 FOOTBALL_PROCESSED_DIR=processed-epl-cards npx ts-node --transpile-only src/scripts/runFootballSim.ts
 */

import { LocalDataProvider } from "../data/providers/LocalDataProvider";
import { FootballDemoSportConfig } from "../sports/footballDemo";
import { SimulationRunner } from "../simulator/SimulationRunner";
import type { EngineContext, GameLog } from "../models";

async function main() {
  const runs = Number(process.env.RUNS ?? "10000");
  const sportId = "football";

  const provider = new LocalDataProvider();

  // IMPORTANT: load players + ALL logs once (fast), do NOT loop getGameLogs per player
  const players = await provider.getPlayers(sportId);

  // If your LocalDataProvider has a "getAllGameLogs" method, use it.
  // If not, it likely supports getGameLogs("ALL") or similar.
  // We'll try a couple safe patterns; adjust ONE line if needed.
  let gameLogs: GameLog[] = [];

  // Option A (common): provider.getAllGameLogs(sportId)
  const anyProvider: any = provider as any;
  if (typeof anyProvider.getAllGameLogs === "function") {
    gameLogs = await anyProvider.getAllGameLogs(sportId);
  } else if (typeof anyProvider.getGameLogsForSport === "function") {
    gameLogs = await anyProvider.getGameLogsForSport(sportId);
  } else {
    // Fallback: read all logs by calling getGameLogs for each player (works but slower).
    // Only used if your provider doesn't expose an all-logs method.
    for (const p of players) {
      const logs = await provider.getGameLogs(p.id, FootballDemoSportConfig.historicalLogFilters);
      gameLogs.push(...logs);
    }
  }

  console.log(`Loaded ${players.length} players and ${gameLogs.length} game logs`);
  console.log(`SportConfig cap=$${FootballDemoSportConfig.salaryCap} roster=${FootballDemoSportConfig.maxPlayers}`);
  console.log(`Runs: ${runs}\n`);

  const context: EngineContext = {
    sportConfig: FootballDemoSportConfig,
    players,
    gameLogs,
    seed: Date.now(),
  };

  // SimulationRunner already prints:
  // - team FP percentiles
  // - salary usage
  // - unique lineup counts (ordered/unordered)
  // - HHI / effective pool
  await SimulationRunner.runSimulation({
    runs,
    context,
    sportId,
    sessionIdPrefix: "sim",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
