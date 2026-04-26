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

export function RegisterModal({ onClose, onSuccess, signUp, linkGoogle, signInMode, signIn, signInGoogle }: RegisterModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const status = (result.error as any).status ? ` (status ${(result.error as any).status})` : "";
      setError(`${result.error.message}${status}`);
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
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, marginBottom: 12, boxSizing: "border-box" }} />
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
