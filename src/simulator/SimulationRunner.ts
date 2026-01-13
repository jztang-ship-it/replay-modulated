import {
  SportConfig,
  Player,
  RosterSlot,
  EngineContext,
  GameLog,
} from '../models';
import { DataProvider } from '../data/DataProvider';
import { FantasyEngine } from '../engine/FantasyEngine';
import { RandomEngine } from '../engine/RandomEngine';
import { mean, median, stddev, percentile } from '../utils/stats';
import { computeSeed, SeedMode } from '../utils/seed';

export type SimulationConfig = {
  runs: number;
  seedMode: SeedMode;
  fixedSeed?: number;
  minTeamSalaryBenchmark?: number;
};

interface RunResult {
  teamFP: number;
  totalSalary: number;
  filledCount: number;
  positionCounts: Record<string, number>;
  tierCounts: Record<string, number>;
  zeroFPCount: number;
  achievements: Record<string, number>;
  winResult: boolean | null;
}

export async function runSimulation(params: {
  sportConfig: SportConfig;
  dataProvider: DataProvider;
  simulationConfig?: Partial<SimulationConfig>;
}): Promise<void> {
  const { sportConfig, dataProvider, simulationConfig = {} } = params;

  // Load data
  const players = await dataProvider.getPlayers('football');
  const allLogs: GameLog[] = [];
  for (const player of players) {
    const playerLogs = await dataProvider.getGameLogs(player.id, {
      seasonsBack: 10,
      minMinutes: 1,
    });
    allLogs.push(...playerLogs);
  }

  // Defaults
  const runs = simulationConfig.runs ?? 10000;
  const seedMode = simulationConfig.seedMode ?? 'SESSION';
  const fixedSeed = simulationConfig.fixedSeed ?? 12345;
  const minTeamSalaryBenchmark =
    simulationConfig.minTeamSalaryBenchmark ?? sportConfig.salaryCap * 0.92;

  // Collect results
  const results: RunResult[] = [];
  let failed = 0;

  for (let i = 0; i < runs; i++) {
    const sessionId = `sim-${i}`;
    const seed = computeSeed(seedMode, fixedSeed, sessionId);

    try {
      const context: EngineContext = {
        sportConfig,
        players,
        gameLogs: allLogs,
        seed,
      };

      const engine = new FantasyEngine(context, dataProvider);

      // Run state flow
      engine.createSession(sessionId, 'football', seed);
      engine.initialDeal();
      // Hold none - skip toggleHold
      engine.finalDraw();
      engine.resolve();

      const session = engine.getSession();
      if (!session) {
        failed++;
        continue;
      }

      const resolutions = engine.getResolutions();

      // Collect metrics
      const totalSalary = session.roster.reduce(
        (sum, slot) => sum + (slot.player?.salary || 0),
        0
      );
      const filledCount = session.roster.filter((s) => s.player).length;

      const positionCounts: Record<string, number> = {};
      const tierCounts: Record<string, number> = {};
      let zeroFPCount = 0;

      for (const slot of session.roster) {
        if (slot.player) {
          positionCounts[slot.player.position] =
            (positionCounts[slot.player.position] || 0) + 1;
          if (slot.player.tier) {
            tierCounts[slot.player.tier] =
              (tierCounts[slot.player.tier] || 0) + 1;
          }
        }
      }

      for (const res of resolutions) {
        if (res.fantasyPoints === 0) {
          zeroFPCount++;
        }
      }

      const achievements: Record<string, number> = {};
      for (const res of resolutions) {
        for (const ach of res.triggeredAchievements) {
          achievements[ach.ruleId] = (achievements[ach.ruleId] || 0) + 1;
        }
      }

      results.push({
        teamFP: session.resolvedTeamFP ?? 0,
        totalSalary,
        filledCount,
        positionCounts,
        tierCounts,
        zeroFPCount,
        achievements,
        winResult: session.winResult,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Cannot fill slot')
      ) {
        failed++;
        continue;
      }
      throw error;
    }
  }

  // Calculate statistics
  const teamFPs = results.map((r) => r.teamFP);
  const salaries = results.map((r) => r.totalSalary);
  const sortedTeamFPs = [...teamFPs].sort((a, b) => a - b);
  const sortedSalaries = [...salaries].sort((a, b) => a - b);

  const completeLineups = results.filter(
    (r) => r.filledCount === sportConfig.maxPlayers
  ).length;
  const salaryAboveBenchmark = results.filter(
    (r) => r.totalSalary >= minTeamSalaryBenchmark
  ).length;
  const totalZeroFP = results.reduce((sum, r) => sum + r.zeroFPCount, 0);
  const wins = results.filter((r) => r.winResult === true).length;

  // Aggregate achievements
  const achievementCounts: Record<string, number> = {};
  for (const result of results) {
    for (const [ruleId, count] of Object.entries(result.achievements)) {
      achievementCounts[ruleId] = (achievementCounts[ruleId] || 0) + count;
    }
  }

  const topAchievements = Object.entries(achievementCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Print report
  console.log(`\n=== Simulation Report ===`);
  console.log(`Runs: ${runs}`);
  console.log(`Failed: ${failed}`);
  console.log(`Successful: ${results.length}\n`);

  console.log(`Team FP Statistics:`);
  console.log(`  Min: ${sortedTeamFPs[0]?.toFixed(2) ?? 0}`);
  console.log(`  Mean: ${mean(teamFPs).toFixed(2)}`);
  console.log(`  Median: ${median(teamFPs).toFixed(2)}`);
  console.log(`  P90: ${percentile(sortedTeamFPs, 0.9).toFixed(2)}`);
  console.log(`  P99: ${percentile(sortedTeamFPs, 0.99).toFixed(2)}`);
  console.log(`  StdDev: ${stddev(teamFPs).toFixed(2)}\n`);

  console.log(`Salary Usage:`);
  console.log(`  Min: $${sortedSalaries[0]?.toFixed(2) ?? 0}`);
  console.log(`  Mean: $${mean(salaries).toFixed(2)}`);
  console.log(`  Median: $${median(salaries).toFixed(2)}`);
  console.log(`  P10: $${percentile(sortedSalaries, 0.1).toFixed(2)}`);
  console.log(
    `  % >= Benchmark ($${minTeamSalaryBenchmark.toFixed(2)}): ${(
      (salaryAboveBenchmark / results.length) *
      100
    ).toFixed(2)}%\n`
  );

  console.log(
    `Complete Lineups: ${((completeLineups / results.length) * 100).toFixed(2)}%\n`
  );

  console.log(
    `Avg Zero FP Players per Lineup: ${(totalZeroFP / results.length).toFixed(2)}\n`
  );

  console.log(`Top 10 Achievements by Frequency:`);
  for (const [ruleId, count] of topAchievements) {
    console.log(`  ${ruleId}: ${count}`);
  }
  console.log('');

  console.log(
    `Win Rate: ${((wins / results.length) * 100).toFixed(2)}%\n`
  );
}
