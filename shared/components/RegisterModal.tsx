// shared/components/RegisterModal.tsx
import { useState } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { addWelcomeMessage } from "@shared/inbox/inbox";
import { supabase } from "@shared/lib/supabase";

interface RegisterModalProps {
  onClose: () => void;
  onSuccess: () => void;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  linkGoogle: () => Promise<{ error: AuthError | null }>;
  signInMode?: boolean;
  signIn?: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInGoogle?: () => Promise<{ error: AuthError | null }>;
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

export function RegisterModal({ onClose, onSuccess, signUp, linkGoogle, signInMode, signIn, signInGoogle }: RegisterModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSignIn, setIsSignIn] = useState(signInMode ?? false);

  const handleSubmit = async () => {
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
    setShowSuccess(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1500);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    console.log("[auth] google path — isSignIn:", isSignIn);
    const result = isSignIn
      ? await signInGoogle?.() ?? { error: { message: "Google sign in not available" } as any }
      : await linkGoogle();
    setLoading(false);
    console.log("[auth] google result:", result);
    if (result.error) {
      console.error("[auth] google path failed:", result.error);
      setError(`Google: ${result.error.message}`);
    } else {
      // Fire-and-forget: insert welcome message for the new/upgraded user
      if (!isSignIn) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await addWelcomeMessage(user.id);
      }
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

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#1a1a2e", borderRadius: "16px 16px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 420, color: "#fff" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {isSignIn ? "Welcome back" : "Save your progress"}
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
          {isSignIn ? "Sign in to restore your account" : "Play on any device. Never lose your wins."}
        </div>
        <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "wait" : "pointer", marginBottom: 16 }}>
          {isSignIn ? "Sign in with Google" : "Sign up with Google"}
        </button>
        <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginBottom: 16 }}>or</div>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
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
        {error && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#3b82f6", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "..." : isSignIn ? "Sign in" : "Save my account"}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button onClick={() => setIsSignIn(!isSignIn)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
            {isSignIn ? "Create new account" : "Already have an account?"}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
