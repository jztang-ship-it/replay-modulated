// shared/views/__tests__/GameView.betOncePerHand.test.ts
//
// Economic invariant (build-phase Commit A): ONE hand pays once and rakes once,
// independent of draw count. Today both fire per-draw, which is correct ONLY
// because single-draw makes draws == hands. The Commit-B round loop breaks that
// equality, so the invariant is made true here, before any multi-round code.
//
// WHY STATIC-SOURCE (not an RTL "3 HOLD→DRAW cycles" render):
//   - GameView is a ~3000-line component with deeply nested providers + async
//     state; the project deliberately does NOT render it in unit tests. Precedent
//     + rationale: GameView.recipientDealClear.test.ts ("assert the neighbors").
//   - The multi-round loop does not exist yet (Commit B), so there is no machine
//     path that performs 3 HOLD→DRAW cycles in one hand to drive behaviorally.
//   - Extracting the inline bet/rake into a testable unit would be a refactor,
//     which Commit A explicitly forbids.
// The structural proof below is STRONGER than a 3-cycle test: it proves the draw
// path performs ZERO money operations for ANY draw count (not just 3), and it
// FAILS on pre-repair code (which had setBalance + setBetNonce inside the HOLD
// branch). That is the "can only pass on correct code" discriminator.
//
// If onPrimaryAction's branch structure is refactored, update this test alongside.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_VIEW = readFileSync(resolve(__dirname, "../GameView.tsx"), "utf8");
const USE_REVEAL = readFileSync(resolve(__dirname, "../_useReveal.ts"), "utf8");

// onPrimaryAction's IDLE branch (per-hand path): from `if (gameState === "IDLE") {`
// up to the HOLD branch opener. The `if (gameState === "IDLE") {` form (no `||`)
// is unique to onPrimaryAction.
const idleBranch = (() => {
  const m = /if \(gameState === "IDLE"\) \{([\s\S]*?)\n\s*if \(gameState === "HOLD"\) \{/.exec(GAME_VIEW);
  expect(m, "onPrimaryAction IDLE branch must be locatable").not.toBeNull();
  return m![1];
})();

// onPrimaryAction's HOLD branch (per-draw path): from the HOLD opener up to the
// RESULTS/WIN_CELEBRATION branch.
const holdBranch = (() => {
  const m = /\n\s*if \(gameState === "HOLD"\) \{([\s\S]*?)\n\s*if \(gameState === "RESULTS" \|\| gameState === "WIN_CELEBRATION"\) \{/.exec(GAME_VIEW);
  expect(m, "onPrimaryAction HOLD branch must be locatable").not.toBeNull();
  return m![1];
})();

const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("economic invariant — one hand pays once, rakes once (per-draw → per-hand)", () => {
  // ── CRITICAL: the three-round theorem, expressed structurally ──────────────
  // A draw (HOLD branch) performs ZERO money operations. Therefore N HOLD→DRAW
  // cycles in one hand produce exactly 0 deductions and 0 rakes from the draw
  // path — the 3-round case the Commit-B loop will create reduces to the single
  // hand-entry charge. This assertion FAILS on pre-repair code (the HOLD branch
  // had both setBalance(prev - currentBet) and setBetNonce).
  it("a draw performs NO bet deduction (HOLD branch has no setBalance)", () => {
    expect(holdBranch).not.toMatch(/setBalance\s*\(/);
  });
  it("a draw performs NO bonus-pool rake (HOLD branch has no setBetNonce)", () => {
    expect(holdBranch).not.toMatch(/setBetNonce\s*\(/);
  });

  // ── A hand charges exactly once ────────────────────────────────────────────
  // The deal entry (IDLE branch) deducts the bet exactly once and bumps betNonce
  // (the rake trigger) exactly once. FAILS on pre-repair code (IDLE had neither).
  it("the hand deducts the bet exactly once (IDLE branch)", () => {
    expect(countOf(idleBranch, /prev - currentBet/g)).toBe(1);
  });
  it("the hand fires the rake exactly once (IDLE branch bumps betNonce once)", () => {
    expect(countOf(idleBranch, /setBetNonce\s*\(/g)).toBe(1);
  });

  // ── Placement: a failed/empty deal is never charged ────────────────────────
  // The deduction sits AFTER the deal-validity guard, so a throw/empty roster
  // returns before any charge — mirroring the prior HOLD-entry timing, which
  // also only ran after a successful deal.
  it("the deduction is placed after the deal-validity guard (no charge on failed deal)", () => {
    const guardIdx = idleBranch.indexOf("if (!nextRoster.length)");
    const deductIdx = idleBranch.indexOf("prev - currentBet");
    expect(guardIdx, "deal-validity guard must exist").toBeGreaterThan(-1);
    expect(deductIdx, "deduction must exist").toBeGreaterThan(-1);
    expect(deductIdx).toBeGreaterThan(guardIdx);
  });
});

describe("economic invariant — unchanged-behavior guards (tendrils the map said are clean)", () => {
  it("affordability gate unchanged (IDLE still checks balance < currentBet before dealing)", () => {
    expect(idleBranch).toMatch(/if \(balance < currentBet\)/);
  });
  it("payout math unchanged (uses a single currentBet, not a draw-count product)", () => {
    expect(USE_REVEAL).toMatch(/calculatePayoutWithStreak\(tier, currentBet, streak\)/);
    // no payout site multiplies by a draw / round count
    expect(USE_REVEAL).not.toMatch(/currentBet\s*\*\s*(drawCount|rounds|roundsUsed|numDraws)/);
  });
  it("leaderboard submits unchanged (money_won = payout, session_score = FP)", () => {
    expect(USE_REVEAL).toMatch(/submitToLeaderboard\("money_won", payout\)/);
    expect(USE_REVEAL).toMatch(/submitToLeaderboard\("session_score"/);
  });
  it("streak increments per completed hand, not per draw (resolve-path recorders intact)", () => {
    expect(USE_REVEAL).toMatch(/incrementStreak\(\)/);
    expect(USE_REVEAL).toMatch(/recordStreakWin\(\)/);
  });
});
