// @vitest-environment jsdom
/**
 * shared/components/__tests__/PasswordResetSurface.test.tsx
 *
 * Phase 5b piece 1 — U4-g (2026-05-28, doc lock 8004211): contract-locks
 * the password recovery surface's state machine.
 *   - "idle" by default → renders null.
 *   - passwordResetRequestTick increment → transitions to email-entry.
 *   - Send → calls resetPasswordForEmail → transitions to confirmation.
 *   - Cancel/dismiss → returns to idle.
 *   - PASSWORD_RECOVERY event detection is exercised via the AuthProvider's
 *     own onAuthStateChange listener — covered separately by AuthProvider
 *     test boundary; this test focuses on the surface's UI states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PasswordResetSurface } from "../PasswordResetSurface";
import { AuthContext, type AuthContextValue } from "@shared/auth/AuthProvider";

function makeAuth(over: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    uid: "u_test",
    isAuthenticated: false,
    isAnonymous: true,
    ftueCompleted: null,
    signUp: async () => ({ error: null as any }),
    linkGoogle: async () => ({ error: null as any }),
    signIn: async () => ({ error: null as any }),
    signInGoogle: async () => ({ error: null as any }),
    signOut: async () => ({ error: null as any }),
    resetPasswordForEmail: async () => ({ error: null as any }),
    passwordResetRequestTick: 0,
    requestPasswordReset: () => { /* no-op */ },
    ...over,
  };
}

function renderWithAuth(auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <PasswordResetSurface />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

describe("PasswordResetSurface — state machine", () => {
  it("renders null in idle state (tick === 0)", () => {
    const { container } = renderWithAuth(makeAuth({ passwordResetRequestTick: 0 }));
    expect(container.querySelector("[data-password-reset-surface]")).toBeNull();
  });

  it("transitions to email-entry on tick > 0 (initial render)", () => {
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1 }));
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
  });

  it("transitions to email-entry when tick increments via context update", () => {
    const { rerender, container } = render(
      <AuthContext.Provider value={makeAuth({ passwordResetRequestTick: 0 })}>
        <PasswordResetSurface />
      </AuthContext.Provider>,
    );
    expect(container.querySelector("[data-password-reset-surface]")).toBeNull();
    rerender(
      <AuthContext.Provider value={makeAuth({ passwordResetRequestTick: 1 })}>
        <PasswordResetSurface />
      </AuthContext.Provider>,
    );
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
  });

  it("Send tap calls resetPasswordForEmail with trimmed email and transitions to confirmation on success", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null as any }));
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1, resetPasswordForEmail }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "  alice@example.com  " } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith("alice@example.com");
    });
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeTruthy();
    });
  });

  it("surfaces friendly error on rate-limit error and stays in email-entry", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: { message: "rate limit exceeded" } as any }));
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1, resetPasswordForEmail }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/too many attempts/i)).toBeTruthy();
    });
    // Still in email-entry; not confirmation.
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });

  it("requires non-empty email", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null as any }));
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1, resetPasswordForEmail }));
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    // The validation is synchronous (no API call before the empty check);
    // resetPasswordForEmail must not have fired.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    // Error message renders after the state update flushes. The exact-match
    // anchors disambiguate from the subheading that also contains "Enter
    // your email".
    expect(await screen.findByText(/^enter your email$/i)).toBeTruthy();
  });

  it("Cancel returns to idle", () => {
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1 }));
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByPlaceholderText(/email/i)).toBeNull();
  });

  it("Confirmation Done returns to idle", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ error: null as any }));
    renderWithAuth(makeAuth({ passwordResetRequestTick: 1, resetPasswordForEmail }));
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });

  it("backdrop click dismisses from email-entry", () => {
    const { container } = renderWithAuth(makeAuth({ passwordResetRequestTick: 1 }));
    const backdrop = container.querySelector("[data-password-reset-surface]") as HTMLElement;
    expect(backdrop).toBeTruthy();
    // Simulate click on the backdrop element itself (target === currentTarget).
    act(() => {
      backdrop.click();
    });
    expect(screen.queryByPlaceholderText(/email/i)).toBeNull();
  });
});
