// @vitest-environment jsdom
/**
 * shared/components/__tests__/ChallengeSharePrompt.test.tsx
 *
 * Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock 2caa7a3):
 *   - R1: placeholder commentary copy on the prominent strip variant.
 *   - U1/U2/U3/U4: anonymous tap opens RegisterModal in challenge context
 *     directly (no intermediate NameCaptureModal anon mode).
 *   - U6: signed-in tap opens NameCaptureModal (unchanged).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeSharePrompt } from "../ChallengeSharePrompt";
import { AuthContext } from "@shared/auth/AuthProvider";
import type { GeneratedCard } from "@shared/types/index";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";

beforeAll(() => {
  // @ts-expect-error global fetch stub — useChallengeShare's createChallenge
  // path uses supabase.auth.getSession + POST to /api/challenge/create.
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ challenge_id: "test", share_url: "", card_url: "" }),
  }));
});

const baseAuthCtx = {
  user: null,
  uid: "u_test",
  isAuthenticated: false,
  isAnonymous: true,
  signUp: async () => ({ error: null as any }),
  linkGoogle: async () => ({ error: null as any }),
  signIn: async () => ({ error: null as any }),
  signInGoogle: async () => ({ error: null as any }),
  signOut: async () => ({ error: null as any }),
};

function withAuth(isAnonymous: boolean, children: React.ReactNode) {
  return (
    <AuthContext.Provider value={{ ...baseAuthCtx, isAnonymous, isAuthenticated: !isAnonymous }}>
      {children}
    </AuthContext.Provider>
  );
}

function makeTrigger(trigger: string = "choke"): TriggerResult {
  return { trigger, headline: "Brutal hand. See if they survive the same slate." } as TriggerResult;
}

const baseProps = {
  sport: "basketball",
  season: "2425",
  totalFp: 110,
  winTier: "BUST",
  roster: [] as GeneratedCard[],
  initialRoster: [] as GeneratedCard[],
  badges: [],
  winTiersMap: {} as any,
  serializeRoster: () => ({}),
  shareHeadline: "Test headline",
};

const PLACEHOLDER_COPY = "the best part of our game is you can compete with your friends to see who can pull the best games";

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

describe("R1 — placeholder commentary copy", () => {
  it("appears in the DOM when the prominent strip renders (named trigger)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    expect(screen.getByText(PLACEHOLDER_COPY)).toBeTruthy();
  });

  it("does not appear on the small corner-icon variant (default trigger)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("default")} />
    )));
    expect(screen.queryByText(PLACEHOLDER_COPY)).toBeNull();
  });

  it("renders for signed-in users too (universal)", () => {
    render(withAuth(false, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    expect(screen.getByText(PLACEHOLDER_COPY)).toBeTruthy();
  });
});

describe("U1/U2/U4 — anonymous tap opens RegisterModal in challenge context", () => {
  it("anonymous user taps Challenge a Friend → unified auth surface appears (Google + email; name field hidden pre-auth)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    // RegisterModal challenge-context pre-auth state per U4-a (2026-05-28
    // amendment): Google button, email/password inputs, NO name field.
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/your name/i)).toBeNull();
  });

  it("does NOT open the legacy NameCaptureModal anon mode (gone post-unification)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    // The babd079 anon-mode shape was a "Sign in to send" heading with
    // Sign up + Sign in buttons and no Google button. Verify those
    // anti-patterns are absent: there should be only ONE Sign up-related
    // button (the RegisterModal email-submit button), not the two-button
    // anon CTAs.
    const signUpButtons = screen.queryAllByRole("button", { name: /^sign up$/i });
    expect(signUpButtons.length).toBe(0);
  });
});

describe("U6 — signed-in tap opens NameCaptureModal (unchanged)", () => {
  it("signed-in user taps Challenge a Friend → modal opens in mode='fresh' (input visible, no Google button)", () => {
    render(withAuth(false, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    // NameCaptureModal fresh mode: input visible, no Google button (that
    // belongs to RegisterModal, which signed-in users skip).
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
  });
});
