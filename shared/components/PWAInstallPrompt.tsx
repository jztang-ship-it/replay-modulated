/**
 * shared/components/PWAInstallPrompt.tsx — Custom PWA install prompt with coin reward.
 * Intercepts beforeinstallprompt. Renders nothing on iOS Safari (event never fires).
 */

import { useEffect, useState } from "react";

interface Props {
  rewardCoins: number;
  onInstalled: () => void;
}

export function PWAInstallPrompt({ rewardCoins, onInstalled }: Props) {
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
          Get +{rewardCoins} bonus coins
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
