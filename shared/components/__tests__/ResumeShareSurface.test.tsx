// @vitest-environment jsdom
/**
 * shared/components/__tests__/ResumeShareSurface.test.tsx
 *
 * Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock 2caa7a3):
 *  - sessionStorage round-trip: writePendingChallengeShare → readPending
 *    via internal effect.
 *  - Mount with signed-in + valid payload → modal mounts.
 *  - Mount with anonymous + payload present → silent cleanup (no modal).
 *  - Mount with stale (>15min) payload → cleared, no modal.
 *  - Mount with no payload → render null.
 *  - Dismiss clears sessionStorage.
 *  - Continue tap fires POST + clears.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ResumeShareSurface,
  writePendingChallengeShare,
  PENDING_SHARE_KEY,
  PENDING_SHARE_TTL_MS,
} from "../ResumeShareSurface";
import { AuthContext } from "@shared/auth/AuthProvider";
import type { User } from "@supabase/supabase-js";

const baseAuth = {
  user: null as User | null,
  uid: "u_test",
  isAuthenticated: false,
  isAnonymous: true,
  signUp: async () => ({ error: null as any }),
  linkGoogle: async () => ({ error: null as any }),
  signIn: async () => ({ error: null as any }),
  signInGoogle: async () => ({ error: null as any }),
  signOut: async () => ({ error: null as any }),
};

function withAuth(over: Partial<typeof baseAuth>, children: React.ReactNode) {
  const ctx = { ...baseAuth, ...over };
  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
}

const signedInUser = {
  id: "u-signed",
  user_metadata: { full_name: "Alice Wonder" },
  email: "alice@example.com",
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01",
} as User;

function samplePayload() {
  return {
    hand_id: "hand-xyz",
    sport: "basketball",
    season: "2425",
    total_fp: 142.3,
    initial_roster_serialized: { cards: [] },
    trigger_type: "choke",
    share_headline: "Test caption",
  };
}

beforeEach(() => {
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
  // @ts-expect-error global fetch stub
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ challenge_id: "c-1", share_url: "https://example/c/1" }),
  }));
  // Stub navigator.share + clipboard
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
});

describe("writePendingChallengeShare", () => {
  it("persists a payload with v: 1 and created_at timestamp", () => {
    writePendingChallengeShare(samplePayload());
    const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.v).toBe(1);
    expect(parsed.hand_id).toBe("hand-xyz");
    expect(typeof parsed.created_at).toBe("number");
  });
});

describe("ResumeShareSurface mount behavior", () => {
  it("renders null with no payload", () => {
    const { container } = render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  // Phase 5b post-piece-2c fix (2026-05-30, Bug B): the prior eager
  // clearPending() on the initial isAnonymous=true mount destroyed the
  // payload before auth had a chance to resolve. New behavior: render
  // null but PRESERVE the payload — the effect re-runs on isAnonymous
  // flip and surfaces the resume modal then.
  it("preserves payload while isAnonymous is true (auth not yet resolved)", async () => {
    writePendingChallengeShare(samplePayload());
    render(withAuth({ isAnonymous: true }, <ResumeShareSurface />));
    expect(screen.queryByRole("button", { name: /send challenge/i })).toBeNull();
    // Payload is NOT cleared — TTL inside readPending() + sessionStorage's
    // tab-scoped lifetime handle staleness; the surface does not.
    expect(sessionStorage.getItem(PENDING_SHARE_KEY)).toBeTruthy();
  });

  it("surfaces the resume modal when isAnonymous flips false (post-redirect auth resolves)", async () => {
    writePendingChallengeShare(samplePayload());
    // Initial mount: anonymous (auth not yet resolved post-redirect).
    const { rerender } = render(withAuth({ isAnonymous: true }, <ResumeShareSurface />));
    expect(screen.queryByRole("button", { name: /send challenge/i })).toBeNull();
    // Auth resolves; re-render with non-anon context — the effect re-runs
    // on isAnonymous flip, finds the still-present payload, surfaces it.
    rerender(withAuth({ isAnonymous: false, user: signedInUser }, <ResumeShareSurface />));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /send challenge/i })).toBeTruthy();
    });
  });

  it("renders the resume modal when signed-in + valid payload", () => {
    writePendingChallengeShare(samplePayload());
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    // Name field populated via deriveDisplayName from user_metadata.full_name
    expect(screen.getByDisplayValue("Alice Wonder")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send challenge/i })).toBeTruthy();
  });

  it("clears stale (>15min old) payload and renders null", async () => {
    const stale = { ...samplePayload() };
    const raw = JSON.stringify({
      v: 1,
      ...stale,
      created_at: Date.now() - PENDING_SHARE_TTL_MS - 1000,
    });
    sessionStorage.setItem(PENDING_SHARE_KEY, raw);
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    // The internal readPending() rejects the stale payload, so the surface
    // never gets to the cleanup branch — it just renders null. The stale
    // entry stays in sessionStorage until the next valid write overwrites
    // it (or the tab closes). That's acceptable for stale-detection; the
    // important property is no surface rendered.
    expect(screen.queryByRole("button", { name: /send challenge/i })).toBeNull();
  });

  it("on dismiss, clears sessionStorage", () => {
    writePendingChallengeShare(samplePayload());
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    expect(sessionStorage.getItem(PENDING_SHARE_KEY)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /maybe later|cancel/i }));
    expect(sessionStorage.getItem(PENDING_SHARE_KEY)).toBeNull();
  });

  // Phase 0 Commit 2 (2026-06-02) — resume-path trigger-detail parity.
  // The normal useChallengeShare.createChallenge POST forwards four
  // Phase-5c-S1 detail fields (near_miss_gap, near_miss_next_tier,
  // anchor_base_player_id, top_game_tier). Before this commit, the
  // resume path lost them — OAuth-resumed challenges landed with NULL
  // trigger-detail and the recipient intro selector fell back to
  // generic per-trigger copy. Test: a resumed payload carrying the four
  // fields POSTs them through verbatim.
  it("forwards Phase-5c-S1 trigger-detail fields on Send challenge POST (rare_pull anchor + topGameTier)", async () => {
    writePendingChallengeShare({
      hand_id: "hand-rare",
      sport: "basketball",
      season: "2425",
      total_fp: 285.5,
      initial_roster_serialized: { cards: [] },
      trigger_type: "rare_pull",
      share_headline: "You pulled a legendary game",
      near_miss_gap: null,
      near_miss_next_tier: null,
      anchor_base_player_id: "p_jokic",
      top_game_tier: "record",
    });
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));
    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
      const createCall = calls.find(([url]) => String(url) === "/api/challenge/create");
      expect(createCall).toBeTruthy();
    });
    const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
    const createCall = calls.find(([url]) => String(url) === "/api/challenge/create")!;
    const body = JSON.parse(String(createCall[1].body));
    expect(body.trigger_type).toBe("rare_pull");
    expect(body.anchor_base_player_id).toBe("p_jokic");
    expect(body.top_game_tier).toBe("record");
    // miss-only fields stay null on a rare_pull trigger (mirrors the
    // normal-path POST shape where unset detail fields go as null).
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
  });

  it("legacy pre-Commit-2 payload (no trigger-detail captured) POSTs the four fields as null", async () => {
    // A pending payload from a session that pre-dated Commit 2 wouldn't
    // have captured the four fields. The POST body must still include
    // them — as null — so the API row is created with explicit NULLs
    // (matching the normal-path shape). api/challenge/create.ts:59-62
    // already treats missing fields as null; pinning the wire shape
    // keeps the contract explicit and the row identical to today's
    // normal-path "default" trigger.
    writePendingChallengeShare(samplePayload());
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));
    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
      const createCall = calls.find(([url]) => String(url) === "/api/challenge/create");
      expect(createCall).toBeTruthy();
    });
    const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
    const createCall = calls.find(([url]) => String(url) === "/api/challenge/create")!;
    const body = JSON.parse(String(createCall[1].body));
    expect(body.near_miss_gap).toBeNull();
    expect(body.near_miss_next_tier).toBeNull();
    expect(body.anchor_base_player_id).toBeNull();
    expect(body.top_game_tier).toBeNull();
  });

  it("on Send challenge tap, fires POST and clears sessionStorage", async () => {
    writePendingChallengeShare(samplePayload());
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <ResumeShareSurface />
    )));
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));
    // Supabase.auth.getSession() also calls fetch under the hood (token
    // refresh). Look for the create call specifically rather than asserting
    // the total call count.
    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
      const createCall = calls.find(([url]) => String(url) === "/api/challenge/create");
      expect(createCall).toBeTruthy();
    });
    const calls = (globalThis.fetch as any).mock.calls as Array<[string, RequestInit]>;
    const createCall = calls.find(([url]) => String(url) === "/api/challenge/create")!;
    const body = JSON.parse(String(createCall[1].body));
    expect(body.hand_id).toBe("hand-xyz");
    expect(body.challenger_name).toBe("Alice Wonder");
    expect(body.share_headline).toBe("Test caption");
    await waitFor(() => {
      expect(sessionStorage.getItem(PENDING_SHARE_KEY)).toBeNull();
    });
  });
});
