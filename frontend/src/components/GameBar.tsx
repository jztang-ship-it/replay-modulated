// src/components/GameBar.tsx
// LAYER 1: Sport-agnostic bottom game bar
//
// BUDGET LOGIC (single source of truth):
//   IDLE:              remaining = capMax (nothing spent)
//   HOLD:              remaining = capMax - lockedSalary (deducts per hold tap, restores on unhold)
//   DRAWING/DEALING:   remaining = capMax - capUsed (full roster locked in)
//   REVEALING:         remaining = capMax - revealedSalary (ticks per card reveal)
//   RESULTS/WIN:       remaining = capMax - capUsed (final settled value)
//
// Display format: "remaining / capMax" on one line, e.g. "126 / 180"

import React, { useEffect, useRef, useState } from "react";

// ============================================================
// LEGEND MODAL
// ============================================================

const SCORING_RULES = [
  { stat: "Goal",           pts: "+10", pos: "FW/MD" },
  { stat: "Assist",         pts: "+6",  pos: "All" },
  { stat: "Shot on Target", pts: "+1",  pos: "FW/MD" },
  { stat: "Key Pass",       pts: "+1",  pos: "MD" },
  { stat: "Tackle Won",     pts: "+1",  pos: "DE/MD" },
  { stat: "Interception",   pts: "+1",  pos: "DE/MD" },
  { stat: "Clean Sheet",    pts: "+4",  pos: "GK/DE" },
  { stat: "Save",           pts: "+1",  pos: "GK" },
  { stat: "Goal Conceded",  pts: "-1",  pos: "GK/DE" },
  { stat: "Yellow Card",    pts: "-1",  pos: "All" },
  { stat: "Red Card",       pts: "-3",  pos: "All" },
];

const BADGE_RULES = [
  { icon: "🚀", label: "CAREER NIGHT", condition: "FP > 140% of projection" },
  { icon: "🔥", label: "ON FIRE",       condition: "FP > 115% of projection" },
  { icon: "🥶", label: "ICE COLD",      condition: "FP < 70% of projection" },
];

const colHdr: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: 1,
  textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
};

function LegendModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"payouts" | "scoring" | "badges">("payouts");

  // Payout tiers matching calculateWinTier in payoutLogic
  const PAYOUT_TIERS = [
    { label: "JACKPOT",     score: "100+", payout: "25x", color: "#FFD700",   bg: "rgba(255,215,0,0.12)",   border: "rgba(255,215,0,0.3)" },
    { label: "BIG WIN",     score: "75+",  payout: "10x", color: "#C084FC",   bg: "rgba(192,132,252,0.10)", border: "rgba(192,132,252,0.25)" },
    { label: "MED WIN",     score: "55+",  payout: "5x",  color: "#36D46B",   bg: "rgba(54,212,107,0.10)",  border: "rgba(54,212,107,0.25)" },
    { label: "SMALL WIN",   score: "40+",  payout: "2x",  color: "#3AA0FF",   bg: "rgba(58,160,255,0.10)",  border: "rgba(58,160,255,0.25)" },
    { label: "LOSS",        score: "<40",  payout: "—",   color: "#6B7280",   bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)" },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.80)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 16px 40vh 16px",
        animation: "fadeInBg 200ms ease",
      }}
    >
      <style>{`
        @keyframes fadeInBg { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg,#0E1628 0%,#080E1C 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          width: "100%",
          maxWidth: 380,
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          animation: "slideUp 250ms cubic-bezier(.2,.9,.4,1)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "0 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1, color: "#EAF0FF" }}>SCORING GUIDE</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", margin: "10px 0 0" }}>
          {(["payouts", "scoring", "badges"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "10px 0",
                background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #FFB14A" : "2px solid transparent",
                color: tab === t ? "#FFB14A" : "rgba(255,255,255,0.4)",
                fontSize: 10, fontWeight: 900, letterSpacing: 1.2,
                textTransform: "uppercase", cursor: "pointer",
              }}
            >{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>

          {tab === "payouts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                <span style={colHdr}>Tier</span>
                <span style={{ ...colHdr, textAlign: "right" }}>Team FP</span>
                <span style={{ ...colHdr, textAlign: "right", minWidth: 38 }}>Payout</span>
              </div>
              {PAYOUT_TIERS.map(r => (
                <div
                  key={r.label}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8,
                    alignItems: "center", padding: "8px 12px",
                    borderRadius: 10,
                    background: r.bg,
                    border: `1px solid ${r.border}`,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: r.color }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", textAlign: "right" }}>{r.score}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, textAlign: "right", minWidth: 38, color: r.payout === "—" ? "rgba(255,255,255,0.3)" : "#EAF0FF" }}>{r.payout}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
                Team FP = sum of all 6 players' fantasy points. Payout = bet × multiplier.
              </div>
            </div>
          )}

          {tab === "scoring" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, paddingBottom: 5, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                <span style={colHdr}>Stat</span>
                <span style={{ ...colHdr, textAlign: "right" }}>Pos</span>
                <span style={{ ...colHdr, textAlign: "right", minWidth: 32 }}>FP</span>
              </div>
              {SCORING_RULES.map(r => (
                <div key={r.stat} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "4px 2px" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{r.stat}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "right", whiteSpace: "nowrap" }}>{r.pos}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, textAlign: "right", minWidth: 32, color: r.pts.startsWith("+") ? "#36D46B" : "#ef4444" }}>{r.pts}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "badges" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BADGE_RULES.map(b => (
                <div key={b.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF", marginBottom: 3 }}>{b.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{b.condition}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4, lineHeight: 1.6 }}>
                Badges appear on both the card front and back after each reveal.
              </div>
            </div>
          )}
        </div>

        {/* Close button at bottom — matches basketball pattern */}
        <button
          onClick={onClose}
          style={{
            padding: "14px 0", background: "rgba(255,255,255,0.04)",
            border: "none", borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)", fontSize: 10,
            fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export type GameStateLabel =
  | "IDLE"
  | "DEALING"
  | "HOLD"
  | "DRAWING"
  | "REVEALING"
  | "RESULTS"
  | "WIN_CELEBRATION";

type Props = {
  gameState: GameStateLabel;
  balance: number;
  isBalanceAnimating?: boolean;
  totalFp: number;
  capMax: number;
  capUsed: number;       // full salary of all cards (post-draw settled value)
  lockedSalary: number;  // salary of held cards only (HOLD phase)
  revealedSalary: number;// running salary of revealed cards (REVEALING phase)
  betMultiplier: number;
  baseBet: number;
  onBetMultiplier: (m: number) => void;
  onAction: () => void;
};

const MULTIPLIERS = [1, 3, 5, 10];

// Smoothly animates from previous value to new value
function RollingNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) {
      setDisplayed(end);
      prevRef.current = end;
      return;
    }

    const duration = 150; // fast snap — should complete before next card flips
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out quart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * eased;
      setDisplayed(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayed(end);
        prevRef.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <>{displayed.toFixed(decimals)}</>;
}



function actionLabel(state: GameStateLabel): string {
  if (state === "IDLE") return "DEAL";
  if (state === "DEALING") return "...";
  if (state === "HOLD") return "DRAW";
  if (state === "DRAWING") return "...";
  if (state === "REVEALING") return "SKIP";
  return "REPLAY";
}

function actionGradient(state: GameStateLabel): string {
  if (state === "HOLD") return "linear-gradient(180deg, #36D46B 0%, #1FA94B 100%)";
  if (state === "RESULTS" || state === "WIN_CELEBRATION")
    return "linear-gradient(180deg, #3AA0FF 0%, #1D6DD7 100%)";
  return "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)";
}

function isDisabled(state: GameStateLabel): boolean {
  return state === "DEALING" || state === "DRAWING";
}

function salarySpent(
  state: GameStateLabel,
  capUsed: number,
  lockedSalary: number,
  revealedSalary: number
): number {
  if (state === "IDLE") return 0;
  if (state === "HOLD") return lockedSalary;
  if (state === "DRAWING") return lockedSalary;   // new cards not committed yet
  if (state === "REVEALING") return revealedSalary;
  // DEALING, RESULTS, WIN_CELEBRATION — full roster settled
  return capUsed;
}

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 1,
  textTransform: "uppercase",
  opacity: 0.55,
  marginBottom: 2,
  whiteSpace: "nowrap",
};

export function GameBar({
  gameState,
  balance,
  isBalanceAnimating,
  totalFp,
  capMax,
  capUsed,
  lockedSalary,
  revealedSalary,
  betMultiplier,
  baseBet,
  onBetMultiplier,
  onAction,
}: Props) {
  const betLocked =
    gameState === "DEALING" ||
    gameState === "DRAWING" ||
    gameState === "REVEALING";

  const [showLegend, setShowLegend] = useState(false);

  const spent = salarySpent(gameState, capUsed, lockedSalary, revealedSalary);
  const remaining = capMax - spent;
  const overBudget = remaining < 0;
  const currentBet = baseBet * betMultiplier;

  return (
    <>
      {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Row 1: Balance | Team FP | Budget */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Balance */}
        <div>
          <div style={labelStyle}>Balance</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 950,
              lineHeight: 1,
              color: isBalanceAnimating ? "#36D46B" : "#EAF0FF",
              transition: "color 300ms ease",
            }}
          >
            ${balance.toLocaleString()}
          </div>
        </div>

        {/* Team FP center pill */}
        <div
          style={{
            textAlign: "center",
            padding: "5px 18px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 2 }}>
            <span style={{ ...labelStyle, textAlign: "center", marginBottom: 0 }}>Team FP</span>
            <button
              onClick={() => setShowLegend(true)}
              style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: 900, lineHeight: 1, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >?</button>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 950,
              letterSpacing: -0.5,
              color: "#EAF0FF",
              lineHeight: 1,
            }}
          >
            <RollingNumber value={totalFp} decimals={1} />
          </div>
        </div>

        {/* Budget: remaining / cap on one line */}
        <div style={{ textAlign: "right" }}>
          <div style={{ ...labelStyle, textAlign: "right" }}>Budget</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "flex-end",
              gap: 3,
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 950,
                lineHeight: 1,
                color: overBudget ? "#ef4444" : "#EAF0FF",
                transition: "color 200ms ease",
              }}
            >
              {remaining}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.4, lineHeight: 1 }}>
              / {capMax}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Bet pills | bet cost | Action button */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {MULTIPLIERS.map((m: number) => {
            const active = betMultiplier === m;
            return (
              <button
                key={m}
                onClick={() => onBetMultiplier(m)}
                disabled={betLocked}
                style={{
                  background: active ? "rgba(100,180,255,0.22)" : "rgba(255,255,255,0.07)",
                  border: active ? "1px solid rgba(100,180,255,0.75)" : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: active ? "#8ec8ff" : "#EAF0FF",
                  fontWeight: 900,
                  fontSize: 12,
                  padding: "7px 10px",
                  cursor: betLocked ? "default" : "pointer",
                  opacity: betLocked ? 0.4 : 1,
                  transition: "all 150ms ease",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                }}
              >
                {m}x
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", flexShrink: 0 }}>
          ${currentBet}
        </div>

        <button
          onClick={onAction}
          disabled={isDisabled(gameState)}
          style={{
            flex: 1,
            borderRadius: 12,
            border: "none",
            padding: "13px 0",
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            cursor: isDisabled(gameState) ? "default" : "pointer",
            background: isDisabled(gameState) ? "rgba(255,255,255,0.1)" : actionGradient(gameState),
            color: "#EAF0FF",
            opacity: isDisabled(gameState) ? 0.45 : 1,
            boxShadow: isDisabled(gameState) ? "none" : "0 6px 20px rgba(0,0,0,0.35)",
            transition: "opacity 150ms ease, box-shadow 150ms ease",
            lineHeight: 1,
          }}
        >
          {actionLabel(gameState)}
        </button>
      </div>
    </div>
    </>
  );
}
