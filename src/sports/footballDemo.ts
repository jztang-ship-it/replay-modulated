// src/sports/footballDemo.ts
import type { SportConfig } from "../models";

/**
 * FootballDemoSportConfig (Objective-only; uses your SportConfig interface)
 *
 * IMPORTANT:
 * - Your engine scorer reads `statCategories` and `projectionWeights`.
 * - Your EPL logs are snake_case in stats, so we keep snake_case here.
 * - This config is for the ENGINE (sim / sandbox / scripts).
 */
export const FootballDemoSportConfig: SportConfig = {
  name: "football-demo",

  // Core roster constraints (engine side)
  positions: ["GK", "DEF", "MID", "FWD"],
  salaryCap: 150,
  minPlayers: 6,
  maxPlayers: 6,

  // Exactly 6 players:
  // 1 GK required, at least 1 DEF/MID/FWD, remaining 2 are FLEX (DEF/MID/FWD)
  positionLimits: {
    GK: { min: 1, max: 1 },
    DEF: { min: 1, max: 5 },
    MID: { min: 1, max: 5 },
    FWD: { min: 1, max: 5 },
  },

  // Objective-only stat keys (match your log.stats keys)
  statCategories: [
    "minutes",
    "goals_scored",
    "assists",
    "clean_sheets",
    "goals_conceded",
    "saves",
    "yellow_cards",
    "red_cards",
    "penalties_missed",
    "penalties_saved",
    "own_goals",
  ],

  // Weights used by ProjectionEngine.calculateFantasyPoints
  projectionWeights: {
    minutes: 0.02,
    goals_scored: 6.0,
    assists: 4.0,
    clean_sheets: 4.0,
    goals_conceded: -0.5,
    saves: 1.8,
    yellow_cards: -1.0,
    red_cards: -3.0,
    penalties_missed: -2.0,
    penalties_saved: 5.0,
    own_goals: -2.0,
  },

  // Filters used by GameLogFilterEngine
  historicalLogFilters: {
    seasonsBack: 3,
    minMinutes: 1, // you decided: 1 minute, not 10
  },

  // Keep something simple so engine runs
  winCondition: {
    type: "FIXED_THRESHOLD",
    thresholds: [
      { tier: "SMALL", minFP: 35 },
      { tier: "MEDIUM", minFP: 45 },
      { tier: "BIG", minFP: 55 },
      { tier: "HUGE", minFP: 70 },
      { tier: "JACKPOT", minFP: 82 },
    ],
  },

  // Achievements can be empty while you stabilize scoring
  achievements: [],

  // Optional knobs (if your lineup engine reads them)
  lineupGenerationMode: "STRICT",
  requiredPositions: ["GK", "DEF", "MID", "FWD"],
  anchorStrategy: {
    mode: "ONE_ORANGE_OR_TWO_PURPLE",
    // you can later set minTotalSalary: 140 (or similar) to prevent tiny lineups
  },
};
