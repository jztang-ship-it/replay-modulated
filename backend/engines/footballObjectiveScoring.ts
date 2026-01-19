// src/engine/footballObjectiveScoring.ts
/**
 * Objective-only football scoring from FPL-style logs.
 *
 * We intentionally ignore derived indices (influence/creativity/threat/ict/bps/xP/expected_*).
 *
 * This module is meant to be the single source of truth used by:
 * - Engine (ResolutionEngine)
 * - UI (engineAdapter)
 */

export type FootballObjectiveStats = {
    minutes: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    goalsConceded: number;
    saves: number;
    yellowCards: number;
    redCards: number;
    penaltiesMissed: number;
    penaltiesSaved: number;
    ownGoals: number;
  };
  
  export type FootballObjectiveWeights = FootballObjectiveStats;
  
  export const DEFAULT_FOOTBALL_OBJECTIVE_WEIGHTS: FootballObjectiveWeights = {
    minutes: 0.02,        // 90 mins => 1.8
    goals: 6.0,           // big positive
    assists: 4.0,
    cleanSheets: 4.0,     // GK/DEF benefit most; we keep it simple for now
    goalsConceded: -0.5,  // mild penalty
    saves: 1.8,
    yellowCards: -1.0,
    redCards: -3.0,
    penaltiesMissed: -2.0,
    penaltiesSaved: 5.0,
    ownGoals: -2.0,
  };
  
  function n(x: any): number {
    const v = typeof x === "number" ? x : Number(x);
    return Number.isFinite(v) ? v : 0;
  }
  
  /**
   * Map your snake_case log.stats keys -> canonical objective keys
   */
  export function normalizeFootballObjectiveStats(raw: Record<string, any> | undefined | null): FootballObjectiveStats {
    const s = raw ?? {};
  
    // Your logs use snake_case:
    // minutes, goals_scored, assists, clean_sheets, goals_conceded, saves, yellow_cards, red_cards, penalties_*, own_goals
    return {
      minutes: n(s.minutes),
      goals: n(s.goals_scored ?? s.goals),
      assists: n(s.assists),
      cleanSheets: n(s.clean_sheets ?? s.cleanSheets),
      goalsConceded: n(s.goals_conceded ?? s.goalsConceded),
      saves: n(s.saves),
      yellowCards: n(s.yellow_cards ?? s.yellowCards),
      redCards: n(s.red_cards ?? s.redCards),
      penaltiesMissed: n(s.penalties_missed ?? s.penaltiesMissed),
      penaltiesSaved: n(s.penalties_saved ?? s.penaltiesSaved),
      ownGoals: n(s.own_goals ?? s.ownGoals),
    };
  }
  
  /**
   * Compute fantasy points from objective-only stats using a linear weighted sum.
   * Returns unscaled FP (small-ish numbers). If you want a “bigger feel”, multiply by UI_DISPLAY_MULT (e.g. 10).
   */
  export function computeFootballObjectiveFP(
    rawStats: Record<string, any> | undefined | null,
    weights: FootballObjectiveWeights = DEFAULT_FOOTBALL_OBJECTIVE_WEIGHTS
  ): {
    fp: number;
    stats: FootballObjectiveStats;
    breakdown: Record<keyof FootballObjectiveStats, number>;
  } {
    const stats = normalizeFootballObjectiveStats(rawStats);
  
    const breakdown = {
      minutes: stats.minutes * weights.minutes,
      goals: stats.goals * weights.goals,
      assists: stats.assists * weights.assists,
      cleanSheets: stats.cleanSheets * weights.cleanSheets,
      goalsConceded: stats.goalsConceded * weights.goalsConceded,
      saves: stats.saves * weights.saves,
      yellowCards: stats.yellowCards * weights.yellowCards,
      redCards: stats.redCards * weights.redCards,
      penaltiesMissed: stats.penaltiesMissed * weights.penaltiesMissed,
      penaltiesSaved: stats.penaltiesSaved * weights.penaltiesSaved,
      ownGoals: stats.ownGoals * weights.ownGoals,
    } satisfies Record<keyof FootballObjectiveStats, number>;
  
    let fp = 0;
    for (const v of Object.values(breakdown)) fp += v;
  
    // keep 2 decimals deterministic
    fp = Math.round(fp * 100) / 100;
  
    return { fp, stats, breakdown };
  }
  