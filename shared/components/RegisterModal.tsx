// shared/components/RegisterModal.tsx
import { useContext, useEffect, useMemo, useState } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { addWelcomeMessage } from "@shared/inbox/inbox";
import { supabase } from "@shared/lib/supabase";
import { AuthContext } from "@shared/auth/AuthProvider";
import { deriveDisplayName } from "@shared/utils/deriveDisplayName";

/** Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock 2caa7a3).
 *  "normal" = MVP/LEGEND wins, hand≥5 nudges (existing behavior — auth only).
 *  "challenge" = Anonymous user taps Challenge a Friend. Auth fields PLUS a
 *  name input on the same modal. Pre-auth: name disabled. Post-auth (modal
 *  observes useAuth().isAnonymous flipping to false): auth UI hidden, name
 *  input enabled + populated via deriveDisplayName, Continue posts. */
export type RegisterModalContext = "normal" | "challenge";

interface RegisterModalProps {
  onClose: () => void;
  onSuccess: () => void;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  signInMode?: boolean;
  signIn?: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInGoogle?: () => Promise<{ error: AuthError | null }>;
  /** Phase 5b piece 1: surface variant per the unification lock (U2). */
  context?: RegisterModalContext;
  /** Phase 5b piece 1: fires BEFORE either Google call. The caller uses
   *  this hook to persist mid-flow state (sessionStorage) so the post-
   *  redirect ResumeShareSurface can pick up the share. Path β for
   *  Google means the React tree unmounts during OAuth; this hook is the
   *  only chance to checkpoint share state before that happens.
   *
   *  Phase 3 step 1 (lock: docs/challenge-landing-v2-phase3-authored-
   *  voice-engine-lock.md): widened to accept an async hook. The caller
   *  may need to settle the authored headline via /api/headline before
   *  the sessionStorage write, otherwise the resume path degrades to
   *  the bank-pick string. handleGoogle below awaits the hook so the
   *  OAuth redirect doesn't fire mid-fetch. */
  onBeforeGoogleRedirect?: () => void | Promise<void>;
  /** Phase 5b piece 1: challenge-context only. Fired when user has authed
   *  (path α email path within this same modal session) AND entered a
   *  name AND tapped the unified Continue. Caller wires this to fire the
   *  share-POST. NOT used on the Google path — that flow exits via the
   *  redirect; resume happens in ResumeShareSurface. */
  onChallengeAuthComplete?: (displayName: string) => void | Promise<void>;
  /** Auth-cleanup 2026-06-26: optional claim/stake framing for the post-win boss
   *  claim path. Overrides ONLY the normal sign-UP copy (not signInMode's
   *  "Welcome back", not challenge-context strings) so the modal reads
   *  consistently with the BossClaimPrompt card. Undefined for every existing
   *  caller → default copy, unchanged. */
  claim?: { heading?: string; subheading?: string };
}

/** Translate raw Supabase auth errors into friendly user-facing copy. */
function friendlyAuthError(err: AuthError | { message?: string }, isSignIn: boolean): string {
  const msg = String((err as any)?.message ?? "").toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "Email or password is incorrect. Try again or create a new account.";
  }
  if (msg.includes("email not confirmed")) {
    return "Confirm your email to sign in (check your inbox for the link).";
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return "This email is already registered — try signing in instead.";
  }
  if (msg.includes("password") && (msg.includes("short") || msg.includes("characters"))) {
    return "Password is too short — use at least 6 characters.";
  }
  if (msg.includes("rate") || msg.includes("too many")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Connection issue — check your internet and try again.";
  }
  // Fallback: original message without the noisy "(status XXX)" suffix
  return (err as any)?.message ?? (isSignIn ? "Sign in failed" : "Sign up failed");
}

export function RegisterModal({
  onClose, onSuccess, signUp, linkGoogle, signInMode, signIn, signInGoogle,
  context = "normal", onBeforeGoogleRedirect, onChallengeAuthComplete, claim,
}: RegisterModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSignIn, setIsSignIn] = useState(signInMode ?? false);

  // Phase 5b piece 1: observe auth state internally so the challenge-context
  // post-auth render shape kicks in automatically once email-path auth
  // completes (or on remount via ResumeShareSurface). U4-g: pull
  // requestPasswordReset for the "Forgot password?" link.
  const { user, isAnonymous, requestPasswordReset } = useContext(AuthContext);
  const isChallengeContext = context === "challenge";

  // Phase 5b piece 1: name field state for challenge context. Initialized
  // post-auth via deriveDisplayName; user can edit.
  const initialChallengeName = useMemo(() => isAnonymous ? "" : deriveDisplayName(user), [isAnonymous, user]);
  const [challengeName, setChallengeName] = useState(initialChallengeName);
  // Keep name in sync with auth state — if user authenticates mid-modal,
  // populate the name field from the new session metadata. Does not
  // overwrite a name the user has actively edited (tracked via the
  // userEditedName flag).
  const [userEditedName, setUserEditedName] = useState(false);
  useEffect(() => {
    if (!isChallengeContext) return;
    if (userEditedName) return;
    if (isAnonymous) return;
    const derived = deriveDisplayName(user);
    if (derived) setChallengeName(derived);
  }, [isChallengeContext, isAnonymous, user, userEditedName]);

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password.trim()) { setError("Email and password required"); return; }
    setLoading(true);
    setError(null);
    const result = isSignIn
      ? await signIn?.(email, password) ?? { error: { message: "Sign in not available" } as any }
      : await signUp(email, password);
    setLoading(false);
    if (result.error) {
      console.error("[auth] email path failed:", result.error);
      setError(friendlyAuthError(result.error, isSignIn));
      return;
    }
    // Fire-and-forget: insert welcome message for the new/upgraded user
    if (!isSignIn) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await addWelcomeMessage(user.id);
    }
    // Phase 5b piece 1: in challenge context, do NOT auto-close. The modal
    // stays mounted, auth flips isAnonymous, the name field appears, the
    // user enters/confirms a name, and the unified Continue button posts
    // the challenge. In normal context, preserve today's behavior:
    // celebratory pause then close.
    if (isChallengeContext) return;
    setShowSuccess(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1500);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    // Phase 5b piece 1: persist mid-flow state BEFORE Google's redirect
    // tears down the React tree. The caller (ChallengeSharePrompt in
    // challenge context) wires this to serialize the share-POST
    // payload.
    //
    // Phase 3 step 1: AWAITED. Settling the authored headline before
    // sessionStorage write needs a 0.6-1.5s round-trip to /api/headline;
    // the OAuth redirect (started below by signInGoogle / linkGoogle)
    // must NOT race ahead of that fetch or the resume path degrades.
    // A sync caller returns void → await is a no-op; an async caller
    // is properly sequenced.
    if (isChallengeContext) await onBeforeGoogleRedirect?.();
    const result = isSignIn
      ? await signInGoogle?.() ?? { error: { message: "Google sign in not available" } as any }
      : await linkGoogle();
    setLoading(false);
    if (result.error) {
      console.error("[auth] google path failed:", result.error);
      setError(`Google: ${result.error.message}`);
    } else {
      // Fire-and-forget welcome message. The redirect may have already
      // started, but this is non-blocking so a non-redirect race is fine.
      if (!isSignIn) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await addWelcomeMessage(user.id);
      }
    }
  };

  const handleChallengeContinue = async () => {
    const trimmed = challengeName.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    try {
      await onChallengeAuthComplete?.(trimmed);
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
        <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "32px 24px", textAlign: "center", color: "#22C55E", fontSize: 20, fontWeight: 700 }}>
          {isSignIn ? "Welcome back" : "Saved!"}
        </div>
      </div>
    );
  }

  // Phase 5b piece 1 — U4 second amendment (2026-05-28, doc lock 8004211).
  // Challenge context renders APPEND-STYLE across the auth seam (not swap):
  //   Pre-auth (anon): auth controls (Google + email + password fields +
  //                    email submit + toggle link). No name field.
  //   Post-auth (!anon): auth section transitions to a confirmation line
  //                      ("Signed in as: <user.email>"). Name input + Send
  //                      challenge appear BELOW. User perceives the modal
  //                      adding content, not swapping it. Modal grows
  //                      vertically; no scroll needed.
  // Heading transitions post-auth from "Sign up/in to send to your friend"
  // (pre-auth) to "Add your name to send" (post-auth) per U4-d revised.
  // Chrome (frame, dismiss, font, spacing) stays continuous.
  const showAuthControls = !isChallengeContext || isAnonymous;
  const showChallengeAuthConfirmation = isChallengeContext && !isAnonymous;
  const showChallengeNameField = isChallengeContext && !isAnonymous;
  const showChallengeContinue = isChallengeContext && !isAnonymous;
  const showEmailSubmit = showAuthControls;
  // U4-g: "Forgot password?" link visible in sign-in mode only (any
  // context). Triggers PasswordResetSurface via AuthContext.
  const showForgotPasswordLink = showAuthControls && isSignIn;

  const heading = (() => {
    if (isChallengeContext && !isAnonymous) return "Add your name to send";
    if (isChallengeContext) return "Sign up/in to send to your friend";
    if (isSignIn) return "Welcome back";
    // Normal sign-up: claim framing overrides only here (challenge + signInMode
    // above are untouched).
    return claim?.heading ?? "Save your progress";
  })();
  const subheading = (() => {
    // Post-auth challenge context: brief continuation. Pre-auth challenge:
    // friend-facing framing. signInMode + normal context: existing copy unless
    // a claim framing is supplied (normal sign-up only).
    if (isChallengeContext && !isAnonymous) return "Confirm your name to finish.";
    if (isChallengeContext) return "Your friends need a way to find your challenge.";
    if (isSignIn) return "Sign in to restore your account";
    return claim?.subheading ?? "Play on any device. Never lose your wins.";
  })();

  // U4-b revised: confirmation identifier. Prefer email (strongest identity
  // signal for both email-auth and Google-auth users); fall back to derived
  // display name if somehow no email is set.
  const confirmationIdentifier = user?.email || deriveDisplayName(user) || "your account";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#1a1a2e", borderRadius: "16px 16px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 420, color: "#fff" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{heading}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>{subheading}</div>

        {showAuthControls && (
          <>
            <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: "#fff", color: "#1f2937", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: "#4285F4" }}>G</span>
              {isSignIn ? "Sign in with Google" : "Continue with Google"}
            </button>
            <div style={{ textAlign: "center", color: "#64748b", fontSize: 11, marginBottom: 14, letterSpacing: 1 }}>or use email</div>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleEmailSubmit(); }}
                style={{ width: "100%", padding: "10px 40px 10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "#94a3b8", fontSize: 16, padding: "6px 8px", lineHeight: 1,
                }}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </>
        )}

        {showChallengeAuthConfirmation && (
          // U4-b revised (2026-05-28, doc lock 8004211): post-auth, the
          // auth section transitions to a confirmation line so the user
          // sees the completed step ABOVE the new name step. Append-style,
          // not swap.
          <div
            data-h2h-challenge-auth-confirmation="true"
            style={{
              padding: "12px 14px", borderRadius: 8,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.25)",
              color: "#22C55E", fontSize: 13, fontWeight: 600,
              marginBottom: 18, display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>✓</span>
            <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
              Signed in as <span style={{ color: "#fff", fontWeight: 700 }}>{confirmationIdentifier}</span>
            </span>
          </div>
        )}

        {showChallengeNameField && (
          <>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
              Your name
            </div>
            <input
              type="text"
              placeholder="Your name"
              value={challengeName}
              onChange={e => { setChallengeName(e.target.value); setUserEditedName(true); }}
              maxLength={32}
              autoCapitalize="words"
              autoComplete="off"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#fff",
                fontSize: 14, marginBottom: 12, boxSizing: "border-box",
              }}
            />
          </>
        )}

        {error && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}

        {showEmailSubmit && (
          <button onClick={handleEmailSubmit} disabled={loading} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
            {/* U4-d (2026-05-28): "Sign up with email" replaces "Save with email"
                in challenge context — "save" is wrong verb for the share-CTA
                flow. Normal context keeps "Save with email" for the existing
                save-your-progress framing. */}
            {loading ? "..." : isSignIn ? "Sign in with email" : isChallengeContext ? "Sign up with email" : "Save with email"}
          </button>
        )}

        {showForgotPasswordLink && (
          // U4-g (2026-05-28, doc lock 8004211): "Forgot password?" link
          // in sign-in mode. Tapping increments AuthContext's
          // passwordResetRequestTick; PasswordResetSurface (mounted at
          // App.tsx level) observes the change and transitions to its
          // email-entry state.
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => requestPasswordReset()}
              style={{
                background: "none", border: "none", padding: 0,
                color: "#64748b", fontSize: 12, cursor: "pointer",
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {showChallengeContinue && (
          <button
            onClick={handleChallengeContinue}
            disabled={loading || challengeName.trim().length < 2}
            style={{
              width: "100%", padding: "13px", borderRadius: 8, border: "none",
              background: (loading || challengeName.trim().length < 2) ? "rgba(255,177,74,0.3)" : "#FFB14A",
              color: (loading || challengeName.trim().length < 2) ? "rgba(7,10,18,0.5)" : "#070A12",
              fontSize: 15, fontWeight: 900,
              cursor: (loading || challengeName.trim().length < 2) ? "default" : "pointer",
            }}
          >
            {loading ? "Sending..." : "Send challenge"}
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          {showAuthControls ? (
            <button onClick={() => setIsSignIn(!isSignIn)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
              {isSignIn ? "Create new account" : "Already have an account?"}
            </button>
          ) : <span />}
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
            {isChallengeContext && !isAnonymous ? "Cancel" : "Maybe later"}
          </button>
        </div>
      </div>
    </div>
  );
}
