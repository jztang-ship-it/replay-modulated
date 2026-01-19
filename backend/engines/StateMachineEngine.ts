/**
 * StateMachineEngine - Enforces strict game state transitions
 * Sport-agnostic state machine for game session flow
 */

import { GameState, GameSession } from '../models';

export class StateMachineEngine {
  /**
   * Validate state transition and throw error if invalid
   */
  static validateTransition(
    currentState: GameState,
    targetState: GameState
  ): void {
    const validTransitions: Record<GameState, GameState[]> = {
      [GameState.IDLE]: [GameState.INITIAL_DEAL],
      [GameState.INITIAL_DEAL]: [GameState.HOLD_PHASE],
      [GameState.HOLD_PHASE]: [GameState.HOLD_PHASE, GameState.FINAL_DRAW],
      [GameState.FINAL_DRAW]: [GameState.RESOLUTION],
      [GameState.RESOLUTION]: [GameState.RESULT],
      [GameState.RESULT]: [], // Terminal state
    };

    const allowed = validTransitions[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `Invalid state transition from ${currentState} to ${targetState}`
      );
    }
  }

  /**
   * Transition session to new state
   */
  static transition(session: GameSession, targetState: GameState): GameSession {
    this.validateTransition(session.state, targetState);

    return {
      ...session,
      state: targetState,
    };
  }

  /**
   * Check if state transition is allowed
   */
  static canTransition(
    currentState: GameState,
    targetState: GameState
  ): boolean {
    try {
      this.validateTransition(currentState, targetState);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if session is in a terminal state
   */
  static isTerminal(state: GameState): boolean {
    return state === GameState.RESULT;
  }

  /**
   * Check if hold toggling is allowed
   */
  static canToggleHold(state: GameState): boolean {
    return state === GameState.HOLD_PHASE;
  }
}
