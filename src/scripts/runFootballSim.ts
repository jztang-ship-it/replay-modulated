/**
 * runFootballSim.ts
 * 10k simulation CLI using SimulationRunner report output (HHI, unique lineups, RTP, etc.)
 *
 * Usage:
 *   cd /Users/john/Cursor
 *   FOOTBALL_PROCESSED_DIR=processed-epl-cards npx ts-node --transpile-only src/scripts/runFootballSim.ts
 *   RUNS=20000 FOOTBALL_PROCESSED_DIR=processed-epl-cards npx ts-node --transpile-only src/scripts/runFootballSim.ts
 */

import { LocalDataProvider } from "../data/providers/LocalDataProvider";
import { FootballDemoSportConfig } from "../sports/footballDemo";
import { runSimulation } from "../simulator/SimulationRunner";

async function main() {
  const runs = Number(process.env.RUNS ?? "10000");
  const dataProvider = new LocalDataProvider();

  await runSimulation({
    sportConfig: FootballDemoSportConfig,
    dataProvider,
    simulationConfig: {
      runs,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
