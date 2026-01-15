import { SportConfig, EngineContext, GameLog } from '../models';
import { DataProvider } from '../data/DataProvider';
import { FantasyEngine } from '../engine/FantasyEngine';
import { mean, median, stddev, percentile } from '../utils/stats';
import { computeSeed, SeedMode } from '../utils/seed';

function fingerprintUnordered(roster: any[], mode: "card" | "base" = "card"): string {
  const ids = roster
    .filter((s) => s?.player)
    .map((s) => (mode === "base" ? (s.player.basePlayerId ?? s.player.id) : s.player.id))
    .sort();
  return ids.join("|");
}

function fingerprintOrdered(roster: any[], mode: "card" | "base" = "card"): string {
  const ids = roster.map((s) => {
    if (!s?.player) return "EMPTY";
    return mode === "base" ? (s.player.basePlayerId ?? s.player.id) : s.player.id;
  });
  return ids.join("|");
}


export type SimulationConfig = {
  runs: number;
  seedMode: SeedMode;
  fixedSeed?: number;
  progressEvery?: number;
  watchdogMs?: number;
  minTeamSalaryBenchmark?: number;
  slotPercentiles?: {
    small: number;
    medium: number;
    big: number;
    huge: number;
    jackpot: number;
  };
  payouts?: {
    small: number;
    medium: number;
    big: number;
    huge: number;
    jackpot: number;
  };
  nearMissDelta?: number;
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
  playerIds: string[];
  playerIdsSet: string[];
}

export async function runSimulation(params: {
  sportConfig: SportConfig;
  dataProvider: DataProvider;
  simulationConfig?: Partial<SimulationConfig>;
}): Promise<void> {
  const { sportConfig, dataProvider, simulationConfig = {} } = params;

  const runs = simulationConfig.runs ?? 10000;
  const seedMode = simulationConfig.seedMode ?? 'SESSION';
  const fixedSeed = simulationConfig.fixedSeed ?? 12345;
  const progressEvery = simulationConfig.progressEvery ?? 250;
  const watchdogMs = simulationConfig.watchdogMs ?? 5000;

  const minTeamSalaryBenchmark = simulationConfig.minTeamSalaryBenchmark ?? sportConfig.salaryCap * 0.92;

  const slotPercentiles = simulationConfig.slotPercentiles ?? {
    small: 0.55,
    medium: 0.8,
    big: 0.93,
    huge: 0.99,
    jackpot: 0.999,
  };

  const payouts = simulationConfig.payouts ?? {
    small: 0.6,
    medium: 1.8,
    big: 5,
    huge: 18,
    jackpot: 75,
  };

  const nearMissDelta = simulationConfig.nearMissDelta ?? 10;

  const t0 = Date.now();
  const players = await dataProvider.getPlayers('football');

  const allLogs: GameLog[] = [];
  for (const player of players) {
    const playerLogs = await dataProvider.getGameLogs(player.id, {
      seasonsBack: 10,
      minMinutes: 1,
    });
    allLogs.push(...playerLogs);
  }
  const t1 = Date.now();
  console.log(`Loaded ${players.length} players, ${allLogs.length} logs in ${((t1 - t0) / 1000).toFixed(2)}s\n`);

  const results: RunResult[] = [];
  let failed = 0;
  let lastProgressAt = Date.now();

  for (let i = 0; i < runs; i++) {
    if (i % progressEvery === 0) {
      const now = Date.now();
      const dt = ((now - lastProgressAt) / 1000).toFixed(2);
      console.log(`sim progress: ${i}/${runs} (+${dt}s)`);
      lastProgressAt = now;
    }

    const sessionId = `sim-${i}`;
    const seed = computeSeed(seedMode, fixedSeed, sessionId);

    const watchdog = setTimeout(() => {
      console.log(`⚠️ watchdog: run ${i}/${runs} is slow (seed=${seed})`);
    }, watchdogMs);

    try {
      const context: EngineContext = { sportConfig, players, gameLogs: allLogs, seed };
      const engine = new FantasyEngine(context, dataProvider);

      engine.createSession(sessionId, 'football', seed);
      engine.initialDeal();
      engine.finalDraw();
      engine.resolve();

      const session = engine.getSession();
      if (!session) { failed++; clearTimeout(watchdog); continue; }

      const resolutions = engine.getResolutions();

      // FIXED: Derive Team FP from resolutions to ensure consistency
      const teamFP = resolutions.reduce((sum, res) => sum + res.fantasyPoints, 0);

      const totalSalary = session.roster.reduce((sum, slot) => sum + (slot.player?.salary || 0), 0);
      const filledCount = session.roster.filter((s) => s.player).length;

      const positionCounts: Record<string, number> = {};
      const tierCounts: Record<string, number> = {};
      let zeroFPCount = 0;
      const playerIdsOrdered: string[] = [];
      const playerIdsUnordered: string[] = [];

      for (const slot of session.roster) {
        if (slot.player) {
          playerIdsOrdered.push(slot.player.id);
          playerIdsUnordered.push(slot.player.id);
          positionCounts[slot.player.position] = (positionCounts[slot.player.position] || 0) + 1;
          if (slot.player.tier) {
            tierCounts[slot.player.tier] = (tierCounts[slot.player.tier] || 0) + 1;
          }
        }
      }

      for (const res of resolutions) {
        if (res.fantasyPoints === 0) zeroFPCount++;
      }

      const achievements: Record<string, number> = {};
      for (const res of resolutions) {
        for (const ach of res.triggeredAchievements) {
          achievements[ach.ruleId] = (achievements[ach.ruleId] || 0) + 1;
        }
      }

      playerIdsUnordered.sort();

      results.push({
        teamFP, // Using our summed value
        totalSalary,
        filledCount,
        positionCounts,
        tierCounts,
        zeroFPCount,
        achievements,
        winResult: session.winResult,
        playerIds: playerIdsOrdered,
        playerIdsSet: playerIdsUnordered,
      });

      clearTimeout(watchdog);
    } catch (error) {
      clearTimeout(watchdog);
      failed++;
    }
  }

  // --- STATS CALCULATION (Exactly as you had it) ---
  const teamFPs = results.map((r) => r.teamFP);
  const salaries = results.map((r) => r.totalSalary);
  const sortedTeamFPs = [...teamFPs].sort((a, b) => a - b);
  const sortedSalaries = [...salaries].sort((a, b) => a - b);

  const completeLineups = results.filter((r) => r.filledCount === sportConfig.maxPlayers).length;
  const salaryAboveBenchmark = results.filter((r) => r.totalSalary >= minTeamSalaryBenchmark).length;
  const totalZeroFP = results.reduce((sum, r) => sum + r.zeroFPCount, 0);
  const wins = results.filter((r) => r.winResult === true).length;

  const achievementCounts: Record<string, number> = {};
  for (const result of results) {
    for (const [ruleId, count] of Object.entries(result.achievements)) {
      achievementCounts[ruleId] = (achievementCounts[ruleId] || 0) + count;
    }
  }
  const topAchievements = Object.entries(achievementCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const pSmall = percentile(sortedTeamFPs, slotPercentiles.small);
  const pMed = percentile(sortedTeamFPs, slotPercentiles.medium);
  const pBig = percentile(sortedTeamFPs, slotPercentiles.big);
  const pHuge = percentile(sortedTeamFPs, slotPercentiles.huge);
  const pJack = percentile(sortedTeamFPs, slotPercentiles.jackpot);

  const hitRate = (line: number) => results.filter((r) => r.teamFP >= line).length / Math.max(1, results.length);

  const nearMissLow = pSmall - nearMissDelta;
  const nearMissRate = results.filter((r) => r.teamFP >= nearMissLow && r.teamFP < pSmall).length / Math.max(1, results.length);

  const bandRates = {
    LOSS: results.filter((r) => r.teamFP < pSmall).length / results.length,
    SMALL: results.filter((r) => r.teamFP >= pSmall && r.teamFP < pMed).length / results.length,
    MEDIUM: results.filter((r) => r.teamFP >= pMed && r.teamFP < pBig).length / results.length,
    BIG: results.filter((r) => r.teamFP >= pBig && r.teamFP < pHuge).length / results.length,
    HUGE: results.filter((r) => r.teamFP >= pHuge && r.teamFP < pJack).length / results.length,
    JACKPOT: results.filter((r) => r.teamFP >= pJack).length / results.length,
  };

  const rtp = bandRates.SMALL * payouts.small + bandRates.MEDIUM * payouts.medium + bandRates.BIG * payouts.big + bandRates.HUGE * payouts.huge + bandRates.JACKPOT * payouts.jackpot;

  const uniqueUnordered = new Set(results.map((r) => r.playerIdsSet.join(','))).size;
  const uniqueOrdered = new Set(results.map((r) => r.playerIds.join(','))).size;

  const pickCounts: Record<string, number> = {};
  let totalPicks = 0;
  for (const r of results) {
    for (const id of r.playerIds) {
      pickCounts[id] = (pickCounts[id] || 0) + 1;
      totalPicks++;
    }
  }
  const hhi = Object.values(pickCounts).map((c) => c / Math.max(1, totalPicks)).reduce((sum, p) => sum + p * p, 0) || 0;
  const effectivePool = hhi > 0 ? 1 / hhi : 0;

  const topPicks = Object.entries(pickCounts).sort((a, b) => b[1] - a[1]).slice(0, 50);

  // --- REPORTING ---
  console.log(`\n=== Simulation Report ===`);
  console.log(`Runs: ${runs} | Failed: ${failed} | Successful: ${results.length}\n`);

  console.log(`Team FP Statistics:`);
  console.log(`  Min: ${sortedTeamFPs[0]?.toFixed(2) ?? 0} | Mean: ${mean(teamFPs).toFixed(2)} | Median: ${median(teamFPs).toFixed(2)}`);
  console.log(`  P90: ${percentile(sortedTeamFPs, 0.9).toFixed(2)} | P99: ${percentile(sortedTeamFPs, 0.99).toFixed(2)} | StdDev: ${stddev(teamFPs).toFixed(2)}\n`);

  console.log(`Salary Usage:`);
  console.log(`  Mean: $${mean(salaries).toFixed(2)} | % >= Benchmark: ${((salaryAboveBenchmark / results.length) * 100).toFixed(2)}%\n`);

  console.log(`Diversity Checks:`);
  console.log(`  Unique lineups (unordered): ${uniqueUnordered} (${((uniqueUnordered / results.length) * 100).toFixed(2)}%)`);
  console.log(`  Effective player pool: ${effectivePool.toFixed(1)}\n`);

  console.log(`Suggested "Slot Lines":`);
  console.log(`  Small:  FP >= ${pSmall.toFixed(2)} | Medium: FP >= ${pMed.toFixed(2)} | Big: FP >= ${pBig.toFixed(2)}`);
  console.log(`  Huge:   FP >= ${pHuge.toFixed(2)} | Jackpot: FP >= ${pJack.toFixed(2)}\n`);

  console.log(`RTP (Return To Player): ${(rtp * 100).toFixed(2)}%\n`);

  console.log(`Top 10 Achievements:`);
  topAchievements.forEach(([id, count]) => console.log(`  ${id}: ${count}`));
}