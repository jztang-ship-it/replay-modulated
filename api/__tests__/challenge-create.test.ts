/**
 * api/__tests__/challenge-create.test.ts
 *
 * Phase 5c (post-Path-A diagnostic, 2026-06-01): the missing test that
 * would have caught the silent server-side drop of trigger-detail fields.
 *
 * Pattern: mock supabaseAdmin + verifyAuth; call the handler with a body
 * that includes all four trigger-detail fields (anchor_base_player_id,
 * top_game_tier, near_miss_gap, near_miss_next_tier); CAPTURE the object
 * passed to supabase.from("shared_challenges").insert(...) and assert it
 * carries the four fields under the correct column names with the correct
 * values.
 *
 * This is the test gap the previous mocks (useChallengeShare body, real
 * evaluateTrigger emission) didn't cover. The previous tests proved the
 * client SENDS the fields; this test proves the server function's
 * destructure → insert mapping is wired correctly. Code static-read can
 * miss subtle drops (field misnaming, conditional stripping, transform
 * functions); a runtime mock test cannot.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { capturedInserts, makeBuilder } = vi.hoisted(() => {
  const capturedInserts: any[] = [];
  const makeBuilder = () => {
    const builder: any = {};
    builder.insert = vi.fn((payload: any) => {
      capturedInserts.push(payload);
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn(() =>
      Promise.resolve({
        data: {
          challenge_id: "test-challenge-uuid",
          anchor_base_player_id: capturedInserts[capturedInserts.length - 1]?.anchor_base_player_id ?? null,
          top_game_tier: capturedInserts[capturedInserts.length - 1]?.top_game_tier ?? null,
          near_miss_gap: capturedInserts[capturedInserts.length - 1]?.near_miss_gap ?? null,
          near_miss_next_tier: capturedInserts[capturedInserts.length - 1]?.near_miss_next_tier ?? null,
        },
        error: null,
      }),
    );
    return builder;
  };
  return { capturedInserts, makeBuilder };
});

vi.mock("../hand/_lib/supabaseServer.js", () => ({
  supabaseAdmin: {
    from: vi.fn(() => makeBuilder()),
  },
}));

vi.mock("../hand/_lib/auth.js", () => ({
  verifyAuth: vi.fn(async () => ({
    user: { id: "user-uuid-test" },
    error: null,
  })),
}));

import handler from "../challenge/create.ts";

function makeReq(body: any): any {
  return { method: "POST", body, headers: {} };
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

const BASE_BODY = {
  hand_id: "hand-1",
  sport: "basketball",
  season: "2425",
  target_score: 165,
  initial_roster: { cards: [] },
  challenger_name: "Test User",
  trigger_type: "default",
  share_headline: "headline",
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedInserts.length = 0;
});

describe("api/challenge/create — trigger-detail body→insert mapping", () => {
  it("passes all four trigger-detail fields into the supabase insert payload (the test that catches server-side drops)", async () => {
    const body = {
      ...BASE_BODY,
      trigger_type: "rare_pull",
      anchor_base_player_id: "1641705", // Wembanyama basePlayerId
      top_game_tier: "season",
    };
    await handler(makeReq(body), makeRes());
    expect(capturedInserts).toHaveLength(1);
    const payload = capturedInserts[0];
    expect(payload.trigger_type).toBe("rare_pull");
    expect(payload.anchor_base_player_id).toBe("1641705");
    expect(payload.top_game_tier).toBe("season");
    expect(payload.near_miss_gap).toBeNull();
    expect(payload.near_miss_next_tier).toBeNull();
  });

  it("passes bad_beat anchor through (regression-lock for the Path A null-anchor bug)", async () => {
    const body = {
      ...BASE_BODY,
      trigger_type: "bad_beat",
      anchor_base_player_id: "201942", // DeRozan — the basePlayerId observed in the live prod log
      top_game_tier: null,
      near_miss_gap: null,
      near_miss_next_tier: null,
    };
    await handler(makeReq(body), makeRes());
    expect(capturedInserts).toHaveLength(1);
    const payload = capturedInserts[0];
    expect(payload.trigger_type).toBe("bad_beat");
    expect(payload.anchor_base_player_id).toBe("201942");
    expect(payload.top_game_tier).toBeNull();
    expect(payload.near_miss_gap).toBeNull();
    expect(payload.near_miss_next_tier).toBeNull();
  });

  it("passes big_score anchor through", async () => {
    const body = {
      ...BASE_BODY,
      trigger_type: "big_score",
      anchor_base_player_id: "1628389", // Adebayo
    };
    await handler(makeReq(body), makeRes());
    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0].anchor_base_player_id).toBe("1628389");
  });

  it("passes miss gap + next_tier through", async () => {
    const body = {
      ...BASE_BODY,
      trigger_type: "miss",
      near_miss_gap: 2.5,
      near_miss_next_tier: "ALL_STAR",
    };
    await handler(makeReq(body), makeRes());
    expect(capturedInserts).toHaveLength(1);
    const payload = capturedInserts[0];
    expect(payload.trigger_type).toBe("miss");
    expect(payload.near_miss_gap).toBe(2.5);
    expect(payload.near_miss_next_tier).toBe("ALL_STAR");
    expect(payload.anchor_base_player_id).toBeNull();
    expect(payload.top_game_tier).toBeNull();
  });

  it("legacy body without the four detail fields → all four insert payload values are null (back-compat)", async () => {
    // A client that hasn't deployed the new payload shape yet. The
    // destructure should yield undefined → the ?? null fallback writes
    // null to all four columns. No throw.
    await handler(makeReq(BASE_BODY), makeRes());
    expect(capturedInserts).toHaveLength(1);
    const payload = capturedInserts[0];
    expect(payload.trigger_type).toBe("default");
    expect(payload.anchor_base_player_id).toBeNull();
    expect(payload.top_game_tier).toBeNull();
    expect(payload.near_miss_gap).toBeNull();
    expect(payload.near_miss_next_tier).toBeNull();
  });

  it("preserves existing payload fields (regression-guard against accidental destructure-without-insert drift)", async () => {
    const body = {
      ...BASE_BODY,
      trigger_type: "rare_pull",
      anchor_base_player_id: "1641705",
      top_game_tier: "season",
    };
    await handler(makeReq(body), makeRes());
    const payload = capturedInserts[0];
    expect(payload.created_by).toBe("user-uuid-test");
    expect(payload.sport).toBe("basketball");
    expect(payload.season).toBe("2425");
    expect(payload.target_fp).toBe(165);
    expect(payload.initial_roster).toEqual({ cards: [] });
    expect(payload.challenger_name).toBe("Test User");
    expect(payload.share_headline).toBe("headline");
    expect(payload.hand_id).toBe("hand-1");
    expect(payload.roster_size).toBe(0); // cards: [] → length 0
  });
});
