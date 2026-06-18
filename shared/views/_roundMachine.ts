/**
 * shared/views/_roundMachine.ts — pure round-machine controller (build-phase B1).
 *
 * The DECISION layer of the build-phase round loop, extracted from onPrimaryAction
 * so the economic seam is runtime-testable WITHOUT rendering GameView (the project
 * does not render GameView in unit tests). onPrimaryAction keeps ALL choreography
 * (sleeps, flipState, refs, redrawRoster/resolveRoster, setGameState) and delegates
 * exactly one thing to this module: "given this round, loop back to HOLD or lock to
 * REVEALING — and if locking, perform the once-per-hand economics."
 *
 * Invariant: money crosses the seam at lineup-lock, once per hand, independent of
 * round count. Strategy (hold/reroll, up to MAX_ROUNDS) happens inside the hand for
 * free — the loop path performs ZERO money/persist/telemetry operations.
 *
 * Pure module (no React): `commitRound` is called directly by tests with spy
 * `effects`. The side effects (charge / rake / persistLock / telemetry) are INJECTED
 * — real implementations live in onPrimaryAction; the module only orchestrates their
 * order and once-ness.
 */
import type { PlayerCard } from "@shared/types";

/** Build-phase v1: a hand is at most three hold/reroll rounds. */
export const MAX_ROUNDS = 3;

/** The deterministic owed-result record persisted at lock, before the charge.
 *  Carries resolved FP (NOT pre-resolution card selection) so a charge-then-crash
 *  is fully reconstructable. `entryFee` is stored so the money-in/result-out
 *  reconcile is auditable: payout was computed from this same fee. */
export interface LockRecord {
  roster: PlayerCard[];
  totalFp: number;
  tier: string;
  payout: number;
  streak: number;
  entryFee: number;
}

/** Side effects injected by onPrimaryAction (real impls) or by tests (spies). */
export interface RoundLockEffects {
  telemetry: (event: "lineup_locked" | "entry_fee_committed") => void;
  /** Persist the owed-result record. Awaited before charge — the record must
   *  exist before money moves (crash-boundary safety). */
  persistLock: (record: LockRecord) => Promise<void>;
  /** Deduct the single entry fee. */
  charge: (entryFee: number) => void;
  /** Fire the once-per-hand bonus-pool rake. */
  rake: () => void;
}

export interface CommitRoundInput {
  /** Rounds used BEFORE this commit (0 on the first commit of a hand). */
  roundsUsed: number;
  maxRounds: number;
  /** True when the player chose to lock now rather than take another round. */
  userTappedReveal: boolean;
  entryFee: number;
  streak: number;
  /** MUST be the post-resolveRoster roster (actualFp baked). The choreography
   *  calls commitRound only after resolveRoster, so this module can never
   *  receive a pre-resolution selection — the crash-boundary record is always
   *  resolved by construction. */
  resolvedRoster: PlayerCard[];
  /** Pure outcome computation. Payout MUST derive from the passed entryFee so the
   *  persisted record reconciles with the charge. */
  resolveOutcome: (
    roster: PlayerCard[],
    entryFee: number,
    streak: number,
  ) => { totalFp: number; tier: string; payout: number };
  effects: RoundLockEffects;
}

export interface CommitRoundResult {
  next: "HOLD" | "REVEALING";
  /** Rounds used AFTER this commit — written back to _useSharedGameState. */
  roundsUsed: number;
  locked: boolean;
}

/**
 * Commit one round. Loops back to HOLD (free) until the player locks or runs out
 * of rounds; on lock, runs the once-per-hand lineup-lock economics in a
 * crash-boundary-safe order and routes to REVEALING.
 */
export async function commitRound(input: CommitRoundInput): Promise<CommitRoundResult> {
  const {
    roundsUsed, maxRounds, userTappedReveal,
    entryFee, streak, resolvedRoster, resolveOutcome, effects,
  } = input;

  const nextRoundsUsed = roundsUsed + 1;
  const lock = userTappedReveal || nextRoundsUsed >= maxRounds;

  if (!lock) {
    // Loop back to HOLD for another free round. ZERO money/persist/telemetry —
    // this is the path Commit A's invariant protects: strategy is free.
    return { next: "HOLD", roundsUsed: nextRoundsUsed, locked: false };
  }

  // ── Lineup lock — money crosses the seam exactly once. ────────────────────
  // Ordering is a crash-boundary invariant (pinned by test):
  //   lineup_locked → persistLock (awaited) → charge → entry_fee_committed → rake
  // Record the owed result BEFORE charging, so a charge-then-crash always has a
  // recoverable record; the only crash gap (post-persist / pre-charge) leaves a
  // record with no charge (safe — re-chargeable/voidable), never the reverse.
  // payout is computed from the SAME entryFee that charge deducts (reconcile).
  const { totalFp, tier, payout } = resolveOutcome(resolvedRoster, entryFee, streak);
  effects.telemetry("lineup_locked");
  await effects.persistLock({ roster: resolvedRoster, totalFp, tier, payout, streak, entryFee });
  effects.charge(entryFee);
  effects.telemetry("entry_fee_committed");
  effects.rake();

  return { next: "REVEALING", roundsUsed: nextRoundsUsed, locked: true };
}
