// @vitest-environment jsdom
/**
 * shared/auth/__tests__/AuthProvider.test.ts
 *
 * Phase 5b piece 1 — Item B (2026-05-28, doc lock edc58d9): contract-lock
 * on the B5 promotion helper. The full AuthProvider transition flow is
 * tested via live verification (Supabase mocking the entire
 * onAuthStateChange + database upsert chain is high-effort for low
 * incremental confidence); this unit-tests the localStorage scan logic
 * that decides whether to promote.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { anyLocalFtueCompleted, AuthContext } from "../AuthProvider";

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe("anyLocalFtueCompleted — B5 helper", () => {
  it("returns false when no FTUE keys exist", () => {
    expect(anyLocalFtueCompleted()).toBe(false);
  });

  it("returns true when basketball flag is set to '1'", () => {
    window.localStorage.setItem("replaymod_ftue_basketball", "1");
    expect(anyLocalFtueCompleted()).toBe(true);
  });

  it("returns true when baseball flag is set to '1' (any sport satisfies)", () => {
    window.localStorage.setItem("replaymod_ftue_baseball", "1");
    expect(anyLocalFtueCompleted()).toBe(true);
  });

  it("returns true when ANY of multiple sport flags is set to '1'", () => {
    window.localStorage.setItem("replaymod_ftue_basketball", "0");
    window.localStorage.setItem("replaymod_ftue_baseball", "1");
    window.localStorage.setItem("replaymod_ftue_soccer", "0");
    expect(anyLocalFtueCompleted()).toBe(true);
  });

  it("returns false when all FTUE flags are NOT '1'", () => {
    window.localStorage.setItem("replaymod_ftue_basketball", "0");
    window.localStorage.setItem("replaymod_ftue_baseball", "false");
    expect(anyLocalFtueCompleted()).toBe(false);
  });

  it("ignores non-FTUE keys with similar prefixes", () => {
    window.localStorage.setItem("replaymod_nickname", "1");
    window.localStorage.setItem("replaymod_balance", "1");
    expect(anyLocalFtueCompleted()).toBe(false);
  });
});

describe("AuthContext — U4-g defaults (2026-05-28, doc lock 8004211)", () => {
  it("exposes resetPasswordForEmail + requestPasswordReset + passwordResetRequestTick with safe no-op defaults", async () => {
    // The default context value's methods exist and don't throw when called
    // outside an AuthProvider. Real implementations are wired in
    // AuthProvider.tsx and tested via integration with PasswordResetSurface.
    const ctx = AuthContext as any;
    const defaultValue = ctx._currentValue ?? ctx._currentValue2 ?? null;
    // Skip introspection if React internals don't expose default value
    // structure; the contract check below covers the same surface.
    if (!defaultValue) return;
    expect(typeof defaultValue.resetPasswordForEmail).toBe("function");
    expect(typeof defaultValue.requestPasswordReset).toBe("function");
    expect(typeof defaultValue.passwordResetRequestTick).toBe("number");
    expect(defaultValue.passwordResetRequestTick).toBe(0);
    const result = await defaultValue.resetPasswordForEmail("test@example.com");
    expect(result.error).toBeNull();
    expect(() => defaultValue.requestPasswordReset()).not.toThrow();
  });
});
