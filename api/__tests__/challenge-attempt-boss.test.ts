/**
 * api/__tests__/challenge-attempt-boss.test.ts
 *
 * Phase 2 (boss delivery consumer), Commit 4. A counted attempt against a boss
 * row (created_by null, sender_kind 'boss') must:
 *   - write the attempt row (audit trail unchanged),
 *   - increment the challenge-level counters (best_score etc. — the free
 *     "who holds today's Bulls" belt-precursor), and
 *   - fire NO user_notifications insert (a boss has no owner to notify).
 *
 * Mirrors challenge-attempt.test.ts; flips the row to a boss and adds spies on
 * the attempt insert + the shared_challenges counter update.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockState, notificationInsertSpy, attemptInsertSpy, challengeUpdateSpy } = vi.hoisted(() => {
  const mockState: any = {
    challenge: null,
    priorAttempts: { data: [], error: null },
    insertedAttempt: null,
    updatedCounters: null,
    sharedChallengesSingleCallCount: 0,
  };
  return {
    mockState,
    notificationInsertSpy: vi.fn(),
    attemptInsertSpy: vi.fn(),
    challengeUpdateSpy: vi.fn(),
  };
});

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const sharedChallengesBuilder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.update = vi.fn((arg: any) => { challengeUpdateSpy(arg); return b; });
    b.single = vi.fn(() => {
      mockState.sharedChallengesSingleCallCount++;
      return Promise.resolve(
        mockState.sharedChallengesSingleCallCount === 1
          ? mockState.challenge
          : mockState.updatedCounters,
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
    b.insert = vi.fn((arg: any) => { attemptInsertSpy(arg); return b; });
    b.single = vi.fn(() => Promise.resolve(mockState.insertedAttempt));
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

const VALID_ID = "00000000-0000-4000-8000-0000000000bb";
const ATTEMPTER = "22222222-2222-4222-8222-222222222222";

function makeReq(body: any): any {
  return { method: "POST", query: { id: VALID_ID }, body, headers: {} };
}
function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Boss row: ownerless (created_by null) + sender_kind boss.
  mockState.challenge = {
    data: {
      challenge_id: VALID_ID,
      created_by: null,
      sender_kind: "boss",
      target_fp: 142.5,
      attempt_count: 0,
      winner_count: 0,
      best_score: null,
      best_user_name: null,
    },
    error: null,
  };
  mockState.priorAttempts = { data: [], error: null };
  mockState.insertedAttempt = {
    data: { attempt_id: "att-boss-1", created_at: new Date().toISOString() },
    error: null,
  };
  mockState.updatedCounters = {
    data: { attempt_count: 1, winner_count: 1, best_score: 150, best_user_name: "Alice" },
    error: null,
  };
  mockState.sharedChallengesSingleCallCount = 0;
});

describe("POST /api/challenge/:id/attempt — boss safety (Commit 4)", () => {
  it("writes the attempt row, increments counters, and fires NO notification for a boss", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        score: 150,
        is_winner: true,
        user_id: ATTEMPTER,
        user_name: "Alice",
        score_breakdown: [{ id: "p1" }],
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);

    // Attempt row written (audit trail unchanged).
    expect(attemptInsertSpy).toHaveBeenCalledTimes(1);
    expect(attemptInsertSpy.mock.calls[0][0]).toMatchObject({
      challenge_id: VALID_ID,
      user_id: ATTEMPTER,
      score: 150,
      is_winner: true,
    });

    // Challenge-level counters bumped — the free belt-precursor.
    expect(challengeUpdateSpy).toHaveBeenCalled();
    const updateArgs = challengeUpdateSpy.mock.calls.map(c => c[0]);
    expect(updateArgs.some(u => u.attempt_count === 1)).toBe(true);
    expect(updateArgs.some(u => u.best_score === 150 && u.best_user_name === "Alice")).toBe(true);

    // NO owner notification — a boss has no owner.
    expect(notificationInsertSpy).not.toHaveBeenCalled();

    // Response reflects the bumped counters.
    const payload = res.json.mock.calls[0][0];
    expect(payload.attempt_count).toBe(1);
    expect(payload.best_score).toBe(150);
  });

  it("a losing boss attempt also writes + counts but never notifies (no owner to defend)", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        score: 100,
        is_winner: false,
        user_id: ATTEMPTER,
        user_name: "Bob",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(attemptInsertSpy).toHaveBeenCalledTimes(1);
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});
