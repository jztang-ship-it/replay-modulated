// src/components/TierGauge.tsx
import React, { useEffect, useRef, useState } from "react";
import type { PayoutConfig, WinTier } from "../engine/payoutLogic";
import { DEFAULT_PAYOUT_CONFIG, getNextTier, getNearMissLevel } from "../engine/payoutLogic";

export function TierGauge({
  totalFp,
  config = DEFAULT_PAYOUT_CONFIG,
  isActive = false,
}: {
  totalFp: number;
  config?: PayoutConfig;
  isActive?: boolean;
}) {
  const maxFp = Math.max(...config.tiers.map(t => t.minFp)) + 20;
  const fillPct = Math.min(100, (totalFp / maxFp) * 100);
  const [animatedFill, setAnimatedFill] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const target = fillPct;
    let current = animatedFill;
    const step = () => {
      const diff = target - current;
      if (Math.abs(diff) < 0.2) { setAnimatedFill(target); return; }
      current += diff * 0.12;
      setAnimatedFill(current);
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fillPct]); // eslint-disable-line

  const nearMiss = getNearMissLevel(totalFp, config);
  const nextTier = getNextTier(totalFp, config);
  const currentTierDef = [...config.tiers]
    .sort((a, b) => b.minFp - a.minFp)
    .find(t => totalFp >= t.minFp);

  const isNearMiss = nearMiss !== "NONE" && isActive;
  const pulseColor = currentTierDef?.color ?? "#FFB14A";

  const sortedTiers = [...config.tiers].sort((a, b) => a.minFp - b.minFp);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      width: 28,
      height: "100%",
      padding: "8px 0",
    }}>

      {/* Near miss label */}
      {isNearMiss && nextTier && (
        <div style={{
          fontSize: 7,
          fontWeight: 900,
          color: "#FFD700",
          textAlign: "center",
          letterSpacing: 0.3,
          lineHeight: "10px",
          animation: "nmPulse 0.8s ease-in-out infinite",
          whiteSpace: "nowrap",
        }}>
          {nextTier.pointsNeeded.toFixed(0)} FP!
        </div>
      )}

      {/* Gauge track */}
      <div style={{
        flex: 1,
        width: 8,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 99,
        position: "relative",
        overflow: "visible",
      }}>

        {/* Tier markers */}
        {sortedTiers.slice(1).map(tier => {
          const markerPct = (tier.minFp / maxFp) * 100;
          const reached = totalFp >= tier.minFp;
          return (
            <div
              key={tier.tier}
              style={{
                position: "absolute",
                bottom: `${markerPct}%`,
                left: "50%",
                transform: "translate(-50%, 50%)",
                width: 16,
                height: 2,
                background: reached ? tier.color : "rgba(255,255,255,0.2)",
                borderRadius: 1,
                zIndex: 2,
                boxShadow: reached ? `0 0 6px ${tier.color}` : "none",
                transition: "background 300ms, box-shadow 300ms",
              }}
            />
          );
        })}

        {/* Fill bar */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${animatedFill}%`,
          background: `linear-gradient(0deg, ${pulseColor}, #FFD700)`,
          borderRadius: 99,
          boxShadow: `0 0 8px ${pulseColor}88`,
          transition: "background 400ms",
          animation: isNearMiss ? "nearMissGlow 0.6s ease-in-out infinite alternate" : "none",
        }} />

        {/* Glowing tip dot */}
        {animatedFill > 2 && (
          <div style={{
            position: "absolute",
            bottom: `calc(${animatedFill}% - 5px)`,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#FFD700",
            boxShadow: `0 0 8px 3px ${pulseColor}`,
            zIndex: 3,
          }} />
        )}
      </div>

      {/* Tier emoji at current level */}
      <div style={{ fontSize: 12, lineHeight: 1 }}>
        {currentTierDef?.emoji ?? "🎯"}
      </div>

      <style>{`
        @keyframes nearMissGlow {
          from { box-shadow: 0 0 8px ${pulseColor}88; }
          to   { box-shadow: 0 0 20px ${pulseColor}ff, 0 0 40px ${pulseColor}66; }
        }
        @keyframes nmPulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}