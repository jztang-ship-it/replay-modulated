// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/useChallengeAttempt.test.tsx
 *
 * Phase 5b commit 2 (2026-05-28): contract-lock on the POST body shape.
 * The hook is the single recipient-side site that posts attempts; both
 * production wrappers (H2HRecipientReveal, ChallengeComparisonScreen)
 * pass through to it. Two calls to lock:
 *
 *   1. score_breakdown must travel WHEN resolvedRoster is supplied.
 *      Sender-side overlay (phase 5b commits 3-4) consumes the JSON.
 *   2. score_breakdown must be OMITTED when resolvedRoster is undefined,
 *      so the server's `?? null` default applies and the pre-phase-5b
 *      call shape stays wire-compatible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useChallengeAttempt } from "../useChallengeAttempt";
import type { GeneratedCard } from "@shared/types";

function makeCard(over: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1",
    basePlayerId: "p1",
    personKey: "p1",
    cardId: "c1",
    name: "Test Player",
    team: "ABC",
    season: "2425",
    position: "PG",
    photoCode: "playte01",
    salary: 50,
    tier: "PURPLE",
    projectedFp: 30,
    slotIndex: 0,
    wasHeld: false,
    actualFp: 25,
    fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  } as GeneratedCard;
}

const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        attempt_id: "test-attempt",
        attempt_count: 1,
        winner_count: 0,
        best_score: null,
        best_user_name: null,
        is_best: false,
        is_window_open: true,
        window_closes_at_ms: Date.now() + 3600_000,
      }),
  }),
);

beforeEach(() => {
  fetchMock.mockClear();
  // @ts-expect-error global fetch stub
  globalThis.fetch = fetchMock;
  // Fresh localStorage between tests so markChallengeAttempted state
  // doesn't bleed across.
  try { window.localStorage.clear(); } catch {}
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.fetch;
});

describe("useChallengeAttempt POST body — phase 5b commit 2 contract", () => {
  it("includes score_breakdown as a serialized array when resolvedRoster is supplied", async () => {
    const roster = Array.from({ length: 6 }, (_, i) =>
      makeCard({ slotIndex: i, cardId: `c-${i}`, id: `p-${i}` }),
    );

    renderHook(() =>
      useChallengeAttempt({
        challengeId: "test-challenge",
        myScore: 100,
        targetScore: 90,
        sport: "basketball",
        enabled: true,
        resolvedRoster: roster,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/challenge/test-challenge/attempt");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.score).toBe(100);
    expect(body.is_winner).toBe(true);
    expect(Array.isArray(body.score_breakdown)).toBe(true);
    expect(body.score_breakdown).toHaveLength(6);
    // Shape sanity — the picker output must include the locked fields.
    expect(body.score_breakdown[0]).toMatchObject({
      id: "p-0",
      basePlayerId: "p1",
      slotIndex: 0,
      salary: 50,
      tier: "PURPLE",
      gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    });
  });

  it("omits score_breakdown when resolvedRoster is not supplied", async () => {
    renderHook(() =>
      useChallengeAttempt({
        challengeId: "test-challenge",
        myScore: 80,
        targetScore: 90,
        sport: "basketball",
        enabled: true,
        // resolvedRoster intentionally omitted
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect("score_breakdown" in body).toBe(false);
    expect(body.score).toBe(80);
    expect(body.is_winner).toBe(false);
  });

  it("includes referrer_token when referrerToken is supplied (layer C delta-b)", async () => {
    renderHook(() =>
      useChallengeAttempt({
        challengeId: "test-challenge",
        myScore: 100,
        targetScore: 90,
        sport: "basketball",
        enabled: true,
        referrerToken: "GLASS-REF-001",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.referrer_token).toBe("GLASS-REF-001");
  });

  it("omits referrer_token when referrerToken is not supplied (byte-identical no-ref body)", async () => {
    renderHook(() =>
      useChallengeAttempt({
        challengeId: "test-challenge",
        myScore: 80,
        targetScore: 90,
        sport: "basketball",
        enabled: true,
        // referrerToken intentionally omitted
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    // Absent (key not present), not null — the optionality the server's null
    // default + the no-ref byte-identical guarantee depend on.
    expect("referrer_token" in body).toBe(false);
  });

  it("does not POST when enabled is false", async () => {
    renderHook(() =>
      useChallengeAttempt({
        challengeId: "test-challenge",
        myScore: 100,
        targetScore: 90,
        sport: "basketball",
        enabled: false,
        resolvedRoster: [makeCard()],
      }),
    );

    await new Promise(r => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
