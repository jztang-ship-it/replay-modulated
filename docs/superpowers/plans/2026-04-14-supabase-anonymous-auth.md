# Supabase Anonymous Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking Supabase anonymous auth that silently creates real user accounts, with soft registration nudges at high-emotion moments and a PWA install prompt on return visits.

**Architecture:** AuthProvider wraps the app but never blocks rendering. Game loads instantly on localStorage UID, Supabase upgrades it in the background. Registration nudges fire one-shot at big wins, leaderboard appearances, and sustained play. Leaderboard API gets two-tier verification (verified/unverified). DB tables scaffolded for future server-side state.

**Tech Stack:** Supabase Auth (anonymous + email + Google), React Context, Vercel Serverless Functions, Supabase PostgreSQL (tables + RLS)

**Spec:** `docs/superpowers/specs/2026-04-14-supabase-anonymous-auth-design.md`

---

### Task 1: Supabase Client Singleton

**Files:**
- Create: `shared/lib/supabase.ts`

- [ ] **Step 1: Create the Supabase client module**

```typescript
// shared/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth disabled");
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
);
```

- [ ] **Step 2: Add environment variables**

Add to `basketball/.env.local`:
```
VITE_SUPABASE_URL="https://hnhrpwwznzokkfagfumb.supabase.co"
VITE_SUPABASE_ANON_KEY="<get from Supabase dashboard → Settings → API → anon public key>"
```

The Supabase project ID `hnhrpwwznzokkfagfumb` is already used for storage URLs in the existing `.env.local`.

- [ ] **Step 3: Verify import resolves**

Run from `basketball/`:
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to `shared/lib/supabase.ts`. (May see other pre-existing errors.)

- [ ] **Step 4: Commit**

```bash
git add shared/lib/supabase.ts basketball/.env.local
git commit -m "feat(auth): add Supabase client singleton with env vars"
```

---

### Task 2: AuthProvider — Non-Blocking Context

**Files:**
- Create: `shared/auth/AuthProvider.tsx`
- Create: `shared/auth/useAuth.ts`

- [ ] **Step 1: Create AuthProvider**

```typescript
// shared/auth/AuthProvider.tsx
import { createContext, useEffect, useState, useRef, type ReactNode } from "react";
import { supabase } from "@shared/lib/supabase";
import type { User, AuthError } from "@supabase/supabase-js";

export interface AuthContextValue {
  /** Supabase user object, null if auth hasn't resolved yet */
  user: User | null;
  /** Best available UID: supabase user.id → localStorage rm_uid → newly generated */
  uid: string;
  /** True if user has a Supabase session (anonymous or registered) */
  isAuthenticated: boolean;
  /** True if user is anonymous (not linked to email/Google) */
  isAnonymous: boolean;
  /** Upgrade anonymous account with email + password */
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  /** Link Google identity to current anonymous account */
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  /** Sign in existing registered user (email + password) */
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  /** Sign in with Google (for returning registered users) */
  signInGoogle: () => Promise<{ error: AuthError | null }>;
}

/** Get or create a localStorage UID — immediate, no async */
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

  // Derive UID: prefer supabase user.id, fall back to localStorage
  const uid = user?.id ?? localUid.current;
  const isAuthenticated = user !== null;
  const isAnonymous = user?.is_anonymous ?? true;

  useEffect(() => {
    let mounted = true;

    // Listen for auth state changes (session restore, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    // Attempt to restore existing session or create anonymous one
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (mounted) setUser(session.user);
        return;
      }
      // No existing session — create anonymous account
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
```

- [ ] **Step 2: Create useAuth hook**

```typescript
// shared/auth/useAuth.ts
import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./AuthProvider";

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: Clean or pre-existing errors only.

- [ ] **Step 4: Commit**

```bash
git add shared/auth/AuthProvider.tsx shared/auth/useAuth.ts
git commit -m "feat(auth): AuthProvider with non-blocking anonymous sign-in"
```

---

### Task 3: Wire AuthProvider into App

**Files:**
- Modify: `basketball/src/App.tsx`

- [ ] **Step 1: Wrap App with AuthProvider — no loading gate**

Current `App.tsx`:
```typescript
import { ErrorBoundary } from "./components/ErrorBoundary";
import GameView from "./views/GameView";
import LandingPage from "./views/LandingPage";
import { useFTUE } from "@shared/hooks/useFTUE";
import { useState } from "react";

export default function App() {
  const { isFTUE } = useFTUE("basketball");
  const [view, setView] = useState<"landing" | "game">(
    isFTUE ? "landing" : "game"
  );

  return (
    <ErrorBoundary>
      {view === "landing" ? (
        <LandingPage onPlay={() => setView("game")} />
      ) : (
        <GameView />
      )}
    </ErrorBoundary>
  );
}
```

Add AuthProvider import and wrap. The game renders immediately — AuthProvider never blocks:

```typescript
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "@shared/auth/AuthProvider";
import GameView from "./views/GameView";
import LandingPage from "./views/LandingPage";
import { useFTUE } from "@shared/hooks/useFTUE";
import { useState } from "react";

export default function App() {
  const { isFTUE } = useFTUE("basketball");
  const [view, setView] = useState<"landing" | "game">(
    isFTUE ? "landing" : "game"
  );

  return (
    <AuthProvider>
      <ErrorBoundary>
        {view === "landing" ? (
          <LandingPage onPlay={() => setView("game")} />
        ) : (
          <GameView />
        )}
      </ErrorBoundary>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Manual test — open app in browser**

```bash
cd basketball && npm run dev
```

Open browser. Verify:
- Game loads instantly (no loading screen)
- Open DevTools → Application → Local Storage → check for `sb-hnhrpwwznzokkfagfumb-auth-token` key (Supabase session)
- If Supabase env vars aren't set yet, game still loads with localStorage UID (console shows "[auth] Anonymous sign-in failed" or "[supabase] Missing VITE_SUPABASE_URL" warning)

- [ ] **Step 4: Commit**

```bash
git add basketball/src/App.tsx
git commit -m "feat(auth): wrap App with AuthProvider"
```

---

### Task 4: Replace playerIdentity UID with Auth UID

**Files:**
- Modify: `shared/utils/playerIdentity.ts`
- Modify: `shared/analytics/analytics.ts`

- [ ] **Step 1: Update playerIdentity.ts to use auth UID**

The current `getPlayerUid()` reads from localStorage. We need it to prefer the Supabase UID when available. Since `playerIdentity.ts` is called from non-React contexts (analytics, leaderboard submit functions), we can't use the React hook directly. Instead, we expose a setter that AuthProvider calls.

Replace the contents of `shared/utils/playerIdentity.ts`:

```typescript
// shared/utils/playerIdentity.ts

/** Auth UID set by AuthProvider when Supabase resolves */
let _authUid: string | null = null;

/** Called by AuthProvider when Supabase user resolves. Do not call from elsewhere. */
export function setAuthUid(uid: string | null): void {
  _authUid = uid;
}

/** UID priority: Supabase user.id → localStorage rm_uid → generate new */
export function getPlayerUid(): string {
  if (_authUid) return _authUid;
  const key = "rm_uid";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem(key, uid);
  }
  return uid;
}

export function getNickname(): string {
  return localStorage.getItem("replaymod_nickname") ?? getOrCreateNickname();
}

export function setNickname(name: string): void {
  localStorage.setItem("replaymod_nickname", name);
}

export function getSessionId(): string {
  let id = localStorage.getItem("rm_session_id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    localStorage.setItem("rm_session_id", id);
  }
  return id;
}

// ── Random nickname generator ──────────────────────────────────────────────
const ADJECTIVES = [
  "Shadow","Phantom","Iron","Golden","Silent","Swift","Cosmic","Neon",
  "Thunder","Crimson","Blazing","Stealth","Frost","Rogue","Electric",
  "Turbo","Viper","Storm","Cyber","Titan","Lunar","Onyx","Delta",
];
const NOUNS = [
  "Hoops","Dunk","Clutch","Swish","Rebound","Fadeaway","Crossover",
  "Alley","Buzzer","Layup","Jumper","Slam","Court","Triple","Press",
];

function getOrCreateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const nick = `${adj}${noun}_${num}`;
  localStorage.setItem("replaymod_nickname", nick);
  return nick;
}
```

- [ ] **Step 2: Wire AuthProvider to call setAuthUid**

Add to `shared/auth/AuthProvider.tsx`, inside the `AuthProvider` component, after the `uid` derivation:

```typescript
import { setAuthUid } from "@shared/utils/playerIdentity";

// Inside AuthProvider, add this effect after the existing useEffect:
useEffect(() => {
  setAuthUid(user?.id ?? null);
}, [user]);
```

- [ ] **Step 3: Update analytics.ts to use playerIdentity**

In `shared/analytics/analytics.ts`, replace the `getOrCreateUserId()` function (lines 83-93):

```typescript
import { getPlayerUid } from "@shared/utils/playerIdentity";

// Replace the entire getOrCreateUserId function with:
function getOrCreateUserId(): string {
  return getPlayerUid();
}
```

This way analytics uses the same UID priority chain as everything else.

- [ ] **Step 4: Type-check and verify**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add shared/utils/playerIdentity.ts shared/auth/AuthProvider.tsx shared/analytics/analytics.ts
git commit -m "feat(auth): replace localStorage UID with auth-aware UID priority chain"
```

---

### Task 5: Leaderboard Two-Tier Verification

**Files:**
- Modify: `api/leaderboard.ts`

- [ ] **Step 1: Add Supabase JWT verification to leaderboard**

Add imports and a helper at the top of `api/leaderboard.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseServer = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/** Verify Supabase JWT and return the user ID, or null if invalid/missing */
async function verifyToken(authHeader: string | undefined): Promise<{ uid: string | null; verified: boolean }> {
  if (!authHeader || !supabaseServer) return { uid: null, verified: false };
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { uid: null, verified: false };
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return { uid: null, verified: false };
  return { uid: user.id, verified: true };
}
```

- [ ] **Step 2: Add verification to submit handler**

Inside `handleSubmit`, after parsing `uid` from the request body, add the verification check:

```typescript
// After: const { action, metric, value, uid, nickname, proof } = req.body ?? {};
const authHeader = req.headers.authorization as string | undefined;
const tokenResult = await verifyToken(authHeader);

// Two-tier verification: reject if token present but UID mismatches
if (tokenResult.verified && tokenResult.uid !== uid) {
  return json(res, 403, { error: "UID mismatch" });
}

const verified = tokenResult.verified;
```

- [ ] **Step 3: Add env var note**

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel project environment variables. The service role key is needed server-side to verify JWTs. Get it from Supabase dashboard → Settings → API → service_role key.

- [ ] **Step 4: Update client-side leaderboard submission to include auth token**

In `basketball/src/views/GameView.tsx`, update `submitToLeaderboard` (around line 136) to include the Supabase session token:

```typescript
async function submitToLeaderboard(metric: string, value: number, extra?: Record<string, unknown>) {
  const uid = getPlayerUid();
  const nickname = getNickname();
  if (!uid || value <= 0) return;
  // Get auth token if available
  let authHeader: Record<string, string> = {};
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch { /* auth not available, submit unverified */ }
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ action: "submit", metric, value, uid, nickname, session_id: getSessionId(), ...extra }),
    });
  } catch { }
}
```

Add the supabase import at the top of GameView.tsx:
```typescript
import { supabase } from "@shared/lib/supabase";
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add api/leaderboard.ts basketball/src/views/GameView.tsx
git commit -m "feat(auth): two-tier leaderboard verification — verified/unverified flags"
```

---

### Task 6: Registration Modal

**Files:**
- Create: `shared/components/RegisterModal.tsx`

- [ ] **Step 1: Create the registration modal component**

```typescript
// shared/components/RegisterModal.tsx
import { useState } from "react";
import type { AuthError } from "@supabase/supabase-js";

interface RegisterModalProps {
  onClose: () => void;
  onSuccess: () => void;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  /** If true, show sign-in mode instead of sign-up */
  signInMode?: boolean;
  signIn?: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInGoogle?: () => Promise<{ error: AuthError | null }>;
}

export function RegisterModal({ onClose, onSuccess, signUp, linkGoogle, signInMode, signIn, signInGoogle }: RegisterModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSignIn, setIsSignIn] = useState(signInMode ?? false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password required");
      return;
    }
    setLoading(true);
    setError(null);

    const result = isSignIn
      ? await signIn?.(email, password) ?? { error: { message: "Sign in not available" } as any }
      : await signUp(email, password);

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setShowSuccess(true);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1500);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    const result = isSignIn
      ? await signInGoogle?.() ?? { error: { message: "Google sign in not available" } as any }
      : await linkGoogle();
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
    }
    // Google OAuth redirects — success handled on return
  };

  if (showSuccess) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}>
        <div style={{
          background: "#1a1a2e", borderRadius: 16, padding: "32px 24px", textAlign: "center",
          color: "#22C55E", fontSize: 20, fontWeight: 700,
        }}>
          Saved!
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#1a1a2e", borderRadius: "16px 16px 0 0", padding: "24px 20px 32px",
        width: "100%", maxWidth: 420, color: "#fff",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {isSignIn ? "Welcome back" : "Save your progress"}
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
          {isSignIn ? "Sign in to restore your account" : "Play on any device. Never lose your wins."}
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #334155",
            background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 600,
            cursor: loading ? "wait" : "pointer", marginBottom: 16,
          }}
        >
          {isSignIn ? "Sign in with Google" : "Sign up with Google"}
        </button>

        <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginBottom: 16 }}>or</div>

        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155",
            background: "#0f172a", color: "#fff", fontSize: 14, marginBottom: 8, boxSizing: "border-box",
          }}
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155",
            background: "#0f172a", color: "#fff", fontSize: 14, marginBottom: 12, boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 8 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", padding: "12px", borderRadius: 8, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 15, fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "..." : isSignIn ? "Sign in" : "Save my account"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button
            onClick={() => setIsSignIn(!isSignIn)}
            style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            {isSignIn ? "Create new account" : "Already have an account?"}
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add shared/components/RegisterModal.tsx
git commit -m "feat(auth): registration modal — email/password + Google, bottom sheet"
```

---

### Task 7: Registration Nudge Component

**Files:**
- Create: `shared/components/RegisterNudge.tsx`

- [ ] **Step 1: Create the nudge component**

```typescript
// shared/components/RegisterNudge.tsx
import { useState, useEffect } from "react";

interface RegisterNudgeProps {
  /** Unique nudge ID for one-shot tracking (e.g. "nudge_big_win") */
  nudgeId: string;
  /** Message to display */
  message: string;
  /** Whether the trigger condition is met right now */
  active: boolean;
  /** Called when user taps the CTA */
  onRegister: () => void;
  /** Called when user dismisses */
  onDismiss?: () => void;
}

/** Check if this nudge has already been shown */
function wasShown(nudgeId: string): boolean {
  return localStorage.getItem(`rm_${nudgeId}_shown`) === "1";
}

/** Mark this nudge as shown */
function markShown(nudgeId: string): void {
  localStorage.setItem(`rm_${nudgeId}_shown`, "1");
}

/** Check if any auth nudge has fired this session */
function authNudgeFiredThisSession(): boolean {
  return sessionStorage.getItem("rm_auth_nudge_fired") === "1";
}

function markAuthNudgeFired(): void {
  sessionStorage.setItem("rm_auth_nudge_fired", "1");
}

export function RegisterNudge({ nudgeId, message, active, onRegister, onDismiss }: RegisterNudgeProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (wasShown(nudgeId)) return;
    if (authNudgeFiredThisSession()) return;

    markShown(nudgeId);
    markAuthNudgeFired();
    // Small delay so it doesn't flash immediately on top of other animations
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [active, nudgeId]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
      padding: "16px 16px 24px", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9) 30%)",
    }}>
      <div style={{
        background: "#1e293b", borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12, maxWidth: 420, margin: "0 auto",
      }}>
        <div style={{ flex: 1, color: "#e2e8f0", fontSize: 13, lineHeight: 1.4 }}>
          {message}
        </div>
        <button
          onClick={() => { dismiss(); onRegister(); }}
          style={{
            background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          Save
        </button>
        <button
          onClick={dismiss}
          style={{
            background: "none", border: "none", color: "#64748b", fontSize: 18,
            cursor: "pointer", padding: "4px 8px", lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/components/RegisterNudge.tsx
git commit -m "feat(auth): one-shot registration nudge banner component"
```

---

### Task 8: PWA Install Prompt

**Files:**
- Create: `shared/components/PwaInstallPrompt.tsx`

- [ ] **Step 1: Create PWA prompt component**

```typescript
// shared/components/PwaInstallPrompt.tsx
import { useState, useEffect, useRef } from "react";

interface PwaInstallPromptProps {
  /** True when conditions are met to show the prompt */
  active: boolean;
}

function wasShown(): boolean {
  return localStorage.getItem("rm_nudge_pwa_shown") === "1";
}

function markShown(): void {
  localStorage.setItem("rm_nudge_pwa_shown", "1");
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
}

export function PwaInstallPrompt({ active }: PwaInstallPromptProps) {
  const [visible, setVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  // Capture the beforeinstallprompt event (Chrome/Edge/Samsung)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (wasShown()) return;
    if (isStandalone()) return; // Already installed

    markShown();
    const t = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      deferredPromptRef.current = null;
    } else if (isIos()) {
      setShowIosInstructions(true);
      return;
    }
    setVisible(false);
  };

  const dismiss = () => setVisible(false);

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
      padding: "16px 16px 24px", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9) 30%)",
    }}>
      <div style={{
        background: "#1e293b", borderRadius: 12, padding: "14px 16px",
        maxWidth: 420, margin: "0 auto",
      }}>
        {showIosInstructions ? (
          <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Add to Home Screen</div>
            <div>Tap the <strong>Share</strong> button, then <strong>"Add to Home Screen"</strong></div>
            <button onClick={dismiss} style={{
              marginTop: 12, background: "none", border: "1px solid #334155", borderRadius: 8,
              color: "#94a3b8", padding: "8px 14px", fontSize: 13, cursor: "pointer", width: "100%",
            }}>
              Got it
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, color: "#e2e8f0", fontSize: 13, lineHeight: 1.4 }}>
              Add ReplayMod to your home screen for instant access.
            </div>
            <button
              onClick={handleInstall}
              style={{
                background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
                padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Install
            </button>
            <button
              onClick={dismiss}
              style={{
                background: "none", border: "none", color: "#64748b", fontSize: 18,
                cursor: "pointer", padding: "4px 8px", lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/components/PwaInstallPrompt.tsx
git commit -m "feat(auth): PWA install prompt with iOS instructions fallback"
```

---

### Task 9: Wire Nudges + PWA into GameView

**Files:**
- Modify: `basketball/src/views/GameView.tsx`

This is the integration task — connecting nudge triggers to actual game events.

- [ ] **Step 1: Add imports and auth hook**

Add at the top of GameView.tsx:

```typescript
import { useAuth } from "@shared/auth/useAuth";
import { RegisterNudge } from "@shared/components/RegisterNudge";
import { RegisterModal } from "@shared/components/RegisterModal";
import { PwaInstallPrompt } from "@shared/components/PwaInstallPrompt";
```

Inside the GameView component function, add near the top (with other hooks):

```typescript
const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
const [showRegisterModal, setShowRegisterModal] = useState(false);
```

- [ ] **Step 2: Add nudge trigger state**

Add these state/derived values in GameView:

```typescript
// Nudge triggers — derived from game state
const [bigWinFired, setBigWinFired] = useState(false);
const [onLeaderboard, setOnLeaderboard] = useState(false);
const sessionCount = useRef(
  parseInt(localStorage.getItem("rm_session_count") ?? "0", 10)
);

// Increment session count on mount
useEffect(() => {
  const next = sessionCount.current + 1;
  sessionCount.current = next;
  localStorage.setItem("rm_session_count", String(next));
}, []);
```

- [ ] **Step 3: Wire big win trigger**

In the hand resolution callback (around line 860, inside the `runSpring` callback, after `setWinTier(tier)`), add:

```typescript
// Nudge trigger: first ALL_STAR+ hit
const BIG_WIN_TIERS = ["ALL_STAR", "MVP", "LEGEND"];
if (BIG_WIN_TIERS.includes(tier) && isAnonymous) {
  setBigWinFired(true);
}
```

- [ ] **Step 4: Wire leaderboard trigger**

In `checkLeaderboardRank()` (around line 149), after determining the user is on the board, add:

```typescript
// After: localStorage.setItem("rm_on_board_today", onBoard ? "1" : "0");
if (onBoard && isAnonymous) {
  setOnLeaderboard(true);
}
```

- [ ] **Step 5: Render nudges and modal**

At the bottom of GameView's JSX return, before the closing fragments, add:

```typescript
{/* Registration nudges — only for anonymous users, only during IDLE/RESULTS */}
{isAnonymous && (gameState === "IDLE" || gameState === "RESULTS") && (
  <>
    <RegisterNudge
      nudgeId="nudge_big_win"
      message="Nice hit! Save your progress so you don't lose it."
      active={bigWinFired}
      onRegister={() => setShowRegisterModal(true)}
    />
    <RegisterNudge
      nudgeId="nudge_leaderboard"
      message="You're on the board! Claim your spot — add an email."
      active={onLeaderboard}
      onRegister={() => setShowRegisterModal(true)}
    />
    <RegisterNudge
      nudgeId="nudge_retention"
      message="Having fun? Save your account to play on any device."
      active={handCount >= 12}
      onRegister={() => setShowRegisterModal(true)}
    />
  </>
)}

{/* PWA prompt — fires on session 2+ */}
{(gameState === "IDLE" || gameState === "RESULTS") && (
  <PwaInstallPrompt active={sessionCount.current >= 2} />
)}

{/* Registration modal */}
{showRegisterModal && (
  <RegisterModal
    onClose={() => setShowRegisterModal(false)}
    onSuccess={() => setShowRegisterModal(false)}
    signUp={signUp}
    linkGoogle={linkGoogle}
    signIn={signIn}
    signInGoogle={signInGoogle}
  />
)}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Manual test in browser**

Test scenarios:
1. Play through FTUE + first hand — no nudges should fire (hand count too low, no big win yet)
2. Simulate big win — set `replaymod_hand_count` to 12, play until ALL_STAR+ hit — nudge should appear
3. Dismiss nudge — should not appear again (check `rm_nudge_big_win_shown` in localStorage)
4. Tap "Save" on nudge — registration modal should open
5. Tap "Maybe later" — modal closes, gameplay resumes
6. Open on second session (or set `rm_session_count` to 2) — PWA prompt should appear

- [ ] **Step 8: Commit**

```bash
git add basketball/src/views/GameView.tsx
git commit -m "feat(auth): wire registration nudges + PWA prompt into GameView"
```

---

### Task 10: "Already Have an Account?" on Landing Page

**Files:**
- Modify: `basketball/src/views/LandingPage.tsx` (or wherever the landing page lives)

- [ ] **Step 1: Check landing page location**

```bash
ls basketball/src/views/Landing* basketball/src/components/Landing* 2>/dev/null
```

- [ ] **Step 2: Add sign-in link**

Read the LandingPage component and add a small "Already have an account? Sign in" link at the bottom. When tapped, it opens the RegisterModal in sign-in mode.

Add imports:
```typescript
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";
import { useState } from "react";
```

Add inside the component:
```typescript
const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
const [showSignIn, setShowSignIn] = useState(false);
```

Add at the bottom of the landing page JSX (before closing wrapper):
```typescript
{isAnonymous && (
  <button
    onClick={() => setShowSignIn(true)}
    style={{
      background: "none", border: "none", color: "#64748b", fontSize: 12,
      cursor: "pointer", padding: "12px 0", width: "100%", textAlign: "center",
    }}
  >
    Already have an account? Sign in
  </button>
)}
{showSignIn && (
  <RegisterModal
    signInMode
    onClose={() => setShowSignIn(false)}
    onSuccess={() => setShowSignIn(false)}
    signUp={signUp}
    linkGoogle={linkGoogle}
    signIn={signIn}
    signInGoogle={signInGoogle}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add basketball/src/views/LandingPage.tsx
git commit -m "feat(auth): add 'Already have an account?' link to landing page"
```

---

### Task 11: Database Schema Scaffold

**Files:**
- Create: `supabase/migrations/001_player_tables.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/001_player_tables.sql
-- Scaffold tables for player auth, state, and hand audit trail.
-- Balance/streak populated by server-side hand resolution (future project).
-- hand_log written client-side for now, moves to server-only later.

-- Player profile (extends Supabase auth.users)
create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Player',
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

-- Game state (balance, streak — scaffold now, authoritative later)
create table if not exists public.player_state (
  id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 100000,
  streak integer not null default 0,
  hands_played integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Hand log (write-only audit trail)
create table if not exists public.hand_log (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  roster_ids text[] not null,
  total_fp numeric(6,1) not null,
  tier text not null,
  payout integer not null default 0,
  streak_at_play integer not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_hand_log_player on public.hand_log(player_id);
create index if not exists idx_hand_log_created on public.hand_log(created_at);

-- RLS: users can only read their own rows
alter table public.player_profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.hand_log enable row level security;

create policy "Users read own profile" on public.player_profiles
  for select using (auth.uid() = id);

create policy "Users insert own profile" on public.player_profiles
  for insert with check (auth.uid() = id);

create policy "Users update own profile" on public.player_profiles
  for update using (auth.uid() = id);

create policy "Users read own state" on public.player_state
  for select using (auth.uid() = id);

create policy "Users read own hands" on public.hand_log
  for select using (auth.uid() = player_id);

create policy "Users insert own hands" on public.hand_log
  for insert with check (auth.uid() = player_id);
```

- [ ] **Step 2: Run migration against Supabase**

Either run via the Supabase dashboard SQL editor (paste the SQL) or if the Supabase CLI is installed:

```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_player_tables.sql
git commit -m "feat(auth): scaffold player_profiles, player_state, hand_log tables with RLS"
```

---

### Task 12: Write Player Profile on Auth + Log Hands

**Files:**
- Modify: `shared/auth/AuthProvider.tsx`
- Modify: `basketball/src/views/GameView.tsx`

- [ ] **Step 1: Create player profile on first anonymous sign-in**

In `shared/auth/AuthProvider.tsx`, add profile creation after successful sign-in. Add inside the async IIFE, after the anonymous sign-in succeeds:

```typescript
import { getNickname } from "@shared/utils/playerIdentity";

// Inside the async IIFE, after: if (mounted && data.user) setUser(data.user);
// Add profile upsert (idempotent — safe to call multiple times):
if (data.user) {
  supabase.from("player_profiles").upsert({
    id: data.user.id,
    nickname: getNickname(),
    is_anonymous: data.user.is_anonymous ?? true,
  }, { onConflict: "id" }).then(({ error }) => {
    if (error) console.warn("[auth] Failed to upsert profile:", error.message);
  });
}
```

Also upsert when a session is restored (existing user returning):
```typescript
// After: if (mounted) setUser(session.user);
// Add:
supabase.from("player_profiles").upsert({
  id: session.user.id,
  nickname: getNickname(),
  is_anonymous: session.user.is_anonymous ?? true,
}, { onConflict: "id" }).then(({ error }) => {
  if (error) console.warn("[auth] Failed to upsert profile:", error.message);
});
```

- [ ] **Step 2: Log hands to hand_log table**

In `basketball/src/views/GameView.tsx`, add a function near the other utility functions (around line 130):

```typescript
async function logHandToDb(
  roster: PlayerCard[],
  totalFp: number,
  tier: string,
  payout: number,
  streak: number,
) {
  try {
    const uid = getPlayerUid();
    if (!uid || uid.startsWith("u_")) return; // Only log if we have a real Supabase UID
    const rosterIds = roster
      .map(c => String((c as any).basePlayerId ?? ""))
      .filter(Boolean);
    const { data: { session } } = await supabase.auth.getSession();
    const verified = !!session?.access_token;
    await supabase.from("hand_log").insert({
      player_id: uid,
      roster_ids: rosterIds,
      total_fp: totalFp,
      tier,
      payout,
      streak_at_play: streak,
      verified,
    });
  } catch { /* silent — audit trail is best-effort for now */ }
}
```

Call it in the hand resolution callback (around line 870, after `gameAnalytics.handResolved`):

```typescript
// After: gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
logHandToDb(rosterRef.current, totalFp, String(tier), payout, streak);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add shared/auth/AuthProvider.tsx basketball/src/views/GameView.tsx
git commit -m "feat(auth): write player profile on auth, log hands to hand_log table"
```

---

### Task 13: End-to-End Manual Test

**Files:** None (testing only)

- [ ] **Step 1: Verify Supabase dashboard setup**

Confirm in Supabase dashboard:
- Anonymous sign-ins enabled
- Email provider enabled
- Tables `player_profiles`, `player_state`, `hand_log` exist
- RLS policies active

- [ ] **Step 2: Fresh browser test (anonymous flow)**

1. Clear all localStorage for the app
2. Load the game
3. Verify: game loads instantly, no loading screen
4. Check DevTools → Application → Local Storage: `sb-*-auth-token` should appear within ~500ms
5. Check Supabase dashboard → Authentication → Users: new anonymous user should appear
6. Check Supabase → Table Editor → `player_profiles`: row with nickname should exist
7. Play a hand → check `hand_log` table: entry should appear

- [ ] **Step 3: Test nudge flow**

1. Set `replaymod_hand_count` to 11 in localStorage
2. Play one hand — retention nudge should appear (hand 12)
3. Tap "Save" → registration modal opens
4. Close modal → nudge should not reappear
5. Play until ALL_STAR+ → big_win nudge should NOT fire (auth nudge already fired this session)
6. Reload page → play until ALL_STAR+ → big_win nudge should fire (new session)

- [ ] **Step 4: Test registration flow**

1. Open registration modal
2. Enter email + password → submit
3. Check Supabase dashboard: user should upgrade from anonymous to registered
4. Check `player_profiles`: `is_anonymous` should flip to false
5. Auth nudges should stop appearing

- [ ] **Step 5: Test leaderboard verification**

1. Play a hand that lands on leaderboard
2. Check browser DevTools → Network → leaderboard POST: should include `Authorization: Bearer <token>` header
3. Check API response: should be 200 OK

- [ ] **Step 6: Test PWA prompt**

1. Set `rm_session_count` to 1 in localStorage
2. Reload page → play to IDLE → PWA prompt should appear
3. Dismiss → should not reappear

- [ ] **Step 7: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix(auth): post-integration test fixes"
```

- [ ] **Step 8: Push**

```bash
git push
```
