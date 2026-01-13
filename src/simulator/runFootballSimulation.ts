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
    },
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
