import { useEffect, useState } from "react";
import type { WinTier } from "../utils/payoutLogic";

const TIER_CONFIG = {
  ROOKIE:   { label: "ROOKIE",   color: "#10B981", emoji: "⚽", delay: 1800 },
  STARTER:  { label: "STARTER",  color: "#3B82F6", emoji: "🌟", delay: 2200 },
  ALL_STAR: { label: "ALL-STAR", color: "#8B5CF6", emoji: "🏆", delay: 2800 },
  MVP:      { label: "MVP",      color: "#F59E0B", emoji: "👑", delay: 3500 },
  BUST:     { label: "BUST",     color: "#6B7280", emoji: "💨", delay: 1200 },
};

interface Props {
  tier: WinTier;
  payout: number;
  multiplier: number;
  onComplete: () => void;
}

export function WinCelebration({ tier, payout, multiplier, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const cfg = TIER_CONFIG[tier];

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onComplete, 400); }, cfg.delay);
    return () => clearTimeout(t);
  }, []);

  if (tier === "BUST") return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      opacity: visible ? 1 : 0, transition: "opacity 0.4s ease",
      pointerEvents: visible ? "auto" : "none",
    }} onClick={onComplete}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        transform: visible ? "scale(1)" : "scale(0.8)",
        transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ fontSize: 64 }}>{cfg.emoji}</div>
        <div style={{
          fontSize: 48, fontWeight: 950, letterSpacing: -1,
          color: cfg.color, textShadow: `0 0 40px ${cfg.color}`,
        }}>
          {cfg.label}
        </div>
        {payout > 0 && (
          <div style={{ fontSize: 28, fontWeight: 800, color: "#EAF0FF" }}>
            +${payout.toLocaleString()}
          </div>
        )}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
          tap to continue
        </div>
      </div>
    </div>
  );
}
