// @vitest-environment jsdom
/** Contract tests for the client side of the authoritative attempt boundary. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@shared/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
}));

vi.mock("@shared/analytics/analytics",()=>({track:vi.fn()}));

import { useChallengeAttempt } from "../useChallengeAttempt";

const HAND_ID = "33333333-3333-4333-8333-333333333333";

const fetchMock = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    attempt_id: "test-attempt",
    score: 101,
    is_winner: true,
    attempt_count: 1,
    winner_count: 1,
    best_score: 101,
    best_user_name: "Alice",
    is_best: true,
    is_window_open: true,
    window_closes_at_ms: Date.now() + 3600_000,
  }),
}));

beforeEach(() => {
  fetchMock.mockClear();
  // @ts-expect-error global fetch stub
  globalThis.fetch = fetchMock;
  try { window.localStorage.clear(); } catch {}
});

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.fetch;
});

describe("useChallengeAttempt server-authoritative request contract", () => {
  it("sends only hand_id and presentation metadata, never client score/winner/roster", async () => {
    renderHook(() => useChallengeAttempt({
      challengeId: "00000000-0000-4000-8000-000000000001",
      handId: HAND_ID,
      myScore: 9999,
      targetScore: 90,
      sport: "basketball",
      enabled: true,
      referrerToken: "GLASS-REF-001",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/challenge/00000000-0000-4000-8000-000000000001/attempt");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      hand_id: HAND_ID,
      user_name: expect.any(String),
      referrer_token: "GLASS-REF-001",
    });
    expect(body).not.toHaveProperty("score");
    expect(body).not.toHaveProperty("is_winner");
    expect(body).not.toHaveProperty("score_breakdown");
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("anon_uid");
  });

  it("uses the server score and winner in the returned state", async () => {
    const { result } = renderHook(() => useChallengeAttempt({
      challengeId: "00000000-0000-4000-8000-000000000001",
      handId: HAND_ID,
      myScore: 1,
      targetScore: 90,
      sport: "basketball",
      enabled: true,
    }));

    await waitFor(() => expect(result.current.attemptResult?.score).toBe(101));
    expect(result.current.attemptResult?.is_winner).toBe(true);
    expect(result.current.state).toBe("WIN");
  });

  it("does not POST until a verified hand id is available", async () => {
    renderHook(() => useChallengeAttempt({
      challengeId: "00000000-0000-4000-8000-000000000001",
      handId: null,
      myScore: 100,
      targetScore: 90,
      sport: "basketball",
      enabled: true,
    }));
    await new Promise(r => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
