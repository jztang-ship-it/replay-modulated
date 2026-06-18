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
      return { ok: true as const, handId: "h-test" };
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
  // ── HEADLINE: deal=lineup 1, then 2 rerolls → exactly one charge, on the 2nd ─
  // Round model: the deal is lineup 1 (choreography sets roundsUsed=1; NOT a
  // commit). The player rerolls twice (3 lineups total); lock fires on the 2nd
  // reroll. maxRounds=3.
  it("basketball (maxRounds 3): deal=lineup 1, 2 rerolls → lock on the 2nd (3 lineups, one charge)", async () => {
    const { effects, charges } = makeSpies();

    // reroll 1 (from lineup 1): loops to lineup 2, zero effects
    const r1 = await commitRound(input({ roundsUsed: 1, userTappedReveal: false }, effects));
    expect(r1).toMatchObject({ next: "HOLD", roundsUsed: 2, locked: false });
    expect(effects.charge).toHaveBeenCalledTimes(0);
    expect(effects.persistLock).toHaveBeenCalledTimes(0);
    expect(effects.telemetry).toHaveBeenCalledTimes(0);

    // reroll 2 (from lineup 2): LOCK → lineup 3 reveals
    const r2 = await commitRound(input({ roundsUsed: 2, userTappedReveal: false }, effects));
    expect(r2).toMatchObject({ next: "REVEALING", roundsUsed: 3, locked: true });
    expect(effects.charge).toHaveBeenCalledTimes(1);
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.rake).toHaveBeenCalledTimes(1);
    expect(effects.persistLock).toHaveBeenCalledTimes(1);
    expect(effects.telemetry).toHaveBeenCalledTimes(2); // lineup_locked + entry_fee_committed
  });

  it("single-shot (maxRounds 1): the first reroll locks = today's behavior, one charge", async () => {
    const { effects, charges } = makeSpies();
    // deal set roundsUsed=1; first reroll: 1+1 >= 1 → lock immediately
    const r = await commitRound(input({ roundsUsed: 1, maxRounds: 1, userTappedReveal: false }, effects));
    expect(r).toMatchObject({ next: "REVEALING", locked: true });
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.charge).toHaveBeenCalledTimes(1);
  });

  it("early lock (userTappedReveal): locks before maxRounds, one charge (B2 control)", async () => {
    const { effects, charges } = makeSpies();
    const r = await commitRound(input({ roundsUsed: 1, userTappedReveal: true }, effects));
    expect(r).toMatchObject({ next: "REVEALING", locked: true });
    expect(charges).toEqual([ENTRY_FEE]);
    expect(effects.rake).toHaveBeenCalledTimes(1);
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

  it("slow-but-successful persist: charge fires AFTER persist resolves (ordering preserved)", async () => {
    const order: string[] = [];
    const effects: RoundLockEffects = {
      telemetry: () => {},
      persistLock: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5)); // slow persist that still confirms
        order.push("persist-done");
        return { ok: true as const, handId: "h-slow" };
      }),
      charge: vi.fn(() => { order.push("charge"); }),
      rake: () => {},
    };
    await commitRound(input({ roundsUsed: 1, userTappedReveal: true }, effects));
    expect(order).toEqual(["persist-done", "charge"]); // charge waited for the slow persist
  });

  // ── THE HANG FIX: persist false → NO charge, skipped telemetry, still REVEALING ─
  it("persist failure (ok:false): NO charge, entry_fee_skipped(handId+reason), still REVEALING", async () => {
    const events: Array<{ ev: string; meta?: any }> = [];
    let charged = false;
    const effects: RoundLockEffects = {
      telemetry: (ev, meta) => events.push({ ev, meta }),
      persistLock: async () => ({ ok: false, handId: "h-fail", reason: "timeout" as const }),
      charge: () => { charged = true; },
      rake: () => {},
    };
    const r = await commitRound(input({ roundsUsed: 1, userTappedReveal: true }, effects));
    expect(r.next).toBe("REVEALING");   // reveal is NEVER blocked by a failed persist
    expect(charged).toBe(false);        // no charge without a confirmed record (safe direction)
    const skip = events.find(e => e.ev === "entry_fee_skipped");
    expect(skip?.meta).toMatchObject({ handId: "h-fail", reason: "timeout" });
    expect(events.find(e => e.ev === "entry_fee_committed")).toBeUndefined();
  });

  // ── Anon fast-path: persist confirms (logHandToDb no-ops) → charge fires ──────
  it("anon fast-path: persist ok:true (logHandToDb no-op) → charge DOES fire", async () => {
    const { effects, charges } = makeSpies(); // makeSpies persistLock returns ok:true
    await commitRound(input({ roundsUsed: 1, userTappedReveal: true }, effects));
    expect(charges).toEqual([ENTRY_FEE]); // anon hands still charge — must not regress
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
