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
}

function getLocalUid(): string {
  const key = "rm_uid";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem(key, uid);
  }
  return uid;
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
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const localUid = useRef(getLocalUid());

  const uid = user?.id ?? localUid.current;
  const isAuthenticated = user !== null;
  const isAnonymous = user?.is_anonymous ?? true;

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) setUser(session?.user ?? null);
      // Fires after OAuth redirect returns with a session — the only reliable
      // point to confirm Google sign-in succeeded on the web.
      if (event === "SIGNED_IN" && session?.user && !session.user.is_anonymous) {
        const provider = session.user.app_metadata?.provider ?? "unknown";
        track("auth", "signin_success", { provider });
      }
    });

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (mounted) setUser(session.user);
        supabase.from("player_profiles").upsert({
          id: session.user.id,
          nickname: getNickname(),
          is_anonymous: session.user.is_anonymous ?? true,
        }, { onConflict: "id" }).then(({ error }) => {
          if (error) console.warn("[auth] Failed to upsert profile:", error.message);
        });
        return;
      }
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn("[auth] Anonymous sign-in failed, using localStorage UID:", error.message);
        return;
      }
      if (mounted && data.user) {
        setUser(data.user);
        // Upsert player profile (idempotent)
        supabase.from("player_profiles").upsert({
          id: data.user.id,
          nickname: getNickname(),
          is_anonymous: data.user.is_anonymous ?? true,
        }, { onConflict: "id" }).then(({ error }) => {
          if (error) console.warn("[auth] Failed to upsert profile:", error.message);
        });
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setAuthUid(user?.id ?? null);
  }, [user]);

  const handCountForAuthEvent = () => {
    try { return parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10); }
    catch { return 0; }
  };

  const signUp = async (email: string, password: string) => {
    const wasAnonymous = user?.is_anonymous ?? true;
    const { error } = await supabase.auth.updateUser({ email, password });
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
    const { error } = await supabase.auth.linkIdentity({ provider: "google" });
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
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    // OAuth redirects the page — success event fires from session rehydration below.
    if (error) track("auth", "signin_google_failed", { reason: (error as AuthError).message });
    return { error: error as AuthError | null };
  };

  return (
    <AuthContext.Provider value={{ user, uid, isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}
