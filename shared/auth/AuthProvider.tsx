import { createContext, useEffect, useState, useRef, type ReactNode } from "react";
import { supabase } from "@shared/lib/supabase";
import type { User, AuthError } from "@supabase/supabase-js";
import { setAuthUid, getNickname } from "@shared/utils/playerIdentity";
import { track } from "@shared/analytics/analytics";

export interface AuthContextValue {
  user: User | null;
  uid: string;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  /** Phase 5b piece 1 — Item B (FTUE bypass, doc lock edc58d9).
   *  Server-side FTUE-completion flag for signed-in users, fetched from
   *  player_profiles.ftue_completed on session resolve.
   *  - `null` = loading OR user is anonymous (consumers should treat the
   *    anonymous case as "use local-storage gate" per B3/B4).
   *  - `true` = completed (signed-in user has finished FTUE on some
   *    device).
   *  - `false` = needs FTUE (only set if a future code path explicitly
   *    clears it; not used today).
   *  Per B7's bias rule: NULL on a signed-in user is treated as completed
   *  by useFTUE — pre-rule existing accounts don't re-see FTUE. */
  ftueCompleted: boolean | null;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  /** Phase 5b piece 1 — U4-g (2026-05-28, doc lock 8004211). Wraps
   *  supabase.auth.resetPasswordForEmail. Triggers a password-reset email
   *  to the given address. Caller is typically PasswordResetSurface's
   *  email-entry state. Recovery email sends only if the Supabase project
   *  dashboard has the "Reset Password" email template enabled + the
   *  redirect URL allowlist includes the current origin. */
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | null }>;
  /** Phase 5b piece 1 — U4-g trigger. Counter incremented by
   *  requestPasswordReset(). PasswordResetSurface observes increments via
   *  useEffect and transitions to its email-entry state. Counter-based
   *  signal sidesteps the "how do we reset the flag" question — each call
   *  is a fresh trigger. */
  passwordResetRequestTick: number;
  /** Phase 5b piece 1 — U4-g trigger. RegisterModal's "Forgot password?"
   *  link calls this. Increments passwordResetRequestTick. */
  requestPasswordReset: () => void;
  /** Phase 5b post-piece-2c (2026-05-30): post-OAuth-redirect error
   *  surfaced from the URL. Supabase returns identity-collision and
   *  similar callback failures as `?error=...&error_description=...`.
   *  Without surfacing it, users land back on the home screen silently
   *  signed-out and have no way to know why. RegisterModal can read this
   *  and render the message inline if the user re-opens the modal.
   *  Cleared after read (one-shot). */
  oauthError: string | null;
}

function getLocalUid(): string {
  // localStorage throws in iOS Safari Private Mode — never let it blank-screen
  // the app. Fall back to an ephemeral in-session UID if storage is dead.
  const key = "rm_uid";
  try {
    let uid = localStorage.getItem(key);
    if (!uid) {
      uid = "u_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      try { localStorage.setItem(key, uid); } catch { /* private mode */ }
    }
    return uid;
  } catch {
    return "u_ephemeral_" + Math.random().toString(36).slice(2, 11);
  }
}

/**
 * Where to send the user back after Google OAuth.
 *
 * Without an explicit `redirectTo`, Supabase falls back to its project-level
 * "Site URL" setting — which on a fresh project defaults to localhost and will
 * redirect every prod user back to localhost. Explicitly pinning the return
 * URL to the current origin + path avoids that whole class of bug, including
 * coming back to the same sport (`/basketball/` vs `/baseball/`).
 *
 * The URL still has to be on Supabase's "Redirect URLs" allowlist or the
 * provider rejects the redirect. Allowlist needs at minimum:
 *   - https://replayifs.com/**
 *   - https://*.vercel.app/**   (preview deploys)
 *   - http://localhost:5173/**  (local dev)
 */
function oauthRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin + window.location.pathname;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  uid: "",
  isAuthenticated: false,
  isAnonymous: true,
  ftueCompleted: null,
  signUp: async () => ({ error: null }),
  linkGoogle: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInGoogle: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ error: null }),
  passwordResetRequestTick: 0,
  requestPasswordReset: () => { /* no-op default */ },
  oauthError: null,
});

/** Phase 5b piece 1 — Item B helper (2026-05-28, doc lock edc58d9).
 *  B5: scan localStorage for any per-sport FTUE-completion flag set to "1".
 *  Used at the anonymous→signed-in transition to decide whether to promote
 *  the user's local FTUE state to their server-side profile. Per the lock,
 *  ANY sport's local completion satisfies the promotion (the profile-level
 *  flag is sport-agnostic; B1 reads "signed-in users never see FTUE"
 *  globally, not per-sport). */
export function anyLocalFtueCompleted(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("replaymod_ftue_")) continue;
      if (localStorage.getItem(key) === "1") return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Phase 5b piece 1 — Item B (2026-05-28, doc lock edc58d9). Server-side
  // FTUE-completion flag for signed-in users. NULL while loading or for
  // anonymous users; populated from player_profiles.ftue_completed on
  // signed-in session resolve and on anon→signed transition (B5 promotion).
  const [ftueCompleted, setFtueCompleted] = useState<boolean | null>(null);
  // Phase 5b piece 1 — U4-g (2026-05-28, doc lock 8004211). Counter trigger
  // for PasswordResetSurface. RegisterModal's "Forgot password?" link calls
  // requestPasswordReset() which increments this. PasswordResetSurface's
  // useEffect detects the change and transitions to its email-entry state.
  const [passwordResetRequestTick, setPasswordResetRequestTick] = useState(0);
  // Phase 5b post-piece-2c (2026-05-30): post-OAuth error surfaced from URL.
  // Supabase callback failures (e.g., identity collision, provider rejection)
  // return as `?error=...&error_description=...`. Parsed once on mount and
  // the URL params stripped so a refresh doesn't re-surface them.
  const [oauthError, setOauthError] = useState<string | null>(null);
  const localUid = useRef(getLocalUid());
  // Once-only promotion guard so the B5 write doesn't fire on every
  // re-emission of SIGNED_IN events (Supabase emits these on token refresh).
  const ftuePromotedRef = useRef(false);

  const uid = user?.id ?? localUid.current;
  const isAuthenticated = user !== null;
  const isAnonymous = user?.is_anonymous ?? true;

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Phase 5b post-piece-2c (2026-05-30) — Bug A supplementary: scan URL
    // for OAuth-callback errors (Supabase returns identity-collision and
    // similar as `?error=...&error_description=...`). One-shot read; the
    // params are stripped so a refresh doesn't re-surface them.
    try {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.has("error")) {
          const msg = params.get("error_description") || params.get("error") || "OAuth failed";
          setOauthError(msg);
          console.warn("[auth] OAuth callback returned error:", msg);
          const url = new URL(window.location.href);
          url.searchParams.delete("error");
          url.searchParams.delete("error_description");
          url.searchParams.delete("error_code");
          window.history.replaceState({}, "", url.toString());
        }
      }
    } catch (e) {
      console.warn("[auth] URL error scan failed:", e);
    }

    // Helper: set user + upsert profile + fetch FTUE flag (non-anon only).
    // Shared between the INITIAL_SESSION existing-session path and the
    // signInAnonymously success path.
    const onSessionEstablished = (sessionUser: User) => {
      if (!mounted) return;
      setUser(sessionUser);
      try {
        supabase.from("player_profiles").upsert({
          id: sessionUser.id,
          nickname: getNickname(),
          is_anonymous: sessionUser.is_anonymous ?? true,
        }, { onConflict: "id" }).then(({ error }) => {
          if (error) console.warn("[auth] Failed to upsert profile:", error.message);
        });
      } catch (e) { console.warn("[auth] profile upsert threw:", e); }
      // Phase 5b piece 1 — Item B (2026-05-28, doc lock edc58d9):
      // populate ftueCompleted from the profile for signed-in users on
      // initial page-load. Anonymous users leave ftueCompleted as null —
      // useFTUE falls back to localStorage in that case per B3/B4.
      if (!sessionUser.is_anonymous) {
        try {
          supabase.from("player_profiles")
            .select("ftue_completed")
            .eq("id", sessionUser.id)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) console.warn("[auth] FTUE flag fetch failed:", error.message);
              else if (mounted) setFtueCompleted((data?.ftue_completed as boolean | null | undefined) ?? null);
            });
        } catch (e) { console.warn("[auth] FTUE flag fetch threw:", e); }
      }
    };

    // Every Supabase-touching path is wrapped. Auth is never allowed to blank
    // the screen: the app must render with the localStorage fallback UID if
    // anything here fails.
    try {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        try {
          if (mounted) setUser(session?.user ?? null);

          // Phase 5b post-piece-2c (2026-05-30) — Bug A fix: bootstrap is
          // gated on INITIAL_SESSION instead of a racing IIFE. The prior
          // code called getSession() then signInAnonymously() in an IIFE;
          // when the user returned from an OAuth redirect, getSession()
          // could return null (SDK hadn't finished URL-hash exchange yet)
          // and signInAnonymously() then overwrote the in-flight Google
          // session. INITIAL_SESSION fires once the SDK has completed URL
          // session detection — by then any redirect session is already
          // resolved, so the anon-fallback decision is safe.
          if (event === "INITIAL_SESSION") {
            console.info("[auth] INITIAL_SESSION →", session?.user
              ? { id: session.user.id, is_anonymous: session.user.is_anonymous, email: session.user.email || null }
              : "no session");
            if (session?.user) {
              onSessionEstablished(session.user);
            } else {
              try {
                supabase.auth.signInAnonymously().then(({ data, error }) => {
                  if (error) {
                    console.error("[auth] signInAnonymously FAILED — user will run on localStorage UID only (no Supabase row):", error);
                    return;
                  }
                  console.info("[auth] signInAnonymously OK →", data.user ? { id: data.user.id, is_anonymous: data.user.is_anonymous } : "no user returned");
                  if (data.user) onSessionEstablished(data.user);
                }).catch((e) => {
                  console.error("[auth] signInAnonymously threw — falling back to local UID:", e);
                });
              } catch (e) {
                console.error("[auth] signInAnonymously failed to start:", e);
              }
            }
          }

          if (event === "SIGNED_IN" && session?.user && !session.user.is_anonymous) {
            const provider = session.user.app_metadata?.provider ?? "unknown";
            track("auth", "signin_success", { provider });
            // Phase 5b piece 1 — Item B B5 (2026-05-28, doc lock edc58d9):
            // anon→signed-in transition promotes any local FTUE-completion
            // to the server-side profile so the user doesn't re-see FTUE
            // post-signup. Guarded so we only promote once per session
            // (Supabase emits SIGNED_IN on every token refresh).
            if (!ftuePromotedRef.current && anyLocalFtueCompleted()) {
              ftuePromotedRef.current = true;
              supabase.from("player_profiles")
                .update({ ftue_completed: true })
                .eq("id", session.user.id)
                .then(({ error }) => {
                  if (error) console.warn("[auth] FTUE promotion failed:", error.message);
                  else if (mounted) setFtueCompleted(true);
                });
            } else if (!ftuePromotedRef.current) {
              // No local flag to promote — fetch the existing profile flag so
              // B4 read precedence has fresh data after sign-in.
              ftuePromotedRef.current = true;
              supabase.from("player_profiles")
                .select("ftue_completed")
                .eq("id", session.user.id)
                .maybeSingle()
                .then(({ data, error }) => {
                  if (error) console.warn("[auth] FTUE flag fetch failed:", error.message);
                  else if (mounted) setFtueCompleted((data?.ftue_completed as boolean | null | undefined) ?? null);
                });
            }
          }
        } catch (e) {
          console.warn("[auth] onAuthStateChange handler failed:", e);
        }
      });
      subscription = sub?.data?.subscription ?? null;
    } catch (e) {
      console.warn("[auth] onAuthStateChange subscribe failed:", e);
    }

    return () => {
      mounted = false;
      try { subscription?.unsubscribe(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    setAuthUid(user?.id ?? null);
    if (typeof window !== "undefined") {
      (window as any).__rm_auth = {
        uid,
        user,
        isAuthenticated,
        isAnonymous,
        isFromSupabase: user !== null,
        localFallbackUid: user ? null : localUid.current,
      };
    }
  }, [user, uid, isAuthenticated, isAnonymous]);

  const handCountForAuthEvent = () => {
    try { return parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10); }
    catch { return 0; }
  };

  const signUp = async (email: string, password: string) => {
    // Re-read the session so this is correct even if `user` state hasn't caught up
    // (e.g. RegisterModal opened before signInAnonymously resolved).
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
    const currentUser = session?.user ?? null;
    const wasAnonymous = currentUser?.is_anonymous ?? false;

    let error: AuthError | null;
    if (currentUser && wasAnonymous) {
      // Upgrade the existing anonymous user → permanent email user.
      const res = await supabase.auth.updateUser({ email, password });
      error = res.error;
      console.info("[auth] signUp via updateUser (upgrade anon) →", error ? `ERR ${error.message}` : "OK");
    } else {
      // No session, or session is already a permanent user → create a fresh user.
      const res = await supabase.auth.signUp({ email, password });
      error = res.error;
      console.info("[auth] signUp via signUp (new user) →", error
        ? `ERR ${error.message}`
        : { id: res.data.user?.id, email: res.data.user?.email, confirmed: !!res.data.user?.email_confirmed_at });
      if (!error && res.data.user && !currentUser) {
        // If no prior session existed, surface the new user into context immediately.
        setUser(res.data.user);
      }
    }

    if (!error) {
      track("auth", "signup_email", { from_anonymous: wasAnonymous, hand_number: handCountForAuthEvent() });
      if (wasAnonymous) track("auth", "account_linked_from_anon", { method: "email", hand_number: handCountForAuthEvent() });
    } else {
      track("auth", "signup_email_failed", { reason: error.message });
    }
    return { error };
  };

  const linkGoogle = async () => {
    const wasAnonymous = user?.is_anonymous ?? true;
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: oauthRedirectUrl() },
    });
    if (!error) {
      track("auth", "link_google", { from_anonymous: wasAnonymous, hand_number: handCountForAuthEvent() });
      if (wasAnonymous) track("auth", "account_linked_from_anon", { method: "google", hand_number: handCountForAuthEvent() });
    } else {
      track("auth", "link_google_failed", { reason: (error as AuthError).message });
    }
    return { error: error as AuthError | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) track("auth", "signin_email", {});
    else track("auth", "signin_email_failed", { reason: error.message });
    return { error };
  };

  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirectUrl() },
    });
    // OAuth redirects the page — success event fires from session rehydration below.
    if (error) track("auth", "signin_google_failed", { reason: (error as AuthError).message });
    return { error: error as AuthError | null };
  };

  // Phase 5b piece 1 — U4-g (2026-05-28, doc lock 8004211). Wraps Supabase's
  // resetPasswordForEmail with the standard redirectTo. Recovery email
  // sends only if the Supabase project's email template is enabled and the
  // redirect URL is allowlisted in the dashboard.
  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: oauthRedirectUrl(),
    });
    if (!error) track("auth", "password_reset_requested", {});
    else track("auth", "password_reset_failed", { reason: (error as AuthError).message });
    return { error: error as AuthError | null };
  };

  // Phase 5b piece 1 — U4-g trigger. Increments the counter that
  // PasswordResetSurface observes. RegisterModal's "Forgot password?" tap
  // calls this; surface picks up the change via useEffect.
  const requestPasswordReset = () => {
    setPasswordResetRequestTick(n => n + 1);
  };

  // Sign out then immediately re-anon so the app never lands without a session.
  // Local UID stays as the playerIdentity fallback if the re-anon call fails.
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      track("auth", "signout_failed", { reason: error.message });
      return { error };
    }
    track("auth", "signout", {});
    setUser(null);
    try {
      const { data, error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        console.warn("[auth] re-anon after signOut failed:", anonErr);
      } else if (data.user) {
        setUser(data.user);
      }
    } catch (e) {
      console.warn("[auth] re-anon after signOut threw:", e);
    }
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ user, uid, isAuthenticated, isAnonymous, ftueCompleted, signUp, linkGoogle, signIn, signInGoogle, signOut, resetPasswordForEmail, passwordResetRequestTick, requestPasswordReset, oauthError }}>
      {children}
    </AuthContext.Provider>
  );
}
