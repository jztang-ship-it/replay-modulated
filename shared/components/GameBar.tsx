

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { THEME } from "@shared/theme";
import type { JSX as ReactJSX } from "react";
import { track } from "@shared/analytics/analytics";
import { formatBonusCountdown, getMsUntilNextBonusRotation } from "@shared/utils/dailyBonus";
import { isSlateV2Enabled } from "@shared/featureFlags";
import type { HandStatus } from "@shared/utils/handStatus";

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
  tierRows: Array<{ label: string; score: string;  color: string; bg: string; border: string }>;
  bonusRows?: Array<{ label: string; condition: string; reward: string }>;
  scoringRules: ScoringRule[];
  stamps?: BadgeInfo[];
  badges: BadgeInfo[];
  /** Today's 3 hot-bonus players — rotates every UTC midnight. */
  todaysStars?: Array<{ name: string; basePlayerId: string; tier?: string; bonus?: 5 | 10 | 20 }>;
}

// Celebration data passed in when WIN_CELEBRATION is active
export interface CelebrationData {
  tierLabel: string;       // e.g. "ALL-STAR"
  tierColor: string;       // e.g. "#C9A84C"
  tierGlow: string;        // e.g. "#C9A84C55"

  streak: number;          // current win streak
  isBust: boolean;

  isLoss: boolean;         // true for ROOKIE (partial loss) and BUST (full loss)

  /** Tier-orthogonal flavor flag (🔥 HEATER / ❄️ COLD_NIGHT) or null. Display
   *  only — Cold Night also drives the loss-coloring hook (isLoss) BUST vacated. */
  handStatus?: HandStatus | null;
}

type Props = {
  gameState: GameStateLabel;

  totalFp: number;
  capMax: number;
  capUsed: number;
  lockedSalary: number;
  revealedSalary: number;

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

  /** Pulse the replay/deal button to draw attention on results. */
  replayPulse?: boolean;
  /** FTUE only: relabel the REVEALING primary CTA "AUTO" → "GAME TIME". */
  ftueActive?: boolean;
  /** FTUE only: pulse the primary CTA (reuses the replayPulse blink) to signal
   *  "you can advance now" — NEXT once the round's directed holds are locked,
   *  GAME TIME at the reveal-walk entry. Off (default) → no pulse. */
  ftuePrimaryPulse?: boolean;
  /** FTUE Pass B only: dim + disable the primary CTA (REPLAY) during the history
   *  beat's locked stage — reuses the existing disabled dim (opacity 0.3, no
   *  action), and suppresses the pulse. Off (default) → no change. */
  ftuePrimaryLocked?: boolean;

  challengeMode?: boolean;
  /** Hide the built-in TierBar — use when an external TierGauge is shown */
  hideTierBar?: boolean;

  tierGaugeSlot?: React.ReactNode;

  splitFooter?: {
    multipliersHost: HTMLElement | null;
    controlsHost: HTMLElement | null;
  };

  splitMultiplierRowVisible?: boolean;
  /**
   * Tap target for the leaderboard trophy button rendered to the right of the
   * primary action button (DEAL / DRAW / REPLAY).
   */
  onViewLeaderboard?: () => void;
  /** Pulse the legend (ⓘ) icon to draw attention — e.g. daily bonus refresh */
  legendPulsing?: boolean;
  /** Pulse the trophy (🏆) icon to draw attention — e.g. leaderboard qualification */
  trophyPulsing?: boolean;
  /** One-shot celebration burst on the trophy (~800ms scale-pop + radiating
   *  glow ring) that chains into the iconBlink pulse loop. Fires when the
   *  player has just landed on the daily leaderboard. */
  trophyBurst?: boolean;
  /** Boss-live tell: when a boss is available, the trophy carries the same
   *  SUBTLE STATIC gold emphasis as trophyOnBoard (gold border + icon, NO
   *  animation → inherently prefers-reduced-motion-safe). Below the loud
   *  burst/pulse tier, above the dim default. Default false. */
  bossLive?: boolean;
  /** Called when the trophyBurst keyframe animation completes (one-shot).
   *  Parent should clear its trophyBurst state so the in-memory flag does
   *  not persist across hands. The durable iconBlink pulse keeps running
   *  via the rm_board_ack-derived pulseActive read below. */
  onBurstEnd?: () => void;
  /** Current win streak for fire emoji display in the game bar */
  streak?: number;

  showStreak?: boolean;

  challengeAvailable?: boolean;
  onChallenge?: () => void;
  /** Per-hand dismiss of the hot-hand CHALLENGE CTA ("not this one"). When fired,
   *  GameView flips challengeDismissed → challengeAvailable false → REPLAY returns as
   *  the lone centered CTA. CHALLENGE and REPLAY are never co-present in the row. */
  onDismissChallenge?: () => void;

  /** Called when user opens the legend modal — parent can clear pulse state */
  onLegendOpened?: () => void;
  /** Called when user taps the trophy/leaderboard icon — parent can clear pulse state */
  onTrophyOpened?: () => void;
  /**
   * Sport key — used to gate the Legend modal's "Today's Hot Players"
   * bonus row. When slate v2 is enabled for this sport, the row is
   * hidden because the slate panel takes over surface area.
   * Optional for back-compat: if omitted, falls back to slate-v2-OFF
   * behavior (bonus row shown when todaysStars is non-empty).
   */
  sportKey?: string;
  /** Challenge mode: when present, replace the tier-countdown label with
   *  "TARGET: {fp} — {name}" so the recipient knows the score to beat. */
  challengeTarget?: { name: string; fp: number };
  /** Round position for the x/N hold-loop indicator. Both default to single-shot
   *  (maxRounds 1) — the indicator + "NEXT" relabel only engage when maxRounds>1
   *  (basketball), so single-shot sports are untouched. */
  roundsUsed?: number;
  maxRounds?: number;
};

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

function actionLabel(state: GameStateLabel, maxRounds: number, ftue = false): string {
  if (state === "IDLE") return "DEAL";
  if (state === "DEALING") return "...";
  // Multi-round (basketball, maxRounds>1): every interactive HOLD advance reads
  // "NEXT" (one-path model — finality is carried by the x/N round signage, not
  // the button). Single-shot sports (maxRounds===1) keep "DRAW" — their only
  // HOLD locks immediately, so the relabel can never reach them.
  if (state === "HOLD") return maxRounds > 1 ? "NEXT" : "DRAW";
  if (state === "DRAWING") return "...";
  // REVEALING primary CTA is "GAME TIME" for all sports, both FTUE + normal play (the
  // affordance to flip the given cards / see the result). The former normal-play "AUTO"
  // is retired; the `ftue` param is now vestigial for this label.
  if (state === "REVEALING") return "GAME TIME";
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

function TierBar({
  totalFp, gameState, winTiers, isCelebration,
  lastCardProgress, lastCardFp, onOvershootSettled,
  challengeTarget,
}: {
  totalFp: number;
  gameState: GameStateLabel;
  winTiers: WinTierDisplay[];
  isCelebration: boolean;
  lastCardProgress: number;
  lastCardFp: number;
  onOvershootSettled: () => void;
  challengeTarget?: { name: string; fp: number };
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
          color: challengeTarget
            ? "#FFB14A"
            : showBar
              ? (fptNeeded === 0 ? displayColor : "rgba(255,255,255,0.50)")
              : "rgba(255,255,255,0.30)",
        }}>
          {challengeTarget
            ? `TARGET: ${challengeTarget.fp.toFixed(1)} — ${challengeTarget.name}`
            : showBar
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
      </div>
    </div>
  );
}

// ── Legend modal (unchanged) ────────────────────────────────────────────────

const colHdr: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: 1,
  textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
};

function LegendModal({
  onClose,
  legend,
  sportKey,

}: {
  onClose: () => void;
  legend: LegendData;
  sportKey?: string;

}) {

  const [tab, setTab] = useState<"tiers" | "scoring" | "badges">("tiers");
  // Bonus row is shown only when slate v2 is OFF for this sport. When ON,
  // the slate panel (landing drawer + in-game chip overlay) is the single
  // surface for daily-bonus players. Default-OFF when sportKey is missing
  // preserves the pre-0530a59 production behavior.
  const showBonusRow = !sportKey || !isSlateV2Enabled(sportKey);
  // Live countdown to next UTC midnight — updates every second while modal
  // is open. Only mounted when bonus row is shown to avoid churning a
  // useless interval when slate v2 is on.
  const [countdown, setCountdown] = useState<string>(() => formatBonusCountdownLocal());
  useEffect(() => {
    if (!showBonusRow) return;
    const interval = setInterval(() => setCountdown(formatBonusCountdownLocal()), 1000);
    return () => clearInterval(interval);
  }, [showBonusRow]);
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
          {(["tiers", "scoring", "badges"] as const).map(t => (
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
          {tab === "tiers" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Today's hot players (bonus row) — pre-slate-v2 surface. */}
              {/* When slate v2 is ON for this sport, the row is hidden because */}
              {/* the slate panel takes over (landing drawer + in-game chip overlay). */}
              {showBonusRow && legend.todaysStars && legend.todaysStars.length > 0 && (
                <div style={{ marginBottom: 10, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "#FFD700", textTransform: "uppercase" }}>
                      TODAY'S HOT PLAYERS
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
                      NEW IN {countdown}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {legend.todaysStars.map(s => {
                      const bonus = s.bonus ?? 5;
                      return (
                        <div key={s.basePlayerId} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 10,
                          background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)",
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#EAF0FF" }}>{s.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: "#FFD700", minWidth: 48, textAlign: "right" }}>+{bonus} FP</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9, color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}>
                    Pick these players — they add bonus FP on top of their real game. Rotates at UTC midnight.
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                <span style={colHdr}>Tier</span>
                <span style={{ ...colHdr, textAlign: "right" }}>Team FP</span>
                {null}
              </div>
              {legend.tierRows.map(r => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 10, background: r.bg, border: `1px solid ${r.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.8, color: r.color }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", textAlign: "right" }}>{r.score}</span>
                  {null}
                </div>
              ))}

              <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
                Team FP = sum of all 5 players' fantasy points.{null}
              </div>

              {null}
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

function CelebrationBottom({ celebration, onDismiss }: { celebration: CelebrationData; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const copy = { head: celebration.tierLabel, sub: "Tap to continue" };

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, [celebration]);

  const pipColor = celebration.isBust ? "#FF3B30" : "#FF8C00";
  const pipGlow = celebration.isBust ? "#FF3B3055" : "#FF8C0055";

  // B2a status flag — sparse, tier-orthogonal flavor badge. Heater = gold/flame
  // viral-flex; Cold Night = cold/dim (pairs with the loss-coloring hook on
  // isLoss). Sits above the (paused-for-basketball) streak row. Absent on most
  // hands. Visual only — device-glass before trusting the look.
  const statusBadge = celebration.handStatus === "HEATER"
    ? { label: "🔥 HEATER", color: "#FFD54A", bg: "rgba(255,196,0,0.12)", border: "rgba(255,196,0,0.45)" }
    : celebration.handStatus === "COLD_NIGHT"
    ? { label: "❄️ COLD NIGHT", color: "#7FB6FF", bg: "rgba(96,140,200,0.12)", border: "rgba(96,140,200,0.4)" }
    : null;

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
      {statusBadge && (
        <div style={{
          alignSelf: "center",
          display: "inline-flex", alignItems: "center",
          fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
          fontFamily: FF, color: statusBadge.color,
          background: statusBadge.bg, border: `1px solid ${statusBadge.border}`,
          borderRadius: 999, padding: "4px 12px",
          textShadow: `0 0 10px ${statusBadge.color}66`,
        }}>
          {statusBadge.label}
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: celebration.isBust ? "rgba(255,59,48,0.07)" : "rgba(255,140,0,0.08)",
        border: `1px solid ${celebration.isBust ? "#FF3B3020" : "#FF8C0020"}`,
        borderRadius: 10, padding: "12px 14px",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: pipColor, fontFamily: FF, lineHeight: 1.2 }}>
            {copy.head}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontFamily: FF }}>
            {copy.sub}
          </div>
        </div>
        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>›</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.12)", letterSpacing: "0.08em", fontFamily: FF }}>

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

  `;
  document.head.appendChild(st);
}

// ── Wage animation state machine ──────────────────────────────────────────
type WagePhase = "idle" | "glow" | "thud" | "flip" | "fly" | "settled";

// ── GameBar ─────────────────────────────────────────────────────────────────

export function GameBar({
  gameState,   totalFp,
  lastCardProgress = 0,
  lastCardFp = 0,
  capMax, capUsed, lockedSalary, revealedSalary,
      onAction,
  winTiers, legend,
  celebration, onWinCelebrationComplete,
  replayPulse = false,
  challengeMode = false,
  hideTierBar = false,
  tierGaugeSlot,
  splitFooter,
  splitMultiplierRowVisible = true,
  onViewLeaderboard,
  legendPulsing = false,
  trophyPulsing = false,
  trophyBurst = false,
  bossLive = false,
  onBurstEnd,
  streak = 0,
  showStreak: _ignoredShowStreak,

  challengeAvailable = false,
  onChallenge,
  onDismissChallenge,

  onLegendOpened,
  onTrophyOpened,
  sportKey,
  challengeTarget,
  roundsUsed = 1,
  maxRounds = 1,
  ftueActive = false,
  ftuePrimaryPulse = false,
  ftuePrimaryLocked = false,
}: Props) {
  // FTUE Pass B: the primary CTA is disabled/dimmed when the state disables it
  // (DEALING/DRAWING) OR when the history beat locks REPLAY. Superset of the
  // normal gate → non-FTUE (ftuePrimaryLocked=false) is byte-identical.

  const showStreak = false;
  const primaryDisabled = isDisabled(gameState) || ftuePrimaryLocked;
  // x/N hold-loop indicator + "NEXT" relabel — multi-round only. Single-shot
  // sports (maxRounds 1) get neither, so their HOLD stays "DRAW" and no
  // indicator renders. Shown across the active hand (HOLD/DRAWING/REVEALING);
  // roundsUsed snaps to maxRounds at lock so the reveal reads N/N.
  const showRoundIndicator = maxRounds > 1 &&
    (gameState === "HOLD" || gameState === "DRAWING" || gameState === "REVEALING");
  // Trophy button: 36×36 circular, sits absolutely positioned right of the
  // action button row's container. Border + icon flip to gold once the user
  // has landed on the daily leaderboard (rm_on_board_today === "1").
  const trophyOnBoard = (() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("rm_on_board_today") === "1"; } catch { return false; }
  })();
  // Durable pulse derivation — true while the player is on the daily
  // leaderboard AND has not yet acknowledged it (by tapping the trophy).
  // Survives page reloads because both keys are persistent localStorage.
  // Independent of the one-shot trophyBurst prop, so when the burst
  // self-clears via onBurstEnd the pulse keeps going until the tap
  // writes rm_board_ack="1".
  const pulseActive = (() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("rm_on_board_today") === "1"
        && localStorage.getItem("rm_board_ack") !== "1";
    } catch { return false; }
  })();

  const ChallengeButton = (challengeAvailable && onChallenge) ? (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "min(168px, 50%)" }}>
      <button
        type="button"
        onClick={onChallenge}
        data-action="challenge"
        style={{
          width: "100%",
          borderRadius: THEME.button.action.borderRadius, border: "none",
          padding: "11px 0",
          fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
          cursor: "pointer", lineHeight: 1, whiteSpace: "nowrap",
          background: "linear-gradient(135deg, #FFB14A, #FF8A3D)",
          color: "#0B0E14",
          boxShadow: "0 4px 14px rgba(0,0,0,0.30)",
          pointerEvents: "auto" as const,
        }}
      >
        Challenge
      </button>
      <button
        type="button"
        onClick={onDismissChallenge}
        data-action="challenge-dismiss"
        style={{
          background: "none", border: "none",
          padding: "6px 12px", margin: 0, lineHeight: 1,
          color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
          cursor: "pointer", pointerEvents: "auto" as const,
        }}
      >
        not this one
      </button>
    </div>
  ) : null;

  const TrophyButton = onViewLeaderboard ? (
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
        border: `1px solid ${(trophyOnBoard || bossLive) ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.1)"}`,
        color: (trophyOnBoard || bossLive) ? "#FFD700" : "rgba(255,255,255,0.3)",
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
    if (!isCelebration) { setOvershootSettled(false); }
  }, [isCelebration]);

  const prevStreakRef = useRef(streak);
  // Update prev streak after render so flash/extinguish can compare
  useEffect(() => { prevStreakRef.current = streak; }, [streak]);

  function handleCelebTap(e: React.MouseEvent) {
    if (!showCelebContent || !onWinCelebrationComplete) return;
    onWinCelebrationComplete();
  }

  const spent = salarySpent(gameState, capUsed, lockedSalary, revealedSalary);
  const remaining = capMax - spent;
  const overBudget = remaining < 0;

  const controlsFooter = (
    <>

      {null}
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

          <div style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>

            <></>
          </div>

          {/* Icon blink + Streak flash + extinguish keyframes */}
          <style>{`
            @keyframes iconBlink {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.3; transform: scale(0.92); }
            }
            /* prefers-reduced-motion guard (the inline iconBlink/trophyBurst had
               none): kill the pulse/burst on tagged icons so they fall back to
               the steady-gold static treatment. !important beats the inline
               animation. Helps the loud legend/qualify tier for free. */
            @media (prefers-reduced-motion: reduce) {
              [data-gb-anim] { animation: none !important; }
            }
            @keyframes trophyBurst {
              0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(255,215,0,0); }
              25%  { transform: scale(1.4);  box-shadow: 0 0 0 4px rgba(255,215,0,0.65), 0 0 18px 8px rgba(255,215,0,0.5); }
              55%  { transform: scale(1.08); box-shadow: 0 0 0 14px rgba(255,215,0,0.05), 0 0 28px 16px rgba(255,215,0,0); }
              100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(255,215,0,0); }
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

          {/* Streak row — stretched across line, tiers unlock progressively.
              Hidden when showStreak is false (streaks paused — basketball). */}
          {null}

          <div style={{ display: "flex", alignItems: "center", position: "relative", paddingTop: 2, minHeight: showStreak ? 44 : 40, justifyContent: "center" as const }}>

            {showRoundIndicator && (
              <div style={{ position: "absolute", left: 0, display: "flex", alignItems: "center", gap: 8 }}>

                {showRoundIndicator && (
                  <span data-testid="round-indicator" style={{
                    fontSize: 13, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                    letterSpacing: 1, color: "rgba(255,255,255,0.6)", fontFamily: FF, whiteSpace: "nowrap",
                  }}>
                    {roundsUsed}/{maxRounds}
                  </span>
                )}

                {null}
              </div>
            )}

            {/* REPLAY — the lone centered CTA on all non-challenge states/hands. Hidden
                when challengeAvailable (CHALLENGE owns the slot), so it never shrinks or
                de-centers. Width is ALWAYS min(168px,50%) — the challenge variant is gone. */}
            {!challengeAvailable && (
            <button
              onClick={onAction}
              disabled={primaryDisabled}
              data-action={gameState === "IDLE" ? "deal" : gameState === "HOLD" ? "draw" : undefined}
              style={{
                width: "min(168px, 50%)",
                borderRadius: THEME.button.action.borderRadius, border: "none",
                padding: "11px 0",
                fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                cursor: (primaryDisabled) ? "default" : "pointer",
                background: (primaryDisabled) ? "rgba(255,255,255,0.10)" : actionBackground(gameState),
                color: (primaryDisabled) ? "rgba(255,255,255,0.35)" : actionTextColor(gameState),
                opacity: primaryDisabled ? 0.3 : 1,
                pointerEvents: "auto" as const,
                boxShadow: (primaryDisabled) ? "none" : "0 4px 14px rgba(0,0,0,0.30)",
                transition: "opacity 300ms ease", lineHeight: 1,
                animation: (replayPulse || ftuePrimaryPulse) ? "replayPulse 1.2s ease-in-out infinite" : "none",
              }}>
              {(replayPulse || ftuePrimaryPulse) && <style>{`@keyframes replayPulse { 0%,100% { box-shadow: 0 4px 14px rgba(0,0,0,0.3); } 50% { box-shadow: 0 4px 14px rgba(0,0,0,0.3), 0 0 0 6px rgba(58,160,255,0.5), 0 0 20px rgba(58,160,255,0.3); } }`}</style>}
              {actionLabel(gameState, maxRounds, ftueActive)}
            </button>
            )}

            {/* CHALLENGE-dominant CTA (+ "not this one" dismiss) — occupies the SAME
                centered slot when challengeAvailable; mutually exclusive with REPLAY. */}
            {ChallengeButton}

            {/* Legend + trophy — right (both hidden during FTUE). In story state
                pushed right via marginLeft:auto (in-flow); otherwise absolute-right
                exactly as before so non-challenge rows are pixel-identical. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, position: "absolute" as const, right: 0 }}>
              <button data-gb-anim="true" onClick={() => { setShowLegend(true); onLegendOpened?.(); }} style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: legendPulsing ? "rgba(255,215,0,0.9)" : "transparent",
                border: `2px solid ${legendPulsing ? "rgba(255,215,0,0.9)" : THEME.colors.surfaceStroke}`,
                color: legendPulsing ? "#070A12" : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 900, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                animation: legendPulsing ? "iconBlink 1.2s ease-in-out infinite" : "none",
              }}>i</button>
              {onViewLeaderboard && (
                <button
                  type="button"
                  data-gb-anim="true"
                  aria-label="View leaderboard"
                  onClick={() => { onViewLeaderboard(); onTrophyOpened?.(); }}
                  onAnimationEnd={(e) => {
                    // Only the trophyBurst keyframe ever ends — iconBlink
                    // is `infinite`, so it never fires animationend. The
                    // name check guards against accidental future
                    // chained animations on this element.
                    if (e.animationName === "trophyBurst") onBurstEnd?.();
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: (trophyBurst || trophyPulsing || pulseActive) ? "rgba(255,215,0,0.15)" : "transparent",
                    border: `1px solid ${(trophyBurst || trophyPulsing || pulseActive) ? "rgba(255,215,0,0.7)" : (trophyOnBoard || bossLive) ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.1)"}`,
                    color: (trophyBurst || trophyPulsing || pulseActive) ? "#FFD700" : (trophyOnBoard || bossLive) ? "#FFD700" : "rgba(255,255,255,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: 14, padding: 0,
                    animation: trophyBurst
                      ? "trophyBurst 800ms ease-out 0s 1 both, iconBlink 1.2s ease-in-out 800ms infinite"
                      : (trophyPulsing || pulseActive)
                      ? "iconBlink 1.2s ease-in-out infinite"
                      : "none",
                  }}
                >🏆</button>
              )}
            </div>
          </div>
        </div>

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
          <LegendModal onClose={() => setShowLegend(false)} legend={legend} sportKey={sportKey}  />,
          document.body
        )}
      </>
    );
  }

  if (split) {
    return (
      <>
        {showLegend && ReactDOM.createPortal(
          <LegendModal onClose={() => setShowLegend(false)} legend={legend} sportKey={sportKey}  />,
          document.body
        )}
        {ReactDOM.createPortal(
          <></>,
          splitFooter!.multipliersHost as Element
        )}
        {ReactDOM.createPortal(controlsFooter, splitFooter!.controlsHost as Element)}
      </>
    );
  }

  return (
    <>
      {showLegend && ReactDOM.createPortal(
        <LegendModal onClose={() => setShowLegend(false)} legend={legend} sportKey={sportKey}  />,
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
            challengeTarget={challengeTarget}
          />
        </div>}

        {null}

        {/* ── ZONE B.5: external TierGauge slot (e.g. GameView) — omit wrapper when unused so footer height isn’t reserved ── */}
        {tierGaugeSlot != null && tierGaugeSlot !== false && (
          <div style={{ height: 54, flexShrink: 0, overflow: "visible", marginBottom: 12 }}>
            {tierGaugeSlot}
          </div>
        )}

        <div style={{ position: "relative", overflow: "hidden", paddingBottom: "max(32px, env(safe-area-inset-bottom, 20px))" }}>

          {/* Normal content */}
          <div style={{
            filter: showCelebContent ? "blur(5px)" : "none",
            opacity: showCelebContent ? 0 : 1,
            transition: "filter 0.35s ease, opacity 0.35s ease",
            pointerEvents: showCelebContent ? "none" : "auto",
          }}>
            {null}

            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, marginBottom: 6, opacity: challengeMode ? 0 : 1, pointerEvents: challengeMode ? "none" as const : "auto" as const, transition: "opacity 0.3s ease" }}>
              {/* Balance — left */}

              <div style={{ flexShrink: 0 }}>
                {null}
              </div>

              {/* Wage — true center */}
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
                <></>
              </div>

              {/* Legend — right (hidden during FTUE) */}
              {(
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
              {/* REPLAY — hidden when challengeAvailable (CHALLENGE owns the slot), so it
                  never shrinks/de-centers. Width ALWAYS min(168px,50%); challenge variant gone. */}
              {!challengeAvailable && (
              <button
                onClick={onAction}
                disabled={primaryDisabled}
                data-action={gameState === "IDLE" ? "deal" : gameState === "HOLD" ? "draw" : undefined}
                style={{
                  width: "min(168px, 50%)",
                  borderRadius: THEME.button.action.borderRadius, border: "none",
                  padding: "11px 0",
                  fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                  cursor: (primaryDisabled) ? "default" : "pointer",
                  background: (primaryDisabled) ? "rgba(255,255,255,0.10)" : actionBackground(gameState),
                  color: (primaryDisabled) ? "rgba(255,255,255,0.35)" : actionTextColor(gameState),
                  opacity: primaryDisabled ? 0.3 : 1,
                  pointerEvents: "auto" as const,
                  boxShadow: (primaryDisabled) ? "none" : "0 4px 14px rgba(0,0,0,0.30)",
                  transition: "opacity 150ms ease", lineHeight: 1,
                  animation: (replayPulse || ftuePrimaryPulse) ? "replayPulse 1.2s ease-in-out infinite" : "none",
                }}>
                {(replayPulse || ftuePrimaryPulse) && <style>{`@keyframes replayPulse { 0%,100% { box-shadow: 0 4px 14px rgba(0,0,0,0.3); } 50% { box-shadow: 0 4px 14px rgba(0,0,0,0.3), 0 0 0 6px rgba(58,160,255,0.5), 0 0 20px rgba(58,160,255,0.3); } }`}</style>}
                {actionLabel(gameState, maxRounds, ftueActive)}
              </button>
              )}
              {/* CHALLENGE-dominant CTA (+ dismiss) — same centered slot; mutually
                  exclusive with REPLAY. */}
              {ChallengeButton}
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
              />
            </div>
          )}
        </div>

      </div>
    </>
  );
}
