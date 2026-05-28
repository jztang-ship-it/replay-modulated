/**
 * api/__tests__/challenge-attempt.test.ts
 *
 * Phase 5b commit 2 (2026-05-28): contract-lock on the user_notifications
 * insert payload. The sender-side overlay (phase 5b commits 3-4) reads
 * the attempter's roster from this payload; the field name + shape must
 * stay frozen.
 *
 * Strategy: mock supabaseAdmin at the supabaseServer module boundary
 * (same pattern as challenge-sender-hand.test.ts). Drive a "counted
 * attempt" (first attempt, not self-farm, window open) — that's the
 * branch that fires the notification insert. Spy on the insert call
 * and assert payload shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockState, notificationInsertSpy } = vi.hoisted(() => {
  const mockState: any = {
    challenge: null,
    priorAttempts: { data: [], error: null },
    insertedAttempt: null,
    updatedCounters: null,
    sharedChallengesSingleCallCount: 0,
  };
  const notificationInsertSpy = vi.fn();
  return { mockState, notificationInsertSpy };
});

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const sharedChallengesBuilder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.single = vi.fn(() => {
      mockState.sharedChallengesSingleCallCount++;
      // 1st single() — challenge fetch. 2nd — updated counters at end.
      return Promise.resolve(
        mockState.sharedChallengesSingleCallCount === 1
          ? mockState.challenge
          : mockState.updatedCounters,
      );
    });
    // For `await ...update(...).eq(...)` — the builder is awaited directly.
    b.then = (resolve: any) => resolve({ data: null, error: null });
    return b;
  };

  const challengeAttemptsBuilder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    // .insert(...).select(...).single() resolves the inserted-row data.
    b.single = vi.fn(() => Promise.resolve(mockState.insertedAttempt));
    // `await q` after .select().eq().order().eq() resolves prior attempts.
    b.then = (resolve: any) => resolve(mockState.priorAttempts);
    return b;
  };

  const userNotificationsBuilder = () => {
    const b: any = {};
    b.insert = vi.fn((arg: any) => {
      notificationInsertSpy(arg);
      return { then: (resolve: any) => resolve({ data: null, error: null }) };
    });
    return b;
  };

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "shared_challenges") return sharedChallengesBuilder();
        if (table === "challenge_attempts") return challengeAttemptsBuilder();
        if (table === "user_notifications") return userNotificationsBuilder();
        return {};
      }),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

import handler from "../challenge/[id]/attempt.ts";

function makeReq(body: any): any {
  return {
    method: "POST",
    query: { id: VALID_ID },
    body,
    headers: {},
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_ID = "00000000-0000-4000-8000-000000000001";
const CHALLENGE_OWNER = "11111111-1111-4111-8111-111111111111";
const ATTEMPTER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mockState.challenge = {
    data: {
      challenge_id: VALID_ID,
      created_by: CHALLENGE_OWNER,
      target_fp: 90,
      attempt_count: 0,
      winner_count: 0,
      best_score: null,
      best_user_name: null,
    },
    error: null,
  };
  mockState.priorAttempts = { data: [], error: null };
  mockState.insertedAttempt = {
    data: { attempt_id: "att-1", created_at: new Date().toISOString() },
    error: null,
  };
  mockState.updatedCounters = {
    data: { attempt_count: 1, winner_count: 1, best_score: 100, best_user_name: "Alice" },
    error: null,
  };
  mockState.sharedChallengesSingleCallCount = 0;
});

describe("POST /api/challenge/:id/attempt — notification payload (phase 5b commit 2)", () => {
  it("writes attempter_roster into user_notifications.payload alongside existing fields", async () => {
    const score_breakdown = [
      {
        id: "p1", basePlayerId: "p1", name: "Alice Card", salary: 50,
        tier: "PURPLE", slotIndex: 0, wasHeld: false, actualFp: 25,
      },
      {
        id: "p2", basePlayerId: "p2", name: "Bob Card", salary: 60,
        tier: "RED", slotIndex: 1, wasHeld: true, actualFp: 30,
      },
    ];

    const res = makeRes();
    await handler(
      makeReq({
        score: 100,
        is_winner: true,
        user_id: ATTEMPTER, // attempter != owner → not self-farm
        user_name: "Alice",
        score_breakdown,
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationInsertSpy).toHaveBeenCalledTimes(1);

    const inserted = notificationInsertSpy.mock.calls[0][0];
    expect(inserted.user_id).toBe(CHALLENGE_OWNER);
    expect(inserted.type).toBe("challenge_attempted");

    // Existing fields preserved verbatim.
    expect(inserted.payload).toMatchObject({
      challenge_id: VALID_ID,
      attempter_name: "Alice",
      attempter_user_id: ATTEMPTER,
      attempter_score: 100,
      target_score: 90,
      is_winner: true,
    });

    // NEW: attempter_roster is the same blob the client posted.
    expect(inserted.payload.attempter_roster).toEqual(score_breakdown);
  });

  it("writes attempter_roster: null when score_breakdown is omitted", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        score: 85,
        is_winner: false,
        user_id: ATTEMPTER,
        user_name: "Alice",
        // score_breakdown intentionally omitted (legacy / pre-phase-5b client)
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationInsertSpy).toHaveBeenCalledTimes(1);
    const inserted = notificationInsertSpy.mock.calls[0][0];
    expect(inserted.payload.attempter_roster).toBeNull();
  });

  it("does not insert a notification on self-farm attempts", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        score: 100,
        is_winner: true,
        user_id: CHALLENGE_OWNER, // attempter = owner → self-farm
        user_name: "Alice",
        score_breakdown: [{ id: "p1" }],
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    // Self-farm is gated out by `isCountedAttempt`; payload never written.
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});
