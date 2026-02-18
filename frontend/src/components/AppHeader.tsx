// src/components/AppHeader.tsx
// LAYER 1: Sport-agnostic top navigation + community jackpot bar
// Jackpot grows over time (ticker) + each bet placed adds a small slice

import React, { useEffect, useRef, useState, useCallback } from "react";

// ============================================================
// JACKPOT LOGIC
// ============================================================

// Starting seed — in production this would come from a backend shared state
const JACKPOT_SEED = 12_451.29;

// How much each bet unit contributes to the community pot (5% rake)
const JACKPOT_BET_RAKE = 0.05;

// Time tick: +$0.01 every 3s (simulated community activity)
const TICK_INTERVAL_MS = 3000;
const TICK_AMOUNT = 0.01;

// The jackpot threshold for 100% fill — matches JACKPOT win tier
const JACKPOT_TARGET_FP = 100; // team FP needed to win jackpot

// ============================================================
// JACKPOT BAR
// ============================================================

function JackpotBar({ fillPct }: { fillPct: number }) {
  const [animated, setAnimated] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const target = Math.min(100, Math.max(0, fillPct));
    let current = animated;
    const step = () => {
      const diff = target - current;
      if (Math.abs(diff) < 0.15) { setAnimated(target); return; }
      current += diff * 0.08;
      setAnimated(current);
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fillPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = animated >= 90
    ? "linear-gradient(90deg,#FF4500 0%,#FFB14A 50%,#FFD700 100%)"
    : animated >= 60
    ? "linear-gradient(90deg,#FF7A2F 0%,#FFB14A 60%,#FFD700 100%)"
    : "linear-gradient(90deg,#FF9F1C 0%,#FFD700 100%)";

  return (
    <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden", position: "relative" }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${animated}%`,
        background: color,
        borderRadius: 99,
        boxShadow: animated > 5 ? "0 0 8px rgba(255,180,50,0.7)" : "none",
        transition: "background 300ms ease",
      }} />
      {/* Glowing dot at tip */}
      {animated > 3 && (
        <div style={{
          position: "absolute", top: "50%",
          left: `calc(${Math.min(animated, 99)}% - 4px)`,
          transform: "translateY(-50%)",
          width: 8, height: 8, borderRadius: "50%",
          background: "#FFD700",
          boxShadow: "0 0 8px 3px rgba(255,215,0,0.9)",
          animation: "jpulse 1.4s ease-in-out infinite",
        }} />
      )}
      <style>{`@keyframes jpulse { 0%,100%{opacity:1;transform:translateY(-50%) scale(1)} 50%{opacity:.5;transform:translateY(-50%) scale(1.8)} }`}</style>
    </div>
  );
}

// ============================================================
// TABS
// ============================================================

type TabId = "home" | "pulse" | "collect" | "profile";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home",    label: "Play",    icon: "⚡" },
  { id: "pulse",   label: "Pulse",   icon: "📈" },
  { id: "collect", label: "Collect", icon: "🃏" },
  { id: "profile", label: "Profile", icon: "👤" },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AppHeader({
  // fillPct is driven by current team FP vs jackpot target during reveal
  revealFillPct = 0,
  // Each bet placed calls this externally — AppHeader manages the $ amount
  betAdded = 0,
  jackpotTarget = JACKPOT_TARGET_FP,
}: {
  revealFillPct?: number;   // 0–100, driven by runningTotalFp
  betAdded?: number;        // $ value of latest bet placed (triggers jackpot add)
  jackpotTarget?: number;   // FP score needed to win jackpot (for display)
}) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [jackpotAmount, setJackpotAmount] = useState(JACKPOT_SEED);
  const prevBetRef = useRef(0);

  // ── Time-based ticker (simulated community activity) ──
  useEffect(() => {
    const id = setInterval(() => {
      setJackpotAmount(p => parseFloat((p + TICK_AMOUNT).toFixed(2)));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ── Bet-based contribution ──
  useEffect(() => {
    if (betAdded > 0 && betAdded !== prevBetRef.current) {
      prevBetRef.current = betAdded;
      const contribution = parseFloat((betAdded * JACKPOT_BET_RAKE).toFixed(2));
      if (contribution > 0) {
        setJackpotAmount(p => parseFloat((p + contribution).toFixed(2)));
      }
    }
  }, [betAdded]);

  // Fill pct: use reveal-driven pct when active, else 0
  const fillPct = Math.min(100, Math.max(0, revealFillPct));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

      {/* Nav row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, paddingLeft: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>REPLAY</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "#FFB14A", marginLeft: 2 }}>FS</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {TABS.map(({ id, label, icon }) => {
            const active = activeTab === id;
            const disabled = id !== "home";
            return (
              <button
                key={id}
                onClick={() => !disabled && setActiveTab(id)}
                disabled={disabled}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  padding: "3px 8px",
                  background: active ? "rgba(255,177,74,0.12)" : "transparent",
                  border: active ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
                  borderRadius: 8,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.35 : 1,
                  transition: "all 150ms ease",
                  minWidth: 40,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: active ? "#FFB14A" : "#EAF0FF" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Jackpot row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "#FFB14A", whiteSpace: "nowrap", flexShrink: 0 }}>
          🏆 Jackpot
        </span>
        <div style={{ flex: 1 }}>
          <JackpotBar fillPct={fillPct} />
        </div>
        {/* Jackpot amount — ticks up in real time */}
        <span style={{ fontSize: 11, fontWeight: 950, color: "#FFD700", whiteSpace: "nowrap", flexShrink: 0, textShadow: "0 0 8px rgba(255,215,0,0.5)", fontVariantNumeric: "tabular-nums" }}>
          ${jackpotAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Jackpot target hint — small label below bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
        <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,215,0,0.4)", letterSpacing: 0.5 }}>
          {jackpotTarget}+ FP to win
        </span>
      </div>

    </div>
  );
}
