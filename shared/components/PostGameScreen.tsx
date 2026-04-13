/**
 * PostGameScreen.tsx — Beta v1
 * Gutted to: Tier Badge | Win Streak | Coins Won | Near-Miss Bar | Play Again
 */

import React, { useState, useEffect } from "react";
import { ShareResultCard } from "./ShareResultCard";

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type WinTier = "LEGEND" | "MVP" | "ALL_STAR" | "STARTER" | "ROOKIE" | "BUST" | "NONE";

export interface ShareableCard {
  name: string;
  photoCode: string;
  actualFp: number;
  stamp?: string;
}

export interface PostGameResult {
  tier: WinTier;
  totalFP: number;
  payout: number;
  balance: number;
  streak: number;
  nextTier: WinTier | null;
  nextTierThreshold: number;
  rosterCards?: ShareableCard[];
  bestStamp?: string;
}

export interface PostGameScreenProps {
  result: PostGameResult;
  onPlayAgain: () => void;
}

// ─── CONFIG ────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<WinTier, { label: string; color: string; glow: string }> = {
  LEGEND:     { label: "LEGEND",   color: "#EF4444", glow: "#EF444499" },
  MVP:      { label: "MVP",      color: "#FB923C", glow: "#FB923C55" },
  ALL_STAR: { label: "ALL-STAR", color: "#C084FC", glow: "#C084FC55" },
  STARTER:  { label: "STARTER",  color: "#F59E0B", glow: "#F59E0B55" },
  ROOKIE:   { label: "ROOKIE",   color: "#22C55E", glow: "#22C55E55" },
  BUST:     { label: "BUST",     color: "#E5E7EB", glow: "#E5E7EB33" },
  NONE:     { label: "--",       color: "#444444", glow: "#44444433" },
};

const NEAR_MISS_COPY: Partial<Record<WinTier, string[]>> = {
  MVP:      ["That was MVP-level. Legendary run.", "One strong card from MVP."],
  ALL_STAR: ["So close to MVP. Run it back.", "Right on the edge of MVP tier."],
  STARTER:  ["Almost ALL-STAR. You were right there.", "A couple more FP and you had it."],
  ROOKIE:   ["Nearly STARTER tier. Keep going.", "So close — one more hand."],
  BUST:     ["ROOKIE is right there.", "Next hand could flip everything."],
};

const FF = "'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif";

// ─── HOOKS ─────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1000, delay = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    const timeout = setTimeout(() => {
      const step = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return value;
}

// ─── NEAR MISS BAR ─────────────────────────────────────────────────────────

function NearMissBar({
  totalFP,
  tier,
  nextTier,
  nextTierThreshold,
}: {
  totalFP: number;
  tier: WinTier;
  nextTier: WinTier | null;
  nextTierThreshold: number;
}) {
  const [barFill, setBarFill] = useState(0);

  const tierCfg = TIER_CONFIG[tier];

  if (!nextTier) {
    return (
      <div style={{
        background: "#0E1420",
        border: `1px solid ${tierCfg.color}33`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: tierCfg.color, fontFamily: FF }}>
          🏆 Top tier. Legendary.
        </span>
        <span style={{ fontSize: 12, color: "#666", fontFamily: FF }}>
          {totalFP} FP — you maxed it out.
        </span>
      </div>
    );
  }

  const gap = nextTierThreshold - totalFP;
  const rawPct = totalFP / nextTierThreshold;
  const displayPct = Math.min(0.95, Math.max(0.65, rawPct));
  const nextCfg = TIER_CONFIG[nextTier];
  const copies = NEAR_MISS_COPY[nextTier] ?? ["Run it back."];
  const copy = copies[Math.floor(Math.random() * copies.length)];

  useEffect(() => {
    const t = setTimeout(() => setBarFill(displayPct), 600);
    return () => clearTimeout(t);
  }, [displayPct]);

  return (
    <div style={{
      background: "#0E1420",
      border: "1px solid #ffffff0d",
      borderRadius: 14,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Copy */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#CCCCCC",
        letterSpacing: "0.04em",
        fontFamily: FF,
        textAlign: "center",
      }}>
        {copy}
      </div>

      {/* Gap callout */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}>
        <span style={{
          fontSize: 26,
          fontWeight: 800,
          color: nextCfg.color,
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
          pts to {nextCfg.label}
        </span>
      </div>

      {/* Bar */}
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
          background: `linear-gradient(90deg, ${tierCfg.color}88, ${nextCfg.color})`,
          boxShadow: `0 0 12px ${nextCfg.glow}`,
          transition: "width 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        }} />
      </div>

      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: tierCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
          {tierCfg.label}
        </span>
        <span style={{ color: nextCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
          {nextCfg.label}
        </span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function PostGameScreen({ result, onPlayAgain }: PostGameScreenProps) {
  const [phase, setPhase] = useState(0);
  const tierConfig = TIER_CONFIG[result.tier];
  const animPay = useCountUp(result.payout, 900, 200);
  const animStreak = useCountUp(result.streak, 600, 100);

  useEffect(() => {
    const delays = [100, 400, 900, 1200, 1800];
    const timers = delays.map((d, i) => setTimeout(() => setPhase(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, []);

  const isBust = result.tier === "BUST" || result.tier === "NONE";

  return (
    <div style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%",
      minHeight: "100%",
      padding: "36px 20px 40px",
      gap: 16,
      boxSizing: "border-box",
      fontFamily: FF,
      color: "#F0F0F0",
      overflowY: "auto",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at 50% 0%, ${tierConfig.glow} 0%, transparent 55%)`,
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* ── ZONE 1: Tier Badge ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? "translateY(0)" : "translateY(-16px)",
        transition: "all 0.5s ease",
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          border: "1px solid",
          borderRadius: 4,
          padding: "5px 22px",
          background: "rgba(0,0,0,0.45)",
          color: tierConfig.color,
          borderColor: `${tierConfig.color}44`,
          boxShadow: `0 0 24px ${tierConfig.glow}, inset 0 0 12px ${tierConfig.glow}`,
        }}>
          {tierConfig.label}
        </div>
        <div style={{
          fontSize: 12,
          color: "#444",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontFamily: FF,
        }}>
          {isBust ? "Better luck next hand" : "Nice hand"}
        </div>
      </div>

      {/* ── ZONE 2: Streak + Coins ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "row",
        gap: 12,
        width: "100%",
        maxWidth: 360,
        opacity: phase >= 2 ? 1 : 0,
        transform: phase >= 2 ? "translateY(0)" : "translateY(10px)",
        transition: "all 0.45s ease",
      }}>
        {/* Win Streak */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          background: "#110D00",
          border: "1px solid #FF8C0025",
          borderRadius: 14,
          padding: "16px 10px",
        }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <span style={{
            fontSize: 32,
            fontWeight: 800,
            color: "#FF8C00",
            letterSpacing: "-1px",
            fontFamily: FF,
            lineHeight: 1,
          }}>
            {animStreak}
          </span>
          <span style={{
            fontSize: 9,
            color: "#555",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily: FF,
          }}>
            {result.streak === 1 ? "Win" : "Win Streak"}
          </span>
        </div>

        {/* Coins Won */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          background: "#090F00",
          border: "1px solid #7FFF0020",
          borderRadius: 14,
          padding: "16px 10px",
        }}>
          <span style={{ fontSize: 22 }}>🪙</span>
          <span style={{
            fontSize: 32,
            fontWeight: 800,
            color: "#7FFF00",
            letterSpacing: "-1px",
            fontFamily: FF,
            lineHeight: 1,
          }}>
            +{animPay}
          </span>
          <span style={{
            fontSize: 9,
            color: "#555",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily: FF,
          }}>
            Coins Won
          </span>
        </div>
      </div>

      {/* ── ZONE 3: Near-Miss Bar ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 360,
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? "translateY(0)" : "translateY(10px)",
        transition: "all 0.5s ease",
      }}>
        <NearMissBar
          totalFP={result.totalFP}
          tier={result.tier}
          nextTier={result.nextTier}
          nextTierThreshold={result.nextTierThreshold}
        />
      </div>

      {/* ── ZONE 3.5: Share Result ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 360,
        marginTop: 4,
        opacity: phase >= 4 ? 1 : 0,
        transform: phase >= 4 ? "translateY(0)" : "translateY(10px)",
        transition: "all 0.5s ease",
      }}>
        <ShareResultCard result={result} />
      </div>

      {/* ── ZONE 4: Play Again ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 360,
        marginTop: 8,
        opacity: phase >= 5 ? 1 : 0,
        transform: phase >= 5 ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <button
          onClick={onPlayAgain}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #4aff00, #7FFF00)",
            border: "none",
            borderRadius: 14,
            padding: "18px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            cursor: "pointer",
            boxShadow: "0 0 32px #7FFF0033, 0 8px 24px rgba(0,0,0,0.4)",
            fontFamily: FF,
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <span style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#090B10",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Run It Back
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#090B10" }}>→</span>
        </button>
      </div>
    </div>
  );
}

// ─── OVERLAY WRAPPER ───────────────────────────────────────────────────────

export function PostGameOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        background: "rgba(9, 11, 16, 0.85)",
      }} />
      <div style={{
        position: "relative",
        zIndex: 1,
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}>
        {children}
      </div>
    </div>
  );
}