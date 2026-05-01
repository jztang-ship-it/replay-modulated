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
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
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
  signUp: async () => ({ error: null }),
  linkGoogle: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInGoogle: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const localUid = useRef(getLocalUid());

  const uid = user?.id ?? localUid.current;
  const isAuthenticated = user !== null;
  const isAnonymous = user?.is_anonymous ?? true;

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    // Every Supabase-touching path is wrapped. Auth is never allowed to blank
    // the screen: the app must render with the localStorage fallback UID if
    // anything here fails.
    try {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        try {
          if (mounted) setUser(session?.user ?? null);
          if (event === "SIGNED_IN" && session?.user && !session.user.is_anonymous) {
            const provider = session.user.app_metadata?.provider ?? "unknown";
            track("auth", "signin_success", { provider });
          }
        } catch (e) {
          console.warn("[auth] onAuthStateChange handler failed:", e);
        }
      });
      subscription = sub?.data?.subscription ?? null;
    } catch (e) {
      console.warn("[auth] onAuthStateChange subscribe failed:", e);
    }

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.info("[auth] getSession →", session?.user
          ? { id: session.user.id, is_anonymous: session.user.is_anonymous, email: session.user.email || null }
          : "no session");
        if (session?.user) {
          if (mounted) setUser(session.user);
          try {
            supabase.from("player_profiles").upsert({
              id: session.user.id,
              nickname: getNickname(),
              is_anonymous: session.user.is_anonymous ?? true,
            }, { onConflict: "id" }).then(({ error }) => {
              if (error) console.warn("[auth] Failed to upsert profile:", error.message);
            });
          } catch (e) { console.warn("[auth] profile upsert threw:", e); }
          return;
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error("[auth] signInAnonymously FAILED — user will run on localStorage UID only (no Supabase row):", error);
          return;
        }
        console.info("[auth] signInAnonymously OK →", data.user ? { id: data.user.id, is_anonymous: data.user.is_anonymous } : "no user returned");
        if (mounted && data.user) {
          setUser(data.user);
          try {
            supabase.from("player_profiles").upsert({
              id: data.user.id,
              nickname: getNickname(),
              is_anonymous: data.user.is_anonymous ?? true,
            }, { onConflict: "id" }).then(({ error }) => {
              if (error) console.warn("[auth] Failed to upsert profile:", error.message);
            });
          } catch (e) { console.warn("[auth] profile upsert threw:", e); }
        }
      } catch (e) {
        console.error("[auth] session bootstrap threw — falling back to local UID:", e);
      }
    })();

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
    <AuthContext.Provider value={{ user, uid, isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
