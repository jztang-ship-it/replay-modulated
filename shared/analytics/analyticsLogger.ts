/**
 * shared/analytics/analyticsLogger.ts — Layer 1 (sport-agnostic)
 * Tracks investor metrics: games played, win tiers, session data.
 */

import type { GameEvent, SessionMetrics } from "../types";

class AnalyticsLogger {
  private sessionId: string;
  private sessionStart: number;
  private currentSession: SessionMetrics;

  constructor() {
    this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.sessionStart = Date.now();
    this.currentSession = this.initSession();
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => { this.emit({ sessionId: this.sessionId, sport: this.currentSession.sport, eventType: "SESSION_END", timestamp: Date.now(), data: { handsPlayed: this.currentSession.handsPlayed } }); this.saveSession(); });
    }
  }

  gameStarted(sport: string): void { this.currentSession.sport = sport; this.emit({ sessionId: this.sessionId, sport, eventType: "GAME_STARTED", timestamp: Date.now() }); }
  handDealt(sport: string, rosterSalary: number): void { this.emit({ sessionId: this.sessionId, sport, eventType: "HAND_DEALT", timestamp: Date.now(), data: { rosterSalary } }); }
  cardsHeld(sport: string, heldCount: number): void { this.emit({ sessionId: this.sessionId, sport, eventType: "CARDS_HELD", timestamp: Date.now(), data: { heldCount } }); }

  handResolved(sport: string, totalFp: number, winTier: string, payout: number): void {
    this.currentSession.handsPlayed++;
    this.currentSession.totalFpScored += totalFp;
    this.currentSession.winTierCounts[winTier] = (this.currentSession.winTierCounts[winTier] ?? 0) + 1;
    this.emit({ sessionId: this.sessionId, sport, eventType: "RESOLVE", timestamp: Date.now(), data: { totalFp, winTier, payout } });
    this.saveSession();
  }

  win(sport: string, winTier: string, payout: number, balance: number): void {
    if (balance > this.currentSession.peakBalance) this.currentSession.peakBalance = balance;
    this.emit({ sessionId: this.sessionId, sport, eventType: "WIN", timestamp: Date.now(), data: { winTier, payout, balance } });
    this.saveSession();
  }

  getInvestorMetrics() {
    const sessions = this.getAllSessions();
    const totalHands = sessions.reduce((s, sess) => s + sess.handsPlayed, 0);
    const totalFp = sessions.reduce((s, sess) => s + sess.totalFpScored, 0);
    const winTierDistribution: Record<string, number> = {};
    const sportsPlayed: Record<string, number> = {};
    for (const sess of sessions) {
      for (const [tier, count] of Object.entries(sess.winTierCounts)) winTierDistribution[tier] = (winTierDistribution[tier] ?? 0) + count;
      if (sess.sport) sportsPlayed[sess.sport] = (sportsPlayed[sess.sport] ?? 0) + 1;
    }
    return { totalSessions: sessions.length, totalHandsPlayed: totalHands, avgHandsPerSession: sessions.length > 0 ? Math.round((totalHands / sessions.length) * 10) / 10 : 0, avgFpPerHand: totalHands > 0 ? Math.round((totalFp / totalHands) * 10) / 10 : 0, winTierDistribution, sportsPlayed, peakBalance: sessions.reduce((max, s) => Math.max(max, s.peakBalance), 0) };
  }

  printInvestorMetrics(): void {
    const m = this.getInvestorMetrics();
    console.log("\n=== ReplayMod — Investor Metrics ===");
    console.log(`Sessions: ${m.totalSessions} | Hands: ${m.totalHandsPlayed} | Avg hands/session: ${m.avgHandsPerSession} | Avg FP/hand: ${m.avgFpPerHand}`);
    console.log("Sports:", m.sportsPlayed);
    console.log("Win tiers:", m.winTierDistribution);
  }

  getCurrentSession(): SessionMetrics { return { ...this.currentSession }; }

  private emit(event: GameEvent): void {
    try { const existing = JSON.parse(localStorage.getItem("replaymod_events") ?? "[]"); existing.push(event); localStorage.setItem("replaymod_events", JSON.stringify(existing.slice(-1000))); } catch {}
  }

  private saveSession(): void {
    try {
      this.currentSession.endTime = Date.now();
      const sessions = this.getAllSessions();
      const idx = sessions.findIndex(s => s.sessionId === this.sessionId);
      if (idx >= 0) sessions[idx] = this.currentSession; else sessions.push(this.currentSession);
      localStorage.setItem("replaymod_sessions", JSON.stringify(sessions.slice(-500)));
    } catch {}
  }

  private getAllSessions(): SessionMetrics[] {
    try { return JSON.parse(localStorage.getItem("replaymod_sessions") ?? "[]"); } catch { return []; }
  }

  private initSession(): SessionMetrics {
    return { sessionId: this.sessionId, sport: "", startTime: this.sessionStart, handsPlayed: 0, totalFpScored: 0, winTierCounts: {}, peakBalance: 0 };
  }
}

export const analytics = new AnalyticsLogger();
export default analytics;
export { AnalyticsLogger };
