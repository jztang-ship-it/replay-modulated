// src/engine/ResolutionEngine.ts
/**
 * ResolutionEngine - Resolves team fantasy points and evaluates win conditions
 * Sport-agnostic resolution using config-driven rules
 */

import {
  Player,
  GameLog,
  SportConfig,
  Resolution,
  GameSession,
  RosterSlot,
  WinCondition,
} from "../models";
import { RandomEngine } from "./RandomEngine";
import { ProjectionEngine } from "./ProjectionEngine";
import { GameLogFilterEngine } from "./GameLogFilterEngine";
import { AchievementEngine } from "./AchievementEngine";

// NEW: objective football scoring (single source of truth)
import {
  computeFootballObjectiveFP,
} from "./footballObjectiveScoring";

export class ResolutionEngine {
  static resolveTeamFP(
    roster: RosterSlot[],
    allLogs: GameLog[],
    config: SportConfig,
    rng: RandomEngine,
    maxMulligans: number = 100
  ): Resolution[] {
    const resolutions: Resolution[] = [];
    const players = roster.filter((slot) => slot.player).map((slot) => slot.player!);

    for (const player of players) {
      let selectedLog: GameLog | null = null;
      let attempts = 0;

      while (attempts < maxMulligans && !selectedLog) {
        const eligibleLogs = GameLogFilterEngine.getEligibleLogs(player, allLogs, config);

        if (eligibleLogs.length === 0) break;

        selectedLog = rng.randomChoice(eligibleLogs);
        attempts++;
      }

      if (!selectedLog) {
        const zeroStats: Record<string, number> = {};
        for (const category of config.statCategories) zeroStats[category] = 0;
        const zeroEvents: Record<string, number> = {};

        const achievementResult = AchievementEngine.evaluateAchievements(
          {
            playerId: player.id,
            stats: zeroStats,
            events: zeroEvents,
            gameDate: new Date().toISOString(),
          } as any,
          (config as any).achievements
        );

        resolutions.push({
          playerId: player.id,
          actualStats: zeroStats,
          actualEvents: zeroEvents,
          baseFantasyPoints: 0,
          achievementBonus: achievementResult.totalBonus,
          fantasyPoints: 0 + achievementResult.totalBonus,
          triggeredAchievements: achievementResult.triggeredAchievements,
        });
        continue;
      }

      // -------------------------------
      // BASE FP:
      // If this is football, recompute from objective stats (NOT total_points).
      // Otherwise, use generic ProjectionEngine.calculateFantasyPoints.
      // -------------------------------
      let baseFantasyPoints = 0;

      const sportId = String((config as any).sportId ?? "");
      const isFootball = sportId.includes("football");

      if (isFootball) {
        baseFantasyPoints = computeFootballObjectiveFP((selectedLog as any).stats).fp;
      } else {
        baseFantasyPoints = ProjectionEngine.calculateFantasyPoints((selectedLog as any).stats, config);
      }

      const achievementResult = AchievementEngine.evaluateAchievements(selectedLog as any, (config as any).achievements);

      const finalFantasyPoints = AchievementEngine.applyAchievementsToFP(
        baseFantasyPoints,
        achievementResult.triggeredAchievements
      );

      resolutions.push({
        playerId: player.id,
        actualStats: (selectedLog as any).stats,
        actualEvents: (selectedLog as any).events || {},
        baseFantasyPoints,
        achievementBonus: achievementResult.totalBonus,
        fantasyPoints: finalFantasyPoints,
        triggeredAchievements: achievementResult.triggeredAchievements,
      });
    }

    return resolutions;
  }

  static calculateTeamFP(resolutions: Resolution[]): number {
    return resolutions.reduce((sum, res) => sum + res.fantasyPoints, 0);
  }

  static evaluateWinCondition(teamFP: number, config: SportConfig, opponentFP?: number): boolean {
    const winCondition = (config as any).winCondition as WinCondition;

    switch (winCondition.type) {
      case "FIXED_THRESHOLD": {
        const sortedThresholds = [...winCondition.thresholds].sort((a, b) => b.minFP - a.minFP);
        for (const threshold of sortedThresholds) if (teamFP >= threshold.minFP) return true;
        return false;
      }
      case "HEAD_TO_HEAD": {
        if (opponentFP === undefined) {
          throw new Error("HEAD_TO_HEAD win condition requires opponentFP parameter");
        }
        return teamFP > opponentFP;
      }
      default: {
        const _exhaustive: never = winCondition as never;
        throw new Error(`Unknown win condition type: ${_exhaustive}`);
      }
    }
  }

  static resolveAndEvaluate(
    session: GameSession,
    allLogs: GameLog[],
    config: SportConfig,
    rng: RandomEngine,
    opponentFP?: number
  ): { resolutions: Resolution[]; teamFP: number; winResult: boolean } {
    const resolutions = this.resolveTeamFP(session.roster, allLogs, config, rng);
    const teamFP = this.calculateTeamFP(resolutions);
    const winResult = this.evaluateWinCondition(teamFP, config, opponentFP);

    return { resolutions, teamFP, winResult };
  }
}
