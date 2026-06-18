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

/** Outcome of a bounded persist. ok = the owed-result write was CONFIRMED within
 *  the bound (the charge is gated on this). handId identifies the (attempted)
 *  hand_log row; reason explains a failure so skips are tunable (timeout = DB
 *  slow / raise the dial) and reconcilable (handId cross-checks whether the row
 *  eventually landed → skip + row = under-charged-but-persisted). */
export interface PersistResult {
  ok: boolean;
  handId: string;
  reason?: "timeout" | "throw";
}

/** Side effects injected by onPrimaryAction (real impls) or by tests (spies). */
export interface RoundLockEffects {
  telemetry: (
    event: "lineup_locked" | "entry_fee_committed" | "entry_fee_skipped",
    meta?: Record<string, string | number | boolean | null>,
  ) => void;
  /** Persist the owed-result record, BOUNDED (the timeout lives in the effect
   *  impl, NOT this pure module). Returns ok=true only when the write is
   *  CONFIRMED within the bound — the charge is gated on it (record-before-money).
   *  Awaited before charge. Must never throw (catch → ok:false). */
  persistLock: (record: LockRecord) => Promise<PersistResult>;
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

  // ── Lineup lock — money crosses the seam at most once. ────────────────────
  // Crash-boundary invariant (pinned by tests): the charge is GATED on a
  // CONFIRMED persist. Sequence on success:
  //   lineup_locked → persistLock(ok) → charge → entry_fee_committed → rake
  // On a failed/bounded-out persist: no charge (safe, re-chargeable direction),
  // emit entry_fee_skipped (handId+reason) for reconciliation — and REVEALING
  // STILL fires (reveal is never blocked on a slow/hung network).
  // payout is computed from the SAME entryFee that charge deducts (reconcile).
  const { totalFp, tier, payout } = resolveOutcome(resolvedRoster, entryFee, streak);
  effects.telemetry("lineup_locked");
  const persisted = await effects.persistLock({ roster: resolvedRoster, totalFp, tier, payout, streak, entryFee });
  if (persisted.ok) {
    effects.charge(entryFee);
    effects.telemetry("entry_fee_committed", { handId: persisted.handId });
    effects.rake();
  } else {
    effects.telemetry("entry_fee_skipped", { handId: persisted.handId, reason: persisted.reason ?? "throw" });
  }

  return { next: "REVEALING", roundsUsed: nextRoundsUsed, locked: true };
}
