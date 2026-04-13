// shared/components/RegisterNudge.tsx
import { useState, useEffect } from "react";

interface RegisterNudgeProps {
  nudgeId: string;
  message: string;
  active: boolean;
  onRegister: () => void;
  onDismiss?: () => void;
}

function wasShown(nudgeId: string): boolean {
  return localStorage.getItem(`rm_${nudgeId}_shown`) === "1";
}
function markShown(nudgeId: string): void {
  localStorage.setItem(`rm_${nudgeId}_shown`, "1");
}
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
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [active, nudgeId]);

  if (!visible) return null;

  const dismiss = () => { setVisible(false); onDismiss?.(); };

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000, padding: "16px 16px 24px", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9) 30%)" }}>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, maxWidth: 420, margin: "0 auto" }}>
        <div style={{ flex: 1, color: "#e2e8f0", fontSize: 13, lineHeight: 1.4 }}>{message}</div>
        <button onClick={() => { dismiss(); onRegister(); }} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Save</button>
        <button onClick={dismiss} style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>×</button>
      </div>
    </div>
  );
}
