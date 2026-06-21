/**
 * api/__tests__/boss-ensure-daily-instance.test.ts
 *
 * Phase 2 (boss delivery consumer), Commit 2. Two pins:
 *
 *  (A) The byte-identical regeneration pin the contract calls for — materialize
 *      the same (identity, seed) twice and assert projectSenderFacing is
 *      byte-identical (totalToBeat, the five {name,pos,fp}, toughDay). This is
 *      the determinism guarantee the shared comparison rests on; it lives HERE,
 *      in the consumer, not just in the generator suite.
 *
 *  (B) The writer maps ONLY the sender-facing fields (never the rolled blob),
 *      routes the natural key to instance_key (not the uuid PK), writes
 *      created_by:null, and is idempotent (later callers resolve the same uuid).
 *
 * supabaseAdmin is mocked at the module boundary (same pattern as
 * challenge-attempt.test.ts); the identity resolver is injected so the heavy
 * bank/season disk loads never run.
 */
import { describe, it, expect, vi } from "vitest";
import {
  dailyInstanceSeed,
  projectSenderFacing,
  materializeIdentity,
} from "../../basketball/src/tools/bossContract.ts";
import type { Boss } from "../../basketball/src/tools/bossGenerator.ts";
import { ensureDailyInstance, type ResolvedBossBaked } from "../boss/_lib/ensureDailyInstance.ts";

// Mock the service-role client so importing ensureDailyInstance doesn't require
// SUPABASE_SERVICE_ROLE_KEY (the lazy proxy throws on access without it). The
// tests below inject their own client via deps, so this is just an import guard.
vi.mock("../hand/_lib/supabaseServer.js", () => ({
  supabaseAdmin: {},
  supabaseAuth: {},
}));

function synthBoss(): Boss {
  const starters = [0, 1, 2, 3, 4].map(i => ({
    name: `P${i}`, pos: ["PG", "SG", "SF", "PF", "C"][i],
    gamePool: [24, 26, 28, 30], gp: 70, avgMin: 34, meanFp: 27, traded: false,
  }));
  return {
    season: "2324", team: "BOS", starters,
    expected: 135, expectedRaw: 135, floor: 120, ceiling: 150, rollDepth: 70,
    startersComplete: true, tradedStarter: false, thin: null, gpFloor: 25,
    key: "BOS-2324", tier: "champ", era_id: "CELTICS_BANNER18",
    display: "Banner 18", flavor: "Tatum and Brown finish it",
  } as Boss;
}
const BAND: [number, number] = [120, 150];
const DATE = "2026-08-01";
const SLOT = 0;

const SYNTH_TARGET = 142.5; // an OPAQUE baked target the writer must read verbatim
function synthResolve(): (date: string, slot: number) => ResolvedBossBaked {
  return (date, slot) => {
    const boss = synthBoss();
    const identity = materializeIdentity(boss, "v1.2");
    const seed = dailyInstanceSeed(identity.identityId, date, slot, "daily", BAND, "v1.2", "daily");
    const revealedFive = boss.starters.map((s, i) => ({
      basePlayerId: `bp${i}`, name: s.name, pos: s.pos, salary: 50, tier: "PURPLE", fp: 28.5,
    }));
    return { boss, identity, seed, target: SYNTH_TARGET, revealedFive, marquee: false };
  };
}

describe("Commit 2 (A) — byte-identical regeneration pin", () => {
  it("the same (identity, seed) projects byte-identically across two materializations", () => {
    const boss = synthBoss();
    const seed = dailyInstanceSeed("BOS-2324", DATE, SLOT, "daily", BAND, "v1.2", "daily");

    const first = projectSenderFacing(boss, seed);
    const second = projectSenderFacing(boss, seed);

    // Byte-identical — the literal serialization must match, not just deep-eq.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    // And the specific fields the comparison surface reads.
    expect(second.totalToBeat).toBe(first.totalToBeat);
    expect(second.toughDay).toBe(first.toughDay);
    expect(second.presentedFive).toEqual(first.presentedFive);
    expect(second.presentedFive).toHaveLength(5);
    for (const c of second.presentedFive) {
      expect(Object.keys(c).sort()).toEqual(["fp", "name", "pos"]);
    }
  });
});

// A minimal supabase mock: records inserts, lets a test seed a pre-existing row
// keyed by instance_key so the idempotent re-resolve path can be driven.
function makeClient(opts: {
  existing?: Record<string, { challenge_id: string }>;
  // Keys that maybeSingle is forced to MISS on its first check even though the
  // row exists — simulates a concurrent caller that inserted after our
  // pre-check snapshot, so our insert hits the unique index and we must
  // re-select. After the first forced miss the key behaves normally.
  hideFromMaybeSingleOnce?: string[];
} = {}) {
  const existing: Record<string, { challenge_id: string }> = opts.existing ?? {};
  const hideOnce = new Set(opts.hideFromMaybeSingleOnce ?? []);
  const insertSpy = vi.fn();
  let autoId = 0;

  const builder = (table: string) => {
    const state: { op?: "select" | "insert"; key?: string; payload?: any } = {};
    const b: any = {};
    b.select = vi.fn(() => { state.op = state.op ?? "select"; return b; });
    b.eq = vi.fn((_col: string, val: string) => { state.key = val; return b; });
    b.insert = vi.fn((payload: any) => {
      state.op = "insert";
      state.payload = payload;
      insertSpy(payload);
      return b;
    });
    b.maybeSingle = vi.fn(() => {
      if (state.key && hideOnce.has(state.key)) {
        hideOnce.delete(state.key); // forced miss once, then visible
        return Promise.resolve({ data: null, error: null });
      }
      const row = state.key ? existing[state.key] : undefined;
      return Promise.resolve({ data: row ?? null, error: null });
    });
    b.single = vi.fn(() => {
      if (state.op === "insert") {
        const key = state.payload?.instance_key;
        // Simulate the unique index: a row already present means the insert
        // races and fails; the handler must re-select.
        if (key && existing[key]) {
          return Promise.resolve({ data: null, error: { message: "duplicate key" } });
        }
        const challenge_id = `uuid-${++autoId}`;
        if (key) existing[key] = { challenge_id };
        return Promise.resolve({ data: { challenge_id }, error: null });
      }
      const row = state.key ? existing[state.key] : undefined;
      return Promise.resolve({ data: row ?? null, error: row ? null : { message: "not found" } });
    });
    void table;
    return b;
  };

  const client: any = { from: vi.fn((t: string) => builder(t)) };
  return { client, insertSpy, existing };
}

describe("Commit 2 (B) — the writer maps only sender-facing fields, idempotently", () => {
  it("writes instance_key (not the uuid PK), created_by:null, sender_kind boss, and NO rolled blob", async () => {
    const { client, insertSpy } = makeClient();
    const id = await ensureDailyInstance(DATE, SLOT, { resolve: synthResolve(), client });

    expect(id).toBe("uuid-1");
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0];

    // Natural key routed to instance_key; the uuid PK is NOT written.
    expect(payload.instance_key).toBe(`${DATE}|${SLOT}|BOS-2324`);
    expect(payload).not.toHaveProperty("challenge_id");

    // Ownerless boss.
    expect(payload.created_by).toBeNull();
    expect(payload.sender_kind).toBe("boss");

    // NOT NULL columns with no default (migration 005) are satisfied.
    expect(payload.hand_id).toBe(`${DATE}|${SLOT}|BOS-2324`);
    expect(payload.slate_seed).toBe("");

    // OPAQUE-TARGET SEAM: target_fp is the BAKED target read verbatim — NOT rolled
    // here. (Recalibration = change the artifact; this read is unchanged.)
    expect(payload.target_fp).toBe(SYNTH_TARGET);
    // Playable snapshot — {v:1, sport, cards} so the recipient landing's
    // validateRosterSnapshot accepts it; cards are the revealable five.
    expect((payload.initial_roster as any).v).toBe(1);
    expect((payload.initial_roster as any).sport).toBe("basketball");
    expect((payload.initial_roster as any).cards).toHaveLength(5);
    expect((payload.initial_roster as any).cards[0]).toMatchObject({ basePlayerId: "bp0", salary: 50, tier: "PURPLE" });

    // Sender-facing only — NO rolled blob / generator internals anywhere.
    expect(JSON.stringify(payload)).not.toMatch(
      /\bpicks\b|\bgi\b|\battempts\b|\bstatus\b|\bband\b|rejection|dailyHit|raidHit|seedParams|\broute\b/i,
    );
  });

  it("is idempotent: a second call resolves the SAME uuid without inserting again", async () => {
    const { client, insertSpy } = makeClient();
    const first = await ensureDailyInstance(DATE, SLOT, { resolve: synthResolve(), client });
    const second = await ensureDailyInstance(DATE, SLOT, { resolve: synthResolve(), client });

    expect(second).toBe(first);
    // Only the first call inserts; the second resolves via maybeSingle.
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("survives the insert race: unique-violation falls back to a re-select of the shared uuid", async () => {
    const key = `${DATE}|${SLOT}|BOS-2324`;
    // A concurrent caller already created the row (existing[key]), but our
    // pre-check snapshot misses it once → our insert hits the unique index and
    // .single() returns a duplicate-key error → the writer re-selects.
    const { client, insertSpy } = makeClient({
      existing: { [key]: { challenge_id: "uuid-concurrent" } },
      hideFromMaybeSingleOnce: [key],
    });

    const id = await ensureDailyInstance(DATE, SLOT, { resolve: synthResolve(), client });

    // Resolves to the concurrent caller's uuid, not a new one.
    expect(id).toBe("uuid-concurrent");
    // We did attempt the insert (that's what triggered the race fallback).
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
