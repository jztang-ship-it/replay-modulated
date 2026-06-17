// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/challengeCreate.funnel.test.tsx
 *
 * Bug #2 regression-lock (challenge_create double-fire).
 *
 * Background: an id-less {sport, trigger} `challenge_create` fire once lived
 * in ChallengeSharePrompt alongside the id-carrying fire in
 * useChallengeShare.createChallenge, so the funnel counted two creates per
 * challenge — one with no challenge_id. That stray fire was removed; the only
 * two `challenge_create` fires now (createChallenge + ResumeShareSurface) are
 * on mutually-exclusive paths and BOTH carry a truthy challenge_id.
 *
 * This pins the createChallenge side: exactly ONE `challenge_create` fire per
 * create, and its props.challenge_id is truthy. If a second id-less fire ever
 * regresses back onto this path, this test fails loudly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the analytics module so we can count `track` invocations by action.
const trackMock = vi.fn();
vi.mock("@shared/analytics/analytics", () => ({
  track: (...args: any[]) => trackMock(...args),
}));

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
  trackMock.mockClear();
  fetchMock.mockClear();
  // @ts-expect-error global fetch stub
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.fetch;
});

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

describe("createChallenge funnel — challenge_create fires exactly once with a challenge_id", () => {
  it("fires `challenge_create` exactly once and props.challenge_id is truthy", async () => {
    const hook = renderHook(() => useChallengeShare("basketball"));
    const trigger: TriggerResult = {
      trigger: "big_score",
      headline: "165.0 FP on the board. Same slate. Beat them.",
    };

    await act(async () => {
      await hook.result.current.createChallenge(baseArgs(trigger));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const createFires = trackMock.mock.calls.filter(
      ([, action]) => action === "challenge_create",
    );
    expect(createFires).toHaveLength(1);

    const props = createFires[0][2] as Record<string, unknown>;
    expect(props.challenge_id).toBeTruthy();
    expect(props.challenge_id).toBe("test-challenge");
  });
});
