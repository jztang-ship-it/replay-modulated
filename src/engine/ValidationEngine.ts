/**
 * ValidationEngine - Validates lineups against sport configuration rules
 * Sport-agnostic validation based on SportConfig
 */

import { Lineup, SportConfig, Player } from '../models';

export class ValidationEngine {
  /**
   * Validate a lineup against sport configuration rules
   * Returns an object with isValid flag and array of error messages
   */
  static validateLineup(lineup: Lineup, config: SportConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check player count
    if (lineup.players.length < config.minPlayers) {
      errors.push(`Lineup must have at least ${config.minPlayers} players`);
    }
    if (lineup.players.length > config.maxPlayers) {
      errors.push(`Lineup must have at most ${config.maxPlayers} players`);
    }

    // Check salary cap
    if (lineup.totalSalary > config.salaryCap) {
      errors.push(
        `Lineup salary ${lineup.totalSalary} exceeds cap ${config.salaryCap}`
      );
    }

    // Check position limits
    const positionCounts: Record<string, number> = {};
    for (const player of lineup.players) {
      positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
    }

    for (const position of config.positions) {
      const count = positionCounts[position] || 0;
      const limits = config.positionLimits[position];

      if (!limits) {
        errors.push(`Invalid position: ${position}`);
        continue;
      }

      if (count < limits.min) {
        errors.push(
          `Position ${position} requires at least ${limits.min} player(s), found ${count}`
        );
      }
      if (count > limits.max) {
        errors.push(
          `Position ${position} allows at most ${limits.max} player(s), found ${count}`
        );
      }
    }

    // Check for duplicate players
    const playerIds = new Set<string>();
    for (const player of lineup.players) {
      if (playerIds.has(player.id)) {
        errors.push(`Duplicate player: ${player.name} (${player.id})`);
      }
      playerIds.add(player.id);
    }

    // Validate all positions are valid
    for (const player of lineup.players) {
      if (!config.positions.includes(player.position)) {
        errors.push(
          `Invalid position ${player.position} for player ${player.name}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that a player can be added to a lineup
   */
  static canAddPlayer(
    player: Player,
    currentLineup: Lineup,
    config: SportConfig
  ): { canAdd: boolean; reason?: string } {
    // Check if player already in lineup
    if (currentLineup.players.some((p) => p.id === player.id)) {
      return { canAdd: false, reason: 'Player already in lineup' };
    }

    // Check if lineup is full
    if (currentLineup.players.length >= config.maxPlayers) {
      return { canAdd: false, reason: 'Lineup is full' };
    }

    // Check salary cap
    const newSalary = currentLineup.totalSalary + player.salary;
    if (newSalary > config.salaryCap) {
      return {
        canAdd: false,
        reason: `Adding player would exceed salary cap`,
      };
    }

    // Check position limits
    const positionCount = currentLineup.players.filter(
      (p) => p.position === player.position
    ).length;
    const limits = config.positionLimits[player.position];

    if (!limits) {
      return { canAdd: false, reason: `Invalid position: ${player.position}` };
    }

    if (positionCount >= limits.max) {
      return {
        canAdd: false,
        reason: `Position ${player.position} is at maximum (${limits.max})`,
      };
    }

    return { canAdd: true };
  }

  /**
   * Validate player object structure
   */
  static validatePlayer(player: Player, config: SportConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!player.id) {
      errors.push('Player must have an id');
    }
    if (!player.name) {
      errors.push('Player must have a name');
    }
    if (!player.position) {
      errors.push('Player must have a position');
    }
    if (player.salary <= 0) {
      errors.push('Player salary must be positive');
    }
    if (!config.positions.includes(player.position)) {
      errors.push(`Invalid position: ${player.position}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
