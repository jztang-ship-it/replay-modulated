/**
 * GameView.tsx
 * Orchestration only. No flip logic lives here.
 * Flip state is owned by useCardFlipState.
 * Reveal sequence is owned by useEmotionalReveal.
 */

import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { dealFTUERoster, redrawFTUERoster, resolveFTUERoster } from "../adapters/ftueRoster";
import { CoachLayer } from "@shared/components/CoachLayer";
import { useFTUE } from "@shared/hooks/useFTUE";
import { ensureLoaded } from "../engines/dataEngine";
import { RosterGrid } from "../components/RosterGrid";
import { AppHeader } from "../components/AppHeader";
import { resetAllOverlays } from "../components/AthleteCard";
import { GameBar, type CelebrationData } from "../components/GameBar";
import { useCardFlipState } from "../hooks/useCardFlipState";
import { useEmotionalReveal, type RevealableCard } from "../hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayout, BASKETBALL_WIN_TIERS, type WinTier } from "../utils/payoutLogic";
import { buildPostRevealCopy } from "../utils/buildPostRevealCopy";
import { useGameAnalytics } from "../../../shared/analytics/useGameAnalytics";
import { HotStreakOverlay } from '@shared/engagement/HotStreakOverlay';
import { CollectScreen } from '@shared/engagement/CollectScreen';
import { TierGauge, computeGaugeState } from '@shared/components/TierGauge';
import { useEngagement } from '@shared/engagement/useEngagement';
import { CoinDisplay } from '@shared/engagement/CoinDisplay';
import { DailyTasksPanel } from '@shared/engagement/DailyTasksPanel';
import { XPBar } from '@shared/engagement/XPBar';
import { soundManager } from '@shared/utils/soundManager';
import { audioDirector } from '@shared/utils/audioDirector';
import { getPlayerUid, getNickname, setNickname } from '@shared/utils/playerIdentity';

// Test-wire only: allow passing glow props even if wrapper prop types lag behind.
const RosterGridAny = RosterGrid as any;

const CAP_MAX = sportAdapter.salaryCap;
const ROSTER_SIZE = sportAdapter.rosterSize;
const STARTING_BALANCE = 100000;
const MIN_BALANCE_FLOOR = 500; // auto-refill for testing if balance runs too low

// ── Reveal mode toggle ─────────────────────────────────────────────────────
// "auto" = cards flip automatically in sequence (original behaviour)
// "tap"  = user taps each unheld card to reveal it; held FP fades in at end
const REVEAL_MODE: "auto" | "tap" = "tap";

function loadBalance(): number {
  try {
    const v = localStorage.getItem("replaymod_balance");
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= MIN_BALANCE_FLOOR) return n;
    return STARTING_BALANCE; // reset if missing, NaN, or below floor
  } catch { return STARTING_BALANCE; }
}
function saveBalance(v: number) {
  try { localStorage.setItem("replaymod_balance", String(v)); } catch { }
}

/** Scales the 2×3 roster so both rows always fit the middle grid row (no clipping onto Team FP). */
function RosterGridScaleFit({ children }: { children: ReactNode }) {
  const portRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const port = portRef.current;
    const meas = measRef.current;
    if (!port || !meas) return;
    const run = () => {
      const pw = port.clientWidth;
      const ph = port.clientHeight;
      const mw = meas.scrollWidth;
      const mh = meas.scrollHeight;
      if (!pw || !ph || !mw || !mh) return;
      setScale(Math.min(1, pw / mw, ph / mh));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(port);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={portRef}
      data-ftue-anchor="roster"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={measRef}
        data-ftue-anchor="roster-inner"
        style={{
          width: "100%",
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
const BASE_BET = 10;

// ── Jackpot constants ──────────────────────────────────────────────────────
const JACKPOT_SEED = 12_451.29;
const JACKPOT_BET_RAKE = 0.05;   // 5% of each bet added to pot
const TICK_INTERVAL_MS = 3000;
const TICK_AMOUNT = 0.01;

type GameState =
  | "IDLE" | "DEALING" | "HOLD" | "DRAWING"
  | "REVEALING" | "RESULTS" | "WIN_CELEBRATION";

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function submitToLeaderboard(metric: "streak" | "wins" | "fp", value: number) {
  const uid = getPlayerUid();
  const nickname = getNickname();
  if (!uid || value <= 0) return;
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", metric, value, uid, nickname }),
    });
  } catch { } // Non-critical — never block game flow
}

function cardId(card: any): string {
  return String(card?.cardId ?? card?.basePlayerId ?? "");
}

function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((s, c: any) => s + Number(c?.salary ?? 0), 0);
}

function createPlaceholders(): PlayerCard[] {
  return Array.from({ length: ROSTER_SIZE }, (_, i) => ({
    cardId: `placeholder-${i}`,
    basePlayerId: "",
    name: "",
    team: "",
    season: "",
    position: "MD" as any,
    tier: "WHITE" as any,
    salary: 0,
    projectedFp: 0,
    actualFp: 0,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "" },
    statLine: {},
    achievements: [],
    slotIndex: i,
    wasHeld: false,
  }));
}

const GAUGE_THRESHOLDS = [
  { tier: "ROOKIE",   minFP: 155 },
  { tier: "STARTER",  minFP: 175 },
  { tier: "ALL_STAR", minFP: 195 },
  { tier: "MVP",      minFP: 215 },
  { tier: "GOAT",     minFP: 235 },
];
const NEAR_MISS_FP = 5;

/** Must match salary → tier thresholds in shared/components/CardFront.tsx (derivedTier). */
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 52 ? "ORANGE" : s >= 40 ? "PURPLE" : s >= 28 ? "BLUE" : s >= 16 ? "GREEN" : "WHITE";
}

function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards.map(c => {
    const salary = Number((c as any).salary ?? 0);
    return {
      cardId: cardId(c),
      slotIndex: c.slotIndex ?? 0,
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      salary,
      tier: tierFromSalary(salary),
      wasHeld: (c as any).wasHeld ?? false,
      badges: (c.achievements ?? []).map((a: any) => ({
        id: a.id, icon: a.icon || "⭐", label: a.label, fp: a.fp || 0,
      })),
    };
  });
}

// ── RollingNumber — animates between numeric values ──────────────────────
function RollingNumber({ value, decimals = 0, duration = 400 }: { value: number; decimals?: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) { setDisplayed(end); prevRef.current = end; return; }
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(start + (end - start) * eased);
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { setDisplayed(end); prevRef.current = end; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]); // eslint-disable-line
  return <>{displayed.toFixed(decimals)}</>;
}

// ── Tier flip display helpers ──────────────────────────────────────
function deriveTierFromFp(fp: number): string {
  if (fp >= 235) return "GOAT";
  if (fp >= 215) return "MVP";
  if (fp >= 195) return "ALL_STAR";
  if (fp >= 175) return "STARTER";
  if (fp >= 155) return "ROOKIE";
  return "BUST";
}

// ── Spring oscillation waypoints ────────────────────────────────────────────
const SPRING_TIERS = [
  { name: "BUST",     lo: 0,   hi: 155 },
  { name: "ROOKIE",   lo: 155, hi: 175 },
  { name: "STARTER",  lo: 175, hi: 195 },
  { name: "ALL_STAR", lo: 195, hi: 215 },
  { name: "MVP",      lo: 215, hi: 235 },
  { name: "GOAT",     lo: 235, hi: 9999 },
];
const SPRING_TIER_SPAN = 20.0;

function computeSpringWaypoints(finalFp: number): number[] {
  const tier = SPRING_TIERS.find(t => finalFp >= t.lo && finalFp < t.hi)
    ?? SPRING_TIERS[SPRING_TIERS.length - 1];
  const margin = finalFp - tier.lo;
  const marginNorm = Math.min(1, margin / SPRING_TIER_SPAN);
  const fpNorm = Math.min(1, Math.max(0, (finalFp - 155) / 80));
  const baseAmp = 4.0 + fpNorm * 6.0;
  const marginFactor = 1.0 - marginNorm * 0.75;
  const amplitude = baseAmp * marginFactor;
  const damping = 0.45;

  // Always exactly 3 swings: up → down (crosses boundary) → small up → settle
  const waypoints: number[] = [finalFp];
  let amp = amplitude;
  waypoints.push(finalFp + amp);          // swing 1: up
  amp *= damping;
  waypoints.push(finalFp - amp);          // swing 2: down (may cross boundary)
  amp *= damping;
  waypoints.push(finalFp + amp);          // swing 3: small up
  waypoints.push(finalFp);               // settle
  return waypoints;
}

const TIER_IMAGE_MAP: Record<string, string> = {
  BUST: "bust1.png",
  ROOKIE: "Rookie2.png",
  STARTER: "Starter3.png",
  ALL_STAR: "All_Star_4.png",
  MVP: "MVP5.png",
  GOAT: "GOAT6.png",
};

const GV_STYLE_ID = "gv-tier-flip";
if (typeof document !== "undefined" && !document.getElementById(GV_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = GV_STYLE_ID;
  st.textContent = `
    @keyframes tierFlip {
      0% { transform: perspective(400px) rotateX(90deg); filter: blur(6px); opacity: 0; }
      35% { transform: perspective(400px) rotateX(-15deg); filter: blur(0); opacity: 1; }
      55% { transform: perspective(400px) rotateX(8deg); opacity: 1; }
      75% { transform: perspective(400px) rotateX(-3deg); opacity: 1; }
      100% { transform: perspective(400px) rotateX(0deg); opacity: 1; }
    }
    @keyframes tierSlam {
      0% { transform: scale(0.1) translateY(-10px); opacity: 0; }
      22% { transform: scale(1.45) translateY(2px); opacity: 1; }
      38% { transform: scale(0.85) translateY(-1px); opacity: 1; }
      52% { transform: scale(1.15) translateY(1px); opacity: 1; }
      66% { transform: scale(0.95) translateY(0); opacity: 1; }
      80% { transform: scale(1.03) translateY(0); opacity: 1; }
      100% { transform: scale(1.0) translateY(0); opacity: 1; }
    }
    @keyframes tierSlamFlash {
      0% { opacity: 0; }
      15% { opacity: 0.35; }
      40% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes tierInfoFadeIn {
      0% { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes tierTeaseIn {
      0%   { transform: perspective(400px) rotateX(90deg) scale(0.9); opacity: 0; }
      40%  { transform: perspective(400px) rotateX(-12deg) scale(1.05); opacity: 1; }
      65%  { transform: perspective(400px) rotateX(6deg) scale(0.98); opacity: 1; }
      100% { transform: perspective(400px) rotateX(0deg) scale(1); opacity: 1; }
    }
    @keyframes tierTeaseOut {
      0%   { transform: perspective(400px) rotateX(0deg) scale(1); opacity: 1; }
      30%  { transform: perspective(400px) rotateX(20deg) scale(0.95); opacity: 0.6; }
      100% { transform: perspective(400px) rotateX(90deg) scale(0.85); opacity: 0; }
    }
    @keyframes bonusPoolPulse {
      0%   { box-shadow: 0 0 0px rgba(255,215,0,0); }
      30%  { box-shadow: 0 0 28px rgba(255,215,0,0.95), 0 0 56px rgba(255,215,0,0.5); }
      65%  { box-shadow: 0 0 18px rgba(255,215,0,0.7); }
      100% { box-shadow: 0 0 6px rgba(255,215,0,0.3); }
    }
  `;
  document.head.appendChild(st);
}

/** Gold ×N next to payout when multiplier &gt; 1 */
function BetMultSuffix({ m }: { m: number }) {
  if (m <= 1) return null;
  return (
    <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 900, marginLeft: 4 }}>×{m}</span>
  );
}

// ── BonusRow — community bonus pool pill (streak UI lives in Zone 3) ─────────

const BONUS_TIERS = [
  { wins: 3, pct: 5, color: "#FFD700", glow: "#FFD70099" },
  { wins: 5, pct: 15, color: "#FFD700", glow: "#FFD70099" },
];

const BONUS_DOTS = [
  { threshold: 1, tierIdx: 0 },
  { threshold: 2, tierIdx: 0 },
  { threshold: 3, tierIdx: 0 },
  { threshold: 4, tierIdx: 1 },
  { threshold: 5, tierIdx: 1 },
];

function BonusRow({ betAdded, streak = 0, milestoneHit = false, onAmountChange }: {
  betAdded: number; streak?: number; milestoneHit?: boolean;
  onAmountChange?: (v: number) => void;
}) {
  const [amount, setAmount] = useState(JACKPOT_SEED);
  const prevBetRef = useRef(0);
  const streakGlow = streak >= 5 ? 0.22 : streak >= 3 ? 0.14 : streak >= 1 ? 0.08 : 0.06;
  const streakBorder = streak >= 5 ? "rgba(255,215,0,0.55)" : streak >= 3 ? "rgba(255,215,0,0.38)" : streak >= 1 ? "rgba(255,215,0,0.25)" : "rgba(255,215,0,0.18)";
  const streakShadow = streak > 0 ? `0 0 ${6 + streak * 3}px rgba(255,215,0,${streakGlow})` : "none";

  useEffect(() => {
    const id = setInterval(() => {
      setAmount(p => {
        const next = parseFloat((p + TICK_AMOUNT).toFixed(2));
        onAmountChange?.(next);
        return next;
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (betAdded > 0 && betAdded !== prevBetRef.current) {
      prevBetRef.current = betAdded;
      const contribution = parseFloat((betAdded * JACKPOT_BET_RAKE).toFixed(2));
      if (contribution > 0) setAmount(p => {
        const next = parseFloat((p + contribution).toFixed(2));
        onAmountChange?.(next);
        return next;
      });
    }
  }, [betAdded]); // eslint-disable-line

  return (
    <div style={{
      flex: "0 0 auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0px 12px",
    }}>
      {/* Bonus pool pill only — streak lives in zone 3 under gauge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 14px", borderRadius: 20,
        background: `rgba(255,215,0,${streakGlow})`,
        border: `1px solid ${streakBorder}`,
        boxShadow: milestoneHit
          ? `0 0 0 2px #FFD700, 0 0 32px rgba(255,215,0,0.9), 0 0 64px rgba(255,215,0,0.5)`
          : streakShadow,
        animation: milestoneHit ? "bonusPoolPulse 1.4s ease-out forwards" : "none",
        transition: "box-shadow 300ms ease",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,215,0,0.6)", textTransform: "uppercase" }}>
          Bonus Pool
        </span>
        <span style={{ fontSize: 12, fontWeight: 950, color: "#FFD700", fontVariantNumeric: "tabular-nums", textShadow: "0 0 8px rgba(255,215,0,0.5)" }}>
          ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

    </div>
  );
}

// ── GameView ───────────────────────────────────────────────────────────────

export default function GameView() {

  // Zone 1: State
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const {
    hotStreak,
    sessionWins,
    taskStates,
    loginStreak,
    coins,
    xp,
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    collectTask,
  } = useEngagement();
  const [showCollect, setShowCollect] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState(() => getNickname());
  const [multipliersHost, setMultipliersHost] = useState<HTMLDivElement | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [roster, setRoster] = useState<PlayerCard[]>(createPlaceholders());
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId] = useState<string | undefined>();
  const [betMultiplier, setBetMultiplier] = useState(1);
  const [balance, setBalance] = useState(() => loadBalance());
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [showRawScore, setShowRawScore] = useState(false);

  useEffect(() => {
    if (gameState === "IDLE" || gameState === "HOLD") setShowRawScore(false);
  }, [gameState]);
  const [noTransition, setNoTransition] = useState(false);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const rosterRef = useRef<PlayerCard[]>([]);
  const { isFTUE, completeFTUE } = useFTUE("basketball");
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [revealIndex, setRevealIndex] = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string | null>(null);
  const [celebrationHeld, setCelebrationHeld] = useState(false);
  const [ftueCardsBlocked, setFtueCardsBlocked] = useState(false);
  const [ftueReplayReady, setFtueReplayReady] = useState(false);
  const [ftueResultsDim, setFtueResultsDim] = useState(false);
  const [ftueBookerFlipped, setFtueBookerFlipped] = useState(false);
  const [ftueOscillating, setFtueOscillating] = useState(false);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300
  });
  /** After FTUE scripted gauge animation completes — bar stays frozen until next hand */
  const [ftueGaugeOscDone, setFtueGaugeOscDone] = useState(false);
  const [ftueWinCelebrationActive, setFtueWinCelebrationActive] = useState(false);
  const [ftueBookerPulse, setFtueBookerPulse] = useState(false);
  const [ftueHoldSpotlight, setFtueHoldSpotlight] = useState(false);
  const [ftueCoachBubbleKey, setFtueCoachBubbleKey] = useState<string | null>(null);
  const pendingCelebration = useRef<{ totalFp: number } | null>(null);
  /** FTUE: roster sum can read 0 briefly in RESULTS — keep last resolved hand FP for TierGauge */
  const ftueLastHandFpRef = useRef(0);
  const heldRevealResumeRef = useRef<(() => void) | null>(null);
  const completedCardsRef = useRef<Set<string>>(new Set());
  const regularFinalGaugeKickFiredRef = useRef(false);
  // Near your other useState declarations in GameView.tsx
  const [streak, setStreak] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_streak") ?? "0", 10)
  );
  const [streakMilestone, setStreakMilestone] = useState<{ wins: number; pct: number } | null>(null);

  // Tier flip display state
  const [tierFlipKey, setTierFlipKey] = useState(0);
  const [displayTier, setDisplayTier] = useState("BUST");
  const prevRevealTierRef = useRef("BUST");
  const lastTierFlipTimeRef = useRef(0);
  const tierFlipTimerRef = useRef<number | null>(null);
  const latestGaugeFpRef = useRef(0);
  // Phase 1 = big PNG slam, Phase 2 = settled info view
  const [tierResultPhase, setTierResultPhase] = useState<1 | 2>(1);
  const [nearMissTeasing, setNearMissTeasing] = useState(false);
  const nearMissChoreTimersRef = useRef<number[]>([]);

  // Spring oscillation phase — fires after all cards settle, before results lock in
  const [springFp, setSpringFp] = useState<number | null>(null);
  const [springSettled, setSpringSettled] = useState(false);
  const springRafRef = useRef<number>(0);
  const springTimersRef = useRef<number[]>([]);
  const pendingBalanceUpdateRef = useRef<(() => void) | null>(null);
  const jackpotAmountRef = useRef<number>(JACKPOT_SEED); // mirrors BonusRow amount for milestone calc
  const lockedGaugeFpRef = useRef<number | null>(null);
  const springHasFiredRef = useRef(false);

  const runSpring = useCallback((finalFp: number, onSettled: () => void) => {
    lockedGaugeFpRef.current = finalFp; // freeze gauge immediately — no 1-frame gap
    cancelAnimationFrame(springRafRef.current);
    springTimersRef.current.forEach(clearTimeout);
    springTimersRef.current = [];

    const waypoints = computeSpringWaypoints(finalFp);
    const TOTAL_MS  = 1800;
    const segCount  = waypoints.length - 1;
    const segMs     = TOTAL_MS / segCount;

    let segIndex = 0;
    let segStart: number | null = null;

    setSpringFp(finalFp);
    setSpringSettled(false);

    function tick(now: number) {
      if (segIndex >= segCount) {
        lockedGaugeFpRef.current = finalFp;
        setSpringFp(null);
        setSpringSettled(true);
        onSettled();
        return;
      }
      if (segStart === null) segStart = now;
      const elapsed = now - segStart;
      const t = Math.min(1, elapsed / segMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const from = waypoints[segIndex];
      const to   = waypoints[segIndex + 1];
      setSpringFp(from + eased * (to - from));
      if (t >= 1) { segIndex++; segStart = null; }
      springRafRef.current = requestAnimationFrame(tick);
    }
    springRafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line

  // Near-miss copy — motivating one-liner shown in Phase 2 for BUST/ROOKIE.
  // Picked once when winTier is set; stable for the lifetime of the result screen.
  const nearMissCopy = useMemo(() => {
    const copies: Partial<Record<string, string[]>> = {
      BUST:     ["So close.", "Right there.", "Next hand."],
      ROOKIE:   ["Just a few more FP.", "Run it back.", "So close."],
      STARTER:  ["Right on the edge.", "Almost there.", "Run it back."],
      ALL_STAR: ["One strong hand away.", "So close.", "Push harder."],
    };
    if (!winTier) return null;
    const opts = copies[winTier];
    if (!opts) return null;
    return opts[Math.floor(Math.random() * opts.length)];
  }, [winTier]); // eslint-disable-line

  // Hand count — drives Protected mode (hands 2-30 get top-60% log sampling)
  // Hand 1 is always FTUE. Persisted across sessions.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10)
  );

  // Zone 1: Hooks

  // ── Audio phase sync — maps GameState to AudioPhase ──────────────────
  useEffect(() => {
    const phaseMap: Record<GameState, import('@shared/utils/audioDirector').AudioPhase> = {
      IDLE: "IDLE",
      DEALING: "DEAL",
      HOLD: "HOLD",
      DRAWING: "DRAW",
      REVEALING: "REVEAL",
      RESULTS: "RESULTS",
      WIN_CELEBRATION: "CELEBRATION",
    };
    audioDirector.setPhase(phaseMap[gameState] ?? "IDLE");
  }, [gameState]);

  useEffect(() => {
    ensureLoaded().then(() => setDataReady(true)).catch(console.error);
  }, []);

  const flipState = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet = BASE_BET * betMultiplier;
  const gameAnalytics = useGameAnalytics("basketball");

  function handleCardRevealStart(cardId: string, tierArg: string, shakeType?: string | null) {
    const tier = tierArg?.toUpperCase() ?? "WHITE";
    const st = shakeType ?? null;
    // Must match glowMsForReveal() in useEmotionalReveal
    const base = tier === "ORANGE" ? 900
      : tier === "PURPLE" ? 700
        : tier === "BLUE" ? 400
          : tier === "GREEN" ? 350
            : 250;
    const modifier = st === "legendary" ? 300
      : st === "big" ? 150
        : st === "frozen" ? -100
          : st === "cold" ? -50
            : 0;
    const duration = isSkippingRef.current
      ? (tier === "ORANGE" ? (st === "legendary" ? 500 : 400)
        : tier === "PURPLE" ? (st === "legendary" || st === "big" ? 350 : 300)
          : tier === "BLUE" ? 200
            : tier === "GREEN" ? 175
              : 125)
      : Math.max(150, base + modifier);
    setGlowState({ cardId, tier, durationMs: duration });
    setTimeout(() => setGlowState(prev => ({ ...prev, cardId: null })), duration + 50);
  }

  const {
    runningTotalFp,
    lastCardProgress,
    lastCardFp,
    anchorCardId,
    tapRevealCard,
    heldFpVisible,
    heldRevealedIds,
    tappedCardIds,
    getVisibleFp,
    flipMsMap,
    fpCountUpMsMap,
    performanceTagMap,
    pulseMap,
    shakeInfo,
    cardShakeTypeMap,
    activeRevealCardId,
    isSkipping,
    isSkippingRef,
    clearActiveCard,
    visibleBadgesMap,
    skipToEnd: skipReveal,
    reset: resetReveal,
  } = useEmotionalReveal({
    cards: revealableCards,
    isActive: gameState === "REVEALING",
    revealMode: REVEAL_MODE,
    flipState,
    onBeforeHeldReveal: isFTUE ? (resume) => {
      // Store the resume fn — CoachLayer will call it after last card bubble dismissed
      heldRevealResumeRef.current = resume;
    } : undefined,
    onCardRevealStart: handleCardRevealStart,
    onCardComplete: useCallback((cId: string) => {
      setRevealIndex(prev => {
        const next = prev + 1;
        audioDirector.setRevealProgress(next, rosterRef.current.length);
        return next;
      });
      setLastRevealedCardId(cId);

      // FTUE: start gauge oscillation shortly after Booker's stamp lands
      if (isFTUE && cId === "ftue-booker") {
        setTimeout(() => setFtueOscillating(true), 100);
      }
    }, [isFTUE]),
    onAnchorFpComplete: useCallback((totalFp: number) => {
      if (isFTUE) return;
      if (springHasFiredRef.current) return;
      springHasFiredRef.current = true;
      runSpring(totalFp, () => {
        lockedGaugeFpRef.current = totalFp;
        const tier = calculateWinTier(totalFp);
        const payout = calculatePayout(tier, currentBet);
        setWinTier(tier);
        setWinPayout(payout);
        const bust = !tier || tier === "BUST";
        soundManager.playTierResult(tier);
        const badges = rosterRef.current.reduce((s, c) => s + (c.achievements?.length ?? 0), 0);
        gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
        recordHandPlayed();
        if (!bust) recordHandWon(); else recordHandLost();
        pendingBalanceUpdateRef.current = () => {
          if (payout > 0) {
            setBalance(prev => { const next = prev + payout; saveBalance(next); return next; });
          }
          if (!bust) {
            setStreak(prev => {
              const next = prev + 1;
              localStorage.setItem("replaymod_streak", String(next));
              if (next === 3 || next === 5 || next === 10) soundManager.playStreakMilestone(next);
              if (next === 3) setStreakMilestone({ wins: 3, pct: 5 });
              else if (next === 5) setStreakMilestone({ wins: 5, pct: 15 });
              submitToLeaderboard("streak", next);
              return next;
            });
            submitToLeaderboard("wins", 1);
            submitToLeaderboard("fp", totalFp);
          } else {
            setStreak(0);
            localStorage.setItem("replaymod_streak", "0");
          }
        };
        const t = window.setTimeout(() => {
          setGameState("WIN_CELEBRATION");
        }, 1200);
        springTimersRef.current.push(t);
      });
    }, [isFTUE, currentBet, gameAnalytics, recordHandPlayed, recordHandWon, recordHandLost, runSpring]),
    onAllComplete: useCallback((_totalFp: number) => {
      clearActiveCard();
      soundManager.stopRevealAmbience();
      if (isFTUE) {
        const totalFp = _totalFp;
        ftueLastHandFpRef.current = totalFp;
        const tier = calculateWinTier(totalFp);
        const payout = calculatePayout(tier, currentBet);
        setWinTier(tier);
        setWinPayout(payout);
        const bust = !tier || tier === "BUST";
        const badges = rosterRef.current.reduce((s, c) => s + (c.achievements?.length ?? 0), 0);
        gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
        recordHandPlayed();
        if (!bust) recordHandWon(); else recordHandLost();
        setTimeout(() => {
          pendingCelebration.current = { totalFp };
          setCelebrationHeld(true);
        }, 1200);
      }
      // Non-FTUE: everything already handled in onAnchorFpComplete
    }, [isFTUE, currentBet, gameAnalytics, recordHandPlayed, recordHandWon, recordHandLost]),
  });

  // Zone 2: Derived values
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    if (gameState === "DRAWING") return "DRAWING";
    return "HOLD";
  }, [gameState]);

  const isPreRevealFooter =
    gameState === "IDLE" ||
    gameState === "HOLD" ||
    gameState === "DEALING" ||
    gameState === "DRAWING";
  const showGaugeInZone3 =
    gameState === "REVEALING" ||
    gameState === "RESULTS" ||
    gameState === "WIN_CELEBRATION";

  // Tier color map — mirrors WIN_TIERS in basketball/GameBar.tsx
  const CELEBRATION_TIER_COLORS: Record<string, { color: string; glow: string }> = {
    GOAT: { color: "#EF4444", glow: "#EF444499" },
    MVP: { color: "#FB923C", glow: "#FB923C55" },
    ALL_STAR: { color: "#C084FC", glow: "#C084FC55" },
    STARTER: { color: "#00FFD8", glow: "#00FFD855" },
    ROOKIE: { color: "#22C55E", glow: "#22C55E55" },
    BUST: { color: "#6B7280", glow: "#6B728033" },
  };

  const formatTierLabel = (tier: string) => {
    if (tier === "BUST") return "BUST";
    if (tier === "GOAT") return "G.O.A.T.";
    return tier.replace("_", "-");
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    const tierMult = BASKETBALL_WIN_TIERS[winTier]?.multiplier ?? 0;
    const isLoss = winTier === "BUST"; // ROOKIE is a partial win, not a loss
    const lossAmount = winTier === "BUST" ? BASE_BET * betMultiplier : 0;
    // Streak milestone bonus pool win
    const milestoneTier = BONUS_TIERS.find(t => streak === t.wins);
    const streakMilestonePct = milestoneTier?.pct;
    const bonusPoolWin = streakMilestonePct
      ? Math.floor(jackpotAmountRef.current * (streakMilestonePct / 100))
      : undefined;
    return {
      tierLabel: formatTierLabel(winTier),
      tierColor: tc.color,
      tierGlow: tc.glow,
      payout: winPayout,
      streak,
      isBust: winTier === "BUST",
      betMultiplier,
      tierMultiplier: tierMult,
      baseBet: BASE_BET,
      isLoss,
      lossAmount,
      streakMilestonePct,
      bonusPoolWin,
    };
  }, [gameState, winTier, winPayout, streak, betMultiplier]); // eslint-disable-line

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const lockedSalary = useMemo(() =>
    roster.reduce((s, c: any) => lockedCardIds.has(cardId(c)) ? s + Number(c?.salary ?? 0) : s, 0),
    [roster, lockedCardIds]
  );

  const totalFp = useMemo(() => {
    if (gameState === "REVEALING") return runningTotalFp;
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      const sum = roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
      if (sum > 0) return sum;
      if (isFTUE && ftueLastHandFpRef.current > 0) return ftueLastHandFpRef.current;
      return 0;
    }
    return 0;
  }, [gameState, runningTotalFp, roster, isFTUE]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    // Max possible = projectedFp × 2.0 (salaryRatioCeiling) per card
    const maxPossible = roster.reduce((s, c: any) => s + Number(c.projectedFp ?? 0) * 2.0, 0);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp]);


  // lockedGaugeFpRef freezes the gauge the instant spring starts and forever after
  const displayFp    = springFp ?? (lockedGaugeFpRef.current ?? totalFp);
  const gaugeTotalFp = displayFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // Smart post-reveal copy — replaces "X FP to NEXT TIER" under gauge after results settle
  // Must be after displayFp is declared
  const postRevealCopy = useMemo(() => {
    if ((gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") || !winTier || !springSettled) return null;
    const gaugeSnap = computeGaugeState(displayFp, GAUGE_THRESHOLDS as any, winTier, 8);
    return buildPostRevealCopy({
      totalFp: displayFp,
      winTier,
      roster: roster.map(c => ({
        name: String((c as any).name ?? ""),
        actualFp: Number((c as any).actualFp ?? 0),
        projectedFp: Number((c as any).projectedFp ?? 0) || undefined,
        salary: Number((c as any).salary ?? 0),
        opponent: (c as any).gameInfo?.opponent ?? undefined,
        badges: ((c as any).achievements ?? []).map((a: any) => String(a.id ?? a.label ?? "")),
        statLine: (c as any).statLine ?? undefined,
      })),
      streak,
      prevStreak: winTier === "BUST" ? streak : Math.max(0, streak - 1),
      isBust: winTier === "BUST",
      streakMilestone: streakMilestone ?? undefined,
    });
  }, [gameState, winTier, springSettled, displayFp, roster, streak]); // eslint-disable-line

  // Never show intermediate tiers during spring — only show final tier after spring settles
  const activeTierForDisplay = winTier ?? deriveTierFromFp(totalFp);

  // displayTier is driven only by handleTierCross during normal reveal — not during spring

  // No spring on results — direct-set keeps bar accurate. Spring to be added later.
  const regularFinalGaugeKick = false;

  // Tier result phase: Phase 1 = big slam (with optional near-miss tease), Phase 2 = info view
  useEffect(() => {
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && !isFTUE) {
      nearMissChoreTimersRef.current.forEach(clearTimeout);
      nearMissChoreTimersRef.current = [];
      setNearMissTeasing(false);
      setTierResultPhase(1);
      const gaugeSnap = computeGaugeState(totalFp, GAUGE_THRESHOLDS as any, winTier, NEAR_MISS_FP);
      if (gaugeSnap.isNearMiss && gaugeSnap.nextTier != null) {
        const t1 = setTimeout(() => setNearMissTeasing(true),  400);
        const t2 = setTimeout(() => setNearMissTeasing(false), 1200);
        const t3 = setTimeout(() => setTierResultPhase(2),     1800);
        nearMissChoreTimersRef.current = [t1, t2, t3];
      } else {
        const t = setTimeout(() => setTierResultPhase(2), 1800);
        nearMissChoreTimersRef.current = [t];
      }
      return () => { nearMissChoreTimersRef.current.forEach(clearTimeout); };
    }
  }, [gameState, winTier, isFTUE]); // eslint-disable-line

  // Track tier boundary crossings — paced flip with minimum display time per tier
  // Tier flip — shows EVERY intermediate tier for 600ms each.
  // When gauge crosses multiple tiers, schedules each one on a 600ms chain.
  const TIER_ORDER_LIST = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];
  const tierFlipTimersRef = useRef<number[]>([]);

  const handleTierCross = useCallback((tier: string) => {
    if (isFTUE) return;
    if (springHasFiredRef.current) return; // spring in progress — no tier flips
    if (tier === prevRevealTierRef.current) return;
    soundManager.playTierCross(tier);

    // Clear any pending flip chain
    tierFlipTimersRef.current.forEach(clearTimeout);
    tierFlipTimersRef.current = [];

    const fromIdx = TIER_ORDER_LIST.indexOf(prevRevealTierRef.current);
    const toIdx = TIER_ORDER_LIST.indexOf(tier);
    if (toIdx <= fromIdx) {
      prevRevealTierRef.current = tier;
      setDisplayTier(tier);
      setTierFlipKey(k => k + 1);
      return;
    }

    // Schedule each intermediate tier + final tier at 600ms intervals
    const steps = TIER_ORDER_LIST.slice(fromIdx + 1, toIdx + 1);
    steps.forEach((t, i) => {
      if (i === 0) {
        // First one fires immediately
        prevRevealTierRef.current = t;
        setDisplayTier(t);
        setTierFlipKey(k => k + 1);
      } else {
        const timerId = window.setTimeout(() => {
          prevRevealTierRef.current = t;
          setDisplayTier(t);
          setTierFlipKey(k => k + 1);
        }, i * 600);
        tierFlipTimersRef.current.push(timerId);
      }
    });
  }, [isFTUE]); // eslint-disable-line

  // Reset on state change
  useEffect(() => {
    if (gameState !== "REVEALING" && gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") {
      prevRevealTierRef.current = "BUST";
      setDisplayTier("BUST");
      tierFlipTimersRef.current.forEach(clearTimeout);
      tierFlipTimersRef.current = [];
      // Reset spring
      cancelAnimationFrame(springRafRef.current);
      springTimersRef.current.forEach(clearTimeout);
      springTimersRef.current = [];
      setSpringFp(null);
      setSpringSettled(false);
      pendingBalanceUpdateRef.current = null;
      lockedGaugeFpRef.current = null;
      springHasFiredRef.current = false;
      setStreakMilestone(null);
    }
  }, [gameState]);

  const flippedIds = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") return statsFlippedIds;
    const ids = new Set<string>();
    for (const c of roster) {
      if (flipState.isBack(cardId(c))) ids.add(cardId(c));
    }
    return ids;
  }, [gameState, roster, flipState, statsFlippedIds]);

  const revealingIds = useMemo(() => {
    const ids = new Set<string>();
    if (gameState === "REVEALING") {
      for (const c of roster) {
        const cid = cardId(c);
        const visFp = getVisibleFp(cid);
        if (flipState.isFlipping(cid) || (visFp !== undefined && visFp < Number((c as any).actualFp ?? 0))) {
          ids.add(cid);
        }
      }
    }
    return ids;
  }, [gameState, roster, flipState, getVisibleFp]);

  const displayRoster = roster;

  const visibleFpMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of roster) {
      const fp = getVisibleFp(cardId(c));
      if (fp !== undefined) map.set(cardId(c), fp);
    }
    return map;
  }, [roster, getVisibleFp]);

  const heldCardIds = useMemo(() => {
    if (gameState === "HOLD") return lockedCardIds;
    const held = new Set<string>();
    roster.forEach(c => { if (c.wasHeld) held.add(cardId(c)); });
    return held;
  }, [gameState, roster, lockedCardIds]);

  // Zone 2: Handlers
  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    // FTUE: only Booker can be toggled, and once held cannot unhold
    if (isFTUE && cardKey !== "ftue-booker") return;
    if (isFTUE && cardKey === "ftue-booker" && lockedCardIds.has(cardKey)) return;
    setLockedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
        soundManager.playHoldOff();
      } else {
        next.add(cardKey);
        soundManager.playHoldOn();
        const c = roster.find(x => cardId(x) === cardKey);
        if (c) gameAnalytics.cardHeld(c);
      }
      return next;
    });
  }

  function toggleStatsFlip(cardKey: string) {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    // FTUE: block ALL flips when a bubble is active
    if (isFTUE && ftueCardsBlocked) return;
    // FTUE RESULTS: only Booker is flippable while dim is active
    if (isFTUE && ftueResultsDim && cardKey !== "ftue-booker") return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
    // Track when Booker is flipped in FTUE to trigger the final bubble
    if (isFTUE && cardKey === "ftue-booker") {
      setFtueBookerFlipped(true);
      setFtueBookerPulse(false);
      // Dim stays active — lifted only after final_replay bubble is dismissed
    }
  }

  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      if (balance < currentBet) { alert("Insufficient balance!"); return; }
      resetReveal();
      resetAllOverlays();
      completedCardsRef.current = new Set();
      setDisplayTier("BUST");
      setTierResultPhase(1);
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setRevealedSalary(0);
      setLastRevealedCardId(null);
      setCelebrationHeld(false);
      setFtueOscillating(false);
      setFtueGaugeOscDone(false);
      setFtueWinCelebrationActive(false);
      setFtueBookerPulse(false);
      setFtueHoldSpotlight(false);
      pendingCelebration.current = null;
      ftueLastHandFpRef.current = 0;
      const res: any = isFTUE ? await dealFTUERoster() : await dealInitialRoster();
      const nextRoster = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      rosterRef.current = nextRoster;
      console.log('HAND DEALT CALLED');
      console.log('DEALT');
      gameAnalytics.handDealt(nextRoster);
      setNoTransition(true);
      flipState.initCards(nextRoster.map(cardId));
      setRoster(nextRoster);
      setGameState("DEALING");
      await sleep(50);
      setNoTransition(false);
      for (const c of nextRoster) flipState.revealCard(cardId(c));
      await sleep(50);
      for (const c of nextRoster) flipState.completeReveal(cardId(c));
      await sleep(400);
      setGameState("HOLD");
      return;
    }

    if (gameState === "HOLD") {
      setBalance(prev => { const next = prev - currentBet; saveBalance(next); return next; });
      const markedRoster = roster.map(c => ({ ...c, wasHeld: lockedCardIds.has(cardId(c)) }));
      flipState.beginDraw(markedRoster.filter(c => !(c as any).wasHeld).map(cardId));
      setRoster(markedRoster);
      setGameState("DRAWING");
      await sleep(700);
      const drawRes: any = isFTUE
        ? await redrawFTUERoster({ currentCards: markedRoster, lockedCardIds })
        : await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
      const resolveRes: any = isFTUE
        ? await resolveFTUERoster({ finalCards: drawnRoster })
        : await resolveRoster({ finalCards: drawnRoster, handCount });
      const finalRoster = (resolveRes?.roster ?? resolveRes?.cards ?? drawnRoster) as PlayerCard[];
      const mvp: string | undefined = resolveRes?.mvpCardId ?? resolveRes?.mvpId;
      if (mvp) setMvpId(mvp);

      const heldSalaryAtDraw = finalRoster.reduce(
        (s, c: any) => c.wasHeld ? s + Number(c.salary ?? 0) : s, 0
      );
      setRevealedSalary(heldSalaryAtDraw);

      rosterRef.current = finalRoster;
      completedCardsRef.current = new Set();
      finalRoster.forEach(c => {
        if ((c as any).wasHeld) {
          completedCardsRef.current.add(cardId(c));
        }
      });
      setNoTransition(true);
      // In tap mode: held cards stay FRONT, only non-held start BACK
      const nonHeldIds = finalRoster.filter(c => !(c as any).wasHeld).map(cardId);
      const heldIds = finalRoster.filter(c => (c as any).wasHeld).map(cardId);
      flipState.initCards(nonHeldIds);
      // Force held cards to FRONT so they never show generic back
      heldIds.forEach(id => flipState.revealCard(id));
      setTimeout(() => heldIds.forEach(id => flipState.completeReveal(id)), 0);
      setRoster(finalRoster);
      (window as any).debugRoster = finalRoster;
      setStatsFlippedIds(new Set());
      await sleep(50);
      setNoTransition(false);
      await sleep(50);
      setGameState("REVEALING");
      return;
    }

    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      gameAnalytics.sessionEnd();
      resetReveal();
      resetAllOverlays();
      ftueLastHandFpRef.current = 0;
      setFtueGaugeOscDone(false);
      completedCardsRef.current = new Set();
      setRevealedSalary(0);
      setNoTransition(true);
      const placeholders = createPlaceholders();
      flipState.initCards(placeholders.map(cardId));
      setRoster(placeholders);
      rosterRef.current = placeholders;
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setWinTier(null);
      setWinPayout(0);
      setGameState("IDLE");
      await sleep(50);
      setNoTransition(false);
    }
  }

  // FTUE: when RESULTS starts, dim non-Booker, fire bubble
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    setFtueResultsDim(true);
    setStatsFlippedIds(new Set());
    // Fire the "Darn it" bubble chain after a short settle delay
    const t = setTimeout(() => setFtueWinCelebrationActive(true), 300);
    return () => {
      setFtueResultsDim(false);
      clearTimeout(t);
    };
  }, [gameState, isFTUE]); // eslint-disable-line

  // FTUE: lift dim only after final_replay bubble dismissed (onFtueAllDone)
  useEffect(() => {
    if (ftueReplayReady) setFtueResultsDim(false);
  }, [ftueReplayReady]); // eslint-disable-line

  function onWinCelebrationComplete() {
    // Increment hand count
    if (!isFTUE) {
      const next = parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10) + 1;
      localStorage.setItem("replaymod_hand_count", String(next));
      setHandCount(next);

      // Name prompt trigger — fires once after hand 3
      if (next >= 3 && !localStorage.getItem("replaymod_name_prompted")) {
        localStorage.setItem("replaymod_name_prompted", "true");
        setTimeout(() => setShowNamePrompt(true), 3500);
      }
    }
    // Balance + streak updates already fired via pendingBalanceUpdateRef (wage animation)
    setWinTier(null);
    setWinPayout(0);
    setGameState("RESULTS");
  }

  const [wasSkipped, setWasSkipped] = useState(false);

  function handleButtonClick() {
    if (gameState === "REVEALING") {
      setRevealedSalary(capUsed);
      setWasSkipped(true);
      skipReveal();
    }
    else {
      // Fade out big win music if it's still playing (MVP/GOAT celebration)
      if (gameState === "WIN_CELEBRATION") {
        soundManager.stopBigWin();
      }
      setWasSkipped(false);
      onPrimaryAction();
    }
  }

  // Zone 2.5: FTUE legendary detection
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    for (const [cId, tag] of performanceTagMap.entries()) {
      if (tag === "GREAT") {
        const card = rosterRef.current.find(c => cardId(c) === cId);
        if (card && card.name) {
          setLegendaryCardName(card.name);
          break;
        }
      }
    }
  }, [performanceTagMap, gameState, isFTUE]); // eslint-disable-line

  // Zone 3: JSX
  if (!dataReady) {
    return (
      <div style={{
        width: "100vw", height: "100vh", maxHeight: "-webkit-fill-available",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif", gap: 16,
      }}>
        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.5 }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      color: "#EAF0FF",
      fontFamily: "'Inter', system-ui, sans-serif",
      userSelect: "none",
      boxSizing: "border-box",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      {/* ── Inner game column — 12+54+22+12 = 100dvh ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "hidden",
        overflowX: "hidden",
        width: "100%",
        maxWidth: "min(480px, 100%)",
        margin: "0 auto",
        boxSizing: "border-box",
      }}>

        {/* 1 — Header */}
        <div style={{
          flex: "0 0 12dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 4,
          padding: "0 10px 0",
          marginBottom: 8,
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div data-ftue-chrome="true" style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            padding: "2px 12px",
            backdropFilter: "blur(10px)",
          }}>
            <AppHeader
              onCollect={() => setShowCollect(true)}
              hasUncollected={taskStates.some(t => t.progress >= t.target && !t.collected)}
            />
          </div>
          <div data-ftue-chrome="true">
            <BonusRow
              betAdded={currentBet}
              streak={streak}
              milestoneHit={streak === 3 || streak === 5}
              onAmountChange={(v) => { jackpotAmountRef.current = v; }}
            />
          </div>
        </div>

        {/* 2 — Card stage */}
        <div style={{
          flex: "0 0 54dvh",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "8px 4px 6px 4px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div
            onClick={gameState === "REVEALING" && REVEAL_MODE === "auto" ? skipReveal : undefined}
            style={{
              width: "100%",
              height: "100%",
              cursor: gameState === "REVEALING" && REVEAL_MODE === "auto" ? "pointer" : "default",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <RosterGridScaleFit>
              <RosterGridAny
                roster={displayRoster}
                phase={phase}
                lockedIds={heldCardIds}
                mvpId={mvpId}
                flippedIds={flippedIds}
                revealingIds={revealingIds}
                noTransition={noTransition}
                visibleFpMap={visibleFpMap}
                canFlip={gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
                ftueFlipTargetId={isFTUE && (ftueBookerPulse || ftueHoldSpotlight) ? "ftue-booker" : null}
                flipMsMap={flipMsMap}
                fpCountUpMsMap={fpCountUpMsMap}
                performanceTagMap={performanceTagMap}
                pulseMap={pulseMap}
                shakingCardId={shakeInfo?.cardId ?? null}
                shakeType={shakeInfo?.type ?? null}
                cardShakeTypeMap={cardShakeTypeMap}
                visibleBadgesMap={visibleBadgesMap}
                glowCardId={glowState.cardId}
                glowTier={glowState.tier}
                glowDurationMs={glowState.durationMs}
                isSkipping={isSkipping}
                activeRevealCardId={activeRevealCardId}
                onToggleLock={toggleLock}
                onToggleFlip={toggleStatsFlip}
                revealMode={REVEAL_MODE}
                onTapReveal={isFTUE && ftueCardsBlocked ? undefined : (isFTUE ? (cardId: string) => {
                  tapRevealCard(cardId);
                } : (cardId: string) => {
                  // Immediately add this card's salary so budget rolls down in sync with FP roll up
                  const card = rosterRef.current.find(c => {
                    const id = String(c?.cardId ?? c?.basePlayerId ?? "");
                    return id === cardId;
                  });
                  if (card && !(card as any).wasHeld) {
                    setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
                  }
                  tapRevealCard(cardId);
                })}
                heldFpVisible={heldFpVisible}
                heldRevealedIds={heldRevealedIds}
                tappedCardIds={tappedCardIds}
                isRevealingPhase={gameState === "REVEALING"}
                ftueLockedSlot={
                  (isFTUE && ftueResultsDim)
                    ? 0
                    : (isFTUE && (ftueHoldSpotlight || heldCardIds.has("ftue-booker")) && gameState === "HOLD")
                      ? 0
                      : null
                }
              />
            </RosterGridScaleFit>
          </div>
        </div>

        {/* 3 — Zone 3: Row A score + Row B (multipliers pre-reveal / gauge post-reveal) = 22dvh */}
        <div
          {...(isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")
            ? { "data-ftue-anchor": "ftue-darnit-focus" }
            : {})}
          style={{
            flex: "0 0 20dvh",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {/* ROW A — score / tier result */}
          <div
            data-ftue-anchor="score-row"
            onClick={() => {
              if (gameState === "WIN_CELEBRATION" && showRawScore) {
                onWinCelebrationComplete();
                return;
              }
              if (gameState === "WIN_CELEBRATION" && !showRawScore) {
                setShowRawScore(true);
                return;
              }
              if (gameState === "RESULTS" && winTier && !showRawScore) setShowRawScore(true);
            }}
            style={{
              flex: "0 0 72px",
              height: 72,
              minHeight: 72,
              maxHeight: 72,
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "4px 10px 2px",
              boxSizing: "border-box",
              overflow: "hidden",
              cursor:
                (gameState === "WIN_CELEBRATION" ||
                  (gameState === "RESULTS" && winTier && !showRawScore))
                  ? "pointer"
                  : "default",
            }}
          >
            {!isFTUE && gameState === "REVEALING" ? (
              /* During spring: only FP number — no tier PNG, no flips.
                 The tier sign appears once as the final slam after spring settles. */
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", gap: 3 }}>
                <span style={{
                  fontSize: 30, fontWeight: 900, color: "#FFFFFF",
                  letterSpacing: "-0.5px", lineHeight: 1,
                  fontVariantNumeric: "tabular-nums", fontStyle: "italic",
                }}>
                  {displayFp.toFixed(1)} FP
                </span>
              </div>
            ) : !isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && !showRawScore ? (
              tierResultPhase === 1 ? (
                /* Phase 1: Big tier PNG slam — fills the row with flash */
                <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
                  {/* Screen flash behind the slam */}
                  <div
                    key={`flash-${winTier}-${gameState}`}
                    style={{
                      position: "absolute", inset: -40, borderRadius: 30,
                      background: `radial-gradient(ellipse at center, ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).color}44 0%, transparent 70%)`,
                      animation: "tierSlamFlash 600ms ease-out forwards",
                      pointerEvents: "none",
                    }}
                  />
                  {nearMissTeasing && (() => {
                    const gaugeSnap = computeGaugeState(totalFp, GAUGE_THRESHOLDS as any, winTier, NEAR_MISS_FP);
                    const nextTierKey = gaugeSnap.nextTier ?? winTier;
                    const teaseColors = CELEBRATION_TIER_COLORS[nextTierKey] ?? CELEBRATION_TIER_COLORS.BUST;
                    return (
                      <img
                        key={`tease-${nextTierKey}`}
                        src={`/${TIER_IMAGE_MAP[nextTierKey] ?? "bust1.png"}`}
                        alt={nextTierKey}
                        style={{
                          position: "absolute", maxHeight: 70, maxWidth: "95%", objectFit: "contain",
                          animation: "tierTeaseIn 350ms cubic-bezier(0.22, 1, 0.36, 1)",
                          filter: `drop-shadow(0 0 20px ${teaseColors.glow})`,
                          zIndex: 2, opacity: 0.88,
                        }}
                      />
                    );
                  })()}
                  <img
                    key={`slam-${winTier}-${nearMissTeasing}`}
                    src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                    alt={formatTierLabel(winTier)}
                    style={{
                      maxHeight: 70,
                      maxWidth: "95%",
                      objectFit: "contain",
                      animation: nearMissTeasing ? "none" : "tierSlam 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                      filter: `drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
                      position: "relative", zIndex: 1,
                      opacity: nearMissTeasing ? 0.3 : 1,
                      transition: "opacity 200ms ease",
                    }}
                  />
                </div>
              ) : (
                /* Phase 2: Settled info — two lines only */
                <div style={{
                  display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                  width: "100%", height: "100%", gap: 4,
                  animation: "tierInfoFadeIn 400ms ease-out",
                }}>
                  {/* Line 1: Tier PNG */}
                  <img
                    src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                    alt={formatTierLabel(winTier)}
                    style={{ maxHeight: 36, maxWidth: "70%", objectFit: "contain" }}
                  />
                  {/* Line 2: FP · % of possible score */}
                  <span style={{
                    fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.02em", lineHeight: 1.3, textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {displayFp.toFixed(1)} FP
                    {ceilingPct != null && (
                      <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                        {" · "}{ceilingPct}% of possible score
                      </span>
                    )}
                  </span>
                  {/* Streak + near-miss removed for beta */}
                </div>
              )
            ) : gameState === "WIN_CELEBRATION" && winTier && celebrationData && !showRawScore ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
                {(() => {
                  const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
                  return (
                    <>
                      <div style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "baseline",
                        justifyContent: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}>
                        <span style={{
                          fontSize: 24, fontWeight: 900, letterSpacing: 1, fontStyle: "italic",
                          color: tc.color, textShadow: `0 0 20px ${tc.glow}`,
                          lineHeight: 1,
                        }}>
                          {formatTierLabel(winTier)}
                        </span>
                        {winPayout > 0 && (
                          <span style={{
                            fontSize: 15, fontWeight: 800,
                            color: "rgba(255,255,255,0.6)",
                            letterSpacing: "0.04em",
                            lineHeight: 1,
                          }}>
                            +{winPayout}
                          </span>
                        )}
                      </div>
                      {winTier === "BUST" && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
                          Better luck next hand
                        </div>
                      )}
                      {nearMissCopy && (winTier === "BUST" || winTier === "ROOKIE" || winTier === "STARTER" || winTier === "ALL_STAR") && (
                        <div style={{
                          fontSize: 11, fontWeight: 700,
                          color: winTier === "BUST" ? "rgba(255,255,255,0.3)" : "#22C55E",
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          animation: "tierInfoFadeIn 500ms ease-out 600ms both",
                        }}>
                          {nearMissCopy}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : isFTUE && gameState === "RESULTS" && winTier && !showRawScore ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, width: "100%" }}>
                {(() => {
                  const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
                  return (
                    <div style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "baseline",
                      justifyContent: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}>
                      <span style={{
                        fontSize: 30, fontWeight: 950, letterSpacing: 0.5, fontStyle: "italic",
                        color: tc.color, textShadow: `0 0 22px ${tc.glow}`,
                        lineHeight: 1,
                      }}>
                        {formatTierLabel(winTier)}
                      </span>
                      {winPayout > 0 && (
                        <span style={{
                          fontSize: 22, fontWeight: 800,
                          color: "rgba(255,255,255,0.72)",
                          letterSpacing: "0.04em",
                          lineHeight: 1,
                        }}>
                          +{winPayout} coins
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 48, width: "100%" }}>
                {(() => {
                  const spent =
                    gameState === "IDLE" ? 0 :
                      gameState === "DEALING" ? 0 :
                        gameState === "HOLD" ? lockedSalary :
                          gameState === "DRAWING" ? lockedSalary :
                            gameState === "REVEALING" ? revealedSalary :
                              capUsed;
                  const remaining = CAP_MAX - spent;
                  const overBudget = remaining < 0;
                  return (
                    <>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1, fontStyle: "italic" }}>
                          <RollingNumber value={totalFp} decimals={1} duration={300} />
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 3 }}>
                          Team FP
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 2, justifyContent: "center" }}>
                          <span style={{ fontSize: 30, fontWeight: 900, color: overBudget ? "#ef4444" : "#FFFFFF", lineHeight: 1, fontStyle: "italic" }}>
                            <RollingNumber value={remaining} decimals={0} duration={300} />
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.35)", lineHeight: 1, fontStyle: "italic" }}>
                            /{CAP_MAX}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 3 }}>
                          Budget
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ROW B — fixed-height gauge slot so TierGauge Y position never shifts vs Team FP row */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              alignItems: "stretch",
              padding: "2px 10px 2px",
              boxSizing: "border-box",
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 56,
                minHeight: 56,
                maxHeight: 56,
                flexShrink: 0,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                boxSizing: "border-box",
              }}
            >
              <div
                ref={(el) => setMultipliersHost(el)}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: isPreRevealFooter ? "flex" : "none",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  pointerEvents: "auto",
                }}
              />
              {showGaugeInZone3 ? (
                <div
                  data-ftue-anchor="tier-gauge"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: isPreRevealFooter ? "none" : "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "center",
                    width: "100%",
                    overflow: "visible",
                    boxSizing: "border-box",
                    padding: "0 2px",
                  }}
                >
                  <TierGauge
                    totalFp={gaugeTotalFp}
                    thresholds={[
                      { tier: "ROOKIE", minFP: 155 },
                      { tier: "STARTER", minFP: 175 },
                      { tier: "ALL_STAR", minFP: 195 },
                      { tier: "MVP", minFP: 215 },
                      { tier: "GOAT" as any, minFP: 235 },
                    ]}
                    winTier={springSettled ? (winTier ?? undefined) : undefined}
                    lastCardFp={lastCardFp}
                    isSkip={false}
                    visible
                    ftueSuppressNormal={isFTUE && gameState === "REVEALING" && !ftueOscillating}
                    ftueOscillate={isFTUE && ftueOscillating}
                    ftueLockStaticBar={isFTUE && ftueGaugeOscDone}
                    regularFinalCardKick={regularFinalGaugeKick}
                    onTierCross={undefined}
                    postRevealCopy={postRevealCopy}
                    onFtueOscillateComplete={() => {
                      setFtueGaugeOscDone(true);
                      setFtueOscillating(false);
                      setCelebrationHeld(false);
                      pendingCelebration.current = null;
                      setGameState("RESULTS");
                      setTimeout(() => setFtueWinCelebrationActive(true), 300);
                    }}
                  />
                </div>
              ) : null}
            </div>
            {/* Streak progression UI removed for beta */}
          </div>
        </div>

        {/* 4 — Wallet + action only (14dvh) */}
        <div
          style={{
            flex: "0 0 14dvh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            minHeight: 0,
            overflow: "visible",
            boxSizing: "border-box",
          }}
        >
          <div
            ref={(el) => setControlsHost(el)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: 0,
              padding: "0 10px max(env(safe-area-inset-bottom, 0px) + 8px, 16px)",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <CoachLayer
              isFTUE={isFTUE}
              gameState={gameState}
              lockedCount={lockedCardIds.size}
              revealIndex={revealIndex}
              legendaryCardName={legendaryCardName}
              lastRevealedCardId={lastRevealedCardId}
              ftueBookerFlipped={ftueBookerFlipped}
              onCoachBubbleKey={(key) => {
                setFtueCoachBubbleKey(key);
                if (key === "hold_booker") setFtueHoldSpotlight(true);
              }}
              onResumeHeldReveal={() => {
                const resume = heldRevealResumeRef.current;
                heldRevealResumeRef.current = null;
                resume?.();
              }}
              onCelebrationReady={() => {
                // Non-FTUE: CoachLayer calls this after Booker bubble dismiss
                if (!isFTUE) {
                  setCelebrationHeld(false);
                  if (pendingCelebration.current) {
                    pendingCelebration.current = null;
                    setGameState("WIN_CELEBRATION");
                  }
                }
              }}
              onBubbleActive={(active) => setFtueCardsBlocked(active)}
              ftueWinCelebrationActive={ftueWinCelebrationActive}
              onReplayReady={() => setFtueReplayReady(true)}
              onFtueReadyToFlip={() => setFtueBookerPulse(true)}
              onFtueBookerHeld={() => { /* draw pulse handled inside CoachLayer */ }}
              onFtueAllDone={() => {
                completeFTUE();
                setFtueResultsDim(false);
              }}
              onReplay={() => {
                completeFTUE();
                setLastRevealedCardId(null);
                setCelebrationHeld(false);
                setFtueCardsBlocked(false);
                setFtueReplayReady(false);
                setFtueBookerFlipped(false);
                setFtueBookerPulse(false);
                setFtueHoldSpotlight(false);
                setFtueGaugeOscDone(false);
                pendingCelebration.current = null;
                heldRevealResumeRef.current = null;
                handleButtonClick();
              }}
            />
            <HotStreakOverlay active={hotStreak} winCount={sessionWins} />
            {showCollect && !isFTUE && (
              <CollectScreen
                taskStates={taskStates}
                loginStreak={loginStreak}
                coins={coins}
                xp={xp}
                onClose={() => setShowCollect(false)}
                onCollect={(id) => { collectTask?.(id); }}
              />
            )}
            {/* Name change prompt — after hand 3 */}
            {showNamePrompt && (
              <div style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
              }} onClick={() => setShowNamePrompt(false)}>
                <div onClick={e => e.stopPropagation()} style={{
                  background: "#111827", borderRadius: 16, padding: "24px 20px",
                  width: "min(320px, 90vw)", display: "flex", flexDirection: "column", gap: 12,
                  border: "1px solid rgba(255,215,0,0.2)",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>
                    Want to save your results? You're currently listed as:
                  </div>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    maxLength={20}
                    style={{
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 8, padding: "10px 12px", color: "#FFD700", fontSize: 16, fontWeight: 700,
                      outline: "none", width: "100%", boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => {
                      setNickname(nameInput);
                      setShowNamePrompt(false);
                    }} style={{
                      flex: 1, padding: "10px 0", background: "rgba(255,215,0,0.85)", color: "#070A12",
                      border: "none", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}>Change Name</button>
                    <button onClick={() => setShowNamePrompt(false)} style={{
                      flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>Use This Name</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Portals only — sibling of inner column */}
      <GameBar
        gameState={gameState}
        balance={balance}
        isBalanceAnimating={isBalanceAnimating}
        totalFp={totalFp}
        lastCardProgress={lastCardProgress}
        lastCardFp={lastCardFp}
        capMax={CAP_MAX}
        capUsed={capUsed}
        lockedSalary={lockedSalary}
        revealedSalary={revealedSalary}
        betMultiplier={betMultiplier}
        baseBet={BASE_BET}
        onBetMultiplier={setBetMultiplier}
        onAction={handleButtonClick}
        celebration={celebrationData}
        onWinCelebrationComplete={onWinCelebrationComplete}
        onWageAnimationComplete={() => {
          pendingBalanceUpdateRef.current?.();
          pendingBalanceUpdateRef.current = null;
        }}
        ftueDrawBlocked={isFTUE && gameState === "HOLD" && !heldCardIds.has("ftue-booker")}
        ftueHideSkip={isFTUE}
        ftuePulseNearMiss={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueGaugeOscDone}
        ftueReplayBlocked={isFTUE && gameState === "RESULTS" && !ftueReplayReady}
        dataFtuePrimaryAnchor={isFTUE ? (gameState === "HOLD" ? "draw" : "deal") : undefined}
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter}
      />

    </div>
  );
}