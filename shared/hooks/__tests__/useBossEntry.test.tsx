// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/useBossEntry.test.tsx
 *
 * Phase 2-mount Step 3 — boss info surfaced into React state. Confirms:
 *   - basketball: reads bossChallengeId + bossPlayerCount off the GET
 *   - non-basketball: never fetches, stays null
 *   - missing/failed fields: degrade to null (count is Upgrade, never Required)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useBossEntry } from "../useBossEntry";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });
beforeEach(() => { vi.restoreAllMocks(); });

describe("useBossEntry", () => {
  it("basketball: surfaces bossChallengeId + bossPlayerCount from the GET", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entries: [], metric: "hand_best", scope: "daily", bossChallengeId: "boss-uuid-1", bossPlayerCount: 14318 }),
    }));
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useBossEntry("basketball"));
    await waitFor(() => expect(result.current.bossChallengeId).toBe("boss-uuid-1"));
    expect(result.current.bossPlayerCount).toBe(14318);
    // Hit the basketball board GET exactly once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/leaderboard\?sport=basketball/);
  });

  it("non-basketball: never fetches, stays null", async () => {
    const fetchMock = vi.fn();
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock;
    const { result } = renderHook(() => useBossEntry("baseball"));
    // Give any stray effect a tick.
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ bossChallengeId: null, bossPlayerCount: null });
  });

  it("missing boss fields (no boss today / count not yet written) → null, no throw", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entries: [], metric: "hand_best", scope: "daily", bossChallengeId: "boss-uuid-2" }),
    }));
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock;
    const { result } = renderHook(() => useBossEntry("basketball"));
    await waitFor(() => expect(result.current.bossChallengeId).toBe("boss-uuid-2"));
    expect(result.current.bossPlayerCount).toBeNull();
  });

  it("fetch failure: degrades to null (CTA simply absent)", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network")));
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock;
    const { result } = renderHook(() => useBossEntry("basketball"));
    await Promise.resolve();
    expect(result.current.bossChallengeId).toBeNull();
    expect(result.current.bossPlayerCount).toBeNull();
  });
});
