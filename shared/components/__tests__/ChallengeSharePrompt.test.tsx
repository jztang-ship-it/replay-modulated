// @vitest-environment jsdom
/**
 * shared/components/__tests__/ChallengeSharePrompt.test.tsx
 *
 * Phase 5b piece 1 (2026-05-28, doc lock 3da7f02): contract-locks on
 * the share-CTA surface. Covers:
 *   - R1: placeholder commentary copy is in the DOM on the prominent
 *     strip variant (isSpecial=true), and absent from the small
 *     corner-icon variant (default trigger).
 *   - R2: anon vs signed-in routing — tapping the share button opens
 *     the NameCaptureModal in mode="anon" when isAnonymous, in
 *     mode="fresh"|"confirm" otherwise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeSharePrompt } from "../ChallengeSharePrompt";
import { AuthContext } from "@shared/auth/AuthProvider";
import type { GeneratedCard } from "@shared/types/index";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";

// Stub fetch — useChallengeShare's createChallenge path uses
// supabase.auth.getSession + a POST to /api/challenge/create. None of
// our tests submit, but the global stub guards against accidental
// network errors in case any module-load-time call sneaks through.
beforeAll(() => {
  // @ts-expect-error global fetch stub
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

function makeTrigger(trigger: string = "bad_beat"): TriggerResult {
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
  // Reset localStorage so each test starts with a clean nickname/anon state.
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe("R1 — placeholder commentary copy", () => {
  it("appears in the DOM when the prominent strip renders (named trigger)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("bad_beat")} />
    )));
    expect(screen.getByText(PLACEHOLDER_COPY)).toBeTruthy();
  });

  it("does not appear in the DOM on the small corner-icon variant (default trigger)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("default")} />
    )));
    expect(screen.queryByText(PLACEHOLDER_COPY)).toBeNull();
  });

  it("renders for signed-in users too (universal, not anon-only)", () => {
    render(withAuth(false, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("bad_beat")} />
    )));
    expect(screen.getByText(PLACEHOLDER_COPY)).toBeTruthy();
  });
});

describe("R2 — name overlay opens in anon mode for anonymous users", () => {
  it("anonymous user taps Challenge a Friend → modal opens in mode='anon' (sign-up/sign-in CTAs, no input)", () => {
    render(withAuth(true, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("bad_beat")} />
    )));
    // Tap the primary CTA on the prominent strip.
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    // Modal in anon mode: sign-up + sign-in CTAs visible, no input.
    expect(screen.getByRole("button", { name: /^sign up$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("signed-in user taps Challenge a Friend → modal opens in mode='fresh' (input visible, no sign-up CTA)", () => {
    render(withAuth(false, (
      <ChallengeSharePrompt {...baseProps} triggerResult={makeTrigger("bad_beat")} />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^sign up$/i })).toBeNull();
  });

  it("anon-mode Sign Up CTA fires onRequestSignUp callback", () => {
    const onRequestSignUp = vi.fn();
    render(withAuth(true, (
      <ChallengeSharePrompt
        {...baseProps}
        triggerResult={makeTrigger("bad_beat")}
        onRequestSignUp={onRequestSignUp}
      />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(onRequestSignUp).toHaveBeenCalledTimes(1);
  });

  it("anon-mode Sign In CTA fires onRequestSignIn callback", () => {
    const onRequestSignIn = vi.fn();
    render(withAuth(true, (
      <ChallengeSharePrompt
        {...baseProps}
        triggerResult={makeTrigger("bad_beat")}
        onRequestSignIn={onRequestSignIn}
      />
    )));
    fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(onRequestSignIn).toHaveBeenCalledTimes(1);
  });
});
