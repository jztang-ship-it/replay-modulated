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
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import type { WinTierMap } from "@shared/utils/payoutLogic";
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

  // ── bad_beat: anchor propagates (INVERTED from S1's assertion) ─────────
  // Phase 5c Path A (2026-06-01): bad_beat now persists anchorBasePlayerId
  // alongside trigger + headline. The S1 version of this test asserted all
  // four detail fields null on the basis that bad_beat anchor was client-
  // side derived in S3 — that assertion is now wrong. evaluateTrigger
  // emits the anchor at create time; the recipient intro reads it as a
  // published fact. The end-to-end emission test below proves the REAL
  // pipeline produces the anchor; this propagation test pins that
  // useChallengeShare correctly forwards a Path-A-shape mock to the body.
  it("propagates trigger.anchorBasePlayerId to body.anchor_base_player_id for bad_beat", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "bad_beat",
      headline: "Brutal hand. See if they survive the same slate.",
      anchorBasePlayerId: "201935", // Harden — held card whose delta landed worst
    };
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("bad_beat");
    expect(body.anchor_base_player_id).toBe("201935");
    // miss + top_game fields stay null on bad_beat (no nearMiss; bad_beat
    // doesn't carry a top_game_tier).
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
    expect(body.top_game_tier).toBeNull();
  });

  // ── End-to-end emission (Phase 5c Path A regression-lock) ─────────────
  // S1's tests pre-set the mock's anchor field and verified propagation
  // (mock → body). They never verified that evaluateTrigger ACTUALLY
  // EMITS the anchor for a real-shape TriggerInput — which was the gap
  // that let the bad_beat null-anchor bug ship past green tests. These
  // tests close that gap by running the REAL pipeline: real TriggerInput
  // → real evaluateTrigger → createChallenge → assert the body's
  // anchor_base_player_id is the held card's actual basePlayerId.
  //
  // If evaluateTrigger ever stops emitting an anchor for these triggers
  // (the exact S1-deploy regression), these tests fail loudly.

  function tcard(over: Partial<GeneratedCard> = {}): GeneratedCard {
    return {
      id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
      name: "Player", team: "LAL", season: "2425", position: "SG",
      salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
      actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
      achievements: [], wasHeld: false, ...over,
    } as GeneratedCard;
  }

  const TIERS_E2E: WinTierMap = {
    LEGEND: { minFp: 255, multiplier: 50 },
    MVP: { minFp: 235, multiplier: 8 },
    ALL_STAR: { minFp: 225, multiplier: 3 },
    STARTER: { minFp: 205, multiplier: 1.5 },
    ROOKIE: { minFp: 185, multiplier: 0.5 },
    BUST: { minFp: 0, multiplier: 0 },
  };

  it("E2E: real bad_beat TriggerInput → evaluateTrigger → POST body's anchor_base_player_id is the worst-delta held card", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const roster = [
      tcard({ slotIndex: 0, basePlayerId: "harden", tier: "RED",    actualFp: 30, projectedFp: 50, salary: 65, wasHeld: true  }),
      tcard({ slotIndex: 1, basePlayerId: "lebron", tier: "ORANGE", actualFp: 45, projectedFp: 50, salary: 60, wasHeld: true  }),
      tcard({ slotIndex: 2, basePlayerId: "fill1",  tier: "WHITE",  actualFp: 8 }),
      tcard({ slotIndex: 3, basePlayerId: "fill2",  tier: "WHITE",  actualFp: 8 }),
      tcard({ slotIndex: 4, basePlayerId: "fill3",  tier: "WHITE",  actualFp: 8 }),
    ];
    // Real evaluateTrigger emission — not a hand-set mock.
    const trigger = evaluateTrigger({
      roster, totalFp: 99, winTier: "BUST", badges: [], winTiersMap: TIERS_E2E,
    });
    expect(trigger.trigger).toBe("bad_beat");
    expect(trigger.anchorBasePlayerId).toBe("harden"); // worst delta (-20)
    // Now run through createChallenge and assert the POST body carries it.
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("bad_beat");
    expect(body.anchor_base_player_id).toBe("harden");
    expect(body.top_game_tier).toBeNull();
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
  });

  it("E2E: real big_score TriggerInput → evaluateTrigger → POST body's anchor_base_player_id is the top-actualFp card", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const roster = [
      tcard({ slotIndex: 0, basePlayerId: "leader", actualFp: 62 }),
      tcard({ slotIndex: 1, basePlayerId: "two",    actualFp: 50 }),
      tcard({ slotIndex: 2, basePlayerId: "three",  actualFp: 45 }),
      tcard({ slotIndex: 3, basePlayerId: "four",   actualFp: 42 }),
      tcard({ slotIndex: 4, basePlayerId: "five",   actualFp: 36 }),
    ];
    const trigger = evaluateTrigger({
      roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS_E2E,
    });
    expect(trigger.trigger).toBe("big_score");
    expect(trigger.anchorBasePlayerId).toBe("leader");
    const body = await postBodyFromCreate(hook, trigger);
    expect(body.trigger_type).toBe("big_score");
    expect(body.anchor_base_player_id).toBe("leader");
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
