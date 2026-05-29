// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/useFTUE.test.tsx
 *
 * Phase 5b piece 1 — Item B (2026-05-28, doc lock edc58d9): contract-locks
 * the FTUE-bypass-for-signed-in-users rule. B1 (signed-in users never see
 * FTUE), B3/B4 (anonymous-vs-signed-in precedence), B7 (NULL profile flag
 * for pre-rule existing accounts treated as completed).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFTUE } from "../useFTUE";
import { AuthContext } from "@shared/auth/AuthProvider";
import type { User } from "@supabase/supabase-js";

const baseAuth = {
  user: null as User | null,
  uid: "u_test",
  isAuthenticated: false,
  isAnonymous: true,
  ftueCompleted: null as boolean | null,
  signUp: async () => ({ error: null as any }),
  linkGoogle: async () => ({ error: null as any }),
  signIn: async () => ({ error: null as any }),
  signInGoogle: async () => ({ error: null as any }),
  signOut: async () => ({ error: null as any }),
};

function withAuth(over: Partial<typeof baseAuth>) {
  return ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={{ ...baseAuth, ...over }}>{children}</AuthContext.Provider>
  );
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  // Clear URL params so QA bypasses don't bleed across tests.
  window.history.replaceState({}, "", "/");
});

describe("useFTUE — B1: signed-in users never see FTUE", () => {
  it("isAnonymous=false + ftueCompleted=true → isFTUE=false", () => {
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: false, ftueCompleted: true }),
    });
    expect(result.current.isFTUE).toBe(false);
  });

  it("isAnonymous=false + ftueCompleted=null (pre-rule account) → isFTUE=false per B7 bias", () => {
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: false, ftueCompleted: null }),
    });
    expect(result.current.isFTUE).toBe(false);
  });

  it("isAnonymous=false ignores localStorage gate", () => {
    // Even with NO localStorage flag set, signed-in user does not see FTUE.
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: false, ftueCompleted: null }),
    });
    expect(result.current.isFTUE).toBe(false);
  });

  it("isAnonymous=false + ftueCompleted=false → isFTUE=true (only explicit server false fires FTUE for signed-in)", () => {
    // Reserved for a future explicit reset; not used by any current code
    // path but locked here so the contract is clear.
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: false, ftueCompleted: false }),
    });
    expect(result.current.isFTUE).toBe(true);
  });
});

describe("useFTUE — B3/B4: anonymous users still use local storage", () => {
  it("anonymous + no localStorage flag → isFTUE=true (first-time)", () => {
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: true, ftueCompleted: null }),
    });
    expect(result.current.isFTUE).toBe(true);
  });

  it("anonymous + localStorage flag set → isFTUE=false (already completed)", () => {
    window.localStorage.setItem("replaymod_ftue_basketball", "1");
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: true, ftueCompleted: null }),
    });
    expect(result.current.isFTUE).toBe(false);
  });

  it("anonymous user's localStorage flag is INDEPENDENT from ftueCompleted (which is null for anons)", () => {
    // Even if somehow ftueCompleted were set to true while anonymous, the
    // localStorage gate is what drives the anon path (B3/B4).
    window.localStorage.setItem("replaymod_ftue_basketball", "1");
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: true, ftueCompleted: true }),
    });
    expect(result.current.isFTUE).toBe(false);
  });

  it("completeFTUE writes localStorage + flips isFTUE to false (anon path)", () => {
    const { result } = renderHook(() => useFTUE("basketball"), {
      wrapper: withAuth({ isAnonymous: true, ftueCompleted: null }),
    });
    expect(result.current.isFTUE).toBe(true);
    result.current.completeFTUE();
    expect(window.localStorage.getItem("replaymod_ftue_basketball")).toBe("1");
  });
});
