import React from "react";
/**
 * basketball/src/components/WinCelebration.tsx
 * Thin wrapper — injects basketball tier display config into shared WinCelebration.
 */

import { WinCelebration as SharedWinCelebration, type WinTierDisplayConfig, type WinTierKey } from "@shared/components/WinCelebration";

// BUST removed from basketball display — dormant in the shared WinTierKey union
// (economy layer needs it), but basketball's ROOKIE floor means calculateWinTier
// never returns BUST, so it's never passed here. Typed Exclude<…,"BUST"> and cast
// at the (currently unmounted) call site so the shared Record<WinTierKey> prop
// stays satisfied without re-introducing the BUST display entry.
const BASKETBALL_TIER_CONFIG: Record<Exclude<WinTierKey, "BUST">, WinTierDisplayConfig> = {
  MVP:      { label: "🏆 MVP PERFORMANCE! 🏆", color: "#FF4500", glow: "rgba(255,69,0,0.4)",         scale: 1.2, confetti: true,  duration: 4000 },
  ALL_STAR: { label: "⭐ ALL-STAR PERFORMANCE! ⭐", color: "#C084FC", glow: "rgba(192,132,252,0.35)", scale: 1.1, confetti: true,  duration: 3500 },
  STARTER:  { label: "🔥 STARTER WIN!",          color: "#FFD700", glow: "rgba(255,215,0,0.25)",     scale: 1.05, confetti: false, duration: 3000 },
  ROOKIE:   { label: "✅ ROOKIE WIN",             color: "#CD7F32", glow: "rgba(205,127,50,0.2)",     scale: 1.0, confetti: false, duration: 2000 },
};

type Props = {
  tier: WinTierKey;
  payout: number;
  multiplier: number;
  onComplete: () => void;
};

export function WinCelebration(props: Props) {
  return <SharedWinCelebration {...props} tierConfig={BASKETBALL_TIER_CONFIG as Record<WinTierKey, WinTierDisplayConfig>} />;
}