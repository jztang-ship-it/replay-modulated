import type { Resolution } from '../../models';

export interface SimulationResult {
  run: number;
  teamFP: number;
  won: boolean;
  resolutions: Resolution[];
  achievementBonus: number;
  roster: any[];
}

export interface SimulationSummary {
  totalRuns: number;
  wins: number;
  losses: number;
  winRate: number;
  
  fpStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
    p25: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  achievementImpact: {
    avgBonus: number;
    maxBonus: number;
    percentWithBonus: number;
  };
  
  recommendations: {
    currentThresholds: number[];
    suggestedThresholds: number[];
    reasoning: string;
  };
}