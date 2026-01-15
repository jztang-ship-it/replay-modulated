import { LocalDataProvider } from '../data/providers/LocalDataProvider';
import { FootballDemoSportConfig } from '../sports/footballDemo';
import { runSimulation } from './SimulationRunner';

async function main() {
  console.log('=== iReplay Simulation (Football Demo) ===\n');

  const dataProvider = new LocalDataProvider();

  await runSimulation({
    sportConfig: FootballDemoSportConfig,
    dataProvider,
    simulationConfig: {
      runs: 10000,
      seedMode: 'SESSION',

      // ✅ this is the key your compiler hinted exists
      slotPercentiles: {
        small: 0.55,
        medium: 0.8,
        big: 0.93,
        huge: 0.99,
        jackpot: 0.999,
      },
    },
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
