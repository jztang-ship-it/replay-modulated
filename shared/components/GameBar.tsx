/**
 * shared/components/GameBar.tsx
 * LAYER 1: Sport-agnostic bottom game bar.
 *
 * WIN_CELEBRATION mode transforms the bar in-place:
 *   - Zone above gauge (score/budget) → blurred, shows tier name + coins won
 *   - Tier gauge + team FP → stays live, unblurred, same position
 *   - Zone below gauge (multipliers/wallet/action) → blurred, shows streak hook
 *   - Tap either blurred zone → onWinCelebrationComplete() → RESULTS
 *
 * No separate PostGameOverlay needed. The celebration IS the GameBar.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { THEME } from "@shared/theme";
import type { JSX as ReactJSX } from "react";
import { formatBonusCountdown, getMsUntilNextBonusRotation } from "@shared/utils/dailyBonus";
import { track } from "@shared/analytics/analytics";

/** Live countdown string to next UTC midnight (daily bonus rotation). */
function formatBonusCountdownLocal(): string {
  return formatBonusCountdown(getMsUntilNextBonusRotation());
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ReactJSX.IntrinsicElements { }
  }
}

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
  fp?: number;
}

export interface LegendData {
  payoutRows: Array<{ label: string; score: string; payout: string; color: string; bg: string; border: string }>;
  bonusRows?: Array<{ label: string; condition: string; reward: string }>;
  scoringRules: ScoringRule[];
  stamps?: BadgeInfo[];
  badges: BadgeInfo[];
  /** Today's 3 hot-bonus players — rotates every UTC midnight. */
  todaysStars?: Array<{ name: string; basePlayerId: string; tier?: string; bonus?: 5 | 10 | 20 }>;
  /** Daily mystery score target — exact hit wins instant bonus. */
  mysteryScore?: number;
  mysteryBonus?: number;
}

// Celebration data passed in when WIN_CELEBRATION is active
export interface CelebrationData {
  tierLabel: string;       // e.g. "ALL-STAR"
  tierColor: string;       // e.g. "#C9A84C"
  tierGlow: string;        // e.g. "#C9A84C55"
  payout: number;          // coins earned (tier win only, not including bonus)
  streak: number;          // current win streak
  isBust: boolean;
  betMultiplier: number;   // user-selected multiplier (1/3/5/10)
  tierMultiplier: number;  // tier payout multiplier (0/0.5/3/8/15/50)
  baseBet: number;         // base wager amount (10)
  isLoss: boolean;         // true for ROOKIE (partial loss) and BUST (full loss)
  lossAmount: number;      // amount lost (0 for wins, baseBet*betMultiplier for bust, half for rookie)
  streakMultiplier?: number;    // streak-based multiplier (1.0 / 1.3 / 1.7 / 2.5)
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
  /** 0→1 raw progress of last card FP rollup, drives overshoot in sync */
  lastCardProgress?: number;
  /** Actual FP of last card — scales overshoot magnitude */
  lastCardFp?: number;
  /** Required when gameState === WIN_CELEBRATION */
  celebration?: CelebrationData;
  /** Called when user taps blurred zone to exit celebration */
  onWinCelebrationComplete?: () => void;
  onWageAnimationComplete?: () => void;
  /** FTUE: block the Draw button until the anchor is held */
  ftueDrawBlocked?: boolean;
  /** FTUE: hide the AUTO button during reveal */
  ftueHideSkip?: boolean;
  /** FTUE: pulse the near-miss bar to draw attention (shown during runback) */
  ftuePulseNearMiss?: boolean;
  /** FTUE: block the replay/deal button (before final bubble dismissed) */
  ftueReplayBlocked?: boolean;
  /** FTUE: pulse the replay button to draw attention */
  ftueReplayPulse?: boolean;
  /** FTUE: hide balance+wage+legend row until after DRAW */
  ftueHideBalance?: boolean;
  /** FTUE: CoachLayer spotlight target for primary action (Deal / Draw / replay) */
  dataFtuePrimaryAnchor?: "deal" | "draw";
  /** Hide the built-in TierBar — use when an external TierGauge is shown */
  hideTierBar?: boolean;
  /** Slot rendered between tier bar and multipliers — used for external TierGauge */
  tierGaugeSlot?: React.ReactNode;
  /** When set, multiplier row and wallet/action render into these DOM nodes (single GameBar instance, split layout) */
  splitFooter?: {
    multipliersHost: HTMLElement | null;
    controlsHost: HTMLElement | null;
  };
  /** When false with splitFooter, multiplier buttons are not portaled (host can stay mounted). Default true. */
  splitMultiplierRowVisible?: boolean;
  /**
   * Tap target for the leaderboard trophy button rendered to the right of the
   * primary action button (DEAL / DRAW / REPLAY). Hidden during FTUE
   * (gated on ftueHideSkip).
   */
  onViewLeaderboard?: () => void;
  /** Pulse the legend (ⓘ) icon to draw attention — e.g. daily bonus refresh */
  legendPulsing?: boolean;
  /** Pulse the trophy (🏆) icon to draw attention — e.g. leaderboard qualification */
  trophyPulsing?: boolean;
  /** Current win streak for fire emoji display under balance */
  streak?: number;
  /** Called when user opens the legend modal — parent can clear pulse state */
  onLegendOpened?: () => void;
  /** Called when user taps the trophy/leaderboard icon — parent can clear pulse state */
  onTrophyOpened?: () => void;
};

const MULTIPLIERS = [1, 3, 5, 10];
const FF = "'Rajdhani','Arial Narrow',sans-serif";

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
  const floor = prev?.minFp ?? 0;
  const ceiling = next.minFp;
  const fillPct = Math.min(100, Math.max(0, ((totalFp - floor) / (ceiling - floor)) * 100));
  // Fill color = current tier already achieved (prev), label = next tier to reach
  const fillColor = prev?.color ?? "rgba(255,255,255,0.4)";
  const fillGlow = prev?.glow ?? "rgba(255,255,255,0.15)";
  return { label: next.label, fillPct, color: fillColor, glow: fillGlow, fptNeeded: Math.max(0, ceiling - totalFp) };
}

function actionLabel(state: GameStateLabel): string {
  if (state === "IDLE") return "DEAL";
  if (state === "DEALING") return "...";
  if (state === "HOLD") return "DRAW";
  if (state === "DRAWING") return "...";
  if (state === "REVEALING") return "AUTO";
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

// ── Streak fire row with flash (light-up) and extinguish (streak-break) effects ──
// All 10 emojis on one line: [🔥🔥🔥 1.3x] [🔥🔥 1.7x] [🔥🔥🔥🔥🔥 2.5x]
// Tiers unlock progressively: tier 2 appears at 3 wins, tier 3 at 5 wins.
// Numbers must match STREAK_TIERS in shared/utils/payoutLogic.ts.

const STREAK_LABELS: Record<number, string> = { 3: "1.3x", 5: "1.7x", 10: "2.5x" };

function StreakFireRow({ streak, prevStreak }: { streak: number; prevStreak: number }) {
  const totalFlames = streak >= 5 ? 10 : streak >= 3 ? 5 : 3;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
      {/* Label row — multiplier above its threshold flame, invisible placeholder otherwise */}
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: totalFlames }, (_, i) => {
          const n = i + 1;
          const label = STREAK_LABELS[n];
          const isThresholdSlot = label != null;
          const tierLit = isThresholdSlot && streak >= n;
          return (
            <span key={`lbl-${n}`} style={{
              fontSize: 8, fontWeight: 800, lineHeight: 1,
              display: "inline-block", width: "1em", textAlign: "center",
              color: tierLit ? "#FFD700" : "rgba(255,255,255,0.2)",
              visibility: isThresholdSlot ? "visible" : "hidden",
            }}>{label ?? ""}</span>
          );
        })}
      </div>
      {/* Flame row — totalFlames flames, flame N lit when streak >= N */}
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: totalFlames }, (_, i) => {
          const n = i + 1;
          const isLit = streak >= n;
          const justLit = streak > prevStreak && n === streak;
          return (
            <span key={`flame-${n}`} style={{
              fontSize: 11, opacity: isLit ? 1 : 0.2,
              filter: isLit ? "none" : "grayscale(1)",
              display: "inline-block",
              animation: justLit ? "streakFlash 0.5s ease-out" : "none",
            }}>🔥</span>
          );
        })}
      </div>
    </div>
  );
}

function salarySpent(state: GameStateLabel, capUsed: number, lockedSalary: number, revealedSalary: number): number {
  if (state === "IDLE") return 0;
  if (state === "HOLD") return lockedSalary;
  if (state === "DRAWING") return lockedSalary;
  if (state === "REVEALING") return revealedSalary;
  return capUsed;
}

// ── Streak copy ────────────────────────────────────────────────────────────

function getStreakCopy(streak: number, isBust: boolean): { head: string; sub: string } {
  if (isBust) {
    return streak > 0
      ? { head: "STREAK BROKEN", sub: `${streak}-game run ended` }
      : { head: "NO STREAK", sub: "Start one next game" };
  }
  if (streak === 1) return { head: "STREAK STARTED 🔥", sub: "Keep it alive" };
  if (streak === 2) return { head: "2 IN A ROW 🔥", sub: "You're finding your rhythm" };
  if (streak <= 4) return { head: `${streak}-GAME STREAK 🔥`, sub: "Don't stop now" };
  return { head: `${streak} STRAIGHT 🔥`, sub: "Insane. Come back and do it again." };
}

// ── RollingNumber ──────────────────────────────────────────────────────────

function RollingNumber({ value, decimals = 1, duration: dur = 150 }: { value: number; decimals?: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) { setDisplayed(end); prevRef.current = end; return; }
    const duration = dur;
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

// ── CountUp ───────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900, delay = 0): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    let raf: number;
    const t = setTimeout(() => {
      let start: number | null = null;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 4);
        setVal(Math.round(e * target));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return val;
}

// ── Coin Burst ─────────────────────────────────────────────────────────────

function CoinBurst({ active, color }: { active: boolean; color: string }) {
  const [particles, setParticles] = useState<
    { id: number; vx: number; vy: number; scale: number; c: string }[]
  >([]);

  useEffect(() => {
    if (!active) return;
    const colors = ["#FFD700", "#FFC107", "#FFE066", color, "#FFFFFF"];
    setParticles(
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        vx: (Math.random() - 0.5) * 90,
        vy: -(Math.random() * 55 + 15),
        scale: Math.random() * 0.7 + 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
      }))
    );
    const t = setTimeout(() => setParticles([]), 1000);
    return () => clearTimeout(t);
  }, [active, color]);

  if (!particles.length) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 5 }}>
      {particles.map((p) => (
        <div key={p.id} style={{
          position: "absolute", left: "50%", top: "60%",
          width: 7, height: 7, borderRadius: "50%",
          background: p.c, boxShadow: `0 0 5px ${p.c}`,
          animation: `gb_burst_${p.id} 1s cubic-bezier(0.22,1,0.36,1) forwards`,
        }} />
      ))}
      <style>{particles.map((p) =>
        `@keyframes gb_burst_${p.id} {
          0%   { transform:translate(0,0) scale(${p.scale}); opacity:1; }
          70%  { opacity:1; }
          100% { transform:translate(${p.vx}px,${p.vy}px) scale(0); opacity:0; }
        }`
      ).join("")}</style>
    </div>
  );
}


// ── TierBar ────────────────────────────────────────────────────────────────
//
// Overshoot = damped spring oscillation, driven directly by lastCardProgress.
//
// Timeline (last 30% of rollup, p: 0.7 → 1.0):
//   Normalize t = (p - 0.7) / 0.3  →  0 to 1
//   Spring: A * e^(-damping*t) * cos(freq*t)
//   At t=0: displacement = +A (forward of target)
//   Oscillates: forward → back past target → forward (smaller) → settles at 0 by t=1
//
// Magnitude A scales with the card's bar contribution so a big card = big tug.
// Both the real FP and the spring use the same clock → always land together.

function TierBar({
  totalFp, gameState, winTiers, isCelebration,
  lastCardProgress, lastCardFp, onOvershootSettled, ftuePulseNearMiss = false,
}: {
  totalFp: number;
  gameState: GameStateLabel;
  winTiers: WinTierDisplay[];
  isCelebration: boolean;
  lastCardProgress: number;
  lastCardFp: number;
  onOvershootSettled: () => void;
  ftuePulseNearMiss?: boolean;
}) {
  const { label, fillPct, color, glow, fptNeeded } = getTierState(totalFp, winTiers);
  const showBar = gameState !== "IDLE";

  const tierTop = winTiers[winTiers.length - 1].minFp;
  function getColorAt(pct: number): { color: string; glow: string } {
    const fakeFp = (pct / 100) * tierTop;
    let hitIdx = -1;
    for (let i = 0; i < winTiers.length; i++) {
      if (fakeFp >= winTiers[i].minFp) hitIdx = i;
    }
    if (hitIdx < 0) return { color: "rgba(255,255,255,0.25)", glow: "rgba(255,255,255,0.08)" };
    return { color: winTiers[hitIdx].color, glow: winTiers[hitIdx].glow };
  }

  // ── Spring physics ──────────────────────────────────────────────────────
  // Card's bar contribution scales the amplitude so big cards = bigger tug
  const cardBarContrib = (lastCardFp / tierTop) * 100;
  // A = amplitude in % of bar width. Min 12 so it's always perceptible.
  const A = Math.min(22, Math.max(12, cardBarContrib * 0.6));

  // Keyframe spring: hardcoded offsets as multiples of A
  // t=0: 0 (bar at real value, spring starts)
  // bounce 1: peaks at +A (t≈0.20)  — surges PAST landing spot
  // bounce 2: troughs at -0.8*A (t≈0.50) — pulls BACK below landing spot
  // bounce 3: peaks at +0.4*A (t≈0.75) — small forward again
  // t=1: 0 (lands exactly on truth)
  //
  // Implemented as piecewise linear between keyframes so the values are exact.
  // Keyframes: [t, offset_multiple_of_A]
  const KEYS: [number, number][] = [
    [0.00, 0.0],   // start: bar at real value
    [0.35, 1.0],   // +A   : surge forward past target  (feels like launch)
    [0.60, -0.8],   // -0.8A: pulled back BELOW target   (the tug back)
    [0.80, 0.4],   // +0.4A: small bounce forward again
    [1.00, 0.0],   // land exactly on truth
  ];

  function springAtT(t: number): number {
    for (let i = 0; i < KEYS.length - 1; i++) {
      const [t0, v0] = KEYS[i];
      const [t1, v1] = KEYS[i + 1];
      if (t >= t0 && t <= t1) {
        const frac = (t - t0) / (t1 - t0);
        // Ease in-out within each segment for smooth transitions
        const e = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
        return (v0 + (v1 - v0) * e) * A;
      }
    }
    return 0;
  }

  const isRevealing = gameState === "REVEALING";
  const p = lastCardProgress;

  let springOffset = 0;
  if (isRevealing && p >= 0.65 && p < 1.0) {
    const t = (p - 0.65) / 0.35; // normalize last 35% to 0→1
    springOffset = springAtT(Math.min(t, 1));
  }

  const rawDisplayPct = showBar ? fillPct + springOffset : 0;
  const displayPct = Math.min(99, Math.max(0, rawDisplayPct));
  const isLive = Math.abs(springOffset) > 0.4;

  const { color: displayColor, glow: displayGlow } = isLive
    ? getColorAt(displayPct)
    : { color, glow };

  // Dot scale: blooms on positive overshoot, squishes slightly on negative bounce
  const dotScale = springOffset > 0
    ? 1 + (springOffset / A) * 2.0
    : 1 + (springOffset / A) * 0.4; // subtle squish on pullback

  // Signal GameBar to reveal celebration content once WIN_CELEBRATION starts
  const settledFiredRef = useRef(false);
  useEffect(() => {
    if (!isCelebration) { settledFiredRef.current = false; return; }
    if (!settledFiredRef.current) {
      settledFiredRef.current = true;
      onOvershootSettled();
    }
  }, [isCelebration]); // eslint-disable-line

  const barH = isCelebration ? 14 : 11;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 12, fontWeight: 900, letterSpacing: -0.2, fontFamily: FF, fontStyle: "italic",
          color: showBar ? displayColor : "rgba(255,255,255,0.30)",
          transition: isLive ? "none" : "color 400ms ease",
        }}>
          {showBar ? `${totalFp.toFixed(1)} FP` : ""}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.1, fontFamily: FF,
          color: showBar ? (fptNeeded === 0 ? displayColor : "rgba(255,255,255,0.50)") : "rgba(255,255,255,0.30)",
        }}>
          {showBar
            ? fptNeeded > 0 ? `${fptNeeded.toFixed(1)} FP to ${label}` : `✓ ${label}`
            : `${winTiers[0].minFp} FP to ${winTiers[0].label}`}
        </span>
      </div>

      <div style={{
        width: "100%", height: barH,
        background: "rgba(255,255,255,0.10)",
        borderRadius: 6, overflow: "visible", position: "relative",
        transition: "height 200ms ease",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${displayPct}%`,
          background: `linear-gradient(90deg, ${displayColor}66 0%, ${displayColor} 100%)`,
          borderRadius: 6,
          boxShadow: displayPct > 5 ? `0 0 ${10 + Math.abs(springOffset) * 0.5}px ${displayGlow}` : "none",
          transition: isLive ? "none" : "width 160ms ease-out, background 300ms ease",
        }} />

        {showBar && displayPct > 2 && (
          <div style={{
            position: "absolute", top: "50%",
            left: `calc(${Math.min(displayPct, 98)}% - ${isCelebration ? 6 : 4}px)`,
            width: isCelebration ? 12 : 8,
            height: isCelebration ? 12 : 8,
            borderRadius: "50%",
            background: displayColor,
            boxShadow: `0 0 ${8 + Math.abs(springOffset) * 0.8}px ${displayGlow}`,
            transform: `translateY(-50%) scale(${Math.max(0.7, dotScale)})`,
            transition: isLive ? "none" : "all 300ms ease",
            animation: (!isLive && !isCelebration) ? "tipPulse 1.4s ease-in-out infinite" : "none",
            zIndex: 2,
          }} />
        )}
        <style>{`
          @keyframes tipPulse { 0%,100%{opacity:1;transform:translateY(-50%) scale(1)} 50%{opacity:.4;transform:translateY(-50%) scale(2)} }
          @keyframes nearMissPulse { 0%,100%{opacity:0.15} 50%{opacity:0.55} }
          @keyframes legendIconPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.2)} }
        `}</style>
        {/* FTUE near-miss pulsing segment — shows gap from current fill to next tier */}
        {ftuePulseNearMiss && fptNeeded > 0 && displayPct < 99 && (() => {
          const nextTierPct = Math.min(100, displayPct + (fptNeeded / tierTop) * 100);
          const gapWidth = Math.max(1, nextTierPct - displayPct);
          return (
            <div style={{
              position: "absolute", left: `${displayPct}%`, top: 0, bottom: 0,
              width: `${gapWidth}%`,
              background: "linear-gradient(90deg, #C084FC33, #C084FC88)",
              borderRadius: "0 6px 6px 0",
              animation: "nearMissPulse 1.0s ease-in-out infinite",
            }} />
          );
        })()}
      </div>
    </div>
  );
}


// ── Legend modal (unchanged) ────────────────────────────────────────────────

const colHdr: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: 1,
  textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
};

function LegendModal({ onClose, legend }: { onClose: () => void; legend: LegendData }) {
  const [tab, setTab] = useState<"payouts" | "scoring" | "badges">("payouts");
  // Live countdown to next UTC midnight — updates every second while modal is open.
  const [countdown, setCountdown] = useState<string>(() => formatBonusCountdownLocal());
  useEffect(() => {
    const interval = setInterval(() => setCountdown(formatBonusCountdownLocal()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      paddingBottom: "10vh", paddingLeft: 16, paddingRight: 16,
      animation: "fadeInBg 200ms ease",
    }}>
      <style>{`
        @keyframes fadeInBg { from{opacity:0} to{opacity:1} }
        @keyframes slideUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
      <div onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()} style={{
        background: "linear-gradient(160deg,#0E1628 0%,#080E1C 100%)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18,
        width: "100%", maxWidth: 380, height: "78vh",
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
              {legend.todaysStars && legend.todaysStars.length > 0 && (
                <div style={{ marginBottom: 10, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "#FFD700", textTransform: "uppercase" }}>
                      ★ TODAY'S HOT PLAYERS
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
                      NEW IN {countdown}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {legend.todaysStars.map(s => {
                      const bonus = s.bonus ?? 5;
                      const starCount = bonus === 20 ? 3 : bonus === 10 ? 2 : 1;
                      const stars = "★".repeat(starCount);
                      return (
                        <div key={s.basePlayerId} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 10,
                          background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)",
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#EAF0FF" }}>{s.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, color: "#FFD700", letterSpacing: 1 }}>{stars}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#FFD700", minWidth: 28, textAlign: "right" }}>+{bonus}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9, color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}>
                    Pick these players — they add bonus FP on top of their real game. Rotates at UTC midnight.
                  </div>
                  {/* Mystery score target */}
                  {legend.mysteryScore != null && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(138,43,226,0.12)", border: "1px solid rgba(138,43,226,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(138,43,226,0.8)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Mystery Score
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "#B366FF", fontVariantNumeric: "tabular-nums" }}>
                        {legend.mysteryScore.toFixed(1)} FP = +{legend.mysteryBonus ?? 200}
                      </span>
                    </div>
                  )}
                </div>
              )}
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

              {legend.bonusRows && legend.bonusRows.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "#FFD700", textTransform: "uppercase", marginBottom: 10 }}>
                    Streak Wins
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {legend.bonusRows.map(r => (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.22)" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 900, color: "#FFD700", letterSpacing: 0.5 }}>{r.label}</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginLeft: 8 }}>{r.condition}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 900, color: "#FFD700", whiteSpace: "nowrap" }}>{r.reward}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
                    Bonus pool funded by 5% rake per hand. Resets after payout.
                  </div>
                </div>
              )}
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
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>CARD TEMPERATURE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🔥</span>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF" }}>Fire</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginLeft: 8 }}>Player exceeded their average FP</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🧊</span>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF" }}>Ice</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginLeft: 8 }}>Player fell below their average FP</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "badges" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {legend.badges.length > 0 && (<>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginTop: 8, marginBottom: 4 }}>BADGES</div>
                {legend.badges.map(b => (
                  <div key={b.label} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: "#EAF0FF", marginBottom: 3 }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{b.condition}</div>
                    </div>
                    {b.fp != null && (
                      <span style={{
                        fontSize: 13, fontWeight: 900, flexShrink: 0,
                        color: b.fp < 0 ? "#FF6B6B" : "#FFD700",
                      }}>{b.fp > 0 ? "+" : ""}{b.fp}</span>
                    )}
                  </div>
                ))}
              </>)}
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

// ── CelebrationTop ───────────────────────────────────────────────────────────
// Shown in Zone A after the overshoot has settled.
// Tier name (large) + coins won (large) side by side.
// Tapping triggers coin-fly-to-wallet animation then calls onDismiss.

function CelebrationTop({
  celebration, onDismiss, walletRef,
}: {
  celebration: CelebrationData;
  onDismiss: () => void;
  walletRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [phase, setPhase] = useState(0);
  const [burst, setBurst] = useState(false);
  const [flying, setFlying] = useState(false);
  const coinsRef = useRef<HTMLDivElement>(null);
  const animPay = useCountUp(celebration.payout, 850, 200);

  useEffect(() => {
    setPhase(0); setBurst(false); setFlying(false);
    const t1 = setTimeout(() => setPhase(1), 40);
    const t2 = setTimeout(() => { setPhase(2); if (!celebration.isBust) setBurst(true); }, 260);
    const t3 = setTimeout(() => setBurst(false), 1260);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [celebration]);

  function handleTap() {
    if (celebration.isBust || celebration.payout === 0) { onDismiss(); return; }
    if (flying) return;
    // Launch coin particles from coins element toward wallet
    setFlying(true);
    setTimeout(onDismiss, 520);
  }

  return (
    <div
      onClick={handleTap}
      style={{
        width: "100%", height: "100%", position: "relative",
        display: "flex", flexDirection: "row",
        alignItems: "center", justifyContent: "center",
        gap: 16, cursor: "pointer", overflow: "hidden",
      }}
    >
      <CoinBurst active={burst} color={celebration.tierColor} />
      {flying && walletRef.current != null && coinsRef.current && (
        <CoinFlyToWallet
          fromEl={coinsRef.current}
          toEl={walletRef.current}
          color={celebration.tierColor}
          count={Math.min(8, Math.max(3, Math.round(celebration.payout / 30)))}
        />
      )}

      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse at 50% 50%, ${celebration.tierGlow} 0%, transparent 68%)`,
      }} />

      {/* Tier name */}
      <div style={{
        position: "relative", zIndex: 1, textAlign: "center",
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.34s ease, transform 0.34s ease",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontFamily: FF, marginBottom: 1 }}>
          {celebration.isBust ? "Result" : "You hit"}
        </div>
        <div style={{
          fontSize: 40, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1,
          color: celebration.tierColor, fontFamily: FF, textTransform: "uppercase",
          textShadow: `0 0 28px ${celebration.tierGlow}, 0 0 50px ${celebration.tierGlow}55`,
        }}>
          {celebration.tierLabel}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 48, background: "rgba(255,255,255,0.10)", flexShrink: 0, opacity: phase >= 1 ? 0.6 : 0, transition: "opacity 0.4s ease 0.1s" }} />

      {/* Coins */}
      <div ref={coinsRef} style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
        opacity: phase >= 2 ? 1 : 0,
        transform: phase >= 2 ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.9)",
        transition: "opacity 0.34s ease, transform 0.34s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 20 }}>{celebration.isBust ? "💸" : "🪙"}</span>
          <span style={{
            fontSize: 40, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1,
            color: celebration.isBust ? "#555" : "#FFD700",
            textShadow: celebration.isBust ? "none" : "0 0 22px #FFD70060",
            fontFamily: FF, fontVariantNumeric: "tabular-nums",
          }}>
            {celebration.isBust ? "0" : `+${animPay}`}
          </span>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
          color: celebration.isBust ? "#444" : "#FFD700",
          fontFamily: FF,
          animation: celebration.isBust ? "none" : "tapCollectPulse 1.1s ease-in-out infinite",
        }}>
          {celebration.isBust ? "no payout" : "tap to collect"}
        </div>
      </div>
    </div>
  );
}


// ── CoinFlyToWallet ──────────────────────────────────────────────────────────
// Spawns coin particles that arc from the coins display toward the wallet element.

function CoinFlyToWallet({
  fromEl, toEl, color, count,
}: {
  fromEl: HTMLElement | null;
  toEl: HTMLElement | null;
  color: string;
  count: number;
}) {
  const [particles, setParticles] = useState<
    { id: number; sx: number; sy: number; ex: number; ey: number; delay: number }[]
  >([]);

  useEffect(() => {
    if (!fromEl || !toEl) return;
    const fromR = fromEl.getBoundingClientRect();
    const toR = toEl.getBoundingClientRect();
    const sx = fromR.left + fromR.width / 2;
    const sy = fromR.top + fromR.height / 2;
    const ex = toR.left + toR.width / 2;
    const ey = toR.top + toR.height / 2;

    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        sx: sx + (Math.random() - 0.5) * 24,
        sy: sy + (Math.random() - 0.5) * 16,
        ex: ex + (Math.random() - 0.5) * 14,
        ey: ey + (Math.random() - 0.5) * 10,
        delay: i * 42,
      }))
    );
  }, []);

  if (!particles.length) return null;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.sx, top: p.sy,
            width: 10, height: 10,
            borderRadius: "50%",
            background: "#FFD700",
            boxShadow: `0 0 8px #FFD700, 0 0 16px ${color}`,
            animationName: `coinfly_${p.id}`,
            animationDuration: "480ms",
            animationDelay: `${p.delay}ms`,
            animationFillMode: "both",
            animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      ))}
      <style>{particles.map((p) => `
        @keyframes coinfly_${p.id} {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          60%  { opacity: 1; }
          100% { transform: translate(${p.ex - p.sx}px, ${p.ey - p.sy}px) scale(0.25); opacity: 0; }
        }
      `).join("")}</style>
    </div>
  );
}


// ── CoinFlyFromPoint ─────────────────────────────────────────────────────────
// Same as CoinFlyToWallet but origin is a fixed {x,y} point (tap position).
function CoinFlyFromPoint({
  sx, sy, toEl, color, count,
}: {
  sx: number; sy: number;
  toEl: HTMLElement | null;
  color: string;
  count: number;
}) {
  const [particles, setParticles] = useState<
    { id: number; sx: number; sy: number; ex: number; ey: number; delay: number }[]
  >([]);

  useEffect(() => {
    if (!toEl) return;
    const toR = toEl.getBoundingClientRect();
    const ex = toR.left + toR.width / 2;
    const ey = toR.top + toR.height / 2;
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        sx: sx + (Math.random() - 0.5) * 40,
        sy: sy + (Math.random() - 0.5) * 40,
        ex: ex + (Math.random() - 0.5) * 14,
        ey: ey + (Math.random() - 0.5) * 10,
        delay: i * 38,
      }))
    );
  }, []);

  if (!particles.length) return null;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.sx, top: p.sy,
            width: 10, height: 10,
            borderRadius: "50%",
            background: "#FFD700",
            boxShadow: `0 0 8px #FFD700, 0 0 16px ${color}`,
            animationName: `coinfly_pt_${p.id}`,
            animationDuration: "480ms",
            animationDelay: `${p.delay}ms`,
            animationFillMode: "both",
            animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      ))}
      <style>{particles.map((p) => `
        @keyframes coinfly_pt_${p.id} {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          60%  { opacity: 1; }
          100% { transform: translate(${p.ex - p.sx}px, ${p.ey - p.sy}px) scale(0.25); opacity: 0; }
        }
      `).join("")}</style>
    </div>
  );
}

// ── CelebrationBottom ────────────────────────────────────────────────────────

function CelebrationBottom({ celebration, onDismiss, isFTUE = false }: { celebration: CelebrationData; onDismiss: () => void; isFTUE?: boolean }) {
  const [visible, setVisible] = useState(false);
  const copy = getStreakCopy(celebration.streak, celebration.isBust);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, [celebration]);

  const pipColor = celebration.isBust ? "#FF3B30" : "#FF8C00";
  const pipGlow = celebration.isBust ? "#FF3B3055" : "#FF8C0055";

  return (
    <div
      onClick={onDismiss}
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 6, cursor: "pointer",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.42s ease, transform 0.42s ease",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: celebration.isBust ? "rgba(255,59,48,0.07)" : "rgba(255,140,0,0.08)",
        border: `1px solid ${celebration.isBust ? "#FF3B3020" : "#FF8C0020"}`,
        borderRadius: 10, padding: "12px 14px",
      }}>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
          {isFTUE ? (
            // FTUE: always show 1 solid + 2 empty dots
            <>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: pipColor, boxShadow: `0 0 7px ${pipGlow}` }} />
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "transparent", border: `1.5px solid ${pipColor}55` }} />
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "transparent", border: `1.5px solid ${pipColor}55` }} />
            </>
          ) : (
            <>
              {Array.from({ length: Math.max(1, Math.min(celebration.streak, 6)) }).map((_: unknown, i: number) => (
                <div key={i} style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: celebration.streak === 0 ? "#333" : pipColor,
                  boxShadow: celebration.streak === 0 ? "none" : `0 0 7px ${pipGlow}`,
                  animation: `pip_in 0.28s ease ${i * 0.06}s both`,
                }} />
              ))}
              {celebration.streak > 6 && (
                <span style={{ fontSize: 10, color: pipColor, alignSelf: "center", fontFamily: FF, marginLeft: 2 }}>
                  +{celebration.streak - 6}
                </span>
              )}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: pipColor, fontFamily: FF, lineHeight: 1.2 }}>
            {isFTUE ? "WIN STREAK STARTED 🔥" : copy.head}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontFamily: FF }}>
            {isFTUE ? "Unlock 23-24 Season" : copy.sub}
          </div>
        </div>
        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>›</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.12)", letterSpacing: "0.08em", fontFamily: FF }}>
        XP coming soon ⚡
      </div>
      <style>{`@keyframes pip_in { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} } @keyframes tapCollectPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
    </div>
  );
}


// ── Wage animation keyframes ─────────────────────────────────────────────────
const WAGE_STYLE_ID = "gb-wage-anim";
if (typeof document !== "undefined" && !document.getElementById(WAGE_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = WAGE_STYLE_ID;
  st.textContent = `
    @keyframes wageMultGlow {
      0%   { transform: scale(1);    filter: brightness(1);   opacity: 1; }
      30%  { transform: scale(1.35); filter: brightness(2.4) drop-shadow(0 0 8px currentColor); opacity: 1; }
      60%  { transform: scale(1.12); filter: brightness(1.7) drop-shadow(0 0 4px currentColor); opacity: 1; }
      100% { transform: scale(1);    filter: brightness(1);   opacity: 1; }
    }
    @keyframes tierMultThud {
      0%   { transform: translateY(-44px) scale(0.5); opacity: 0; }
      52%  { transform: translateY(6px)   scale(1.22); opacity: 1; }
      70%  { transform: translateY(-3px)  scale(0.94); opacity: 1; }
      84%  { transform: translateY(2px)   scale(1.04); opacity: 1; }
      100% { transform: translateY(0)     scale(1);    opacity: 1; }
    }
    @keyframes wageFlipOut {
      0%   { transform: perspective(300px) rotateX(0deg);  opacity: 1; }
      100% { transform: perspective(300px) rotateX(90deg); opacity: 0; }
    }
    @keyframes payoutFlipIn {
      0%   { transform: perspective(300px) rotateX(-90deg); opacity: 0; }
      100% { transform: perspective(300px) rotateX(0deg);   opacity: 1; }
    }
    @keyframes payoutFlyToBalance {
      0%   { transform: translateX(0)      scale(1);    opacity: 1; }
      30%  { transform: translateX(-12px)  scale(1.12); opacity: 1; }
      100% { transform: translateX(-110px) scale(0.3);  opacity: 0; }
    }
    @keyframes balanceBlink {
      0%   { color: #FFFFFF; }
      15%  { color: var(--blink-color); filter: drop-shadow(0 0 6px var(--blink-color)); }
      45%  { color: var(--blink-color); filter: drop-shadow(0 0 4px var(--blink-color)); }
      100% { color: #FFFFFF; filter: none; }
    }
  `;
  document.head.appendChild(st);
}

// ── Wage animation state machine ──────────────────────────────────────────
type WagePhase = "idle" | "glow" | "thud" | "flip" | "fly" | "settled";

function WageDisplay({
  baseBet, betMultiplier, celebration, onFlyComplete,
}: {
  baseBet: number;
  betMultiplier: number;
  celebration?: CelebrationData;
  onFlyComplete: (isLoss: boolean) => void;
}) {
  const [phase, setPhase] = useState<WagePhase>("idle");
  const prevKeyRef = useRef<string>("");
  const timersRef  = useRef<number[]>([]);

  useEffect(() => {
    if (!celebration) {
      setPhase("idle");
      prevKeyRef.current = "";
      timersRef.current.forEach(clearTimeout);
      return;
    }
    const key = `${celebration.payout}-${celebration.tierMultiplier}-${celebration.betMultiplier}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const t1 = window.setTimeout(() => setPhase("glow"),    0);
    const t2 = window.setTimeout(() => setPhase("thud"),    800);
    const t3 = window.setTimeout(() => setPhase("flip"),   2000);
    const t4 = window.setTimeout(() => setPhase("fly"),    2500);
    const t5 = window.setTimeout(() => {
      setPhase("settled");
      onFlyComplete(celebration?.isLoss ?? true);
    }, 3150);
    timersRef.current = [t1, t2, t3, t4, t5];
    return () => timersRef.current.forEach(clearTimeout);
  }, [celebration]); // eslint-disable-line

  const isWin    = celebration ? !celebration.isLoss : true;
  const payout   = celebration?.payout ?? 0;
  const loss     = celebration?.lossAmount ?? 0;
  const tierMult = celebration?.tierMultiplier ?? 0;
  const amount   = isWin ? payout : loss;
  const sign     = isWin ? "+" : "-";
  const amtColor = isWin ? "#22C55E" : "#FF3B30";

  const multColor = betMultiplier === 10 ? "#FB923C"
    : betMultiplier === 5  ? "#C084FC"
    : betMultiplier === 3  ? "#3B82F6"
    : "#22C55E";

  const wageLabel = (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
      color: "rgba(255,255,255,0.38)", textTransform: "uppercase" as const,
      flexShrink: 0,
    }}>Wage</span>
  );

  if (phase === "idle" || !celebration) {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {wageLabel}
        <span style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
          {baseBet}
        </span>
        {betMultiplier > 1 && (
          <span style={{ fontSize: 13, fontWeight: 800, color: multColor, lineHeight: 1 }}>
            ×{betMultiplier}
          </span>
        )}
      </div>
    );
  }

  if (phase === "glow") {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {wageLabel}
        <span style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
          {baseBet}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 800, color: multColor, lineHeight: 1,
          display: "inline-block",
          animation: "wageMultGlow 700ms cubic-bezier(0.22,1,0.36,1) forwards",
        }}>
          ×{betMultiplier}
        </span>
      </div>
    );
  }

  if (phase === "thud") {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, overflow: "visible" }}>
        {wageLabel}
        <span style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
          {baseBet}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: multColor, lineHeight: 1 }}>
          ×{betMultiplier}
        </span>
        {tierMult > 0 && (
          <span style={{
            fontSize: 14, fontWeight: 900, color: "#FFD700", lineHeight: 1,
            display: "inline-block",
            animation: "tierMultThud 500ms cubic-bezier(0.22,1,0.36,1) forwards",
          }}>
            ×{tierMult}
          </span>
        )}
      </div>
    );
  }

  if (phase === "flip") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {wageLabel}
        <div style={{ position: "relative", height: 20, minWidth: 60 }}>
          <span style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)",
            whiteSpace: "nowrap",
            animation: "wageFlipOut 220ms ease-in forwards",
          }}>
            {baseBet}{betMultiplier > 1 ? ` ×${betMultiplier}` : ""}{tierMult > 0 ? ` ×${tierMult}` : ""}
          </span>
          <span style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            fontSize: 17, fontWeight: 900, color: amtColor,
            whiteSpace: "nowrap", opacity: 0,
            animation: "payoutFlipIn 280ms ease-out 220ms forwards",
          }}>
            {sign}{amount}
          </span>
        </div>
      </div>
    );
  }

  if (phase === "fly") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {wageLabel}
        <span style={{
          fontSize: 17, fontWeight: 900, color: amtColor,
          whiteSpace: "nowrap", display: "inline-block",
          animation: "payoutFlyToBalance 600ms ease-in forwards",
        }}>
          {sign}{amount}
        </span>
      </div>
    );
  }

  // settled — static until Replay
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {wageLabel}
      <span style={{ fontSize: 17, fontWeight: 900, color: amtColor, lineHeight: 1, whiteSpace: "nowrap" }}>
        {sign}{amount}
      </span>
    </div>
  );
}

// ── GameBar ─────────────────────────────────────────────────────────────────

export function GameBar({
  gameState, balance, isBalanceAnimating, totalFp,
  lastCardProgress = 0,
  lastCardFp = 0,
  capMax, capUsed, lockedSalary, revealedSalary,
  betMultiplier, baseBet, onBetMultiplier, onAction,
  winTiers, legend,
  celebration, onWinCelebrationComplete, onWageAnimationComplete,
  ftueDrawBlocked = false,
  ftueHideSkip = false,
  ftuePulseNearMiss = false,
  ftueReplayBlocked = false,
  ftueReplayPulse = false,
  ftueHideBalance = false,
  dataFtuePrimaryAnchor,
  hideTierBar = false,
  tierGaugeSlot,
  splitFooter,
  splitMultiplierRowVisible = true,
  onViewLeaderboard,
  legendPulsing = false,
  trophyPulsing = false,
  streak = 0,
  onLegendOpened,
  onTrophyOpened,
}: Props) {
  // Trophy button: 36×36 circular, sits absolutely positioned right of the
  // action button row's container. Border + icon flip to gold once the user
  // has landed on the daily leaderboard (rm_on_board_today === "1"). Hidden
  // during FTUE (gated on ftueHideSkip).
  const trophyOnBoard = (() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("rm_on_board_today") === "1"; } catch { return false; }
  })();
  const TrophyButton = onViewLeaderboard && !ftueHideSkip ? (
    <button
      type="button"
      aria-label="View leaderboard"
      onClick={onViewLeaderboard}
      style={{
        position: "absolute",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "transparent",
        border: `1px solid ${trophyOnBoard ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.1)"}`,
        color: trophyOnBoard ? "#FFD700" : "rgba(255,255,255,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 16,
        padding: 0,
      }}
    >
      🏆
    </button>
  ) : null;
  const betLocked = gameState === "DEALING" || gameState === "DRAWING" || gameState === "REVEALING";
  const splitRequested = splitFooter != null;
  const split =
    splitRequested &&
    splitFooter!.multipliersHost != null &&
    splitFooter!.controlsHost != null;
  const [showLegend, setShowLegend] = useState(false);
  const isCelebration = gameState === "WIN_CELEBRATION" && !!celebration;

  // overshootSettled: false until TierBar calls back that the tug animation is done.
  // Zone A shows celebration content only after this is true.
  const [overshootSettled, setOvershootSettled] = useState(false);
  const showCelebContent = isCelebration && overshootSettled;

  // Reset when leaving celebration
  useEffect(() => {
    if (!isCelebration) { setOvershootSettled(false); setBalanceColor("default"); }
  }, [isCelebration]);

  const prevStreakRef = useRef(streak);
  // Update prev streak after render so flash/extinguish can compare
  useEffect(() => { prevStreakRef.current = streak; }, [streak]);

  const walletRef = useRef<HTMLDivElement>(null);
  // walletTargetRef: invisible anchor outside the blur zone — coins fly to this
  const walletTargetRef = useRef<HTMLDivElement>(null);
  // Coin fly state — tapping anywhere in celebration triggers this
  const [celebFlying, setCelebFlying] = useState(false);
  const [balanceColor, setBalanceColor] = useState<"win" | "loss" | "default">("default");
  const [tapOrigin, setTapOrigin] = useState<{ x: number; y: number } | null>(null);
  // Wallet display balance — lags real balance so roll-up starts when coins land
  const [displayBalance, setDisplayBalance] = useState(balance);
  useEffect(() => {
    // Update display balance immediately — timing controlled by onFlyComplete
    setDisplayBalance(balance);
  }, [balance]);

  function handleCelebTap(e: React.MouseEvent) {
    if (!showCelebContent || !onWinCelebrationComplete) return;
    if (celebFlying) return;
    const payout = celebration?.payout ?? 0;
    if (payout > 0) {
      setTapOrigin({ x: e.clientX, y: e.clientY });
      setCelebFlying(true);
      setTimeout(() => {
        setCelebFlying(false);
        setTapOrigin(null);
        onWinCelebrationComplete();
      }, 520);
    } else {
      onWinCelebrationComplete();
    }
  }

  // Keep walletTarget synced to wallet position so coins land in the right spot
  useEffect(() => {
    if (!walletRef.current || !walletTargetRef.current) return;
    const sync = () => {
      const r = walletRef.current!.getBoundingClientRect();
      const t = walletTargetRef.current!;
      t.style.position = "fixed";
      t.style.left = `${r.left}px`;
      t.style.top = `${r.top}px`;
      t.style.width = `${r.width}px`;
      t.style.height = `${r.height}px`;
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [showCelebContent]);

  const spent = salarySpent(gameState, capUsed, lockedSalary, revealedSalary);
  const remaining = capMax - spent;
  const overBudget = remaining < 0;

  /** Active (selected) multiplier: text + border + bg tint per tier.
   *  Matches tier palette: 1x=green (ROOKIE), 3x=blue (STARTER), 5x=purple (ALL_STAR), 10x=orange (MVP). */
  const MULTIPLIER_ACTIVE: Record<number, { text: string; border: string; bg: string }> = {
    1: { text: "#22C55E", border: "#22C55E", bg: "rgba(34,197,94,0.18)" },
    3: { text: "#3B82F6", border: "#3B82F6", bg: "rgba(59,130,246,0.18)" },
    5: { text: "#C084FC", border: "#C084FC", bg: "rgba(192,132,252,0.18)" },
    10: { text: "#FB923C", border: "#FB923C", bg: "rgba(251,146,60,0.18)" },
  };

  const multiplierRow = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", width: "100%", boxSizing: "border-box", padding: "0 10px" }}>
      {MULTIPLIERS.map((m: number) => {
        const active = betMultiplier === m;
        const ma = MULTIPLIER_ACTIVE[m] ?? MULTIPLIER_ACTIVE[1];
        return (
          <button key={m} onClick={() => {
            track("gameplay", "multiplier_selected", { multiplier: m, previous: betMultiplier });
            onBetMultiplier(m);
          }} disabled={betLocked} style={{
            background: active ? ma.bg : THEME.button.multiplier.inactive.bg,
            border: active ? `1px solid ${ma.border}` : THEME.button.multiplier.inactive.border,
            borderRadius: 14,
            color: active ? ma.text : "#6B7280",
            fontWeight: 900, fontSize: active ? 15 : 13,
            padding: active ? "10px" : "8px",
            cursor: betLocked ? "default" : "pointer",
            opacity: betLocked ? 0.4 : 1,
            boxShadow: "none",
            transition: "all 200ms ease", lineHeight: 1,
            flex: 1, maxWidth: 80,
          }}>{m}X</button>
        );
      })}
    </div>
  );

  const controlsFooter = (
    <>
      <div ref={walletTargetRef} style={{ pointerEvents: "none", zIndex: 9998 }} />
      {celebFlying && tapOrigin && walletTargetRef.current && (
        <CoinFlyFromPoint
          sx={tapOrigin.x}
          sy={tapOrigin.y}
          toEl={walletTargetRef.current}
          color="#FFD700"
          count={Math.min(8, Math.max(3, Math.round((celebration?.payout ?? 0) / 30)))}
        />
      )}
      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        flex: 1,
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        boxSizing: "border-box",
      }}>
        <div style={{
          filter: showCelebContent ? "blur(5px)" : "none",
          opacity: showCelebContent ? 0 : 1,
          transition: "filter 0.35s ease, opacity 0.35s ease",
          pointerEvents: showCelebContent ? "none" : "auto",
        }}>
          {/* Wage display — invisible, drives the payout animation callback */}
          <div style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
            <div ref={walletRef} />
            <WageDisplay
              baseBet={baseBet}
              betMultiplier={betMultiplier}
              celebration={isCelebration ? celebration : undefined}
              onFlyComplete={(isLoss) => {
                setBalanceColor(isLoss ? "loss" : "win");
                if (celebration && (celebration.payout > 0 || celebration.isLoss)) {
                  setCelebFlying(true);
                }
                onWageAnimationComplete?.();
              }}
            />
          </div>

          {/* Icon blink + Streak flash + extinguish keyframes */}
          <style>{`
            @keyframes iconBlink {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.3; transform: scale(0.92); }
            }
            @keyframes streakFlash {
              0% { transform: scale(1); filter: brightness(1); }
              30% { transform: scale(1.8); filter: brightness(2.5) drop-shadow(0 0 6px rgba(255,160,0,0.9)); }
              100% { transform: scale(1); filter: brightness(1); }
            }
            @keyframes streakExtinguish {
              0% { opacity: 1; filter: none; }
              30% { transform: scale(1.3); filter: brightness(1.5); }
              60% { opacity: 0.6; filter: grayscale(0.5); }
              100% { opacity: 0.2; filter: grayscale(1); }
            }
          `}</style>

          {/* Streak row — stretched across line, tiers unlock progressively */}
          {streak != null && !ftueHideSkip && (
            <div style={{ display: "flex", alignItems: "center", paddingBottom: 4 }}>
              <StreakFireRow streak={streak} prevStreak={prevStreakRef.current} />
            </div>
          )}

          {/* Action row — 👛 wallet left, button center, legend+trophy right */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", paddingTop: 2, minHeight: 44 }}>
            {/* Wallet chip — left */}
            <div style={{ position: "absolute", left: 0, display: "flex", alignItems: "center", gap: 4, opacity: ftueHideBalance ? 0 : 1, transition: "opacity 0.3s ease" }}>

              <span style={{
                fontSize: 14, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                color: balanceColor === "win" ? "#22C55E" : balanceColor === "loss" ? "#FF3B30" : "#FFFFFF",
                filter: balanceColor !== "default" ? `drop-shadow(0 0 5px ${balanceColor === "win" ? "#22C55E88" : "#FF3B3088"})` : "none",
                transition: "color 300ms ease, filter 300ms ease",
              }}>
                $<RollingNumber value={displayBalance} decimals={0} duration={1200} />
              </span>
            </div>

            <button
              onClick={onAction}
              disabled={isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked}
              data-action={gameState === "IDLE" ? "deal" : gameState === "HOLD" ? "draw" : undefined}
              data-ftue-anchor={dataFtuePrimaryAnchor}
              style={{
                width: "min(168px, 50%)",
                borderRadius: THEME.button.action.borderRadius, border: "none",
                padding: "11px 0",
                fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                cursor: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "default" : "pointer",
                background: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "rgba(255,255,255,0.10)" : actionBackground(gameState),
                color: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "rgba(255,255,255,0.35)" : actionTextColor(gameState),
                opacity: (ftueHideSkip && gameState === "REVEALING") ? 0 : ftueReplayBlocked ? 0 : (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD")) ? 0.3 : 1,
                pointerEvents: (ftueHideSkip && gameState === "REVEALING" || ftueReplayBlocked) ? "none" as const : "auto" as const,
                boxShadow: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "none" : "0 4px 14px rgba(0,0,0,0.30)",
                transition: "opacity 300ms ease", lineHeight: 1,
                animation: ftueReplayPulse ? "ftueReplayPulse 1.2s ease-in-out infinite" : "none",
              }}>
              {ftueReplayPulse && <style>{`@keyframes ftueReplayPulse { 0%,100% { box-shadow: 0 4px 14px rgba(0,0,0,0.3); } 50% { box-shadow: 0 4px 14px rgba(0,0,0,0.3), 0 0 0 6px rgba(58,160,255,0.5), 0 0 20px rgba(58,160,255,0.3); } }`}</style>}
              {actionLabel(gameState)}
            </button>

            {/* Legend + trophy — right (both hidden during FTUE) */}
            <div style={{ position: "absolute", right: 0, display: ftueHideSkip ? "none" : "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => { setShowLegend(true); onLegendOpened?.(); }} style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: legendPulsing ? "rgba(255,215,0,0.9)" : "transparent",
                border: `2px solid ${legendPulsing ? "rgba(255,215,0,0.9)" : THEME.colors.surfaceStroke}`,
                color: legendPulsing ? "#070A12" : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 900, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                animation: legendPulsing ? "iconBlink 1.2s ease-in-out infinite" : "none",
              }}>i</button>
              {onViewLeaderboard && !ftueHideSkip && (
                <button
                  type="button"
                  aria-label="View leaderboard"
                  onClick={() => { onViewLeaderboard(); onTrophyOpened?.(); }}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: trophyPulsing ? "rgba(255,215,0,0.15)" : "transparent",
                    border: `1px solid ${trophyPulsing ? "rgba(255,215,0,0.7)" : trophyOnBoard ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.1)"}`,
                    color: trophyPulsing ? "#FFD700" : trophyOnBoard ? "#FFD700" : "rgba(255,255,255,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: 14, padding: 0,
                    animation: trophyPulsing ? "iconBlink 1.2s ease-in-out infinite" : "none",
                  }}
                >🏆</button>
              )}
            </div>
          </div>
        </div>

        {isCelebration && celebration && !ftueHideSkip && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "stretch", justifyContent: "flex-start",
            paddingTop: "12px",
            opacity: overshootSettled ? 1 : 0,
            transition: "opacity 0.4s ease",
            pointerEvents: overshootSettled ? "auto" : "none",
          }}>
            <CelebrationBottom
              celebration={celebration}
              onDismiss={onWinCelebrationComplete ?? (() => { })}
              isFTUE={false}
            />
          </div>
        )}
      </div>
    </>
  );

  if (splitRequested && !split) {
    return (
      <>
        {showLegend && ReactDOM.createPortal(
          <LegendModal onClose={() => setShowLegend(false)} legend={legend} />,
          document.body
        )}
      </>
    );
  }

  if (split) {
    return (
      <>
        {showLegend && ReactDOM.createPortal(
          <LegendModal onClose={() => setShowLegend(false)} legend={legend} />,
          document.body
        )}
        {ReactDOM.createPortal(
          splitMultiplierRowVisible ? multiplierRow : <></>,
          splitFooter!.multipliersHost as Element
        )}
        {ReactDOM.createPortal(controlsFooter, splitFooter!.controlsHost as Element)}
      </>
    );
  }

  return (
    <>
      {showLegend && ReactDOM.createPortal(
        <LegendModal onClose={() => setShowLegend(false)} legend={legend} />,
        document.body
      )}

      <div
        style={{
          display: "flex", flexDirection: "column", position: "relative",
          cursor: "default",
        }}>

        {/* Zone A removed — score/budget and celebration handled in GameView */}

        {/* ── ZONE B: Tier gauge — hidden when external TierGauge is used ── */}
        {!hideTierBar && <div style={{
          paddingTop: 10, paddingBottom: 10,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <TierBar
            totalFp={totalFp}
            gameState={gameState === "WIN_CELEBRATION" ? "RESULTS" : gameState}
            winTiers={winTiers}
            isCelebration={isCelebration}
            lastCardProgress={lastCardProgress}
            lastCardFp={lastCardFp}
            onOvershootSettled={() => setOvershootSettled(true)}
            ftuePulseNearMiss={ftuePulseNearMiss}
          />
        </div>}

        {/* Invisible wallet target for coin fly — lives outside blur zone */}
        <div ref={walletTargetRef} style={{ pointerEvents: "none", zIndex: 9998 }} />

        {/* Coin fly from tap point → wallet */}
        {celebFlying && tapOrigin && walletTargetRef.current && (
          <CoinFlyFromPoint
            sx={tapOrigin.x}
            sy={tapOrigin.y}
            toEl={walletTargetRef.current}
            color="#FFD700"
            count={Math.min(8, Math.max(3, Math.round((celebration?.payout ?? 0) / 30)))}
          />
        )}

        {/* ── ZONE B.5: external TierGauge slot (e.g. GameView) — omit wrapper when unused so footer height isn’t reserved ── */}
        {tierGaugeSlot != null && tierGaugeSlot !== false && (
          <div style={{ height: 54, flexShrink: 0, overflow: "visible", marginBottom: 12 }}>
            {tierGaugeSlot}
          </div>
        )}

        {/* ── ZONE C: Multipliers/Wallet/Action ↔ Streak hook ─────── */}
        <div style={{ position: "relative", overflow: "hidden", paddingBottom: "max(32px, env(safe-area-inset-bottom, 20px))" }}>

          {/* Normal content */}
          <div style={{
            filter: showCelebContent ? "blur(5px)" : "none",
            opacity: showCelebContent ? 0 : 1,
            transition: "filter 0.35s ease, opacity 0.35s ease",
            pointerEvents: showCelebContent ? "none" : "auto",
          }}>
            {multiplierRow}

            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, marginBottom: 6, opacity: ftueHideBalance ? 0 : 1, pointerEvents: ftueHideBalance ? "none" as const : "auto" as const, transition: "opacity 0.3s ease" }}>
              {/* Balance — left */}
              <div ref={walletRef} style={{ flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Balance</span>
                  <span style={{
                  fontSize: 17, fontWeight: 900, lineHeight: 1,
                  color: balanceColor === "win" ? "#22C55E" : balanceColor === "loss" ? "#FF3B30" : "#FFFFFF",
                  filter: balanceColor !== "default" ? `drop-shadow(0 0 5px ${balanceColor === "win" ? "#22C55E88" : "#FF3B3088"})` : "none",
                  transition: "color 300ms ease, filter 300ms ease",
                }}>
                    $<RollingNumber value={displayBalance} decimals={0} duration={1200} />
                  </span>
                </div>
              </div>

              {/* Wage — true center */}
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
                <WageDisplay
                  baseBet={baseBet}
                  betMultiplier={betMultiplier}
                  celebration={isCelebration ? celebration : undefined}
                  onFlyComplete={(isLoss) => {
                    setBalanceColor(isLoss ? "loss" : "win");
                    if (celebration && (celebration.payout > 0 || celebration.isLoss)) {
                      setCelebFlying(true);
                    }
                    onWageAnimationComplete?.();
                  }}
                />
              </div>

              {/* Legend — right (hidden during FTUE) */}
              {!ftueHideSkip && (
                <button onClick={() => setShowLegend(true)} style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: "transparent",
                  border: `2px solid ${THEME.colors.surfaceStroke}`,
                  color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 900,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>i</button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center", paddingTop: 0, position: "relative" }}>
              <button
                onClick={onAction}
                disabled={isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked}
                data-action={gameState === "IDLE" ? "deal" : gameState === "HOLD" ? "draw" : undefined}
                data-ftue-anchor={dataFtuePrimaryAnchor}
                style={{
                  width: "min(168px, 50%)",
                  borderRadius: THEME.button.action.borderRadius, border: "none",
                  padding: "11px 0",
                  fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                  cursor: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "default" : "pointer",
                  background: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "rgba(255,255,255,0.10)" : actionBackground(gameState),
                  color: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "rgba(255,255,255,0.35)" : actionTextColor(gameState),
                  opacity: (ftueHideSkip && gameState === "REVEALING") ? 0 : (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? 0.3 : 1,
                  pointerEvents: (ftueHideSkip && gameState === "REVEALING" || ftueReplayBlocked) ? "none" as const : "auto" as const,
                  boxShadow: (isDisabled(gameState) || (ftueDrawBlocked && gameState === "HOLD") || ftueReplayBlocked) ? "none" : "0 4px 14px rgba(0,0,0,0.30)",
                  transition: "opacity 150ms ease", lineHeight: 1,
                }}>
                {actionLabel(gameState)}
              </button>
              {TrophyButton}
            </div>
          </div>

          {/* Streak hook — fades in after overshoot settles */}
          {isCelebration && celebration && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "stretch", justifyContent: "flex-start",
              paddingTop: "12px",
              opacity: overshootSettled ? 1 : 0,
              transition: "opacity 0.4s ease",
              pointerEvents: overshootSettled ? "auto" : "none",
            }}>
              <CelebrationBottom
                celebration={celebration}
                onDismiss={onWinCelebrationComplete ?? (() => { })}
                isFTUE={ftueHideSkip}
              />
            </div>
          )}
        </div>

      </div>
    </>
  );
}