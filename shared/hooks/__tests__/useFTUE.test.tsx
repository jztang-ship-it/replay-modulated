// @vitest-environment jsdom
/**
 * shared/hooks/__tests__/useFTUE.test.tsx
 *
 * FTUE KILLED (feat/kill-ftue-real-game, slice 1): the scripted tutorial is
 * removed. This locks the NEW contract — useFTUE always reports
 * `isFTUE === false` regardless of localStorage, URL params, or auth state,
 * and `completeFTUE` is a stable no-op.
 *
 * (Supersedes the Phase 5b Item B gate-behavior tests, which asserted the
 * now-removed "FTUE fires for anon first-timers / never for signed-in" logic.
 * That behavior no longer exists.)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFTUE } from "../useFTUE";

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  // Clear URL params so a stray ?ftue=1 can't bleed across tests.
  window.history.replaceState({}, "", "/");
});

describe("useFTUE — FTUE removed: isFTUE is permanently false", () => {
  it("isFTUE=false with no localStorage flag (former first-timer path)", () => {
    const { result } = renderHook(() => useFTUE("basketball"));
    expect(result.current.isFTUE).toBe(false);
  });

  it("isFTUE=false even with the localStorage flag set", () => {
    window.localStorage.setItem("replaymod_ftue_basketball", "1");
    const { result } = renderHook(() => useFTUE("basketball"));
    expect(result.current.isFTUE).toBe(false);
  });

  it("isFTUE=false even with ?ftue=1 — the former force-on override is gone", () => {
    window.history.replaceState({}, "", "/?ftue=1");
    const { result } = renderHook(() => useFTUE("basketball"));
    expect(result.current.isFTUE).toBe(false);
  });

  it("completeFTUE is a callable no-op with stable identity", () => {
    const { result, rerender } = renderHook(() => useFTUE("basketball"));
    const first = result.current.completeFTUE;
    expect(() => result.current.completeFTUE()).not.toThrow();
    rerender();
    expect(result.current.completeFTUE).toBe(first);
    expect(result.current.isFTUE).toBe(false);
  });
});
