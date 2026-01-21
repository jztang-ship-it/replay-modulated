import { ResolutionEngine } from '../../engines/ResolutionEngine';
import { RandomEngine } from '../../engines/RandomEngine';
import { LineupGenerationEngine } from '../../engines/LineupGenerationEngine';
import type { SportConfig, GameLog } from '../../models';
import type { SimulationResult, SimulationSummary } from './SimulatorTypes';

export class Simulator {
  private config: SportConfig;
  private allLogs: GameLog[];
  private players: any[];
  private rosterSize: number;
  
  constructor(config: SportConfig, allLogs: GameLog[], players: any[], rosterSize: number = 6) {
    this.config = config;
    this.allLogs = allLogs;
    this.players = players;
    this.rosterSize = rosterSize;
  }
  
  async runSimulations(numRuns: number = 10000): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];
    const rng = new RandomEngine();
    
    for (let i = 0; i < numRuns; i++) {
      const roster = LineupGenerationEngine.generateDeterministicLineup(
        this.config,
        this.players,
        rng,
        []
      );
      
      const resolutions = ResolutionEngine.resolveTeamFP(
        roster,
        this.allLogs,
        this.config,
        rng
      );
      
      const teamFP = ResolutionEngine.calculateTeamFP(resolutions);
      const won = ResolutionEngine.evaluateWinCondition(teamFP, this.config);
      
      const achievementBonus = resolutions.reduce((sum, r) => sum + r.achievementBonus, 0);
      
      results.push({ 
        run: i + 1, 
        teamFP, 
        won, 
        resolutions, 
        achievementBonus,
        roster
      });
      
      if ((i + 1) % 1000 === 0) console.log(`${i + 1}/${numRuns}...`);
    }
    
    return results;
  }
  
  analyzeSummary(results: SimulationResult[]): SimulationSummary {
    const wins = results.filter(r => r.won).length;
    const fps = results.map(r => r.teamFP).sort((a, b) => a - b);
    const bonuses = results.map(r => r.achievementBonus);
    
    return {
      totalRuns: results.length,
      wins,
      losses: results.length - wins,
      winRate: wins / results.length,
      fpStats: {
        min: fps[0],
        max: fps[fps.length - 1],
        avg: fps.reduce((a, b) => a + b, 0) / fps.length,
        median: fps[Math.floor(fps.length * 0.5)],
        p25: fps[Math.floor(fps.length * 0.25)],
        p75: fps[Math.floor(fps.length * 0.75)],
        p90: fps[Math.floor(fps.length * 0.90)],
        p95: fps[Math.floor(fps.length * 0.95)],
        p99: fps[Math.floor(fps.length * 0.99)],
      },
      achievementImpact: {
        avgBonus: bonuses.reduce((a, b) => a + b, 0) / bonuses.length,
        maxBonus: Math.max(...bonuses),
        percentWithBonus: (bonuses.filter(b => b > 0).length / bonuses.length) * 100,
      },
      recommendations: {
        currentThresholds: this.getCurrentThresholds(),
        suggestedThresholds: this.suggestThresholds(fps),
        reasoning: this.generateReasoning(wins / results.length, fps),
      },
    };
  }

  private getCurrentThresholds(): number[] {
    const wc = (this.config as any).winCondition;
    return wc.type === 'FIXED_THRESHOLD' ? wc.thresholds.map((t: any) => t.minFP) : [];
  }

  private suggestThresholds(fps: number[]): number[] {
    const n = fps.length;
    return [
      Math.round(fps[Math.floor(n * 0.65)]),
      Math.round(fps[Math.floor(n * 0.85)]),
      Math.round(fps[Math.floor(n * 0.95)]),
      Math.round(fps[Math.floor(n * 0.99)]),
    ];
  }

  private generateReasoning(wr: number, fps: number[]): string {
    let msg = `Win rate: ${(wr * 100).toFixed(1)}%\n`;
    if (wr > 0.40) msg += '⚠️ TOO HIGH\n';
    else if (wr < 0.25) msg += '⚠️ TOO LOW\n';
    else msg += '✅ Good range\n';
    const s = this.suggestThresholds(fps);
    msg += `\nSmall: ${s[0]} | Med: ${s[1]} | Big: ${s[2]} | Jackpot: ${s[3]}`;
    return msg;
  }

  analyzePositions(results: SimulationResult[]): void {
    console.log('\n───────────────────────────────────────────────────────────');
    console.log('POSITION & SALARY VALIDATION:');
    console.log('───────────────────────────────────────────────────────────');
    
    for (let i = 0; i < Math.min(10, results.length); i++) {
      const roster = results[i].roster;
      const posCounts: Record<string, number> = { GK: 0, DE: 0, MD: 0, FW: 0 };
      let totalSalary = 0;
      
      roster.forEach((slot: any) => {
        if (slot.player) {
          posCounts[slot.player.position] = (posCounts[slot.player.position] || 0) + 1;
          totalSalary += slot.player.salary;
        }
      });
      
      const valid = posCounts.GK === 1 && posCounts.DE >= 1 && posCounts.MD >= 1 && posCounts.FW >= 1;
      const salaryOK = totalSalary >= 172 && totalSalary <= 180;
      
      console.log(`Run ${i + 1}: GK=${posCounts.GK} DE=${posCounts.DE} MD=${posCounts.MD} FW=${posCounts.FW} | $${totalSalary} | ${valid && salaryOK ? '✅' : '❌'}`);
    }
  }

  printSummary(s: SimulationSummary): void {
    console.log('\n=== SIMULATION SUMMARY ===\n');
    console.log('Runs: ' + s.totalRuns + ' | Wins: ' + s.wins + ' (' + (s.winRate*100).toFixed(1) + '%)');
    console.log('\nFP: min=' + s.fpStats.min.toFixed(1) + ' avg=' + s.fpStats.avg.toFixed(1) + ' max=' + s.fpStats.max.toFixed(1));
    console.log('P50=' + s.fpStats.median.toFixed(1) + ' P90=' + s.fpStats.p90.toFixed(1) + ' P99=' + s.fpStats.p99.toFixed(1));
    console.log('\nAchievements: avg=' + s.achievementImpact.avgBonus.toFixed(1) + ' max=' + s.achievementImpact.maxBonus.toFixed(1));
    console.log('\n' + s.recommendations.reasoning + '\n');
  }
}