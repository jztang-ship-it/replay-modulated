/**
 * api/__tests__/challenge-get-allowlist.test.ts
 *
 * Phase 2 (boss delivery consumer), Commit 3. GET /api/challenge/[id] must:
 *   - surface sender_kind (default 'player') and tough_day for the landing
 *     boss branch, and
 *   - keep the response a strict sender-facing ALLOWLIST: boss provenance
 *     columns (instance_key, boss_identity_id, boss_bank_version) and any
 *     generator internals must NOT leak, even though the row carries them.
 *
 * supabaseAdmin is mocked at the module boundary (challenge-attempt.test.ts
 * pattern).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockState } = vi.hoisted(() => {
  const mockState: any = { row: null };
  return { mockState };
});

vi.mock("../hand/_lib/supabaseServer.js", () => {
  const builder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.update = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve({ data: mockState.row, error: mockState.row ? null : { message: "not found" } }));
    // fire-and-forget update(...).eq(...).then(...)
    b.then = (resolve: any) => resolve({ data: null, error: null });
    return b;
  };
  return { supabaseAdmin: { from: vi.fn(() => builder()) } };
});

import handler from "../challenge/[id].ts";

function makeReq(id: string | undefined): any {
  return { method: "GET", query: { id }, headers: {} };
}
function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

const BOSS_ID = "00000000-0000-4000-8000-0000000000aa";

// A boss row as the writer (Commit 2) persists it — sender-facing fields PLUS
// boss provenance + the NOT-NULL housekeeping columns. The allowlist must drop
// the non-sender-facing ones.
function bossRow() {
  return {
    challenge_id: BOSS_ID,
    created_by: null,
    sender_kind: "boss",
    tough_day: true,
    challenger_name: "Banner 18",
    share_headline: "Tatum and Brown finish it",
    target_fp: 142.5,
    initial_roster: { cards: [{ name: "P0", pos: "PG", fp: 30 }] },
    sport: "basketball",
    season: "2324",
    trigger_type: "boss",
    roster_size: 5,
    attempt_count: 3,
    winner_count: 1,
    best_score: 150,
    best_user_name: "Alice",
    view_count: 9,
    // ── must NOT leak ──
    instance_key: "2026-08-01|0|BOS-2324",
    boss_identity_id: "BOS-2324",
    boss_bank_version: "v1.2",
    hand_id: "2026-08-01|0|BOS-2324",
    slate_seed: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.row = null;
});

describe("GET /api/challenge/[id] — boss fields + allowlist (Commit 3)", () => {
  it("surfaces sender_kind and tough_day for a boss row", async () => {
    mockState.row = bossRow();
    const res = makeRes();
    await handler(makeReq(BOSS_ID), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.sender_kind).toBe("boss");
    expect(payload.tough_day).toBe(true);
    // Sender-facing identity carried by the existing columns.
    expect(payload.challenger_name).toBe("Banner 18");
    expect(payload.share_headline).toBe("Tatum and Brown finish it");
    expect(payload.target_score).toBe(142.5);
    expect((payload.initial_roster as any).cards).toHaveLength(1);
    expect(payload.created_by).toBeNull();
  });

  it("does NOT leak boss provenance or housekeeping columns past the allowlist", async () => {
    mockState.row = bossRow();
    const res = makeRes();
    await handler(makeReq(BOSS_ID), res);

    const payload = res.json.mock.calls[0][0];
    for (const leaked of [
      "instance_key",
      "boss_identity_id",
      "boss_bank_version",
      "hand_id",
      "slate_seed",
      "view_count",
    ]) {
      expect(payload).not.toHaveProperty(leaked);
    }
    // And no generator internals (they aren't on the row, but assert anyway).
    expect(JSON.stringify(payload)).not.toMatch(/\bband\b|\bK\b|\broute\b|\battempts\b|\bpicks\b|rejection|dailyHit|raidHit/i);
  });

  it("defaults sender_kind to 'player' on a legacy human row missing the column", async () => {
    const row = bossRow();
    delete (row as any).sender_kind;
    delete (row as any).tough_day;
    (row as any).created_by = "11111111-1111-4111-8111-111111111111";
    (row as any).trigger_type = "choke";
    mockState.row = row;

    const res = makeRes();
    await handler(makeReq(BOSS_ID), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.sender_kind).toBe("player");
    expect(payload.tough_day).toBeNull();
  });
});
