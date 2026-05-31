// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/useChallengeShare.test.tsx
 *
 * Phase 5c S1 (2026-05-31, doc lock 8f7e288): POST body contract for the
 * four trigger-detail fields (near_miss_gap, near_miss_next_tier,
 * anchor_base_player_id, top_game_tier).
 *
 * Critical test — pins the rare_pull degradation fix: a rare_pull-shaped
 * create MUST record trigger_type="rare_pull" + non-null
 * anchor_base_player_id/top_game_tier, NOT fall through to default. The
 * prior re-eval fallback (removed in S1) silently lost topGameTier
 * context — see the comment block on CreateChallengeArgs.triggerResult.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChallengeShare } from "../useChallengeShare";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";
import type { GeneratedCard } from "@shared/types";

const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        challenge_id: "test-challenge",
        share_url: "https://example.test/c/test-challenge",
        card_url: "",
      }),
  }),
);

beforeEach(() => {
  fetchMock.mockClear();
  // @ts-expect-error global fetch stub
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.fetch;
});

// Minimal CreateChallengeArgs payload. Roster + initialRoster shapes are
// passed through serializeRoster; the test doesn't care about their content,
// only that the trigger-detail fields land in the POST body.
function baseArgs(triggerResult: TriggerResult) {
  return {
    handId: "hand-1",
    sport: "basketball",
    season: "2425",
    totalFp: 165,
    winTier: "ALL_STAR",
    roster: [] as GeneratedCard[],
    initialRoster: [] as GeneratedCard[],
    badges: [],
    winTiersMap: {} as any,
    challengerName: "Test User",
    serializeRoster: () => ({ cards: [] }),
    triggerResult,
  };
}

async function postBodyFromCreate(
  hook: ReturnType<typeof renderHook<ReturnType<typeof useChallengeShare>, void>>,
  triggerResult: TriggerResult,
): Promise<Record<string, any>> {
  await act(async () => {
    await hook.result.current.createChallenge(baseArgs(triggerResult));
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("useChallengeShare.createChallenge — Phase 5c S1 POST body", () => {
  // ── rare_pull: the critical regression-lock ─────────────────────────────
  it("records trigger_type='rare_pull' + non-null anchor_base_player_id + top_game_tier when triggerResult.trigger='rare_pull'", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "rare_pull",
      headline: "You pulled a legendary game. Challenge someone to beat this.",
      anchorBasePlayerId: "1641705", // Wembanyama
      topGameTier: "season",
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("rare_pull");
    expect(body.anchor_base_player_id).toBe("1641705");
    expect(body.top_game_tier).toBe("season");
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
  });

  // ── miss: gap + next_tier surface, anchor fields null ──────────────────
  it("records near_miss_gap + near_miss_next_tier when triggerResult.trigger='miss'", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "miss",
      headline: "You missed ALL-STAR by 2.5 FP. See if they finish the job.",
      nearMissGap: 2.5,
      nearMissNextTier: "ALL_STAR",
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("miss");
    expect(body.near_miss_gap).toBe(2.5);
    expect(body.near_miss_next_tier).toBe("ALL_STAR");
    expect(body.anchor_base_player_id).toBeNull();
    expect(body.top_game_tier).toBeNull();
  });

  // ── default: all four trigger-detail fields null ───────────────────────
  it("records all four trigger-detail fields as null when triggerResult carries no detail", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "default",
      headline: "165.0 FP on the board. Same slate. Beat them.",
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("default");
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
    expect(body.anchor_base_player_id).toBeNull();
    expect(body.top_game_tier).toBeNull();
  });

  // ── bad_beat: trigger string + null trigger-detail (today's emit shape) ─
  // bad_beat doesn't currently populate anchor_base_player_id on the wire
  // (anchor selection runs client-side in S3 per the design lock). This
  // test pins that shape so a future change that adds bad_beat-server-side
  // anchor metadata is intentional, not accidental.
  it("records trigger_type='bad_beat' with all four detail fields null (anchor is client-side derived)", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "bad_beat",
      headline: "Brutal hand. See if they survive the same slate.",
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("bad_beat");
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
    expect(body.anchor_base_player_id).toBeNull();
    expect(body.top_game_tier).toBeNull();
  });

  // ── Existing-body invariants stay intact ────────────────────────────────
  it("preserves existing POST body fields (hand_id, sport, season, target_score, initial_roster, challenger_name, trigger_type, share_headline)", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "big_score",
      headline: "You hit ALL-STAR. Same slate. Beat them.",
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.hand_id).toBe("hand-1");
    expect(body.sport).toBe("basketball");
    expect(body.season).toBe("2425");
    expect(body.target_score).toBe(165);
    expect(body.initial_roster).toEqual({ cards: [] });
    expect(body.challenger_name).toBe("Test User");
    expect(body.trigger_type).toBe("big_score");
    expect(body.share_headline).toBe("You hit ALL-STAR. Same slate. Beat them.");
  });
});
