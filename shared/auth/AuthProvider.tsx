import { createContext, useEffect, useState, useRef, type ReactNode } from "react";
import { supabase } from "@shared/lib/supabase";
import type { User, AuthError } from "@supabase/supabase-js";
import { setAuthUid } from "@shared/utils/playerIdentity";

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (mounted) setUser(session.user);
        return;
      }
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn("[auth] Anonymous sign-in failed, using localStorage UID:", error.message);
        return;
      }
      if (mounted && data.user) setUser(data.user);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setAuthUid(user?.id ?? null);
  }, [user]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    return { error };
  };

  const linkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({ provider: "google" });
    return { error: error as AuthError | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    return { error: error as AuthError | null };
  };

  return (
    <AuthContext.Provider value={{ user, uid, isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}
