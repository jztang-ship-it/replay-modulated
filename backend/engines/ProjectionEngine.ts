// src/engine/ProjectionEngine.ts
/**
 * ProjectionEngine
 *
 * For "go-live testing":
 * - Projections = deterministic season averages from logs (no randomness)
 * - Fantasy Points = weighted sum over objective statCategories
 */

import type { Player, GameLog, SportConfig, Projection } from "../models";

export class ProjectionEngine {
  /**
   * Deterministic projections:
   * For each player, average each statCategory across eligible logs.
   * ProjectedPoints is computed from projectedStats using calculateFantasyPoints.
   */
  static generateProjections(
    players: Player[],
    gameLogs: GameLog[],
    config: SportConfig
  ): Projection[] {
    return players.map((player) => {
      const playerLogs = gameLogs.filter((log) => log.playerId === player.id);

      if (playerLogs.length === 0) {
        return this.createZeroProjection(player.id, config);
      }

      const avgStats: Record<string, number> = {};
      for (const category of config.statCategories) {
        const vals = playerLogs.map((l) => {
          const v = l.stats?.[category];
          return typeof v === "number" && Number.isFinite(v) ? v : 0;
        });

        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        avgStats[category] = avg;
      }

      const projectedPoints = this.calculateFantasyPoints(avgStats, config);

      return {
        playerId: player.id,
        projectedStats: avgStats,
        projectedPoints,
      };
    });
  }

  /**
   * Weighted sum:
   * FP = Σ stats[category] * projectionWeights[category]
   * (Your SportConfig uses projectionWeights as the canonical weights field.)
   */
  static calculateFantasyPoints(stats: Record<string, number>, config: SportConfig): number {
    let points = 0;

    for (const category of config.statCategories) {
      const raw = stats?.[category];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;

      const wRaw = config.projectionWeights?.[category];
      const weight = typeof wRaw === "number" && Number.isFinite(wRaw) ? wRaw : 0;

      points += value * weight;
    }

    return Math.round(points * 100) / 100;
  }

  private static createZeroProjection(playerId: string, config: SportConfig): Projection {
    const zeroStats: Record<string, number> = {};
    for (const category of config.statCategories) zeroStats[category] = 0;

    return { playerId, projectedStats: zeroStats, projectedPoints: 0 };
  }

  static getPlayerProjection(playerId: string, projections: Projection[]): Projection | undefined {
    return projections.find((p) => p.playerId === playerId);
  }
}
