/**
 * api/__tests__/leaderboard-boss-field.test.ts
 *
 * Phase 2-mount Step 1 — Host route A′. GET /api/leaderboard folds an optional
 * bossChallengeId, gated to sport==='basketball', KV-cached at
 * boss:basketball:today:{date} with a lazy upsert on cache miss. Asserts:
 *   - cache MISS → calls getTodaysBossChallengeId, writes KV, returns the id
 *   - cache HIT  → returns the cached id, does NOT re-upsert
 *   - non-basketball → no bossChallengeId field, resolver not called (football's
 *     competition-keyed shape stays { entries, metric, scope })
 *   - boss failure → 200 with entries, field omitted (Upgrade, never Required)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockKv, mockSupabase, mockGetTodaysBoss } = vi.hoisted(() => {
  const mockKv = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    zrange: vi.fn().mockResolvedValue([]),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
    zincrby: vi.fn().mockResolvedValue(1),
    zscore: vi.fn().mockResolvedValue(0),
  };
  const mockSupabase = { auth: { getUser: vi.fn() } };
  const mockGetTodaysBoss = vi.fn().mockResolvedValue("fresh-boss-uuid");
  return { mockKv, mockSupabase, mockGetTodaysBoss };
});

vi.mock("@vercel/kv", () => ({ kv: mockKv }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mockSupabase }));
vi.mock("../boss/_lib/todaysBoss.ts", () => ({ getTodaysBossChallengeId: mockGetTodaysBoss }));

import handler from "../leaderboard.ts";

function makeReq(query: Record<string, string> = {}): any {
  return { method: "GET", query, body: undefined, headers: {} };
}
function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockKv.get.mockResolvedValue(null);
  mockKv.zrange.mockResolvedValue([]);
  mockGetTodaysBoss.mockResolvedValue("fresh-boss-uuid");
});

describe("GET /api/leaderboard — boss field (Host route A′)", () => {
  it("basketball cache MISS: upserts, writes KV, returns the fresh id", async () => {
    mockKv.get.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq({ sport: "basketball", metric: "hand_best", scope: "daily" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetTodaysBoss).toHaveBeenCalledTimes(1);
    // KV cached under the date-stamped boss key.
    const setKey = mockKv.set.mock.calls[0][0];
    expect(setKey).toMatch(/^boss:basketball:today:\d{4}-\d{2}-\d{2}$/);
    expect(mockKv.set.mock.calls[0][1]).toBe("fresh-boss-uuid");
    const payload = res.json.mock.calls[0][0];
    expect(payload.bossChallengeId).toBe("fresh-boss-uuid");
    expect(payload).toMatchObject({ metric: "hand_best", scope: "daily" });
    expect(Array.isArray(payload.entries)).toBe(true);
  });

  it("basketball cache HIT: returns cached id, does NOT re-upsert or re-write KV", async () => {
    mockKv.get.mockResolvedValue("cached-boss-uuid");
    const res = makeRes();
    await handler(makeReq({ sport: "basketball", metric: "hand_best", scope: "daily" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetTodaysBoss).not.toHaveBeenCalled();
    expect(mockKv.set).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].bossChallengeId).toBe("cached-boss-uuid");
  });

  it("non-basketball (baseball): no bossChallengeId field, resolver not called", async () => {
    const res = makeRes();
    await handler(makeReq({ sport: "baseball", metric: "hand_best", scope: "daily" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetTodaysBoss).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty("bossChallengeId");
    expect(payload).toMatchObject({ metric: "hand_best", scope: "daily" });
  });

  it("football: shape untouched (competition required path unaffected by boss field)", async () => {
    const res = makeRes();
    await handler(makeReq({ sport: "football", competition: "world_cup", metric: "hand_best", scope: "daily" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetTodaysBoss).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("bossChallengeId");
  });

  it("boss failure is non-fatal: 200 with entries, field omitted", async () => {
    mockKv.get.mockRejectedValue(new Error("KV down"));
    const res = makeRes();
    await handler(makeReq({ sport: "basketball", metric: "hand_best", scope: "daily" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty("bossChallengeId");
    expect(Array.isArray(payload.entries)).toBe(true);
  });
});
