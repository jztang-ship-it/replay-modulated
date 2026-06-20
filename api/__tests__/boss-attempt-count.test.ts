/**
 * api/__tests__/boss-attempt-count.test.ts
 *
 * Phase 2-mount Step 2 — KV-only boss participation counter. A boss attempt
 * increments boss:basketball:attempts:{bossDate} ONCE per distinct player's
 * first attempt (gated on attemptCountBumped — the players-not-attempts,
 * replay-proof signal), keyed by the boss's own date from instance_key.
 *   - boss first attempt        → kv.incr fires on the boss's date key
 *   - boss non-first (replay)    → no incr (players, not attempts)
 *   - non-boss (human) attempt   → no incr
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockState, kvIncrSpy, kvExpireSpy } = vi.hoisted(() => {
  const mockState: any = {
    challenge: null,
    priorAttempts: { data: [], error: null },
    insertedAttempt: null,
    updatedCounters: null,
    sharedChallengesSingleCallCount: 0,
  };
  return { mockState, kvIncrSpy: vi.fn().mockResolvedValue(1), kvExpireSpy: vi.fn().mockResolvedValue(1) };
});

vi.mock("@vercel/kv", () => ({ kv: { incr: kvIncrSpy, expire: kvExpireSpy } }));

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const sharedChallengesBuilder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.single = vi.fn(() => {
      mockState.sharedChallengesSingleCallCount++;
      return Promise.resolve(
        mockState.sharedChallengesSingleCallCount === 1 ? mockState.challenge : mockState.updatedCounters,
      );
    });
    b.then = (resolve: any) => resolve({ data: null, error: null });
    return b;
  };
  const challengeAttemptsBuilder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve(mockState.insertedAttempt));
    b.then = (resolve: any) => resolve(mockState.priorAttempts);
    return b;
  };
  const userNotificationsBuilder = () => ({ insert: vi.fn(() => ({ then: (r: any) => r({ data: null, error: null }) })) });
  return {
    supabaseAdmin: {
      from: vi.fn((t: string) =>
        t === "shared_challenges" ? sharedChallengesBuilder()
        : t === "challenge_attempts" ? challengeAttemptsBuilder()
        : userNotificationsBuilder()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

import handler from "../challenge/[id]/attempt.ts";

const VALID_ID = "00000000-0000-4000-8000-0000000000cc";
const ATTEMPTER = "22222222-2222-4222-8222-222222222222";
const BOSS_INSTANCE_KEY = "2026-08-01|0|BOS-2324";

function makeReq(body: any): any { return { method: "POST", query: { id: VALID_ID }, body, headers: {} }; }
function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

function bossChallenge() {
  return {
    data: {
      challenge_id: VALID_ID, created_by: null, sender_kind: "boss",
      instance_key: BOSS_INSTANCE_KEY, target_fp: 142.5,
      attempt_count: 0, winner_count: 0, best_score: null, best_user_name: null,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.challenge = bossChallenge();
  mockState.priorAttempts = { data: [], error: null };
  mockState.insertedAttempt = { data: { attempt_id: "att-1", created_at: new Date().toISOString() }, error: null };
  mockState.updatedCounters = { data: { attempt_count: 1, winner_count: 0, best_score: 100, best_user_name: "Alice" }, error: null };
  mockState.sharedChallengesSingleCallCount = 0;
});

describe("Phase 2-mount Step 2 — boss participation counter (KV-only)", () => {
  it("boss FIRST attempt increments boss:basketball:attempts:{bossDate}", async () => {
    const res = makeRes();
    await handler(makeReq({ score: 150, is_winner: true, user_id: ATTEMPTER, user_name: "Alice" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(kvIncrSpy).toHaveBeenCalledTimes(1);
    expect(kvIncrSpy).toHaveBeenCalledWith("boss:basketball:attempts:2026-08-01");
    // TTL set on the counter key.
    expect(kvExpireSpy).toHaveBeenCalledWith("boss:basketball:attempts:2026-08-01", expect.any(Number));
  });

  it("boss NON-FIRST attempt (replay, prior exists) does NOT increment — players, not attempts", async () => {
    // A prior attempt by the same user, window still open → attemptCountBumped false.
    mockState.priorAttempts = {
      data: [{ score: 90, is_winner: false, created_at: new Date().toISOString() }],
      error: null,
    };
    const res = makeRes();
    await handler(makeReq({ score: 150, is_winner: true, user_id: ATTEMPTER, user_name: "Alice" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(kvIncrSpy).not.toHaveBeenCalled();
  });

  it("non-boss (human) attempt does NOT touch the boss counter", async () => {
    mockState.challenge = {
      data: {
        challenge_id: VALID_ID, created_by: "11111111-1111-4111-8111-111111111111",
        sender_kind: "player", instance_key: null, target_fp: 90,
        attempt_count: 0, winner_count: 0, best_score: null, best_user_name: null,
      },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq({ score: 100, is_winner: true, user_id: ATTEMPTER, user_name: "Alice" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(kvIncrSpy).not.toHaveBeenCalled();
  });
});
