/**
 * Basketball sport configuration for iReplay
 * Defines all basketball-specific rules and settings
 */

import { SportConfig } from '../models';

export const BasketballConfig: SportConfig = {
  name: 'Basketball',
  positions: ['PG', 'SG', 'SF', 'PF', 'C'],
  salaryCap: 100,
  minPlayers: 5,
  maxPlayers: 5,
  positionLimits: {
    PG: { min: 1, max: 2 },
    SG: { min: 1, max: 2 },
    SF: { min: 1, max: 2 },
    PF: { min: 1, max: 2 },
    C: { min: 1, max: 1 },
  },
  statCategories: ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'],
  projectionWeights: {
    points: 1.0,
    rebounds: 1.2,
    assists: 1.5,
    steals: 3.0,
    blocks: 3.0,
    turnovers: -1.0,
  },
  historicalLogFilters: {
    seasonsBack: 10,
    minMinutes: 1, // At least 1 minute played
  },
  winCondition: {
    type: 'FIXED_THRESHOLD',
    thresholds: [
      { tier: 'BRONZE', minFP: 50 },
      { tier: 'SILVER', minFP: 75 },
      { tier: 'GOLD', minFP: 100 },
      { tier: 'PLATINUM', minFP: 125 },
      { tier: 'DIAMOND', minFP: 150 },
    ],
  },
  achievements: [],
};
