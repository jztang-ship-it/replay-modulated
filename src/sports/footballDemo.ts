// src/sports/footballDemo.ts
import { SportConfig } from '../models';
import { FootballAchievements } from './achievements/footballAchievements';

export const FootballDemoSportConfig: SportConfig = {
  name: 'Football (Soccer) - Demo',
  positions: ['FWD', 'MID', 'DEF', 'GK'],
  salaryCap: 150,
  minPlayers: 6,
  maxPlayers: 6,
  positionLimits: {
    GK: { min: 1, max: 1 },
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

  // ✅ IMPORTANT: These keys must exactly match your processed-epl-cards game logs stats keys.
  // FPL-derived keys are camelCase in your pipeline.
  statCategories: [
    'minutes',
    'goals',
    'assists',

    'cleanSheets',
    'goalsConceded',
    'saves',

    'yellowCards',
    'redCards',

    // FPL signal stats (hugely improves separation across positions)
    'bonus',
    'bps',
    'influence',
    'creativity',
    'threat',
    'ictIndex',
  ],

  // Starting weights (calibration pass #1)
  // Goal: make “elite” cards in each position have a comparable *expected FP band*.
  projectionWeights: {
    minutes: 0.0166667, // ~0.5 per 30 mins

    goals: 8.0,
    assists: 6.0,

    cleanSheets: 4.0,     // boosts DEF/GK
    saves: 1.8,           // GK consistency
    goalsConceded: -0.5,  // softer penalty than -1.0 to avoid GK/DEF being nuked

    yellowCards: -2.0,
    redCards: -6.0,

    bonus: 1.0,           // FPL bonus is very informative
    bps: 0.04,            // tune based on distribution
    influence: 0.08,
    creativity: 0.08,
    threat: 0.08,
    ictIndex: 0.25,       // ictIndex is usually smaller scale; weight higher
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
