/**
 * shared/analytics/analyticsLogger.ts — Layer 1 (sport-agnostic)
 *
 * Tracks the metrics that matter for investors:
 *   - Games played per session
 *   - Win tier distribution (game balance validation)
 *   - Session retention signals (did they play again?)
 *   - Score distribution per sport
 *
 * Designed for the garage phase: stores to localStorage.
 * When you're ready to scale (100+ users), swap the storage
 * backend to your own API — the rest of the code doesn't change.
 *
 * Usage:
 *   import { analytics } from 'shared/analytics/analyticsLogger';
 *   analytics.gameStarted('basketball');
 *   analytics.handResolved('basketball', totalFp, 'ALL_STAR');
 *   analytics.sessionSummary(); // call when user leaves
 */

import type { GameEvent, SessionMetrics } from "../types";

// ── Storage backend interface ──────────────────────────────────────────────
// Swap this to send to your own API instead of localStorage

interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  append(key: string, item: any): void;
}

const localStorageBackend: StorageBackend = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  },
  append: (key, item) => {
    try {
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
      existing.push(item);
      // Keep last 1000 events max to avoid storage bloat
      const trimmed = existing.slice(-1000);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {}
  },
};

// ── Analytics class ────────────────────────────────────────────────────────

class AnalyticsLogger {
  private sessionId: string;
  private sessionStart: number;
  private storage: StorageBackend;
  private currentSession: SessionMetrics;

  constructor(storage: StorageBackend = localStorageBackend) {
    this.storage = storage;
    this.sessionId = this.generateSessionId();
    this.sessionStart = Date.now();
    this.currentSession = this.initSession();
    this.registerSessionEnd();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Call when the game initializes for a sport */
  gameStarted(sport: string): void {
    this.currentSession.sport = sport;
    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "GAME_STARTED",
      timestamp: Date.now(),
    });
  }

  /** Call when a hand is dealt */
  handDealt(sport: string, rosterSalary: number): void {
    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "HAND_DEALT",
      timestamp: Date.now(),
      data: { rosterSalary },
    });
  }

  /** Call when user decides which cards to hold */
  cardsHeld(sport: string, heldCount: number): void {
    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "CARDS_HELD",
      timestamp: Date.now(),
      data: { heldCount },
    });
  }

  /** Call after redraw */
  redrawn(sport: string): void {
    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "REDRAW",
      timestamp: Date.now(),
    });
  }

  /** Call after a hand resolves — the most important metric */
  handResolved(sport: string, totalFp: number, winTier: string, payout: number): void {
    this.currentSession.handsPlayed++;
    this.currentSession.totalFpScored += totalFp;
    this.currentSession.winTierCounts[winTier] = (this.currentSession.winTierCounts[winTier] ?? 0) + 1;

    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "RESOLVE",
      timestamp: Date.now(),
      data: { totalFp, winTier, payout },
    });

    this.saveSession();
  }

  /** Call on win celebration */
  win(sport: string, winTier: string, payout: number, balance: number): void {
    if (balance > this.currentSession.peakBalance) {
      this.currentSession.peakBalance = balance;
    }

    this.emit({
      sessionId: this.sessionId,
      sport,
      eventType: "WIN",
      timestamp: Date.now(),
      data: { winTier, payout, balance },
    });

    this.saveSession();
  }

  // ── Investor-facing summary ───────────────────────────────────────────────

  /**
   * Returns the summary stats you show investors.
   * Call this anywhere to get the current aggregate picture.
   */
  getInvestorMetrics(): {
    totalSessions: number;
    totalHandsPlayed: number;
    avgHandsPerSession: number;
    winTierDistribution: Record<string, number>;
    avgFpPerHand: number;
    sportsPlayed: Record<string, number>;
    peakBalance: number;
  } {
    const sessions = this.getAllSessions();
    const totalSessions = sessions.length;
    const totalHands = sessions.reduce((s, sess) => s + sess.handsPlayed, 0);
    const totalFp = sessions.reduce((s, sess) => s + sess.totalFpScored, 0);
    const peakBalance = sessions.reduce((max, sess) => Math.max(max, sess.peakBalance), 0);

    const winTierDistribution: Record<string, number> = {};
    const sportsPlayed: Record<string, number> = {};

    for (const sess of sessions) {
      for (const [tier, count] of Object.entries(sess.winTierCounts)) {
        winTierDistribution[tier] = (winTierDistribution[tier] ?? 0) + count;
      }
      if (sess.sport) {
        sportsPlayed[sess.sport] = (sportsPlayed[sess.sport] ?? 0) + 1;
      }
    }

    return {
      totalSessions,
      totalHandsPlayed: totalHands,
      avgHandsPerSession: totalSessions > 0 ? Math.round((totalHands / totalSessions) * 10) / 10 : 0,
      winTierDistribution,
      avgFpPerHand: totalHands > 0 ? Math.round((totalFp / totalHands) * 10) / 10 : 0,
      sportsPlayed,
      peakBalance,
    };
  }

  /** Log investor metrics to console — useful for demo day */
  printInvestorMetrics(): void {
    const m = this.getInvestorMetrics();
    console.log("\n=== ReplayMod — Session Metrics ===");
    console.log(`Total sessions:       ${m.totalSessions}`);
    console.log(`Total hands played:   ${m.totalHandsPlayed}`);
    console.log(`Avg hands/session:    ${m.avgHandsPerSession}`);
    console.log(`Avg FP/hand:          ${m.avgFpPerHand}`);
    console.log(`Peak balance:         $${m.peakBalance}`);
    console.log("\nSports played:");
    for (const [sport, count] of Object.entries(m.sportsPlayed)) {
      console.log(`  ${sport}: ${count} sessions`);
    }
    console.log("\nWin tier distribution:");
    for (const [tier, count] of Object.entries(m.winTierDistribution)) {
      console.log(`  ${tier}: ${count}`);
    }
  }

  // ── Current session ───────────────────────────────────────────────────────

  getCurrentSession(): SessionMetrics {
    return { ...this.currentSession };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private emit(event: GameEvent): void {
    this.storage.append("replaymod_events", event);
  }

  private saveSession(): void {
    this.currentSession.endTime = Date.now();
    const sessions = this.getAllSessions();
    const existing = sessions.findIndex(s => s.sessionId === this.sessionId);
    if (existing >= 0) {
      sessions[existing] = this.currentSession;
    } else {
      sessions.push(this.currentSession);
    }
    // Keep last 500 sessions
    const trimmed = sessions.slice(-500);
    this.storage.set("replaymod_sessions", JSON.stringify(trimmed));
  }

  private getAllSessions(): SessionMetrics[] {
    try {
      const raw = this.storage.get("replaymod_sessions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private initSession(): SessionMetrics {
    return {
      sessionId: this.sessionId,
      sport: "",
      startTime: this.sessionStart,
      handsPlayed: 0,
      totalFpScored: 0,
      winTierCounts: {},
      peakBalance: 0,
    };
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Auto-save session when tab closes */
  private registerSessionEnd(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.emit({
          sessionId: this.sessionId,
          sport: this.currentSession.sport,
          eventType: "SESSION_END",
          timestamp: Date.now(),
          data: {
            handsPlayed: this.currentSession.handsPlayed,
            totalFpScored: this.currentSession.totalFpScored,
          },
        });
        this.saveSession();
      });
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────────────
// One analytics instance shared across all sports in the app.

export const analytics = new AnalyticsLogger();
export default analytics;
export { AnalyticsLogger };
