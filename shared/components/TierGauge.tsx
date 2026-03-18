/**
 * TierGauge.tsx
 * Exact visual match to PostGameScreen NearMissBar.
 * Only renders when visible=true AND totalFp > 0.
 * Color fades LEFT (current tier) → RIGHT (next tier).
 */

import { useEffect, useState } from "react";

export type GaugeTier = "JACKPOT" | "MVP" | "ALL_STAR" | "STARTER" | "ROOKIE" | "BUST" | "NONE";

export interface TierThreshold {
  tier: GaugeTier;
  minFP: number;
}

interface TierGaugeProps {
  totalFp: number;
  thresholds: TierThreshold[];
  visible: boolean;
}

// Must match PostGameScreen TIER_CONFIG exactly
const TIER_CONFIG: Record<string, { label: string; color: string; glow: string }> = {
  JACKPOT:  { label: "JACKPOT",  color: "#EF4444", glow: "#EF444499" },
  MVP:      { label: "MVP",      color: "#FB923C", glow: "#FB923C55" },
  ALL_STAR: { label: "ALL-STAR", color: "#C084FC", glow: "#C084FC55" },
  STARTER:  { label: "STARTER",  color: "#F59E0B", glow: "#F59E0B55" },
  ROOKIE:   { label: "ROOKIE",   color: "#22C55E", glow: "#22C55E55" },
  BUST:     { label: "BUST",     color: "#6B7280", glow: "#6B728033" },
};

const FF = "'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif";

export function TierGauge({ totalFp, thresholds, visible }: TierGaugeProps) {
  const [barFill, setBarFill] = useState(0);

  const sorted = [...thresholds].sort((a, b) => a.minFP - b.minFP);

  // Find current tier (highest threshold crossed) and next tier
  let currentTier: GaugeTier = "BUST";
  let nextTier: GaugeTier | null = sorted[0]?.tier ?? null;
  let nextTierThreshold = sorted[0]?.minFP ?? 133;

  for (let i = 0; i < sorted.length; i++) {
    if (totalFp >= sorted[i].minFP) {
      currentTier = sorted[i].tier;
      nextTier = sorted[i + 1]?.tier ?? null;
      nextTierThreshold = sorted[i + 1]?.minFP ?? sorted[i].minFP;
    }
  }

  const tierCfg = TIER_CONFIG[currentTier] ?? TIER_CONFIG.BUST;
  // When BUST, target is ROOKIE (first threshold)
  const targetTier      = nextTier ?? (sorted[0]?.tier ?? "ROOKIE");
  const targetCfg       = TIER_CONFIG[targetTier] ?? TIER_CONFIG.ROOKIE;
  const targetThreshold = nextTier ? nextTierThreshold : (sorted[0]?.minFP ?? 133);
  const gap             = Math.max(0, targetThreshold - totalFp);

  const rawPct     = Math.min(1, totalFp / targetThreshold);
  const displayPct = Math.min(0.95, Math.max(0.02, rawPct));

  useEffect(() => {
    if (!visible || totalFp <= 0) { setBarFill(0); return; }
    const t = setTimeout(() => setBarFill(displayPct), 600);
    return () => clearTimeout(t);
  }, [displayPct, visible, totalFp]);

  if (!visible || totalFp <= 0) return null;

  return (
    <div style={{
      padding: "4px 0 2px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>

      {/* Gap callout — matches PostGameScreen */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}>
        <span style={{
          fontSize: 18,
          fontWeight: 800,
          color: targetCfg.color,
          fontFamily: FF,
          letterSpacing: "-0.5px",
        }}>
          {gap.toFixed(1)}
        </span>
        <span style={{
          fontSize: 12,
          color: "#555",
          fontFamily: FF,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          pts to {targetCfg.label}
        </span>
      </div>

      {/* Bar — same 8px height, same gradient, same glow as PostGameScreen */}
      <div style={{
        position: "relative",
        height: 8,
        background: "#ffffff0d",
        borderRadius: 999,
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          borderRadius: 999,
          width: `${barFill * 100}%`,
          background: `linear-gradient(90deg, ${tierCfg.color}88, ${targetCfg.color})`,
          boxShadow: `0 0 12px ${targetCfg.glow}`,
          transition: "width 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        }} />
      </div>

      {/* Labels — left=current, right=target */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: tierCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
          {tierCfg.label}
        </span>
        <span style={{ color: targetCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
          {targetCfg.label}
        </span>
      </div>
    </div>
  );
}