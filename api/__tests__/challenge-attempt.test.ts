/**
 * Contract tests for the authoritative challenge-attempt boundary.
 * The request may contain only a verified hand reference and presentation
 * metadata; score, winner and roster are loaded from hand_log on the server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state, notificationInsertSpy, authGetUser } = vi.hoisted(() => ({
  state: {
    challengeSingleCalls: 0,
    challenge: null as any,
    hand: null as any,
    priorAttempts: { data: [] as any[], error: null },
    insertedAttempt: null as any,
    updatedCounters: null as any,
  },
  notificationInsertSpy: vi.fn(),
  authGetUser: vi.fn(),
}));

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const builder = (table: string) => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.insert = vi.fn(() => b);
    b.maybeSingle = vi.fn(() => {
      if (table === "hand_log") return Promise.resolve(state.hand);
      return Promise.resolve({ data: null, error: null });
    });
    b.single = vi.fn(() => {
      if (table === "shared_challenges") {
        state.challengeSingleCalls += 1;
        return Promise.resolve(
          state.challengeSingleCalls === 1 ? state.challenge : state.updatedCounters,
        );
      }
      if (table === "challenge_attempts") return Promise.resolve(state.insertedAttempt);
      return Promise.resolve({ data: null, error: null });
    });
    b.then = (resolve: any) => {
      if (table === "challenge_attempts") return resolve(state.priorAttempts);
      return resolve({ data: null, error: null });
    };
    return b;
  };

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "user_notifications") {
          return { insert: vi.fn((payload: any) => {
            notificationInsertSpy(payload);
            return Promise.resolve({ data: null, error: null });
          }) };
        }
        return builder(table);
      }),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
    supabaseAuth: { auth: { getUser: authGetUser } },
  };
});

import handler from "../challenge/[id]/attempt.ts";

const VALID_ID = "00000000-0000-4000-8000-000000000001";
const HAND_ID = "33333333-3333-4333-8333-333333333333";
const OWNER = "11111111-1111-4111-8111-111111111111";
const ATTEMPTER = "22222222-2222-4222-8222-222222222222";

function makeReq(body: any, token = "test-token"): any {
  return {
    method: "POST",
    query: { id: VALID_ID },
    body,
    headers: { authorization: `Bearer ${token}` },
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.challengeSingleCalls = 0;
  state.challenge = {
    data: {
      challenge_id: VALID_ID,
      created_by: OWNER,
      sender_kind: "human",
      instance_key: null,
      sport: "basketball",
      season: "2425",
      target_fp: 90,
      attempt_count: 0,
      winner_count: 0,
      best_score: null,
      best_user_name: null,
    },
    error: null,
  };
  state.hand = {
    data: {
      hand_id: HAND_ID,
      player_id: ATTEMPTER,
      sport: "basketball",
      season: "2425",
      total_fp: 100,
      final_roster: [{ id: "server-card", actualFp: 100 }],
      verified: true,
    },
    error: null,
  };
  state.priorAttempts = { data: [], error: null };
  state.insertedAttempt = {
    data: { attempt_id: "att-1", created_at: new Date().toISOString() },
    error: null,
  };
  state.updatedCounters = {
    data: { attempt_count: 1, winner_count: 1, best_score: 100, best_user_name: "Alice" },
    error: null,
  };
  authGetUser.mockResolvedValue({ data: { user: { id: ATTEMPTER } }, error: null });
});

describe("POST /api/challenge/:id/attempt", () => {
  it("derives score, winner and roster from the verified hand, ignoring forged client fields", async () => {
    const res = makeRes();
    await handler(makeReq({
      hand_id: HAND_ID,
      user_name: "Alice",
      score: 9999,
      is_winner: false,
      score_breakdown: [{ id: "forged" }],
    }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationInsertSpy).toHaveBeenCalledTimes(1);
    const notification = notificationInsertSpy.mock.calls[0][0];
    expect(notification.payload).toMatchObject({
      attempter_user_id: ATTEMPTER,
      attempter_score: 100,
      target_score: 90,
      is_winner: true,
      attempter_roster: [{ id: "server-card", actualFp: 100 }],
    });
  });

  it("rejects requests without a valid bearer token", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid" } });
    const res = makeRes();
    await handler(makeReq({ hand_id: HAND_ID }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("does not notify on a self-farm attempt", async () => {
    state.challenge.data.created_by = ATTEMPTER;
    const res = makeRes();
    await handler(makeReq({ hand_id: HAND_ID, score: 1, is_winner: false }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notificationInsertSpy).not.toHaveBeenCalled();
  });
});
