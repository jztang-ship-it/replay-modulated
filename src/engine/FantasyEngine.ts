/**
 * FantasyEngine - Core orchestration engine for fantasy sports gameplay
 * Coordinates all other engines and manages game flow through state machine
 * Sport-agnostic core logic
 */

import {
  Player,
  GameLog,
  SportConfig,
  GameSession,
  GameState,
  RosterSlot,
  Resolution,
  EngineContext,
} from '../models';
import { RandomEngine } from './RandomEngine';
import { StateMachineEngine } from './StateMachineEngine';
import { LineupGenerationEngine } from './LineupGenerationEngine';
import { ResolutionEngine } from './ResolutionEngine';
import { DataProvider } from '../data/DataProvider';

export class FantasyEngine {
  private config: SportConfig;
  private players: Player[];
  private gameLogs: GameLog[];
  private dataProvider: DataProvider | null;
  private rng: RandomEngine;
  private session: GameSession | null = null;

  constructor(context: EngineContext, dataProvider?: DataProvider) {
    this.config = context.sportConfig;
    this.players = context.players;
    this.gameLogs = context.gameLogs;
    this.dataProvider = dataProvider || null;
    this.rng = new RandomEngine(context.seed);
  }

  /**
   * Create a new game session (IDLE -> INITIAL_DEAL)
   */
  createSession(sessionId: string, sportId: string, seed?: number): GameSession {
    if (this.session && this.session.state !== GameState.RESULT) {
      throw new Error('Active session exists. Complete or reset before creating new session.');
    }

    const sessionSeed = seed ?? this.rng.getSeed() ?? Date.now();
    const session: GameSession = {
      sessionId,
      sportId,
      seed: sessionSeed,
      state: GameState.IDLE,
      roster: [],
      remainingCap: this.config.salaryCap,
      resolvedTeamFP: null,
      winResult: null,
    };

    this.session = session;
    return session;
  }

  /**
   * Get current session
   */
  getSession(): GameSession | null {
    return this.session;
  }

  /**
   * Initialize deal (IDLE -> INITIAL_DEAL -> HOLD_PHASE)
   * Generates initial roster using deterministic algorithm
   */
  initialDeal(): GameSession {
    if (!this.session) {
      throw new Error('No active session. Call createSession() first.');
    }

    // Transition: IDLE -> INITIAL_DEAL
    this.session = StateMachineEngine.transition(this.session, GameState.INITIAL_DEAL);

    // Generate initial roster
    const roster = LineupGenerationEngine.generateDeterministicLineup(
      this.config,
      this.players,
      this.rng
    );

    // Calculate remaining cap
    const usedSalary = roster.reduce(
      (sum, slot) => sum + (slot.player?.salary || 0),
      0
    );
    const remainingCap = this.config.salaryCap - usedSalary;

    this.session.roster = roster;
    this.session.remainingCap = remainingCap;

    // Transition to HOLD_PHASE
    this.session = StateMachineEngine.transition(this.session, GameState.HOLD_PHASE);

    return this.session;
  }

  /**
   * Toggle hold status for a roster slot (HOLD_PHASE only)
   */
  toggleHold(slotIndex: number): GameSession {
    if (!this.session) {
      throw new Error('No active session.');
    }

    if (!StateMachineEngine.canToggleHold(this.session.state)) {
      throw new Error(`Cannot toggle hold in state: ${this.session.state}`);
    }

    if (slotIndex < 0 || slotIndex >= this.session.roster.length) {
      throw new Error(`Invalid slot index: ${slotIndex}`);
    }

    const slot = this.session.roster[slotIndex];
    if (!slot.player) {
      throw new Error(`Cannot hold empty slot: ${slotIndex}`);
    }

    // Toggle hold status
    slot.held = !slot.held;

    return this.session;
  }

  /**
   * Final draw - fill remaining slots after holds (HOLD_PHASE -> FINAL_DRAW -> RESOLUTION)
   */
  finalDraw(): GameSession {
    if (!this.session) {
      throw new Error('No active session.');
    }

    // Transition: HOLD_PHASE -> FINAL_DRAW
    this.session = StateMachineEngine.transition(this.session, GameState.FINAL_DRAW);

    // Fill remaining empty slots
    const updatedRoster = LineupGenerationEngine.fillRemainingSlots(
      this.session.roster,
      this.config,
      this.players,
      this.rng
    );

    // Recalculate remaining cap
    const usedSalary = updatedRoster.reduce(
      (sum, slot) => sum + (slot.player?.salary || 0),
      0
    );
    const remainingCap = this.config.salaryCap - usedSalary;

    this.session.roster = updatedRoster;
    this.session.remainingCap = remainingCap;

    // Transition to RESOLUTION
    this.session = StateMachineEngine.transition(this.session, GameState.RESOLUTION);

    return this.session;
  }

  /**
   * Resolve team fantasy points (RESOLUTION -> RESULT)
   */
  resolve(opponentFP?: number): GameSession {
    if (!this.session) {
      throw new Error('No active session.');
    }

    if (this.session.state !== GameState.RESOLUTION) {
      throw new Error(`Cannot resolve in state: ${this.session.state}`);
    }

    // Resolve team FP and evaluate win condition
    const { teamFP, winResult } = ResolutionEngine.resolveAndEvaluate(
      this.session,
      this.gameLogs,
      this.config,
      this.rng,
      opponentFP
    );

    this.session.resolvedTeamFP = teamFP;
    this.session.winResult = winResult;

    // Transition to RESULT
    this.session = StateMachineEngine.transition(this.session, GameState.RESULT);

    return this.session;
  }

  /**
   * Get resolutions for current session (after resolution)
   */
  getResolutions(): Resolution[] {
    if (!this.session || this.session.state !== GameState.RESULT) {
      throw new Error('Session must be in RESULT state to get resolutions.');
    }

    return ResolutionEngine.resolveTeamFP(
      this.session.roster,
      this.gameLogs,
      this.config,
      this.rng
    );
  }

  /**
   * Complete game flow from IDLE to RESULT (convenience method)
   */
  playCompleteGame(sessionId: string, sportId: string, seed?: number, opponentFP?: number): GameSession {
    this.createSession(sessionId, sportId, seed);
    this.initialDeal();
    this.finalDraw();
    this.resolve(opponentFP);
    return this.session!;
  }

  /**
   * Get the sport configuration
   */
  getConfig(): SportConfig {
    return this.config;
  }

  /**
   * Get the random engine (for advanced usage)
   */
  getRandomEngine(): RandomEngine {
    return this.rng;
  }

  /**
   * Reset session (for testing/debugging)
   */
  resetSession(): void {
    this.session = null;
  }
}
