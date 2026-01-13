/**
 * FootballDemoSportConfig - DEMO / MVP ONLY
 * 
 * This config is designed for sandbox/demo purposes with small datasets.
 * It relaxes roster and position constraints to allow testing with limited player pools.
 * 
 * ⚠️ WARNING: This is NOT for production use.
 * ⚠️ Safe to delete once full datasets are available.
 * 
 * Key differences from FootballSportConfig:
 * - maxPlayers: 3 (allows smaller datasets)
 * - All position minimums: 0 (no mandatory positions)
 */

import { SportConfig } from '../models';
import { FootballAchievements } from './achievements/footballAchievements';

export const FootballDemoSportConfig: SportConfig = {
  name: 'Football (Soccer) - Demo',
  positions: ['FWD', 'MID', 'DEF', 'GK'],
  salaryCap: 120,
  minPlayers: 6,
  maxPlayers: 6,
  positionLimits: {
    GK: { min: 1, max: 2 },
    FWD: { min: 1, max: 4 },
    MID: { min: 1, max: 4 },
    DEF: { min: 1, max: 4 },
  },
  lineupGenerationMode: 'RELAXED',
  requiredPositions: ['GK', 'DEF', 'MID', 'FWD'],
  anchorStrategy: {
    mode: 'ONE_ORANGE_OR_TWO_PURPLE',
    minTotalSalary: 110,
  },
  statCategories: [
    'minutes',
    'goals',
    'assists',
    'shots',
    'shots_on_target',
    'key_passes',
    'passes_completed',
    'tackles_won',
    'interceptions',
    'blocks',
    'saves',
    'goals_conceded',
    'yellow_cards',
    'red_cards',
  ],
  projectionWeights: {
    minutes: 0.0166667, // 0.5 per 30 minutes
    goals: 8.0,
    assists: 6.0,
    shots: 0.8,
    shots_on_target: 1.2,
    key_passes: 2.0,
    passes_completed: 0.04, // 1 per 25 passes
    tackles_won: 1.5,
    interceptions: 1.5,
    blocks: 2.0,
    saves: 2.0,
    goals_conceded: -1.0, // Only meaningful for GK/DEF
    yellow_cards: -2.0,
    red_cards: -6.0,
  },
  historicalLogFilters: {
    seasonsBack: 10,
    minMinutes: 1,
  },
  winCondition: {
    type: 'FIXED_THRESHOLD',
    thresholds: [
      { tier: 'BRONZE', minFP: 20 },
      { tier: 'SILVER', minFP: 35 },
      { tier: 'GOLD', minFP: 50 },
    ],
  },
  achievements: FootballAchievements,
};
