// shared/components/PwaInstallPrompt.tsx
//
// Two PWA install prompt components:
// 1. PWAInstallPrompt — original coin-reward version used by CollectScreen
// 2. PwaInstallPrompt — auth nudge version used by GameView
import { useState, useEffect, useRef } from "react";

// ── Original coin-reward PWA prompt (used by CollectScreen) ─────────────────
interface PWAInstallPromptProps {
  rewardCoins: number;
  onInstalled: () => void;
}

export function PWAInstallPrompt({ rewardCoins, onInstalled }: PWAInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(
    typeof localStorage !== "undefined" && localStorage.getItem("replaymod_pwa_dismissed") === "true"
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      onInstalled();
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("replaymod_pwa_dismissed", "true");
    setDismissed(true);
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div style={{
      background: "rgba(255,215,0,0.08)",
      border: "1px solid rgba(255,215,0,0.3)",
      borderRadius: 12,
      padding: "14px 16px",
      marginTop: 16,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <span style={{ fontSize: 24 }}>📲</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#EAF0FF", fontWeight: 700, fontSize: 14 }}>
          Add to Home Screen
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>
          Quick access, full screen.
        </div>
      </div>
      <button onClick={handleInstall} style={{
        background: "rgba(255,215,0,0.85)",
        color: "#070A12",
        border: "none",
        borderRadius: 8,
        padding: "8px 14px",
        fontWeight: 800,
        fontSize: 13,
        cursor: "pointer",
      }}>
        Install
      </button>
      <button onClick={handleDismiss} style={{
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,0.3)",
        fontSize: 18,
        cursor: "pointer",
        padding: 4,
      }}>×</button>
    </div>
  );
}

// ── Auth nudge PWA prompt (used by GameView) ────────────────────────────────

interface PwaInstallPromptProps {
  active: boolean;
  /** Optional attention-mutex hooks — if provided, the prompt claims the
   * lock before showing and releases on dismiss. Lets GameView serialize
   * this against chad commentary, register modal, name prompt, etc. */
  tryClaimAttention?: (surface: string) => boolean;
  releaseAttention?: (surface: string) => void;
}

function wasShown(): boolean { return localStorage.getItem("rm_nudge_pwa_shown") === "1"; }
function markShown(): void { localStorage.setItem("rm_nudge_pwa_shown", "1"); }
function isIos(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function PwaInstallPrompt({ active, tryClaimAttention, releaseAttention }: PwaInstallPromptProps) {
  const [visible, setVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); deferredPromptRef.current = e; };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (wasShown()) return;
    if (isStandalone()) return;
    // Defer the markShown + visible flip until the 1000ms delay fires AND
    // we can claim the attention lock. If we can't claim, leave both
    // unburned so the next IDLE re-evaluates (and the prompt still has its
    // one-shot life remaining).
    const t = setTimeout(() => {
      if (tryClaimAttention && !tryClaimAttention("pwa_install")) return;
      markShown();
      setVisible(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [active, tryClaimAttention]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (deferredPromptRef.current) { deferredPromptRef.current.prompt(); deferredPromptRef.current = null; }
    else if (isIos()) { setShowIosInstructions(true); return; }
    setVisible(false);
    releaseAttention?.("pwa_install");
  };

  const dismiss = () => { setVisible(false); releaseAttention?.("pwa_install"); };

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000, padding: "16px 16px 24px", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.9) 30%)" }}>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: "14px 16px", maxWidth: 420, margin: "0 auto" }}>
        {showIosInstructions ? (
          <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Add to Home Screen</div>
            <div>Tap the <strong>Share</strong> button, then <strong>"Add to Home Screen"</strong></div>
            <button onClick={dismiss} style={{ marginTop: 12, background: "none", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "8px 14px", fontSize: 13, cursor: "pointer", width: "100%" }}>Got it</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, color: "#e2e8f0", fontSize: 13, lineHeight: 1.4 }}>Add ReplayMod to your home screen for instant access.</div>
            <button onClick={handleInstall} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Install</button>
            <button onClick={dismiss} style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>×</button>
          </div>
        )}
      </div>
    </div>
  );
}
