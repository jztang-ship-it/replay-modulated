/**
 * PostGameScreen.tsx
 * Replaces the temporary WIN_CELEBRATION modal.
 * Rendered as a fixed overlay on top of the blurred game grid.
 *
 * Usage in GameView.tsx:
 *   import PostGameScreen from '@shared/components/PostGameScreen';
 *   import { buildPostGameResult } from '../utils/buildPostGameResult';
 *
 *   {gameState === "WIN_CELEBRATION" && (
 *     <PostGameOverlay>
 *       <PostGameScreen
 *         result={buildPostGameResult(roster, winTier, winPayout, balance, streak, taskProgress)}
 *         onPlayAgain={onWinCelebrationComplete}
 *       />
 *     </PostGameOverlay>
 *   )}
 */

import React, { useState, useEffect } from "react";

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type WinTier = "MVP" | "ALL_STAR" | "STARTER" | "ROOKIE" | "BUST";

export type CardTier = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "GREY";

export type PerformanceStamp =
  | "LEGENDARY"
  | "ON_FIRE"
  | "COLD"
  | "BUST"
  | null;

export interface PostGameCard {
  name: string;        // e.g. "S. Curry"
  pos: string;         // e.g. "PG"
  fp: number;          // actual FP this game
  tier: CardTier;      // card background tier
  stamp: PerformanceStamp;
  isAnchor: boolean;   // true for the spotlight/anchor card
}

export interface PostGameTask {
  label: string;       // e.g. "Win 3 games"
  current: number;     // e.g. 1
  total: number;       // e.g. 3
}

export interface PostGameResult {
  tier: WinTier;
  totalFP: number;
  payout: number;       // coins earned this game
  balance: number;      // balance AFTER payout applied
  streak: number;       // current win streak (seed at 1 on game 1)
  cards: PostGameCard[]; // exactly 6
  nextTier: WinTier | null; // null if LEGENDARY (already top)
  nextTierThreshold: number; // FP needed for nextTier
  task: PostGameTask | null; // null if no active task yet
}

export interface PostGameScreenProps {
  result: PostGameResult;
  onPlayAgain: () => void;
  onShare?: () => void;
  onViewStats?: () => void;
}

// ─── CONFIG ────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<WinTier, { label: string; color: string; glow: string }> = {
    MVP:      { label: "MVP",       color: "#FF8C00", glow: "#FF8C0055" },
    ALL_STAR: { label: "ALL-STAR",  color: "#C9A84C", glow: "#C9A84C55" },
    STARTER:  { label: "STARTER",   color: "#9B4DFF", glow: "#9B4DFF44" },
    ROOKIE:   { label: "ROOKIE",    color: "#00E5FF", glow: "#00E5FF33" },
    BUST:     { label: "BUST",      color: "#666666", glow: "#66666633" },
  };

const CARD_COLOR: Record<CardTier, string> = {
  ORANGE: "#FF8C00",
  PURPLE: "#9B4DFF",
  BLUE:   "#00E5FF",
  GREEN:  "#7FFF00",
  GREY:   "#666666",
};

const STAMP_CONFIG: Record<
  NonNullable<PerformanceStamp>,
  { label: string; color: string }
> = {
  LEGENDARY: { label: "LEGENDARY",  color: "#FF8C00" },
  ON_FIRE:   { label: "ON FIRE 🔥", color: "#FF4500" },
  COLD:      { label: "COLD ❄️",   color: "#00BFFF" },
  BUST:      { label: "BUST 💀",   color: "#FF3B30" },
};

const FF = "'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif";

// ─── HOOKS ─────────────────────────────────────────────────────────────────

function useCountUp(
  target: number,
  duration = 1200,
  delay = 0,
  decimals = 1
): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    const timeout = setTimeout(() => {
      const step = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(parseFloat((eased * target).toFixed(decimals)));
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, decimals]);
  return value;
}

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────

function MiniCard({
  card,
  animDelay,
}: {
  card: PostGameCard;
  animDelay: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), animDelay);
    return () => clearTimeout(t);
  }, [animDelay]);

  const tierColor = CARD_COLOR[card.tier];
  const stamp = card.stamp ? STAMP_CONFIG[card.stamp] : null;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        width: 50,
        minHeight: 76,
        background: "#131926",
        border: `1.5px solid ${card.isAnchor ? tierColor : `${tierColor}55`}`,
        borderRadius: 8,
        padding: "6px 3px",
        overflow: "hidden",
        boxShadow: card.isAnchor
          ? `0 0 20px ${tierColor}88, 0 0 40px ${tierColor}33`
          : `0 0 6px ${tierColor}22`,
        transform: visible
          ? card.isAnchor
            ? "scale(1.13) translateY(-5px)"
            : "scale(1) translateY(0)"
          : "scale(0.8) translateY(8px)",
        opacity: visible ? 1 : 0,
        transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          opacity: 0.65,
          color: tierColor,
          fontFamily: FF,
        }}
      >
        {card.pos}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#DDD",
          textAlign: "center",
          lineHeight: 1.1,
          fontFamily: FF,
        }}
      >
        {card.name.split(" ").slice(-1)[0]}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: "-0.5px",
          color: tierColor,
          fontFamily: FF,
        }}
      >
        {card.fp}
      </div>
      {stamp && (
        <div
          style={{
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: "0.04em",
            border: "1px solid",
            borderRadius: 3,
            padding: "1px 3px",
            textAlign: "center",
            marginTop: 2,
            whiteSpace: "nowrap",
            background: `${stamp.color}22`,
            color: stamp.color,
            borderColor: `${stamp.color}55`,
            fontFamily: FF,
          }}
        >
          {stamp.label}
        </div>
      )}
      {/* anchor glow overlay */}
      {card.isAnchor && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 8,
            background: `radial-gradient(circle, ${tierColor}22 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function NearMissBar({
  totalFP,
  nextTier,
  nextTierThreshold,
  tierConfig,
}: {
  totalFP: number;
  nextTier: WinTier;
  nextTierThreshold: number;
  tierConfig: (typeof TIER_CONFIG)[WinTier];
}) {
  const [barFill, setBarFill] = useState(0);
  const gap = nextTierThreshold - totalFP;
  const rawPct = totalFP / nextTierThreshold;
  // Clamp to 70–95% — never show 100% (already at that tier) or <70% (discouraging)
  const displayPct = Math.min(0.95, Math.max(0.70, rawPct));
  const nextConfig = TIER_CONFIG[nextTier];

  useEffect(() => {
    const t = setTimeout(() => setBarFill(displayPct), 900);
    return () => clearTimeout(t);
  }, [displayPct]);

  return (
    <div
      style={{
        background: "#0E1420",
        border: "1px solid #ffffff10",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: "#555",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: FF,
          }}
        >
          Next tier:
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            flex: 1,
            color: nextConfig.color,
            fontFamily: FF,
          }}
        >
          {nextConfig.label}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "#666",
            fontVariantNumeric: "tabular-nums",
            fontFamily: FF,
          }}
        >
          {gap.toFixed(1)} pts away
        </span>
      </div>

      {/* Bar */}
      <div
        style={{
          position: "relative",
          height: 10,
          background: "#ffffff0d",
          borderRadius: 999,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            borderRadius: 999,
            width: `${barFill * 100}%`,
            background: `linear-gradient(90deg, ${tierConfig.color}88, ${tierConfig.color})`,
            boxShadow: `0 0 14px ${tierConfig.glow}`,
            transition: "width 1.3s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {/* Gap marker */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${barFill * 100}%`,
            transform: "translateY(-50%)",
            width: 2,
            height: 18,
            background: "#090B10",
            borderRadius: 1,
          }}
        />
      </div>

      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{ color: tierConfig.color, fontSize: 10, fontFamily: FF }}
        >
          {TIER_CONFIG["BUST"].label /* current tier label passed via parent */}
        </span>
        <span
          style={{ color: nextConfig.color, fontSize: 10, fontFamily: FF }}
        >
          {nextConfig.label}
        </span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function PostGameScreen({
  result,
  onPlayAgain,
  onShare,
  onViewStats,
}: PostGameScreenProps) {
  // Staggered reveal phases: 0 → mount, 1 → header, 2 → cards, 3 → near miss, 4 → streak/task, 5 → CTA
  const [phase, setPhase] = useState(0);

  const tierConfig = TIER_CONFIG[result.tier];
  const animFP  = useCountUp(result.totalFP, 1000, 300, 1);
  const animPay = useCountUp(result.payout,  1200, 400, 0);
  const animBal = useCountUp(result.balance, 1000, 500, 0);

  useEffect(() => {
    const delays = [100, 450, 950, 1650, 2250];
    const timers = delays.map((d, i) =>
      setTimeout(() => setPhase(i + 1), d)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const isTopTier = result.tier === "MVP";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        minHeight: "100%",
        padding: "28px 18px 36px",
        gap: 18,
        boxSizing: "border-box",
        fontFamily: FF,
        color: "#F0F0F0",
        overflowY: "auto",
      }}
    >
      {/* ── Ambient background glow ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 0%, ${tierConfig.glow} 0%, transparent 60%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── ZONE 1: Win Header ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          width: "100%",
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "translateY(0)" : "translateY(-18px)",
          transition: "all 0.5s ease",
        }}
      >
        {/* Tier badge */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            border: "1px solid",
            borderRadius: 4,
            padding: "5px 18px",
            background: "rgba(0,0,0,0.45)",
            color: tierConfig.color,
            borderColor: `${tierConfig.color}44`,
            boxShadow: `0 0 28px ${tierConfig.glow}, inset 0 0 16px ${tierConfig.glow}`,
          }}
        >
          {tierConfig.label}
        </div>

        {/* FP score */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontSize: 60,
              fontWeight: 800,
              letterSpacing: "-2px",
              lineHeight: 1,
              color: "#FFFFFF",
            }}
          >
            {animFP}
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#777",
              letterSpacing: "0.1em",
            }}
          >
            FP
          </span>
        </div>

        {/* Payout + balance */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#7FFF00",
              letterSpacing: "0.05em",
            }}
          >
            +{animPay} coins
          </span>
          <span style={{ fontSize: 12, color: "#555", letterSpacing: "0.05em" }}>
            Balance: {animBal}
          </span>
        </div>
      </div>

      {/* ── ZONE 2: Squad Cards (6 cards) ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        {result.cards.map((card, i) => (
          <MiniCard key={i} card={card} animDelay={i * 90} />
        ))}
      </div>

      {/* ── ZONE 3: Near-Miss Bar ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 380,
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? "translateY(0)" : "translateY(10px)",
          transition: "all 0.5s ease 0.1s",
        }}
      >
        {isTopTier ? (
          <div
            style={{
              background: "#0E1420",
              border: `1px solid ${tierConfig.color}33`,
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: tierConfig.color,
                fontFamily: FF,
              }}
            >
              🏆 All-time best — {result.totalFP} FP
            </span>
            <span style={{ fontSize: 12, color: "#888", fontFamily: FF }}>
              You hit the top tier. Legendary.
            </span>
          </div>
        ) : result.nextTier ? (
          <NearMissBar
            totalFP={result.totalFP}
            nextTier={result.nextTier}
            nextTierThreshold={result.nextTierThreshold}
            tierConfig={tierConfig}
          />
        ) : null}
      </div>

      {/* ── ZONE 4: Streak + Task ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "row",
          gap: 10,
          width: "100%",
          maxWidth: 380,
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(10px)",
          transition: "all 0.4s ease",
        }}
      >
        {/* Streak pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#150F00",
            border: "1px solid #FF8C0033",
            borderRadius: 10,
            padding: "10px 14px",
            flex: 1,
          }}
        >
          <span style={{ fontSize: 18 }}>🔥</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#FF8C00",
              letterSpacing: "0.05em",
              fontFamily: FF,
            }}
          >
            Win Streak: {result.streak}
          </span>
        </div>

        {/* Task pill */}
        {result.task && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              background: "#0A150A",
              border: "1px solid #7FFF0022",
              borderRadius: 10,
              padding: "10px 14px",
              flex: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "#7FFF00",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 700,
                fontFamily: FF,
              }}
            >
              {result.task.label}
            </span>
            {/* Segmented progress */}
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: result.task.total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background:
                      i < result.task!.current ? "#7FFF00" : "#ffffff14",
                    boxShadow:
                      i < result.task!.current ? "0 0 6px #7FFF0077" : "none",
                    transition: `all 0.4s ease ${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: 10,
                color: "#7FFF0077",
                textAlign: "right",
                fontFamily: FF,
              }}
            >
              {result.task.current}/{result.task.total}
            </span>
          </div>
        )}
      </div>

      {/* ── ZONE 5: CTAs ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          width: "100%",
          maxWidth: 380,
          marginTop: 4,
          opacity: phase >= 5 ? 1 : 0,
          transform: phase >= 5 ? "translateY(0)" : "translateY(16px)",
          transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Primary: Play Again */}
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
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 48px #7FFF0055, 0 8px 24px rgba(0,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 32px #7FFF0033, 0 8px 24px rgba(0,0,0,0.4)";
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#090B10",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Play Again
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#090B10" }}>
            →
          </span>
        </button>

        {/* Secondary actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {onShare && (
            <>
              <button
                onClick={onShare}
                style={{
                  background: "none",
                  border: "none",
                  color: "#444",
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  padding: "4px 0",
                  fontFamily: FF,
                }}
              >
                Share Result
              </button>
              <div
                style={{ width: 1, height: 12, background: "#2a2a2a" }}
              />
            </>
          )}
          {onViewStats && (
            <button
              onClick={onViewStats}
              style={{
                background: "none",
                border: "none",
                color: "#444",
                fontSize: 12,
                letterSpacing: "0.06em",
                cursor: "pointer",
                padding: "4px 0",
                fontFamily: FF,
              }}
            >
              View Stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── OVERLAY WRAPPER ───────────────────────────────────────────────────────
// Drop this into GameView.tsx alongside PostGameScreen.
// The game grid behind it will naturally show blurred through the semi-transparent bg.

export function PostGameOverlay({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Blurred backdrop — game grid shows through */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          background: "rgba(9, 11, 16, 0.82)",
        }}
      />
      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}