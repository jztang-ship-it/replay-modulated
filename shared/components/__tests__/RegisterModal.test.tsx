// @vitest-environment jsdom
/**
 * shared/components/__tests__/RegisterModal.test.tsx
 *
 * Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock 2caa7a3):
 *  - context="normal" → existing render shape (auth UI only).
 *  - context="challenge" + anonymous → auth UI + disabled name input.
 *  - context="challenge" + signed-in → auth UI HIDDEN, enabled name input,
 *    Send challenge button gated on name length ≥ 2.
 *  - onBeforeGoogleRedirect fires before linkGoogle/signInGoogle.
 *  - onChallengeAuthComplete fires when post-auth Send challenge tapped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RegisterModal } from "../RegisterModal";
import { AuthContext } from "@shared/auth/AuthProvider";
import type { User } from "@supabase/supabase-js";

const baseAuth = {
  user: null as User | null,
  uid: "u_test",
  isAuthenticated: false,
  isAnonymous: true,
  signUp: vi.fn(async () => ({ error: null as any })),
  linkGoogle: vi.fn(async () => ({ error: null as any })),
  signIn: vi.fn(async () => ({ error: null as any })),
  signInGoogle: vi.fn(async () => ({ error: null as any })),
  signOut: async () => ({ error: null as any }),
};

function withAuth(over: Partial<typeof baseAuth>, children: React.ReactNode) {
  const ctx = { ...baseAuth, ...over };
  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  vi.clearAllMocks();
});

const requiredProps = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  signUp: vi.fn(async () => ({ error: null as any })),
  linkGoogle: vi.fn(async () => ({ error: null as any })),
  signIn: vi.fn(async () => ({ error: null as any })),
  signInGoogle: vi.fn(async () => ({ error: null as any })),
};

describe("RegisterModal — normal context (existing behavior)", () => {
  it("renders Google + email + password (no name input)", () => {
    render(withAuth({ isAnonymous: true }, (
      <RegisterModal {...requiredProps} context="normal" />
    )));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/^password$/i)).toBeTruthy();
    // No challenge name field
    expect(screen.queryByPlaceholderText(/sign in to set your name/i)).toBeNull();
    expect(screen.queryByText(/almost there/i)).toBeNull();
  });
});

describe("RegisterModal — challenge context, anonymous (pre-auth)", () => {
  it("renders auth UI + disabled name field with the placeholder", () => {
    render(withAuth({ isAnonymous: true }, (
      <RegisterModal {...requiredProps} context="challenge" />
    )));
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    const nameInput = screen.getByPlaceholderText(/sign in to set your name/i) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    // No "Send challenge" button yet (gated on signed-in state)
    expect(screen.queryByRole("button", { name: /send challenge/i })).toBeNull();
  });

  it("fires onBeforeGoogleRedirect synchronously when Google button tapped", async () => {
    const onBefore = vi.fn();
    render(withAuth({ isAnonymous: true }, (
      <RegisterModal
        {...requiredProps}
        context="challenge"
        onBeforeGoogleRedirect={onBefore}
      />
    )));
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(onBefore).toHaveBeenCalledTimes(1);
  });
});

describe("RegisterModal — challenge context, signed-in (post-auth)", () => {
  const signedInUser = {
    id: "u-signed",
    user_metadata: { full_name: "Alice Wonder" },
    email: "alice@example.com",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01",
  } as User;

  it("hides auth UI, shows enabled name input populated via deriveDisplayName, shows Send challenge", () => {
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <RegisterModal {...requiredProps} context="challenge" />
    )));
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/^email$/i)).toBeNull();
    const nameInput = screen.getByDisplayValue("Alice Wonder") as HTMLInputElement;
    expect(nameInput.disabled).toBe(false);
    expect(screen.getByRole("button", { name: /send challenge/i })).toBeTruthy();
    expect(screen.getByText(/almost there/i)).toBeTruthy();
  });

  it("Send challenge button is enabled when name has 2+ chars", () => {
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <RegisterModal {...requiredProps} context="challenge" />
    )));
    const btn = screen.getByRole("button", { name: /send challenge/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false); // "Alice Wonder" is ≥ 2 chars
  });

  it("Send challenge button disabled when name trims to < 2 chars", () => {
    const noNameUser = {
      ...signedInUser,
      user_metadata: {},
      email: "a@b.co",
    } as User;
    render(withAuth({ isAnonymous: false, user: noNameUser }, (
      <RegisterModal {...requiredProps} context="challenge" />
    )));
    const nameInput = screen.getByDisplayValue("a") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });
    const btn = screen.getByRole("button", { name: /send challenge/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("fires onChallengeAuthComplete with the (possibly edited) name on tap", () => {
    const onComplete = vi.fn();
    render(withAuth({ isAnonymous: false, user: signedInUser }, (
      <RegisterModal
        {...requiredProps}
        context="challenge"
        onChallengeAuthComplete={onComplete}
      />
    )));
    const nameInput = screen.getByDisplayValue("Alice Wonder") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Alice Edit" } });
    fireEvent.click(screen.getByRole("button", { name: /send challenge/i }));
    expect(onComplete).toHaveBeenCalledWith("Alice Edit");
  });
});
