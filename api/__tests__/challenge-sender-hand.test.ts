/**
 * api/__tests__/challenge-sender-hand.test.ts
 *
 * Integration tests for GET /api/challenge/{id}/sender-hand (phase 1 of
 * the H2H reveal arc data path).
 *
 * Covers:
 *   - challenge + hand_log + populated final_roster → sender_resolved:true,
 *     full card data round-trips through the JSONB column (including a
 *     mixed held/swapped roster).
 *   - challenge + hand_log row but final_roster is NULL → legacy reason.
 *   - challenge + no matching hand_log row (e.g. synthetic hand_id from
 *     api/challenge/create.ts:29) → legacy reason.
 *   - missing challenge → 404.
 *   - invalid challenge_id format → 400.
 *   - non-GET method → 405.
 *
 * Mocks supabaseAdmin at the supabaseServer module boundary; doesn't need
 * an actual Supabase connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResponses, makeBuilder } = vi.hoisted(() => {
  // Per-table response config that tests reset in beforeEach. Each table
  // entry holds the result of the terminal `.single()` / `.maybeSingle()`
  // call. Chained `.select()` and `.eq()` return the builder unchanged.
  const mockResponses: {
    shared_challenges: { single?: any; maybeSingle?: any };
    hand_log: { single?: any; maybeSingle?: any };
  } = {
    shared_challenges: {},
    hand_log: {},
  };
  const makeBuilder = (table: keyof typeof mockResponses) => {
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponses[table].single ?? { data: null, error: { code: "PGRST116" } })
    );
    builder.maybeSingle = vi.fn().mockImplementation(() =>
      Promise.resolve(mockResponses[table].maybeSingle ?? { data: null, error: null })
    );
    return builder;
  };
  return { mockResponses, makeBuilder };
});

vi.mock("../hand/_lib/supabaseServer.js", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeBuilder(table as any)),
  },
}));

import handler from "../challenge/[id]/sender-hand.ts";

function makeReq(method: string, query: Record<string, string> = {}): any {
  return { method, query, body: undefined, headers: {} };
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockResponses.shared_challenges = {};
  mockResponses.hand_log = {};
});

// ──────────────────────────────────────────────────────────────────────
// Happy path: populated final_roster round-trips
// ──────────────────────────────────────────────────────────────────────

describe("GET sender-hand — populated final_roster", () => {
  it("returns sender_resolved:true with cards verbatim from final_roster JSONB", async () => {
    const handId = "hand-xyz-123";
    // Mix of held + swapped, mirrors GeneratedCard shape.
    const finalRoster = [
      {
        id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1_card",
        name: "Allen Iverson", team: "PHI", season: "9899", position: "PG",
        photoCode: "iverso01", salary: 75, tier: "RED", projectedFp: 40,
        slotIndex: 0, wasHeld: true, actualFp: 52.3, fpDelta: 12.3,
        gameInfo: { date: "1999-03-15", opponent: "BOS", homeAway: "home" },
        statLine: { pts: 35, reb: 5, ast: 8, stl: 4, blk: 0, turnovers: 3, mp: 42 },
        achievements: [{ id: "GOD_MODE", icon: "🔥", label: "GOD MODE", fp: 15 }],
      },
      {
        id: "p2", basePlayerId: "p2", personKey: "p2", cardId: "p2_card",
        name: "Tim Duncan", team: "SAS", season: "9899", position: "PF",
        photoCode: "duncan01", salary: 60, tier: "ORANGE", projectedFp: 35,
        slotIndex: 1, wasHeld: false, actualFp: 28.4, fpDelta: -6.6,
        gameInfo: { date: "1999-03-12", opponent: "UTA" },
        statLine: { pts: 18, reb: 11, ast: 2, stl: 1, blk: 2, turnovers: 2, mp: 36 },
        achievements: [],
      },
    ];
    mockResponses.shared_challenges.single = { data: { hand_id: handId }, error: null };
    mockResponses.hand_log.maybeSingle = {
      data: { hand_id: handId, total_fp: 196.4, tier: "STARTER", final_roster: finalRoster },
      error: null,
    };

    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=30");
    const body = res.json.mock.calls[0][0];
    expect(body.challenge_id).toBe(VALID_ID);
    expect(body.sender_resolved).toBe(true);
    expect(body.reason).toBeUndefined();
    expect(body.sender).toEqual({
      handId,
      totalFp: 196.4,
      tier: "STARTER",
      cards: finalRoster,
    });
    // wasHeld mix preserved (the H2H reveal arc reveals swap cards first,
    // held cards last — recipient client needs this flag intact).
    expect(body.sender.cards[0].wasHeld).toBe(true);
    expect(body.sender.cards[1].wasHeld).toBe(false);
    // Per-card achievements + statLine survive the round-trip.
    expect(body.sender.cards[0].achievements[0].id).toBe("GOD_MODE");
    expect(body.sender.cards[1].statLine.pts).toBe(18);
  });

  it("coerces total_fp from numeric string to number (Supabase numeric → string)", async () => {
    // Supabase returns numeric columns as JS strings via the REST API.
    // Endpoint must coerce to number so clients can do arithmetic.
    mockResponses.shared_challenges.single = { data: { hand_id: "h1" }, error: null };
    mockResponses.hand_log.maybeSingle = {
      data: { hand_id: "h1", total_fp: "196.4", tier: "STARTER", final_roster: [] },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    expect(res.json.mock.calls[0][0].sender.totalFp).toBe(196.4);
    expect(typeof res.json.mock.calls[0][0].sender.totalFp).toBe("number");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Legacy fallback paths
// ──────────────────────────────────────────────────────────────────────

describe("GET sender-hand — legacy degradation", () => {
  it("returns sender_resolved:false with reason when hand_log row exists but final_roster is NULL", async () => {
    mockResponses.shared_challenges.single = { data: { hand_id: "old-hand" }, error: null };
    mockResponses.hand_log.maybeSingle = {
      data: { hand_id: "old-hand", total_fp: 175.4, tier: "ROOKIE", final_roster: null },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.sender_resolved).toBe(false);
    expect(body.reason).toBe("legacy_pre_h2h_capture");
    expect(body.sender).toBeNull();
  });

  it("returns sender_resolved:false when no hand_log row matches hand_id (synthetic hand_id from challenge create fallback)", async () => {
    mockResponses.shared_challenges.single = { data: { hand_id: "synthetic-uuid" }, error: null };
    mockResponses.hand_log.maybeSingle = { data: null, error: null };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.sender_resolved).toBe(false);
    expect(body.reason).toBe("legacy_pre_h2h_capture");
    expect(body.sender).toBeNull();
  });

  it("returns sender_resolved:false when final_roster is non-null but not an array (legacy stringly-typed row)", async () => {
    // 20 production hand_log rows from id 38-45 (2026-04-14/15) carry
    // a JSON-encoded string in final_roster from an experimental write
    // path. Array.isArray guard routes these to the same fallback so
    // the sender.cards contract (array of GeneratedCard) holds.
    mockResponses.shared_challenges.single = { data: { hand_id: "stringly-hand" }, error: null };
    mockResponses.hand_log.maybeSingle = {
      data: { hand_id: "stringly-hand", total_fp: 197.8, tier: "ROOKIE", final_roster: '"{\\"some\\":\\"legacy-blob\\"}"' },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.sender_resolved).toBe(false);
    expect(body.reason).toBe("legacy_pre_h2h_capture");
    expect(body.sender).toBeNull();
  });

  it("returns sender_resolved:false when final_roster is an object (not array) — defense in depth", async () => {
    mockResponses.shared_challenges.single = { data: { hand_id: "obj-hand" }, error: null };
    mockResponses.hand_log.maybeSingle = {
      data: { hand_id: "obj-hand", total_fp: 180, tier: "ROOKIE", final_roster: { cards: [] } },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.sender_resolved).toBe(false);
    expect(body.reason).toBe("legacy_pre_h2h_capture");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Error paths
// ──────────────────────────────────────────────────────────────────────

describe("GET sender-hand — error paths", () => {
  it("returns 404 when challenge_id has no shared_challenges row", async () => {
    mockResponses.shared_challenges.single = { data: null, error: { code: "PGRST116" } };
    const res = makeRes();
    await handler(makeReq("GET", { id: VALID_ID }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toBe("Challenge not found");
  });

  it("returns 400 when challenge_id is missing", async () => {
    const res = makeRes();
    await handler(makeReq("GET", {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/missing|invalid/i);
  });

  it("returns 400 when challenge_id is not a valid UUID format", async () => {
    const res = makeRes();
    await handler(makeReq("GET", { id: "not-a-uuid" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/invalid/i);
  });

  it("returns 405 on non-GET method", async () => {
    const res = makeRes();
    await handler(makeReq("POST", { id: VALID_ID }), res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json.mock.calls[0][0].error).toMatch(/GET/);
  });
});
