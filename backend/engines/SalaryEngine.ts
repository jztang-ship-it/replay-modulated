/**
 * SalaryEngine - Manages salary calculations and constraints
 * Sport-agnostic salary management
 */

import { Lineup, Player, SportConfig } from '../models';

export class SalaryEngine {
  /**
   * Calculate total salary for a lineup
   */
  static calculateTotalSalary(players: Player[]): number {
    return players.reduce((total, player) => total + player.salary, 0);
  }

  /**
   * Calculate remaining salary cap space
   */
  static getRemainingSalary(lineup: Lineup, config: SportConfig): number {
    return Math.max(0, config.salaryCap - lineup.totalSalary);
  }

  /**
   * Check if a player can fit within remaining salary
   */
  static canAffordPlayer(
    player: Player,
    currentSalary: number,
    salaryCap: number
  ): boolean {
    return currentSalary + player.salary <= salaryCap;
  }

  /**
   * Get players that can fit within remaining salary, sorted by salary
   */
  static getAffordablePlayers(
    players: Player[],
    currentSalary: number,
    salaryCap: number,
    sortDescending: boolean = false
  ): Player[] {
    const affordable = players.filter((player) =>
      this.canAffordPlayer(player, currentSalary, salaryCap)
    );

    return affordable.sort((a, b) =>
      sortDescending ? b.salary - a.salary : a.salary - b.salary
    );
  }

  /**
   * Create a new lineup with calculated salary
   */
  static createLineup(players: Player[]): Lineup {
    return {
      players,
      totalSalary: this.calculateTotalSalary(players),
    };
  }

  /**
   * Add a player to a lineup and recalculate salary
   */
  static addPlayerToLineup(lineup: Lineup, player: Player): Lineup {
    return {
      players: [...lineup.players, player],
      totalSalary: lineup.totalSalary + player.salary,
    };
  }

  /**
   * Remove a player from a lineup and recalculate salary
   */
  static removePlayerFromLineup(lineup: Lineup, playerId: string): Lineup {
    const player = lineup.players.find((p) => p.id === playerId);
    if (!player) {
      return lineup;
    }

    return {
      players: lineup.players.filter((p) => p.id !== playerId),
      totalSalary: lineup.totalSalary - player.salary,
    };
  }
}
