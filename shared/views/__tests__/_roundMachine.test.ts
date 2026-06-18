// shared/views/__tests__/_roundMachine.test.ts
//
// Runtime proof of the build-phase economic seam (the proof Commit A could only
// assert statically): drive the round controller through real rounds and observe
// the charge/rake/persist/telemetry fire exactly once, at the lock transition.
//
// commitRound is a pure async function — no GameView render, no React. The four
// side effects are injected as spies; their counts and ORDER are the contract.

import { describe, expect, it, vi } from "vitest";
import { commitRound, MAX_ROUNDS, type RoundLockEffects } from "../_roundMachine";

// A resolved roster: cards carry actualFp (post-resolveRoster), never bare ids.
const resolvedRoster = [
  { basePlayerId: "p1", cardId: "c1", actualFp: 40, salary: 60 },
  { basePlayerId: "p2", cardId: "c2", actualFp: 30, salary: 55 },
  { basePlayerId: "p3", cardId: "c3", actualFp: 25, salary: 50 },
  { basePlayerId: "p4", cardId: "c4", actualFp: 20, salary: 45 },
  { basePlayerId: "p5", cardId: "c5", actualFp: 15, salary: 40 },
] as any[];

const ENTRY_FEE = 10;
const STREAK = 4;

// Outcome computed FROM entryFee — totalFp from the resolved roster, payout a
// deterministic function of (tier, entryFee, streak). Mirrors production shape
// (calculatePayoutWithStreak reads the single folded entryFee).
function resolveOutcome(roster: any[], entryFee: number, streak: number) {
  const totalFp = roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
  const tier = totalFp >= 100 ? "STARTER" : "BUST";
  const tierMult = tier === "STARTER" ? 1.5 : 0;
  const streakMult = streak >= 3 ? 1.2 : 1;
  const payout = Math.round(entryFee * tierMult * streakMult);
  return { totalFp, tier, payout };
}

// Spy effect set + a shared order log so we can assert sequencing, not just counts.
function makeSpies() {
  const order: string[] = [];
  const lockRecords: any[] = [];
  const charges: number[] = [];
  const effects: RoundLockEffects = {
    telemetry: vi.fn((ev) => { order.push(ev); }),
    persistLock: vi.fn(async (rec) => {
      // resolve on a real microtask so "persist before charge" is meaningful
      await Promise.resolve();
      lockRecords.push(rec);
      order.push("persistLock");
    }),
    charge: vi.fn((fee: number) => { charges.push(fee); order.push("charge"); }),
    rake: vi.fn(() => { order.push("rake"); }),
  };
  return { effects, order, lockRecords, charges };
}

function input(over: Partial<Parameters<typeof commitRound>[0]>, effects: RoundLockEffects) {
  return {
    roundsUsed: 0, maxRounds: MAX_ROUNDS, userTappedReveal: false,
    entryFee: ENTRY_FEE, streak: STREAK,
    resolvedRoster, resolveOutcome, effects,
    ...over,
  };
}

describe("_roundMachine — money crosses the seam once per hand, at lock", () => {
  // ── HEADLINE: 3 rounds → exactly one charge/rake, fired only at round 3 ─────
  it("3-round hand: rounds 1-2 fire ZERO effects; round 3 locks and charges once", async () => {
    const { effects, charges } = makeSpies();

    const r1 = await commitRound(input({ roundsUsed: 0, userTappedReveal: false }, effects));
    expect(r1).toMatchObject({ next: "HOLD", roundsUsed: 1, locked: false });

    const r2 = await commitRound(input({ roundsUsed: 1, userTappedReveal: false }, effects));
    expect(r2).toMatchObject({ next: "HOLD", roundsUsed: 2, locked: false });

    // rounds 1-2 touched no money/persist/telemetry
    expect(effects.charge).toHaveBeenCalledTimes(0);
    expect(effects.rake).toHaveBeenCalledTimes(0);
    expect(effects.persistLock).toHaveBeenCalledTimes(0);
    expect(effects.telemetry).toHaveBeenCalledTimes(0);

    const r3 = await commitRound(input({ roundsUsed: 2, userTappedReveal: false }, effects));
    expect(r3).toMatchObject({ next: "REVEALING", roundsUsed: 3, locked: true });

    // exactly one of each, only at the lock transition
    expect(effects.charge).toHaveBeenCalledTimes(1);
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.rake).toHaveBeenCalledTimes(1);
    expect(effects.persistLock).toHaveBeenCalledTimes(1);
    expect(effects.telemetry).toHaveBeenCalledTimes(2); // lineup_locked + entry_fee_committed
  });

  it("1-round hand (lock immediately): one charge, one rake", async () => {
    const { effects, charges } = makeSpies();
    const r = await commitRound(input({ roundsUsed: 0, userTappedReveal: true }, effects));
    expect(r).toMatchObject({ next: "REVEALING", locked: true });
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.rake).toHaveBeenCalledTimes(1);
  });

  it("2-round hand (loop once, then lock): one charge", async () => {
    const { effects, charges } = makeSpies();
    const r1 = await commitRound(input({ roundsUsed: 0, userTappedReveal: false }, effects));
    expect(r1.next).toBe("HOLD");
    const r2 = await commitRound(input({ roundsUsed: 1, userTappedReveal: true }, effects));
    expect(r2.next).toBe("REVEALING");
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.charge).toHaveBeenCalledTimes(1);
  });

  it("auto-locks at MAX_ROUNDS even without an explicit lock tap", async () => {
    const { effects } = makeSpies();
    await commitRound(input({ roundsUsed: MAX_ROUNDS - 1, userTappedReveal: false }, effects));
    expect(effects.charge).toHaveBeenCalledTimes(1);
  });
});

describe("_roundMachine — pinned crash-boundary contracts", () => {
  // ── Lock-sequence ORDER (not just counts): persist must resolve BEFORE charge ─
  it("lock sequence order: lineup_locked → persistLock(awaited) → charge → entry_fee_committed → rake", async () => {
    const { effects, order } = makeSpies();
    await commitRound(input({ roundsUsed: 0, userTappedReveal: true }, effects));
    expect(order).toEqual([
      "lineup_locked",
      "persistLock",          // resolved (awaited) before charge — crash-boundary safety
      "charge",
      "entry_fee_committed",
      "rake",
    ]);
  });

  it("persistLock fully resolves before charge fires (await is real, not fire-and-forget)", async () => {
    const order: string[] = [];
    const effects: RoundLockEffects = {
      telemetry: () => {},
      persistLock: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5)); // slow persist
        order.push("persist-done");
      }),
      charge: vi.fn(() => { order.push("charge"); }),
      rake: () => {},
    };
    await commitRound(input({ roundsUsed: 0, userTappedReveal: true }, effects));
    expect(order).toEqual(["persist-done", "charge"]); // charge waited for the slow persist
  });

  // ── Persist record carries RESOLVED FP, not card ids ────────────────────────
  it("persisted lock record carries resolved FP/tier (reconstructable owed result)", async () => {
    const { effects, lockRecords } = makeSpies();
    await commitRound(input({ roundsUsed: 0, userTappedReveal: true }, effects));
    const rec = lockRecords[0];
    expect(rec.totalFp).toBeGreaterThan(0);                       // resolved, not zero
    expect(rec.tier).toBeTruthy();
    expect(rec.roster.every((c: any) => typeof c.actualFp === "number")).toBe(true);
    expect(rec.roster[0].actualFp).toBeGreaterThan(0);            // FP, not just an id
  });

  // ── Money-in / result-out reconcile ─────────────────────────────────────────
  it("reconcile: persisted payout was computed from the SAME entryFee that was charged", async () => {
    const { effects, lockRecords, charges } = makeSpies();
    await commitRound(input({ roundsUsed: 0, userTappedReveal: true }, effects));
    const rec = lockRecords[0];
    const chargedFee = charges[0];
    expect(rec.entryFee).toBe(chargedFee);                        // record fee == charged fee
    const expected = resolveOutcome(resolvedRoster, chargedFee, STREAK).payout;
    expect(rec.payout).toBe(expected);                            // payout derived from that fee
  });
});
