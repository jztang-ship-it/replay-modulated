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

  // Cache resolutions after resolve() so getResolutions() returns the same ones
  private resolvedCache: Resolution[] | null = null;

  constructor(context: EngineContext, dataProvider?: DataProvider) {
    this.config = context.sportConfig;
    this.players = context.players;
    this.gameLogs = context.gameLogs;
    this.dataProvider = dataProvider || null;
    this.rng = new RandomEngine(context.seed);
  }

  createSession(sessionId: string, sportId: string, seed?: number): GameSession {
    if (this.session && this.session.state !== GameState.RESULT) {
      throw new Error('Active session exists.');
    }

    const sessionSeed = seed ?? this.rng.getSeed() ?? Date.now();

    this.session = {
      sessionId,
      sportId,
      seed: sessionSeed,
      state: GameState.IDLE,
      roster: [],
      remainingCap: this.config.salaryCap,
      resolvedTeamFP: null,
      winResult: null,
    };

    this.resolvedCache = null;
    return this.session;
  }

  getSession(): GameSession | null {
    return this.session;
  }

  initialDeal(): GameSession {
    if (!this.session) throw new Error('No active session.');

    this.session = StateMachineEngine.transition(this.session, GameState.INITIAL_DEAL);

    const roster = LineupGenerationEngine.generateDeterministicLineup(
      this.config,
      this.players,
      this.rng
    );

    this.session.roster = roster;

    const used = roster.reduce((sum, s) => sum + (s.player?.salary || 0), 0);
    this.session.remainingCap = this.config.salaryCap - used;

    this.session = StateMachineEngine.transition(this.session, GameState.HOLD_PHASE);
    return this.session;
  }

  toggleHold(slotIndex: number): GameSession {
    if (!this.session) throw new Error('No active session.');
    if (!StateMachineEngine.canToggleHold(this.session.state)) {
      throw new Error('Cannot toggle now.');
    }

    const slot = this.session.roster[slotIndex];
    if (slot && slot.player) slot.held = !slot.held;

    return this.session;
  }

  finalDraw(): GameSession {
    if (!this.session) throw new Error('No active session.');

    this.session = StateMachineEngine.transition(this.session, GameState.FINAL_DRAW);

    const updated = LineupGenerationEngine.fillRemainingSlots(
      this.session.roster,
      this.config,
      this.players,
      this.rng
    );

    this.session.roster = updated;

    const used = updated.reduce((sum, s) => sum + (s.player?.salary || 0), 0);
    this.session.remainingCap = this.config.salaryCap - used;

    this.session = StateMachineEngine.transition(this.session, GameState.RESOLUTION);
    return this.session;
  }

  resolve(opponentFP?: number): GameSession {
    if (!this.session || this.session.state !== GameState.RESOLUTION) {
      throw new Error('Invalid state.');
    }

    // Compute per-player resolutions ONCE
    const resolutions = ResolutionEngine.resolveTeamFP(
      this.session.roster,
      this.gameLogs,
      this.config,
      this.rng
    );

    // Canonical total = sum of final per-player fantasyPoints
    const teamFP = resolutions.reduce((sum, r) => sum + (r.fantasyPoints ?? 0), 0);

    this.session.resolvedTeamFP = teamFP;
    this.session.winResult = ResolutionEngine.evaluateWinCondition(teamFP, this.config, opponentFP);

    // Cache the exact resolutions we used for team total
    this.resolvedCache = resolutions;

    this.session = StateMachineEngine.transition(this.session, GameState.RESULT);
    return this.session;
  }

  getResolutions(): Resolution[] {
    if (!this.session || this.session.state !== GameState.RESULT) {
      throw new Error('Not resolved.');
    }

    // Return cached resolutions from resolve() so it matches displayed totals
    if (this.resolvedCache) return this.resolvedCache;

    // Fallback (should be rare): recompute if cache missing
    return ResolutionEngine.resolveTeamFP(this.session.roster, this.gameLogs, this.config, this.rng);
  }

  playCompleteGame(
    sessionId: string,
    sportId: string,
    seed?: number,
    opponentFP?: number
  ): GameSession {
    this.createSession(sessionId, sportId, seed);
    this.initialDeal();
    this.finalDraw();
    return this.resolve(opponentFP);
  }

  resetSession(): void {
    this.session = null;
    this.resolvedCache = null;
  }

  getConfig(): SportConfig {
    return this.config;
  }

  getRandomEngine(): RandomEngine {
    return this.rng;
  }
}
