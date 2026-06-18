// shared/views/__tests__/GameView.betOncePerHand.test.ts
//
// Economic-seam WIRING proof for build-phase B1. The RUNTIME "one charge/rake per
// hand at lock, for 1/2/3 rounds" proof lives in _roundMachine.test.ts (the pure
// controller). This file pins the GameView WIRING that connects that controller
// correctly: the charge/rake/persist live in commitRound's lock path, a round LOOP
// is free, the deal is free, and persist happens once (at lock, not at reveal).
//
// Static-source (project does not render GameView). The branch extraction keys off
// onPrimaryAction's unique `if (gameState === "IDLE"|"HOLD") {` openers.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const GAME_VIEW = read("../GameView.tsx");
const USE_REVEAL = read("../_useReveal.ts");

const idleBranch = (() => {
  const m = /if \(gameState === "IDLE"\) \{([\s\S]*?)\n\s*if \(gameState === "HOLD"\) \{/.exec(GAME_VIEW);
  expect(m, "IDLE branch must be locatable").not.toBeNull();
  return m![1];
})();
const holdBranch = (() => {
  const m = /\n\s*if \(gameState === "HOLD"\) \{([\s\S]*?)\n\s*if \(gameState === "RESULTS" \|\| gameState === "WIN_CELEBRATION"\) \{/.exec(GAME_VIEW);
  expect(m, "HOLD branch must be locatable").not.toBeNull();
  return m![1];
})();
// The loop sub-branch (decision.next === "HOLD") up to the LOCK fall-through marker.
const loopBranch = (() => {
  const m = /if \(decision\.next === "HOLD"\) \{([\s\S]*?)\n\s*\/\/ LOCK →/.exec(holdBranch);
  expect(m, "loop branch must be locatable").not.toBeNull();
  return m![1];
})();
const idx = (s: string, sub: string) => s.indexOf(sub);

describe("B1 wiring — money crosses the seam only via the controller's lock path", () => {
  // ── The deal is free (charge relocated OUT of IDLE/deal-entry) ──────────────
  it("the deal (IDLE) performs no charge — money is not taken at deal entry", () => {
    expect(idleBranch).not.toMatch(/prev - currentBet/);
    expect(idleBranch).not.toMatch(/setBetNonce\s*\(/);
  });
  it("the deal sets the round counter to 1 (deal = lineup 1)", () => {
    expect(idleBranch).toMatch(/setRoundsUsed\(1\)/);
  });

  // ── HOLD delegates the decision to the controller, AFTER resolveRoster ──────
  it("HOLD calls commitRound after resolveRoster (persist-after-resolve survives)", () => {
    const resolveIdx = idx(holdBranch, "resolveRoster(");
    const commitIdx = idx(holdBranch, "commitRound(");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(resolveIdx); // resolve first, then commit/lock
  });

  // ── charge/rake/persist are wired as the controller's lock EFFECTS ──────────
  it("charge + rake + persist are wired as commitRound effects (not inline per-draw)", () => {
    expect(holdBranch).toMatch(/charge:\s*\(fee\)\s*=>\s*setBalance\(prev\s*=>\s*\{\s*const next = prev - fee/);
    expect(holdBranch).toMatch(/rake:\s*\(\)\s*=>\s*setBetNonce\(n\s*=>\s*n\s*\+\s*1\)/);
    expect(holdBranch).toMatch(/persistLock:\s*async/);
  });

  // ── A round LOOP is FREE — zero money ops on the loop-back path ─────────────
  it("the loop-back path (next === HOLD) performs NO money operations", () => {
    expect(loopBranch).not.toMatch(/setBalance\s*\(/);
    expect(loopBranch).not.toMatch(/setBetNonce\s*\(/);
    expect(loopBranch).toMatch(/setGameState\("HOLD"\)/); // loops back
  });
});

describe("B1 wiring — persist once at lock (relocated from reveal)", () => {
  it("the persistLock effect writes the hand_log row (logHandToDb) at lock", () => {
    expect(holdBranch).toMatch(/persistLock:\s*async[\s\S]*?logHandToDb\(/);
  });
  it("_useReveal NO LONGER writes hand_log (reads the lock-set handId instead) — one write per hand", () => {
    expect(USE_REVEAL).not.toMatch(/logHandToDb\(/);            // no second write at reveal
    expect(USE_REVEAL).toMatch(/currentHandIdRef\.current/);    // reads the lock-generated id
  });
  it("_useReveal guards a missing lock handId (no unlinked hand_best submit)", () => {
    expect(USE_REVEAL).toMatch(/if \(handIdForAudit\) \{[\s\S]*?submitToLeaderboard\("hand_best"/);
  });
});

describe("B1 wiring — unchanged-behavior guards (the tendrils the map said are clean)", () => {
  it("affordability gate unchanged (IDLE checks balance < currentBet)", () => {
    expect(idleBranch).toMatch(/if \(balance < currentBet\)/);
  });
  it("payout math unchanged (single entryFee/currentBet, no draw-count product)", () => {
    expect(USE_REVEAL).toMatch(/calculatePayoutWithStreak\(tier, currentBet, streak\)/);
  });
  it("leaderboard submits unchanged (money_won = payout, session_score = FP)", () => {
    expect(USE_REVEAL).toMatch(/submitToLeaderboard\("money_won", payout\)/);
    expect(USE_REVEAL).toMatch(/submitToLeaderboard\("session_score"/);
  });
  it("streak increments per completed hand, not per round", () => {
    expect(USE_REVEAL).toMatch(/incrementStreak\(\)/);
    expect(USE_REVEAL).toMatch(/recordStreakWin\(\)/);
  });
});
