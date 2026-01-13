/**
 * Football Sandbox Config - Minimal config for sandbox testing
 * Sport-agnostic configuration for football positions
 */

import { SportConfig } from '../models';

export const FootballSandboxConfig: SportConfig = {
  name: 'Football (Sandbox)',
  positions: ['FWD', 'MID', 'DEF', 'GK'],
  salaryCap: 100,
  minPlayers: 5,
  maxPlayers: 5,
  positionLimits: {
    FWD: { min: 1, max: 3 },
    MID: { min: 1, max: 3 },
    DEF: { min: 1, max: 3 },
    GK: { min: 1, max: 1 },
  },
  statCategories: ['goals', 'assists', 'shots'],
  projectionWeights: {
    goals: 6.0,
    assists: 4.0,
    shots: 0.5,
  },
  historicalLogFilters: {
    seasonsBack: 10,
    minMinutes: 1,
  },
  winCondition: {
    type: 'FIXED_THRESHOLD',
    thresholds: [
      { tier: 'BRONZE', minFP: 30 },
      { tier: 'SILVER', minFP: 50 },
      { tier: 'GOLD', minFP: 70 },
      { tier: 'PLATINUM', minFP: 90 },
      { tier: 'DIAMOND', minFP: 110 },
    ],
  },
  achievements: [],
};
