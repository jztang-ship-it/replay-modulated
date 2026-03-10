import React from "react";
/**
 * worldcup/src/components/WinCelebration.tsx
 * Thin wrapper — injects worldcup tier display config into shared WinCelebration.
 */

import { WinCelebration as SharedWinCelebration, type WinTierDisplayConfig, type WinTierKey } from "@shared/components/WinCelebration";

const WORLDCUP_TIER_CONFIG: Record<WinTierKey, WinTierDisplayConfig> = {
  MVP:      { label: "👑 MVP",      color: "#F59E0B", glow: "rgba(245,158,11,0.4)",  scale: 1.2, confetti: true,  duration: 3500 },
  ALL_STAR: { label: "🏆 ALL-STAR", color: "#8B5CF6", glow: "rgba(139,92,246,0.35)", scale: 1.1, confetti: true,  duration: 2800 },
  STARTER:  { label: "🌟 STARTER",  color: "#3B82F6", glow: "rgba(59,130,246,0.25)", scale: 1.05, confetti: false, duration: 2200 },
  ROOKIE:   { label: "⚽ ROOKIE",   color: "#10B981", glow: "rgba(16,185,129,0.2)",  scale: 1.0, confetti: false, duration: 1800 },
  BUST:     { label: "💨 BUST",     color: "#6B7280", glow: "rgba(107,114,128,0.15)",scale: 1.0, confetti: false, duration: 1200 },
};

type Props = {
  tier: WinTierKey;
  payout: number;
  multiplier: number;
  onComplete: () => void;
};

export function WinCelebration(props: Props) {
  return <SharedWinCelebration {...props} tierConfig={WORLDCUP_TIER_CONFIG} />;
}