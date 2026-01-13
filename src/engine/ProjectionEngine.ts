/**
 * ProjectionEngine - Generates fantasy point projections based on historical data
 * Uses sport-agnostic stat categories and weights from SportConfig
 */

import { Player, GameLog, SportConfig, Projection } from '../models';
import { RandomEngine } from './RandomEngine';

export class ProjectionEngine {
  /**
   * Generate projections for a list of players based on historical game logs
   * Uses weighted average of recent performance with some randomization
   */
  static generateProjections(
    players: Player[],
    gameLogs: GameLog[],
    config: SportConfig,
    rng: RandomEngine
  ): Projection[] {
    return players.map((player) => {
      const playerLogs = gameLogs.filter((log) => log.playerId === player.id);

      if (playerLogs.length === 0) {
        // No historical data - return zero projection
        return this.createZeroProjection(player.id, config);
      }

      // Calculate average stats from historical data
      const avgStats: Record<string, number> = {};
      for (const category of config.statCategories) {
        const values = playerLogs
          .map((log) => log.stats[category] || 0)
          .filter((v) => v !== undefined);
        const avg = values.length > 0
          ? values.reduce((sum, val) => sum + val, 0) / values.length
          : 0;
        avgStats[category] = avg;
      }

      // Add small random variance (±10%) for realism
      const projectedStats: Record<string, number> = {};
      for (const category of config.statCategories) {
        const variance = 1.0 + (rng.random() - 0.5) * 0.2; // ±10%
        projectedStats[category] = Math.round(avgStats[category] * variance * 10) / 10;
      }

      // Calculate projected fantasy points using weights
      const projectedPoints = this.calculateFantasyPoints(
        projectedStats,
        config
      );

      return {
        playerId: player.id,
        projectedStats,
        projectedPoints,
      };
    });
  }

  /**
   * Calculate fantasy points from stats using config weights
   */
  static calculateFantasyPoints(
    stats: Record<string, number>,
    config: SportConfig
  ): number {
    let points = 0;
    for (const category of config.statCategories) {
      const value = stats[category] || 0;
      const weight = config.projectionWeights[category] || 0;
      points += value * weight;
    }
    return Math.round(points * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Create a zero projection for a player with no historical data
   */
  private static createZeroProjection(
    playerId: string,
    config: SportConfig
  ): Projection {
    const zeroStats: Record<string, number> = {};
    for (const category of config.statCategories) {
      zeroStats[category] = 0;
    }

    return {
      playerId,
      projectedStats: zeroStats,
      projectedPoints: 0,
    };
  }

  /**
   * Get projection for a specific player
   */
  static getPlayerProjection(
    playerId: string,
    projections: Projection[]
  ): Projection | undefined {
    return projections.find((p) => p.playerId === playerId);
  }
}
