/**
 * shared/hooks/__tests__/useChallengeShare.handLogGapFill.test.ts
 *
 * "Fix c" (2026-06-23) — idempotent sender hand_log gap-fill on the share path,
 * restoring prod's "a row exists for every shared hand" invariant after 0659ca6
 * relocated the sole hand_log write to the best-effort/bounded lock-time
 * persistLock. Without a row, the recipient's sender-hand endpoint returns
 * legacy_pre_h2h_capture → undefined resolvedSenderHand → black reveal.
 *
 * Three required cases (+ the unique-index race backstop):
 *   (i)   writes a row when none exists
 *   (ii)  no-op / no error when persistLock already wrote one
 *   (iii) skips cleanly (no row, no supabase touch) when share-time uid is u_…
 *   (iv)  23505 (concurrent persistLock insert won the partial unique index)
 *         → ON-CONFLICT-DO-NOTHING no-op
 *
 * serializeResolvedRoster is left REAL so the gate-2 shape (Array of resolved
 * card objects, the exact thing sender-hand.ts:100 Array.isArray-checks) is
 * exercised end-to-end, not mocked away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const insert = vi.fn();
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    insert,
  }));
  const getPlayerUid = vi.fn();
  return { maybeSingle, insert, from, getPlayerUid };
});

vi.mock("@shared/lib/supabase", () => ({ supabase: { from: h.from } }));
vi.mock("@shared/utils/playerIdentity", async (orig) => ({
  ...(await orig<typeof import("@shared/utils/playerIdentity")>()),
  getPlayerUid: h.getPlayerUid,
}));

import { ensureSenderHandLogRow } from "../useChallengeShare";

const REAL_UID = "11111111-2222-3333-4444-555555555555";

function tcard(over: Record<string, unknown> = {}) {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
    name: "Player", team: "LAL", season: "2425", position: "SG",
    salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
    actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
    achievements: [], wasHeld: false, ...over,
  };
}

function args(handId = "hand-xyz") {
  return {
    handId,
    sport: "basketball",
    season: "2425",
    totalFp: 188.5,
    winTier: "ALL_STAR",
    roster: [
      tcard({ basePlayerId: "p1", actualFp: 40, tier: "RED" }),
      tcard({ basePlayerId: "p2", actualFp: 22, tier: "BLUE" }),
    ],
    initialRoster: [],
    badges: [],
    challengerName: "X",
    winTiersMap: {},
    serializeRoster: () => ({ cards: [] }),
    triggerResult: { trigger: "default", headline: "h" },
  } as any;
}

beforeEach(() => {
  h.maybeSingle.mockReset();
  h.insert.mockReset();
  h.from.mockClear();
  h.getPlayerUid.mockReset();
  // defaults: no existing row, insert succeeds
  h.maybeSingle.mockResolvedValue({ data: null });
  h.insert.mockResolvedValue({ error: null });
});

describe("ensureSenderHandLogRow — idempotent share-path gap-fill (fix c)", () => {
  it("(i) writes a valid hand_log row when none exists", async () => {
    h.getPlayerUid.mockReturnValue(REAL_UID);
    const res = await ensureSenderHandLogRow(args("hand-xyz"), { access_token: "tok" });

    expect(res).toBe("written");
    expect(h.insert).toHaveBeenCalledTimes(1);
    const row = h.insert.mock.calls[0][0];

    // Gate 1: real uuid as player_id.
    expect(row.player_id).toBe(REAL_UID);
    expect(row.hand_id).toBe("hand-xyz");
    // Gate 3: the canonical column set logHandToDb writes.
    expect(row.total_fp).toBe(188.5);
    expect(row.tier).toBe("ALL_STAR");
    expect(row.sport).toBe("basketball");
    expect(row.season).toBe("2425");
    expect(row.verified).toBe(true);
    expect(row.payout).toBe(0);
    expect(row.streak_at_play).toBe(0);
    expect(row.roster_ids).toEqual(["p1", "p2"]);
    // Gate 2: final_roster is the serializeResolvedRoster array shape the
    // recipient's Array.isArray check at sender-hand.ts:100 requires.
    expect(Array.isArray(row.final_roster)).toBe(true);
    expect(row.final_roster).toHaveLength(2);
    expect(row.final_roster[0].basePlayerId).toBe("p1");
    expect(row.final_roster[0].actualFp).toBe(40);
    expect(row.final_roster[0].tier).toBe("RED");
  });

  it("(ii) no-op (no insert, no error) when persistLock already wrote the row", async () => {
    h.getPlayerUid.mockReturnValue(REAL_UID);
    h.maybeSingle.mockResolvedValue({ data: { hand_id: "hand-xyz" } });

    const res = await ensureSenderHandLogRow(args("hand-xyz"), { access_token: "tok" });

    expect(res).toBe("exists");
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("(iii) skips cleanly with no supabase write when share-time uid is anonymous (u_…)", async () => {
    h.getPlayerUid.mockReturnValue("u_anon123");

    const res = await ensureSenderHandLogRow(args(), { access_token: "tok" });

    expect(res).toBe("skipped-anon");
    // Never touches the DB — no poisoned u_… row in the uuid column.
    expect(h.from).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("(iv) treats a 23505 unique-violation as a no-op (concurrent persistLock won the partial index)", async () => {
    h.getPlayerUid.mockReturnValue(REAL_UID);
    h.maybeSingle.mockResolvedValue({ data: null }); // existence check missed the race
    h.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const res = await ensureSenderHandLogRow(args(), { access_token: "tok" });

    expect(res).toBe("exists");
    expect(h.insert).toHaveBeenCalledTimes(1);
  });

  it("verified=false when there is no session access token", async () => {
    h.getPlayerUid.mockReturnValue(REAL_UID);
    await ensureSenderHandLogRow(args(), null);
    expect(h.insert.mock.calls[0][0].verified).toBe(false);
  });
});
