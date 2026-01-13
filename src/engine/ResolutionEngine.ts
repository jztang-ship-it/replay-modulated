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
} from '../models';
import { RandomEngine } from './RandomEngine';
import { ProjectionEngine } from './ProjectionEngine';
import { GameLogFilterEngine } from './GameLogFilterEngine';
import { AchievementEngine } from './AchievementEngine';

export class ResolutionEngine {
  /**
   * Resolve team fantasy points by selecting one eligible log per player
   * Returns array of resolutions with actual stats and FP
   */
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

      // Try to find an eligible log (with mulligan support)
      while (attempts < maxMulligans && !selectedLog) {
        const eligibleLogs = GameLogFilterEngine.getEligibleLogs(
          player,
          allLogs,
          config
        );

        if (eligibleLogs.length === 0) {
          // No eligible logs - use zero stats
          break;
        }

        // Select uniformly random eligible log
        selectedLog = rng.randomChoice(eligibleLogs);
        attempts++;
      }

      if (!selectedLog) {
        // No eligible log found - create zero resolution
        const zeroStats: Record<string, number> = {};
        for (const category of config.statCategories) {
          zeroStats[category] = 0;
        }
        const zeroEvents: Record<string, number> = {};
        
        // Evaluate achievements (will return empty array if no rules match)
        const achievementResult = AchievementEngine.evaluateAchievements(
          {
            playerId: player.id,
            stats: zeroStats,
            events: zeroEvents,
            gameDate: new Date().toISOString(),
          },
          config.achievements
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

      // Calculate base fantasy points from selected log stats
      const baseFantasyPoints = ProjectionEngine.calculateFantasyPoints(
        selectedLog.stats,
        config
      );

      // Evaluate achievements
      const achievementResult = AchievementEngine.evaluateAchievements(
        selectedLog,
        config.achievements
      );

      // Apply achievements to base FP
      const finalFantasyPoints = AchievementEngine.applyAchievementsToFP(
        baseFantasyPoints,
        achievementResult.triggeredAchievements
      );

      resolutions.push({
        playerId: player.id,
        actualStats: selectedLog.stats,
        actualEvents: selectedLog.events || {},
        baseFantasyPoints,
        achievementBonus: achievementResult.totalBonus,
        fantasyPoints: finalFantasyPoints,
        triggeredAchievements: achievementResult.triggeredAchievements,
      });
    }

    return resolutions;
  }

  /**
   * Calculate total team fantasy points from resolutions
   */
  static calculateTeamFP(resolutions: Resolution[]): number {
    return resolutions.reduce((sum, res) => sum + res.fantasyPoints, 0);
  }

  /**
   * Evaluate win condition based on team FP
   */
  static evaluateWinCondition(
    teamFP: number,
    config: SportConfig,
    opponentFP?: number
  ): boolean {
    const winCondition = config.winCondition;

    switch (winCondition.type) {
      case 'FIXED_THRESHOLD': {
        // Check if teamFP meets any threshold
        // For MVP, returns true if meets highest threshold
        const sortedThresholds = [...winCondition.thresholds].sort(
          (a, b) => b.minFP - a.minFP
        );

        for (const threshold of sortedThresholds) {
          if (teamFP >= threshold.minFP) {
            return true;
          }
        }
        return false;
      }

      case 'HEAD_TO_HEAD': {
        if (opponentFP === undefined) {
          throw new Error(
            'HEAD_TO_HEAD win condition requires opponentFP parameter'
          );
        }
        return teamFP > opponentFP;
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = winCondition;
        throw new Error(`Unknown win condition type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Resolve and evaluate in one call (convenience method)
   */
  static resolveAndEvaluate(
    session: GameSession,
    allLogs: GameLog[],
    config: SportConfig,
    rng: RandomEngine,
    opponentFP?: number
  ): {
    resolutions: Resolution[];
    teamFP: number;
    winResult: boolean;
  } {
    const resolutions = this.resolveTeamFP(
      session.roster,
      allLogs,
      config,
      rng
    );
    const teamFP = this.calculateTeamFP(resolutions);
    const winResult = this.evaluateWinCondition(teamFP, config, opponentFP);

    return {
      resolutions,
      teamFP,
      winResult,
    };
  }
}
