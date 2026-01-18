/**
 * ValidationEngine - Validates lineups against sport configuration rules
 * Sport-agnostic validation based on SportConfig
 */

import { Lineup, SportConfig, Player } from '../models';

/**
 * Helper to get the identity of a player.
 * Uses basePlayerId if available (for season cards), otherwise falls back to id.
 */
function getBaseId(p: { id: string; basePlayerId?: string }) {
  return p.basePlayerId && p.basePlayerId.trim().length > 0 ? p.basePlayerId : p.id;
}

export class ValidationEngine {
  /**
   * Validate a lineup against sport configuration rules
   * Returns an object with isValid flag and array of error messages
   */
  static validateLineup(
    lineup: Lineup,
    config: SportConfig
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const players = lineup.players ?? [];

    // Check player count
    if (players.length < config.minPlayers) {
      errors.push(`Lineup must have at least ${config.minPlayers} players`);
    }
    if (players.length > config.maxPlayers) {
      errors.push(`Lineup must have at most ${config.maxPlayers} players`);
    }

    // Check salary cap
    if (lineup.totalSalary > config.salaryCap) {
      errors.push(`Lineup salary ${lineup.totalSalary} exceeds cap ${config.salaryCap}`);
    }

    // Validate all positions are valid
    for (const player of players) {
      if (!config.positions.includes(player.position)) {
        errors.push(`Invalid position ${player.position} for player ${player.name}`);
      }
    }

    // Check position limits
    const positionCounts: Record<string, number> = {};
    for (const player of players) {
      positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
    }

    for (const position of config.positions) {
      const count = positionCounts[position] || 0;
      const limits = config.positionLimits[position];

      if (!limits) {
        errors.push(`Missing positionLimits config for position: ${position}`);
        continue;
      }

      if (count < limits.min) {
        errors.push(`Position ${position} requires at least ${limits.min} player(s), found ${count}`);
      }
      if (count > limits.max) {
        errors.push(`Position ${position} allows at most ${limits.max} player(s), found ${count}`);
      }
    }

    // Check for duplicates:
    // - exact duplicate card id (should never happen)
    // - duplicate base identity (prevents same player across seasons in same lineup)
    const exactIds = new Set<string>();
    const baseIds = new Set<string>();

    for (const player of players) {
      const bid = getBaseId(player);

      if (exactIds.has(player.id)) {
        errors.push(`Duplicate player instance: ${player.name} (${player.id})`);
      }
      if (baseIds.has(bid)) {
        errors.push(
          `Duplicate player identity not allowed: ${player.name} (basePlayerId=${bid})`
        );
      }

      exactIds.add(player.id);
      baseIds.add(bid);
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
    const currentPlayers = currentLineup.players ?? [];

    // Prevent same base player identity in the lineup (season-card safe)
    const playerBaseId = getBaseId(player);
    if (currentPlayers.some((p) => getBaseId(p) === playerBaseId)) {
      return {
        canAdd: false,
        reason: 'This player (or another version of them) is already in the lineup',
      };
    }

    // Lineup full
    if (currentPlayers.length >= config.maxPlayers) {
      return { canAdd: false, reason: 'Lineup is full' };
    }

    // Salary cap
    const newSalary = currentLineup.totalSalary + player.salary;
    if (newSalary > config.salaryCap) {
      return { canAdd: false, reason: `Adding player would exceed salary cap` };
    }

    // Position limits
    const positionCount = currentPlayers.filter((p) => p.position === player.position).length;
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
  static validatePlayer(
    player: Player,
    config: SportConfig
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!player.id) errors.push('Player must have an id');
    if (!player.name) errors.push('Player must have a name');
    if (!player.position) errors.push('Player must have a position');
    if (player.salary <= 0) errors.push('Player salary must be positive');

    if (!config.positions.includes(player.position)) {
      errors.push(`Invalid position: ${player.position}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
