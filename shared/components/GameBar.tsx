/**
 * shared/components/GameBar.tsx
 * LAYER 1: Sport-agnostic bottom game bar.
 *
 * Sport-specific data is injected via props:
 *   winTiers     — FP thresholds + display colors (from sport adapter)
 *   scoringRules — stat/pts pairs shown in legend (from sport adapter)
 *   badges       — badge descriptions shown in legend (from sport adapter)
 *
 * The entire game mechanic (budget, multipliers, action button, tier bar)
 * is universal and lives here. Only the legend data changes per sport.
 *
 * All sports import from "@shared/components/GameBar".
 */

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { THEME } from "@shared/theme";

// ── Public types ───────────────────────────────────────────────────────────

export type GameStateLabel =
  | "IDLE" | "DEALING" | "HOLD" | "DRAWING"
  | "REVEALING" | "RESULTS" | "WIN_CELEBRATION";

export interface WinTierDisplay {
  label: string;
  minFp: number;
  color: string;
  glow: string;
}

export interface ScoringRule {
  stat: string;
  pts: string;
}

export interface BadgeInfo {
  icon: string;
  label: string;
  condition: string;
}

export interface LegendData {
  payoutRows: Array<{ label: string; score: string; payout: string; color: string; bg: string; border: string }>;
  scoringRules: ScoringRule[];
  stamps: BadgeInfo[];
  badges: BadgeInfo[];
}

type Props = {
  gameState: GameStateLabel;
  balance: number;
  isBalanceAnimating?: boolean;
  totalFp: number;
  capMax: number;
  capUsed: number;
  lockedSalary: number;
  revealedSalary: number;
  betMultiplier: number;
  baseBet: number;
  onBetMultiplier: (m: number) => void;
  onAction: () => void;
  /** Sport-specific win tier thresholds + colors */
  winTiers: WinTierDisplay[];
  /** Sport-specific legend data */
  legend: LegendData;
};

const MULTIPLIERS = [1, 3, 5, 10];

// ── Helpers ────────────────────────────────────────────────────────────────

function getTierState(totalFp: number, winTiers: WinTierDisplay[]) {
  let hitIdx = -1;
  for (let i = 0; i < winTiers.length; i++) {
    if (totalFp >= winTiers[i].minFp) hitIdx = i;
  }
  const nextIdx = hitIdx + 1;
  const next = winTiers[nextIdx];
  const prev = winTiers[hitIdx];
  const last = winTiers[winTiers.length - 1];
  if (!next) {
    return { label: last.label, fillPct: 100, color: last.color, glow: last.glow, fptNeeded: 0 };
  }
  const floor   = prev?.minFp ?? 0;
  const ceiling = next.minFp;
  const fillPct = Math.min(100, Math.max(0, ((totalFp - floor) / (ceiling - floor)) * 100));
  return { label: next.label, fillPct, color: next.color, glow: next.glow, fptNeeded: Math.max(0, Math.ceil(next.minFp - totalFp)) };
}

function actionLabel(state: GameStateLabel): string {
  if (state === "IDLE")      return "DEAL";
  if (state === "DEALING")   return "...";
  if (state === "HOLD")      return "DRAW";
  if (state === "DRAWING")   return "...";
  if (state === "REVEALING") return "SKIP";
  return "REPLAY";
}

function actionBackground(state: GameStateLabel): string {
  if (state === "HOLD") return THEME.palette.green_primary;
  if (state === "RESULTS" || state === "WIN_CELEBRATION") return THEME.palette.blue_secondary;
  if (state === "IDLE") return THEME.palette.blue_primary;
  return THEME.button.default;
}

function actionTextColor(state: GameStateLabel): string {
  if (state === "HOLD") return THEME.palette.black;
  if (state === "IDLE") return THEME.palette.black;
  return THEME.colors.textPrimary;
}

function isDisabled(state: GameStateLabel): boolean {
  return state === "DEALING" || state === "DRAWING";
}

function salarySpent(state: GameStateLabel, capUsed: number, lockedSalary: number, revealedSalary: number): number {
  if (state === "IDLE")      return 0;
  if (state === "HOLD")      return lockedSalary;
  if (state === "DRAWING")   return lockedSalary;
  if (state === "REVEALING") return revealedSalary;
  return capUsed;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RollingNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) { setDisplayed(end); prevRef.current = end; return; }
    const duration = 150;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * eased;
      setDisplayed(current);
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { setDisplayed(end); prevRef.current = end; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <>{displayed.toFixed(decimals)}</>;
}

function TierBar({ totalFp, gameState, winTiers }: { totalFp: number; gameState: GameStateLabel; winTiers: WinTierDisplay[] }) {
  const { label, fillPct, color, glow, fptNeeded } = getTierState(totalFp, winTiers);
  const [animated, setAnimated] = useState(0);
  const rafRef = useRef<number>(0);
  const prevLabelRef = useRef(label);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (label !== prevLabelRef.current && prevLabelRef.current !== winTiers[0].label) {
      prevLabelRef.current = label;
      setBurst(true);
      const t = window.setTimeout(() => setBurst(false), 500);
      return () => window.clearTimeout(t);
    }
    prevLabelRef.current = label;
  }, [label, winTiers]);

  useEffect(() => {
    const target = fillPct;
    let cur = animated;
    const step = () => {
      const diff = target - cur;
      if (Math.abs(diff) < 0.2) { setAnimated(target); return; }
      cur += diff * 0.10;
      setAnimated(cur);
      rafRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fillPct]); // eslint-disable-line

  const showBar = gameState !== "IDLE";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 11, fontWeight: 900, letterSpacing: 1.6, textTransform: "uppercase",
          color: showBar ? color : "rgba(255,255,255,0.30)",
          textShadow: showBar ? `0 0 10px ${glow}` : "none",
          transition: "color 400ms ease",
        }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: "rgba(255,255,255,0.45)" }}>
          {showBar && fptNeeded > 0 ? `${fptNeeded} FP` : showBar ? "✓" : `${winTiers[0].minFp} FP`}
        </span>
      </div>
      <div style={{ width: "100%", height: 10, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${showBar ? animated : 0}%`,
          background: `linear-gradient(90deg, ${color}99 0%, ${color} 100%)`,
          borderRadius: 6,
          boxShadow: animated > 5 ? `0 0 8px ${glow}` : "none",
          transition: "background 400ms ease",
        }} />
        {animated > 3 && showBar && (
          <div style={{
            position: "absolute", top: "50%",
            left: `calc(${Math.min(animated, 97)}% - 4px)`,
            transform: "translateY(-50%)",
            width: 7, height: 7, borderRadius: "50%",
            background: color, boxShadow: `0 0 6px 2px ${glow}`,
            animation: burst ? "tierBurst 0.5s ease-out" : "tipPulse 1.4s ease-in-out infinite",
          }} />
        )}
        <style>{`
          @keyframes tipPulse  { 0%,100%{opacity:1;transform:translateY(-50%) scale(1)} 50%{opacity:.5;transform:translateY(-50%) scale(1.8)} }
          @keyframes tierBurst { 0%{transform:translateY(-50%) scale(1)} 50%{transform:translateY(-50%) scale(3.5)} 100%{transform:translateY(-50%) scale(1)} }
        `}</style>
      </div>
    </div>
  );
}

const colHdr: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: 1,
  textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
};

function LegendModal({ onClose, legend }: { onClose: () => void; legend: LegendData }) {
  const [tab, setTab] = useState<"payouts" | "scoring" | "badges">("payouts");

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
      paddingBottom: "10vh", paddingLeft: 16, paddingRight: 16,
      animation: "fadeInBg 200ms ease",
    }}>
      <style>{`
        @keyframes fadeInBg { from{opacity:0} to{opacity:1} }
        @keyframes slideUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        background: "linear-gradient(160deg,#0E1628 0%,#080E1C 100%)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18,
        width: "100%", maxWidth: 380, maxHeight: "78vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        animation: "slideUp 250ms cubic-bezier(.2,.9,.4,1)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
        </div>
        <div style={{ padding: "0 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1, color: "#EAF0FF" }}>SCORING GUIDE</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", margin: "10px 0 0" }}>
          {(["payouts", "scoring", "badges"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", background: "none", border: "none",
              borderBottom: tab === t ? "2px solid #FFB14A" : "2px solid transparent",
              color: tab === t ? "#FFB14A" : "rgba(255,255,255,0.4)",
              fontSize: 10, fontWeight: 900, letterSpacing: 1.2,
              textTransform: "uppercase", cursor: "pointer",
            }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>

          {tab === "payouts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                <span style={colHdr}>Tier</span>
                <span style={{ ...colHdr, textAlign: "right" }}>Team FP</span>
                <span style={{ ...colHdr, textAlign: "right", minWidth: 38 }}>Payout</span>
              </div>
              {legend.payoutRows.map(r => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 10, background: r.bg, border: `1px solid ${r.border}` }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, paddingBottom: 5, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                <span style={colHdr}>Stat</span>
                <span style={{ ...colHdr, textAlign: "right", minWidth: 42 }}>FP</span>
              </div>
              {legend.scoringRules.map(r => (
                <div key={r.stat} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "4px 2px" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{r.stat}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, textAlign: "right", minWidth: 42, color: r.pts.startsWith("+") ? "#36D46B" : "#ef4444" }}>{r.pts}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "badges" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {legend.stamps.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>STAMPS</div>
                  {legend.stamps.map(b => (
                    <div key={b.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF", marginBottom: 3 }}>{b.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{b.condition}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {legend.badges.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginTop: 8, marginBottom: 4 }}>BADGES</div>
                  {legend.badges.map(b => (
                    <div key={b.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF", marginBottom: 3 }}>{b.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{b.condition}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          padding: "14px 0", background: "rgba(255,255,255,0.04)",
          border: "none", borderTop: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.5)", fontSize: 10,
          fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
        }}>Close</button>
      </div>
    </div>
  );
}

// ── GameBar ────────────────────────────────────────────────────────────────

export function GameBar({
  gameState, balance, isBalanceAnimating, totalFp,
  capMax, capUsed, lockedSalary, revealedSalary,
  betMultiplier, baseBet, onBetMultiplier, onAction,
  winTiers, legend,
}: Props) {
  const betLocked = gameState === "DEALING" || gameState === "DRAWING" || gameState === "REVEALING";
  const [showLegend, setShowLegend] = useState(false);

  const spent     = salarySpent(gameState, capUsed, lockedSalary, revealedSalary);
  const remaining = capMax - spent;
  const overBudget = remaining < 0;
  const currentBet = baseBet * betMultiplier;

  return (
    <>
      {showLegend && ReactDOM.createPortal(
        <LegendModal onClose={() => setShowLegend(false)} legend={legend} />,
        document.body
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>

        {/* Tier progress bar */}
        <TierBar totalFp={totalFp} gameState={gameState} winTiers={winTiers} />

        {/* Score + Budget */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 32, paddingTop: 12, paddingBottom: 2 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1, fontStyle: "italic" }}>
              <RollingNumber value={totalFp} decimals={1} />
            </div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 4 }}>
              Total Score
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 2, justifyContent: "center" }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: overBudget ? "#ef4444" : "#FFFFFF", lineHeight: 1, fontStyle: "italic" }}>
                {remaining}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.35)", lineHeight: 1, fontStyle: "italic" }}>
                /{capMax}
              </span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 4 }}>
              Budget
            </div>
          </div>
        </div>

        {/* Multiplier pills */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", paddingTop: 10 }}>
          {MULTIPLIERS.map((m: number) => {
            const active = betMultiplier === m;
            return (
              <button key={m} onClick={() => onBetMultiplier(m)} disabled={betLocked} style={{
                background: active ? THEME.button.multiplier.active.bg : THEME.button.multiplier.inactive.bg,
                border: active ? "none" : THEME.button.multiplier.inactive.border,
                borderRadius: 24, color: "#FFFFFF",
                fontWeight: 900, fontSize: 14, padding: "9px 0",
                cursor: betLocked ? "default" : "pointer",
                opacity: betLocked ? 0.4 : 1,
                transition: "all 150ms ease", lineHeight: 1,
                flex: 1, maxWidth: 80,
              }}>{m}X</button>
            );
          })}
        </div>

        {/* Wallet + Legend button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 18 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
              Wallet
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: isBalanceAnimating ? THEME.palette.green_primary : "#FFFFFF", transition: "color 300ms ease", lineHeight: 1, marginTop: 2 }}>
              ${balance.toLocaleString()}
            </div>
          </div>
          <button onClick={() => setShowLegend(true)} style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "transparent",
            border: `2px solid ${THEME.colors.surfaceStroke}`,
            color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 900,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>i</button>
        </div>

        {/* Action button */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <button onClick={onAction} disabled={isDisabled(gameState)} style={{
            width: "min(168px, 50%)",
            borderRadius: THEME.button.action.borderRadius, border: "none",
            padding: "11px 0",
            fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
            cursor: isDisabled(gameState) ? "default" : "pointer",
            background: isDisabled(gameState) ? "rgba(255,255,255,0.10)" : actionBackground(gameState),
            color: isDisabled(gameState) ? "rgba(255,255,255,0.35)" : actionTextColor(gameState),
            opacity: isDisabled(gameState) ? 0.5 : 1,
            boxShadow: isDisabled(gameState) ? "none" : "0 4px 14px rgba(0,0,0,0.30)",
            transition: "opacity 150ms ease",
            lineHeight: 1,
          }}>
            {actionLabel(gameState)}
          </button>
        </div>

      </div>
    </>
  );
}