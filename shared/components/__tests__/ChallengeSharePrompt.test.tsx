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
import { render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import { ChallengeSharePrompt, type ChallengeSendHandle } from "../ChallengeSharePrompt";
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

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

// (Removed "R1 — placeholder commentary copy" tests: the fixed bottom-sheet's
// placeholder/headline chrome was replaced by the inline SEND capsule — a bare
// pill, no in-prompt narrative copy. Story-narrative framing is deferred to the
// commentary thread. The send-entry flow below still validates the capsule's tap.)

// The send entry moved off a visible in-prompt button onto the imperative
// startSend() handle (GameBar's "Challenge" button calls it via a ref). These
// tests drive that handle directly — the auth/name-modal routing it triggers is
// unchanged.
describe("U1/U2/U4 — anonymous startSend opens RegisterModal in challenge context", () => {
  it("anonymous startSend → unified auth surface appears (Google + email; name field hidden pre-auth)", () => {
    const ref = createRef<ChallengeSendHandle>();
    render(withAuth(true, (
      <ChallengeSharePrompt ref={ref} {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    act(() => { ref.current?.startSend(); });
    // RegisterModal challenge-context pre-auth state per U4-a (2026-05-28
    // amendment): Google button, email/password inputs, NO name field.
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/your name/i)).toBeNull();
  });

  it("does NOT open the legacy NameCaptureModal anon mode (gone post-unification)", () => {
    const ref = createRef<ChallengeSendHandle>();
    render(withAuth(true, (
      <ChallengeSharePrompt ref={ref} {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    act(() => { ref.current?.startSend(); });
    // The babd079 anon-mode shape was a "Sign in to send" heading with
    // Sign up + Sign in buttons and no Google button. Verify those
    // anti-patterns are absent: there should be only ONE Sign up-related
    // button (the RegisterModal email-submit button), not the two-button
    // anon CTAs.
    const signUpButtons = screen.queryAllByRole("button", { name: /^sign up$/i });
    expect(signUpButtons.length).toBe(0);
  });
});

describe("U6 — signed-in startSend opens NameCaptureModal (unchanged)", () => {
  it("signed-in startSend → modal opens in mode='fresh' (input visible, no Google button)", () => {
    const ref = createRef<ChallengeSendHandle>();
    render(withAuth(false, (
      <ChallengeSharePrompt ref={ref} {...baseProps} triggerResult={makeTrigger("choke")} />
    )));
    act(() => { ref.current?.startSend(); });
    // NameCaptureModal fresh mode: input visible, no Google button (that
    // belongs to RegisterModal, which signed-in users skip).
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
  });
});
