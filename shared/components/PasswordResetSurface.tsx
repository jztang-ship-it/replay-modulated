// shared/components/PasswordResetSurface.tsx
//
// Phase 5b piece 1 — U4-g (2026-05-28, doc lock 8004211): password recovery
// surface. Mounted at App.tsx level. Self-managed four-state machine:
//
//   "idle"              — render null. Default.
//   "email-entry"       — triggered by RegisterModal's "Forgot password?"
//                         link (via AuthContext.requestPasswordReset).
//                         Email field + Send button.
//   "confirmation"      — after resetPasswordForEmail succeeds. "Check your
//                         email." message + dismiss.
//   "recovery-landing"  — triggered by Supabase's PASSWORD_RECOVERY auth
//                         event. New-password field + Update button. Fires
//                         supabase.auth.updateUser({ password }) on submit.
//
// Recovery email only sends if the Supabase project dashboard has the
// "Reset Password" email template enabled + the redirect URL allowlisted.
// Implementation ships regardless; recovery flow only works end-to-end
// once dashboard is configured. See U4-g implementation surfaces section
// of the lock for the user-task dependencies.
//
// Visual chrome matches RegisterModal (same modal frame, same dismiss
// affordance, same font/spacing) per U4-c continuity rule.

import { useCallback, useContext, useEffect, useState } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { AuthContext } from "@shared/auth/AuthProvider";
import { supabase } from "@shared/lib/supabase";
import { track } from "@shared/analytics/analytics";

type SurfaceState = "idle" | "email-entry" | "confirmation" | "recovery-landing";

function friendlyResetError(err: AuthError | { message?: string }): string {
  const msg = String((err as any)?.message ?? "").toLowerCase();
  if (msg.includes("rate") || msg.includes("too many")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Connection issue — check your internet and try again.";
  }
  return (err as any)?.message ?? "Reset request failed";
}

export function PasswordResetSurface() {
  const { passwordResetRequestTick, resetPasswordForEmail } = useContext(AuthContext);
  const [state, setState] = useState<SurfaceState>("idle");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Transition to email-entry on every tick increment from
  // requestPasswordReset(). Initial value is 0; we only respond to >0
  // changes so a stale mount doesn't auto-open.
  useEffect(() => {
    if (passwordResetRequestTick > 0) {
      setState("email-entry");
      setEmail("");
      setError(null);
    }
  }, [passwordResetRequestTick]);

  // Independent onAuthStateChange listener for PASSWORD_RECOVERY. Supabase
  // emits this event when the user clicks the reset email link and the app
  // mounts via the recovery URL. Self-contained — AuthProvider doesn't
  // need to know about recovery state.
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const sub = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setState("recovery-landing");
          setNewPassword("");
          setError(null);
        }
      });
      subscription = sub?.data?.subscription ?? null;
    } catch (e) {
      console.warn("[password-reset] onAuthStateChange subscribe failed:", e);
    }
    return () => { try { subscription?.unsubscribe(); } catch { /* ignore */ } };
  }, []);

  const handleClose = useCallback(() => {
    setState("idle");
    setEmail("");
    setNewPassword("");
    setError(null);
    setLoading(false);
  }, []);

  const handleSendEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError("Enter your email"); return; }
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await resetPasswordForEmail(trimmed);
      if (err) {
        setError(friendlyResetError(err));
        return;
      }
      setState("confirmation");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    const pw = newPassword;
    if (!pw || pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) {
        setError(friendlyResetError(err));
        return;
      }
      track("auth", "password_reset_completed", {});
      setState("confirmation"); // reuse confirmation for "All set" message
    } finally {
      setLoading(false);
    }
  };

  if (state === "idle") return null;

  // Confirmation copy branches on which path led here.
  const isAfterUpdate = state === "confirmation" && !email; // recovery-landing → confirmation has no email
  const confirmationHeading = isAfterUpdate ? "Password updated" : "Check your email";
  const confirmationSub = isAfterUpdate
    ? "You're signed in with your new password."
    : "We sent a reset link. Tap it to set a new password.";

  return (
    <div
      data-password-reset-surface={state}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: "#1a1a2e", borderRadius: "16px 16px 0 0",
        padding: "24px 20px 32px", width: "100%", maxWidth: 420, color: "#fff",
      }}>
        {state === "email-entry" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Reset your password</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
              Enter your email and we'll send a reset link.
            </div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSendEmail(); }}
              autoFocus
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: "1px solid #334155", background: "#0f172a",
                color: "#fff", fontSize: 14, marginBottom: 12, boxSizing: "border-box",
              }}
            />
            {error && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <button
              onClick={handleSendEmail}
              disabled={loading}
              style={{
                width: "100%", padding: "13px", borderRadius: 8, border: "none",
                background: loading ? "rgba(255,177,74,0.3)" : "#FFB14A",
                color: loading ? "rgba(7,10,18,0.5)" : "#070A12",
                fontSize: 15, fontWeight: 900,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={handleClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {state === "confirmation" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#22C55E" }}>
              {confirmationHeading}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
              {confirmationSub}
            </div>
            <button
              onClick={handleClose}
              style={{
                width: "100%", padding: "13px", borderRadius: 8, border: "none",
                background: "#FFB14A", color: "#070A12",
                fontSize: 15, fontWeight: 900, cursor: "pointer",
              }}
            >
              Done
            </button>
          </>
        )}

        {state === "recovery-landing" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Set a new password</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
              Choose a new password (at least 6 characters).
            </div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleUpdatePassword(); }}
                autoFocus
                style={{
                  width: "100%", padding: "10px 40px 10px 12px", borderRadius: 8,
                  border: "1px solid #334155", background: "#0f172a",
                  color: "#fff", fontSize: 14, boxSizing: "border-box",
                }}
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
            <button
              onClick={handleUpdatePassword}
              disabled={loading || newPassword.length < 6}
              style={{
                width: "100%", padding: "13px", borderRadius: 8, border: "none",
                background: (loading || newPassword.length < 6) ? "rgba(255,177,74,0.3)" : "#FFB14A",
                color: (loading || newPassword.length < 6) ? "rgba(7,10,18,0.5)" : "#070A12",
                fontSize: 15, fontWeight: 900,
                cursor: (loading || newPassword.length < 6) ? "default" : "pointer",
              }}
            >
              {loading ? "Updating..." : "Update password"}
            </button>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={handleClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0 }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
