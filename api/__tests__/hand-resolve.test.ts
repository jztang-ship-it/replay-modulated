/**
 * Contract tests for the server-owned hand resolution boundary.
 * The browser may provide a bounded roster selection, but authoritative
 * score, tier, payout, win flags, seed/protection flags, and achievements
 * are derived or controlled by the API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state, authGetUser, rpc, kvGet, kvSet, awardAchievements } = vi.hoisted(() => ({
  state: {
    rpcResult: { data: { hand_id: "hand-1" }, error: null } as any,
    existing: null as any,
    updatePayloads: [] as any[],
  },
  authGetUser: vi.fn(),
  rpc: vi.fn(),
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  awardAchievements: vi.fn(),
}));

vi.mock("../hand/_lib/auth.js", () => ({
  verifyAuth: (req: any) => authGetUser(req),
}));

vi.mock("../hand/_lib/achievements.js", () => ({
  awardVerifiedAchievements: awardAchievements,
}));

vi.mock("@vercel/kv", () => ({
  kv: {
    get: kvGet,
    set: kvSet,
  },
}));

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const builder = (table: string) => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.update = vi.fn((payload: any) => {
      state.updatePayloads.push({ table, payload });
      return b;
    });
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn(() => Promise.resolve(state.existing));
    b.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return b;
  };

  return {
    supabaseAdmin: {
      rpc,
      from: vi.fn((table: string) => builder(table)),
    },
  };
});

import handler from "../hand/resolve.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HAND_ID = "22222222-2222-4222-8222-222222222222";

function makeReq(body: any, token = "test-token"): any {
  return {
    method: "POST",
    body,
    headers: { authorization: `Bearer ${token}` },
  };
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    hand_id: HAND_ID,
    sport: "basketball",
    season: "2425",
    bet_amount: 100,
    tier: "LEGEND",
    payout: 999999,
    is_win: false,
    achievements: ["forged_badge"],
    final_roster: [
      {
        basePlayerId: "player-a",
        actualFp: 100,
        projectedFp: 1,
        fpDelta: 9999,
        name: "A",
        team: "T",
        stats: { points: 999999, forged: true },
      },
      {
        basePlayerId: "player-b",
        actualFp: 80,
        projectedFp: 2,
        name: "B",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rpcResult = { data: { hand_id: HAND_ID }, error: null };
  state.existing = null;
  state.updatePayloads = [];
  authGetUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
  rpc.mockResolvedValue(state.rpcResult);
  kvGet.mockResolvedValue(null);
  kvSet.mockResolvedValue("OK");
  awardAchievements.mockResolvedValue(["server_badge"]);
});

describe("POST /api/hand/resolve", () => {
  it("requires a valid authenticated session", async () => {
    authGetUser.mockResolvedValueOnce({ user: null, error: { message: "invalid" } });
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recomputes tier, payout, win and fpDelta, ignoring forged client authority fields", async () => {
    const res = makeRes();
    await handler(makeReq(validBody()), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({
      p_user_id: USER_ID,
      p_hand_id: HAND_ID,
      p_bet_amount: 100,
      p_total_fp: 180,
      p_tier: "STARTER",
      p_base_payout: 150,
      p_is_win: true,
      p_roster_ids: ["player-a", "player-b"],
      p_scores: { "player-a": 100, "player-b": 80 },
      p_seed: "",
      p_is_ftue: false,
      p_is_protected: false,
    });
    expect(args.p_final_roster).toHaveLength(2);
    expect(args.p_final_roster[0]).toMatchObject({ actualFp: 100, projectedFp: 1, fpDelta: 99, achievements: [] });
    expect(args.p_final_roster[0]).not.toHaveProperty("forged");
    expect(awardAchievements).toHaveBeenCalledWith(USER_ID, HAND_ID, "basketball", "2425");
    expect(kvSet).toHaveBeenCalledWith("bonus_pool:basketball", 1005);
  });

  it("rejects unsupported bet amounts and duplicate roster players before RPC", async () => {
    const badBet = makeRes();
    await handler(makeReq(validBody({ bet_amount: 25 })), badBet);
    expect(badBet.status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();

    const duplicate = makeRes();
    await handler(makeReq(validBody({
      final_roster: [
        { basePlayerId: "same", actualFp: 100 },
        { basePlayerId: "same", actualFp: 80 },
      ],
    })), duplicate);
    expect(duplicate.status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not add rake again when the RPC reports an idempotent duplicate", async () => {
    state.rpcResult = { data: null, error: { message: "duplicate key value violates unique constraint" } };
    rpc.mockResolvedValue(state.rpcResult);
    state.existing = { hand_id: HAND_ID, total_fp: 180, tier: "STARTER", payout: 150, streak_at_play: 1 };

    const res = makeRes();
    await handler(makeReq(validBody()), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, idempotent: true });
    expect(kvSet).not.toHaveBeenCalled();
    expect(awardAchievements).toHaveBeenCalledTimes(1);
  });
});
