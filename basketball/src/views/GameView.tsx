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
import { calculateWinTier, calculatePayout, type WinTier } from "../utils/payoutLogic";
import { useGameAnalytics } from "../../../shared/analytics/useGameAnalytics";
import { HotStreakOverlay } from '@shared/engagement/HotStreakOverlay';
import { CollectScreen }  from '@shared/engagement/CollectScreen';
import { TierGauge }      from '@shared/components/TierGauge';
import { useEngagement }    from '@shared/engagement/useEngagement';
import { CoinDisplay }      from '@shared/engagement/CoinDisplay';
import { DailyTasksPanel }  from '@shared/engagement/DailyTasksPanel';
import { XPBar }            from '@shared/engagement/XPBar';
import { soundManager }     from '@shared/utils/soundManager';
import { audioDirector }   from '@shared/utils/audioDirector';
import { getPlayerUid, getNickname, setNickname } from '@shared/utils/playerIdentity';

// Test-wire only: allow passing glow props even if wrapper prop types lag behind.
const RosterGridAny = RosterGrid as any;

const CAP_MAX        = sportAdapter.salaryCap;
const ROSTER_SIZE    = sportAdapter.rosterSize;
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
  try { localStorage.setItem("replaymod_balance", String(v)); } catch {}
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
const BASE_BET       = 10;

// ── Jackpot constants ──────────────────────────────────────────────────────
const JACKPOT_SEED     = 12_451.29;
const JACKPOT_BET_RAKE = 0.05;   // 5% of each bet added to pot
const TICK_INTERVAL_MS = 3000;
const TICK_AMOUNT      = 0.01;

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
  } catch {} // Non-critical — never block game flow
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
  { wins: 3, pct: 5,   color: "#FFD700", glow: "#FFD70099" },
  { wins: 5, pct: 15,  color: "#FFD700", glow: "#FFD70099" },
];

const BONUS_DOTS = [
  { threshold: 1, tierIdx: 0 },
  { threshold: 2, tierIdx: 0 },
  { threshold: 3, tierIdx: 0 },
  { threshold: 4, tierIdx: 1 },
  { threshold: 5, tierIdx: 1 },
];

function BonusRow({ betAdded, streak = 0 }: { betAdded: number; streak?: number }) {
  const [amount, setAmount] = useState(JACKPOT_SEED);
  const prevBetRef = useRef(0);
  const streakGlow = streak >= 5 ? 0.22 : streak >= 3 ? 0.14 : streak >= 1 ? 0.08 : 0.06;
  const streakBorder = streak >= 5 ? "rgba(255,215,0,0.55)" : streak >= 3 ? "rgba(255,215,0,0.38)" : streak >= 1 ? "rgba(255,215,0,0.25)" : "rgba(255,215,0,0.18)";
  const streakShadow = streak > 0 ? `0 0 ${6 + streak * 3}px rgba(255,215,0,${streakGlow})` : "none";

  useEffect(() => {
    const id = setInterval(() => {
      setAmount(p => parseFloat((p + TICK_AMOUNT).toFixed(2)));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (betAdded > 0 && betAdded !== prevBetRef.current) {
      prevBetRef.current = betAdded;
      const contribution = parseFloat((betAdded * JACKPOT_BET_RAKE).toFixed(2));
      if (contribution > 0) setAmount(p => parseFloat((p + contribution).toFixed(2)));
    }
  }, [betAdded]);

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
        boxShadow: streakShadow,
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
  const [gameState, setGameState]           = useState<GameState>("IDLE");
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
  const [dataReady, setDataReady]           = useState(false);
  const [roster, setRoster]                 = useState<PlayerCard[]>(createPlaceholders());
  const [lockedCardIds, setLockedCardIds]   = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId]                   = useState<string | undefined>();
  const [betMultiplier, setBetMultiplier]   = useState(1);
  const [balance, setBalance]               = useState(() => loadBalance());
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [winTier, setWinTier]               = useState<WinTier | null>(null);
  const [winPayout, setWinPayout]           = useState(0);
  const [showRawScore, setShowRawScore]     = useState(false);

  useEffect(() => {
    if (gameState === "IDLE" || gameState === "HOLD") setShowRawScore(false);
  }, [gameState]);
  const [noTransition, setNoTransition]     = useState(false);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const rosterRef = useRef<PlayerCard[]>([]);
  const { isFTUE, completeFTUE } = useFTUE("basketball");
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [revealIndex, setRevealIndex]           = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string|null>(null);
  const [celebrationHeld,    setCelebrationHeld]    = useState(false);
  const [ftueCardsBlocked,   setFtueCardsBlocked]   = useState(false);
  const [ftueReplayReady,    setFtueReplayReady]    = useState(false);
  const [ftueResultsDim,     setFtueResultsDim]     = useState(false);
  const [ftueBookerFlipped,  setFtueBookerFlipped]  = useState(false);
  const [ftueOscillating,          setFtueOscillating]          = useState(false);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300
  });
  /** After FTUE scripted gauge animation completes — bar stays frozen until next hand */
  const [ftueGaugeOscDone,         setFtueGaugeOscDone]         = useState(false);
  const [ftueWinCelebrationActive, setFtueWinCelebrationActive] = useState(false);
  const [ftueBookerPulse,          setFtueBookerPulse]          = useState(false);
  const [ftueHoldSpotlight,        setFtueHoldSpotlight]        = useState(false);
  const [ftueCoachBubbleKey,     setFtueCoachBubbleKey]       = useState<string | null>(null);
  const pendingCelebration   = useRef<{totalFp:number}|null>(null);
  /** FTUE: roster sum can read 0 briefly in RESULTS — keep last resolved hand FP for TierGauge */
  const ftueLastHandFpRef    = useRef(0);
  const heldRevealResumeRef  = useRef<(() => void) | null>(null);
  const completedCardsRef = useRef<Set<string>>(new Set());
  const regularFinalGaugeKickFiredRef = useRef(false);
  // Near your other useState declarations in GameView.tsx
const [streak, setStreak] = useState<number>(() =>
  parseInt(localStorage.getItem("replaymod_streak") ?? "0", 10)
);

  // Tier flip display state
  const [tierFlipKey, setTierFlipKey] = useState(0);
  const [displayTier, setDisplayTier] = useState("BUST");
  const prevRevealTierRef = useRef("BUST");
  const lastTierFlipTimeRef = useRef(0);
  const tierFlipTimerRef = useRef<number | null>(null);
  const latestGaugeFpRef = useRef(0);
  // Phase 1 = big PNG slam, Phase 2 = settled info view
  const [tierResultPhase, setTierResultPhase] = useState<1 | 2>(1);

  // Hand count — drives Protected mode (hands 2-30 get top-60% log sampling)
  // Hand 1 is always FTUE. Persisted across sessions.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10)
  );

  // Zone 1: Hooks

  // ── Audio phase sync — maps GameState to AudioPhase ──────────────────
  useEffect(() => {
    const phaseMap: Record<GameState, import('@shared/utils/audioDirector').AudioPhase> = {
      IDLE:             "IDLE",
      DEALING:          "DEAL",
      HOLD:             "HOLD",
      DRAWING:          "DRAW",
      REVEALING:        "REVEAL",
      RESULTS:          "RESULTS",
      WIN_CELEBRATION:  "CELEBRATION",
    };
    audioDirector.setPhase(phaseMap[gameState] ?? "IDLE");
  }, [gameState]);

  useEffect(() => {
    ensureLoaded().then(() => setDataReady(true)).catch(console.error);
  }, []);

  const flipState       = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet      = BASE_BET * betMultiplier;
  const gameAnalytics   = useGameAnalytics("basketball");

  function handleCardRevealStart(cardId: string, tierArg: string, shakeType?: string | null) {
    const tier = tierArg?.toUpperCase() ?? "WHITE";
    const st = shakeType ?? null;
    // Must match glowMsForReveal() in useEmotionalReveal
    const base = tier === "ORANGE" ? 900
               : tier === "PURPLE" ? 700
               : tier === "BLUE"   ? 400
               : tier === "GREEN"  ? 350
               :                     250;
    const modifier = st === "legendary" ?  300
                   : st === "big"       ?  150
                   : st === "frozen"    ? -100
                   : st === "cold"      ?  -50
                   :                        0;
    const duration = isSkippingRef.current
      ? (tier === "ORANGE" ? (st === "legendary" ? 500 : 400)
       : tier === "PURPLE" ? (st === "legendary" || st === "big" ? 350 : 300)
       : tier === "BLUE"   ? 200
       : tier === "GREEN"  ? 175
       :                     125)
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
    onAllComplete: useCallback((totalFp: number) => {
      clearActiveCard();
      soundManager.stopRevealAmbience();
      if (isFTUE) ftueLastHandFpRef.current = totalFp;
      const tier = calculateWinTier(totalFp);
      const payout = calculatePayout(tier, currentBet);
      setWinTier(tier);
      setWinPayout(payout);
      const bust = !tier || tier === "BUST";
      // Result sounds by outcome
      if (tier === "MVP" || tier === "GOAT") {
        soundManager.playBigWin();
      } else if (tier === "ALL_STAR" || tier === "STARTER") {
        soundManager.playTierSlam();
      } else if (tier === "ROOKIE") {
        soundManager.playNearMiss();
      } else if (bust) {
        soundManager.playBust();
      }
      const badges = rosterRef.current.reduce((s,c) => s + (c.achievements?.length ?? 0), 0);
      gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
      recordHandPlayed();
      if (!bust) recordHandWon();
      else recordHandLost();
      // Pause 1200ms on final score — user sees the total before celebration kicks in
      setTimeout(() => {
        if (isFTUE) {
          pendingCelebration.current = { totalFp };
          setCelebrationHeld(true);
        } else {
          setGameState("WIN_CELEBRATION");
        }
      }, 1200);
    }, [currentBet, gameAnalytics, isFTUE, recordHandPlayed, recordHandWon, recordHandLost]),
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
    GOAT:     { color: "#EF4444", glow: "#EF444499" },
    MVP:      { color: "#FB923C", glow: "#FB923C55" },
    ALL_STAR: { color: "#C084FC", glow: "#C084FC55" },
    STARTER:  { color: "#00FFD8", glow: "#00FFD855" },
    ROOKIE:   { color: "#22C55E", glow: "#22C55E55" },
    BUST:     { color: "#6B7280", glow: "#6B728033" },
  };

  const formatTierLabel = (tier: string) => {
    if (tier === "BUST") return "BUST";
    if (tier === "GOAT") return "G.O.A.T.";
    return tier.replace("_", "-");
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    return {
      tierLabel: formatTierLabel(winTier),
      tierColor: tc.color,
      tierGlow:  tc.glow,
      payout:    winPayout,
      streak,
      isBust:    winTier === "BUST",
    };
  }, [gameState, winTier, winPayout, streak]); // eslint-disable-line

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

  // Gauge: direct pass-through — totalFp updates every frame via interpolated visibleFpMap
  const gaugeTotalFp = totalFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // No spring on results — direct-set keeps bar accurate. Spring to be added later.
  const regularFinalGaugeKick = false;

  // Tier result phase: Phase 1 = big slam, Phase 2 = info view
  useEffect(() => {
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && !isFTUE) {
      setTierResultPhase(1);
      const t = setTimeout(() => setTierResultPhase(2), 1800);
      return () => clearTimeout(t);
    }
  }, [gameState, winTier, isFTUE]);

  // Track tier boundary crossings — paced flip with minimum display time per tier
  // Tier flip — shows EVERY intermediate tier for 600ms each.
  // When gauge crosses multiple tiers, schedules each one on a 600ms chain.
  const TIER_ORDER_LIST = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];
  const tierFlipTimersRef = useRef<number[]>([]);

  const handleTierCross = useCallback((tier: string) => {
    if (isFTUE) return;
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
      const res: any       = isFTUE ? await dealFTUERoster() : await dealInitialRoster();
      const nextRoster     = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      rosterRef.current    = nextRoster;
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
      const drawRes: any    = isFTUE
        ? await redrawFTUERoster({ currentCards: markedRoster, lockedCardIds })
        : await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster     = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
      const resolveRes: any = isFTUE
        ? await resolveFTUERoster({ finalCards: drawnRoster })
        : await resolveRoster({ finalCards: drawnRoster, handCount });
      const finalRoster     = (resolveRes?.roster ?? resolveRes?.cards ?? drawnRoster) as PlayerCard[];
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
      const heldIds    = finalRoster.filter(c =>  (c as any).wasHeld).map(cardId);
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
    // Increment hand count — read from localStorage (always current)
    // then sync React state, avoiding stale-closure issues.
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
    if (winPayout > 0) {
      setIsBalanceAnimating(true);
      setBalance(prev => prev + winPayout);
      setTimeout(() => setIsBalanceAnimating(false), 2000);
      setStreak(prev => {
        const next = prev + 1;
        localStorage.setItem("replaymod_streak", String(next));
        if (next === 3 || next === 5 || next === 10) soundManager.playStreakMilestone(next);
        // Submit streak to leaderboard
        submitToLeaderboard("streak", next);
        return next;
      });
      // Submit win + FP
      submitToLeaderboard("wins", 1);
      const gameFp = roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
      if (gameFp > 0) submitToLeaderboard("fp", gameFp);
    } else {
      setStreak(0);
      localStorage.setItem("replaymod_streak", "0");
    }
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
            <BonusRow betAdded={currentBet} streak={streak} />
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
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", gap: 3 }}>
                {displayTier !== "BUST" ? (
                  /* Tier crossed — show tier PNG with flip animation via wrapper div */
                  <div
                    key={`flip-wrap-${tierFlipKey}`}
                    style={{
                      animation: tierFlipKey > 0 ? "tierFlip 500ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
                      display: "flex", justifyContent: "center", alignItems: "center",
                    }}
                  >
                    <img
                      src={`/${TIER_IMAGE_MAP[displayTier] ?? "bust1.png"}`}
                      alt={formatTierLabel(displayTier)}
                      style={{ height: 48, maxWidth: "90%", objectFit: "contain" }}
                    />
                  </div>
                ) : null}
                <span style={{
                  fontSize: displayTier === "BUST" ? 30 : 15,
                  fontWeight: 900,
                  color: displayTier === "BUST" ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                  letterSpacing: displayTier === "BUST" ? "-0.5px" : "0.03em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  fontStyle: displayTier === "BUST" ? "italic" : "normal",
                }}>
                  <RollingNumber value={totalFp} decimals={1} duration={300} /> FP
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
                  <img
                    key={`slam-${winTier}-${gameState}`}
                    src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                    alt={formatTierLabel(winTier)}
                    style={{
                      maxHeight: 70,
                      maxWidth: "95%",
                      objectFit: "contain",
                      animation: "tierSlam 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                      filter: `drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
                      position: "relative", zIndex: 1,
                    }}
                  />
                </div>
              ) : (
                /* Phase 2: Settled info — PNG + FP + streak, fades in */
                <div style={{
                  display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                  width: "100%", height: "100%", gap: 1,
                  animation: "tierInfoFadeIn 400ms ease-out",
                }}>
                  <img
                    src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                    alt={formatTierLabel(winTier)}
                    style={{ maxHeight: 36, maxWidth: "70%", objectFit: "contain" }}
                  />
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                    letterSpacing: "0.04em", lineHeight: 1,
                  }}>
                    {totalFp.toFixed(1)} FP{winPayout > 0 ? ` · +${winPayout}` : ""}
                    {winPayout > 0 && <BetMultSuffix m={betMultiplier} />}
                    {winTier === "BUST" && " · Better luck next hand"}
                  </span>
                  {(() => {
                    const _nt = BONUS_TIERS.find(t => streak < t.wins);
                    const _et = [...BONUS_TIERS].reverse().find(t => streak >= t.wins);
                    const _wn = _nt ? _nt.wins - streak : 0;
                    return (
                      <span style={{ fontSize: 10, fontWeight: 700, color: _et ? "#FFD700" : "rgba(255,255,255,0.3)", lineHeight: 1 }}>
                        {streak === 0
                          ? "Win 3 in a row for +5% bonus pool"
                          : _et && !_nt
                          ? `🔥 +${_et.pct}% bonus pool active`
                          : _et
                          ? `🔥 +${_et.pct}% · ${_wn} ${_wn === 1 ? "win" : "wins"} to +${_nt!.pct}%`
                          : `${_wn} ${_wn === 1 ? "win" : "wins"} to +${_nt!.pct}% bonus`}
                      </span>
                    );
                  })()}
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
                            <BetMultSuffix m={betMultiplier} />
                          </span>
                        )}
                      </div>
                      {winTier === "BUST" && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
                          Better luck next hand
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
                          <BetMultSuffix m={betMultiplier} />
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
                    gameState === "IDLE"      ? 0 :
                    gameState === "DEALING"   ? 0 :
                    gameState === "HOLD"      ? lockedSalary :
                    gameState === "DRAWING"   ? lockedSalary :
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
                      { tier: "ROOKIE",   minFP: 155 },
                      { tier: "STARTER",  minFP: 175 },
                      { tier: "ALL_STAR", minFP: 195 },
                      { tier: "MVP",      minFP: 215 },
                      { tier: "GOAT" as any, minFP: 235 },
                    ]}
                    winTier={undefined}
                    lastCardFp={lastCardFp}
                    isSkip={false}
                    visible
                    ftueSuppressNormal={isFTUE && gameState === "REVEALING" && !ftueOscillating}
                    ftueOscillate={isFTUE && ftueOscillating}
                    ftueLockStaticBar={isFTUE && ftueGaugeOscDone}
                    regularFinalCardKick={regularFinalGaugeKick}
                    onTierCross={handleTierCross}
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
            {showGaugeInZone3 && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && (() => {
              const _nt = BONUS_TIERS.find(t => streak < t.wins);
              const _et = [...BONUS_TIERS].reverse().find(t => streak >= t.wins);
              const _wn = _nt ? _nt.wins - streak : 0;
              const isBust = winTier === "BUST";
              return (
                <div style={{
                  display: "flex", flexDirection: "row", alignItems: "center",
                  justifyContent: "center", flexWrap: "nowrap", gap: 5,
                  marginTop: 4, flexShrink: 0, height: 18, maxHeight: 18, overflow: "hidden",
                }}>
                  {streak > 0 && BONUS_DOTS.map((dot, i) => {
                    const filled = streak >= dot.threshold;
                    const tc = BONUS_TIERS[dot.tierIdx].color;
                    const tg = BONUS_TIERS[dot.tierIdx].glow;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: filled ? tc : "rgba(255,255,255,0.12)", boxShadow: filled ? `0 0 4px ${tg}` : "none", flexShrink: 0 }} />
                        {i === 2 && <div style={{ width: 6, height: 1, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                  {streak > 0 && (_et || _nt) && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: _et ? _et.color : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                      {_et && !_nt ? `+${_et.pct}% bonus pool active 🔥` : _et ? `+${_et.pct}%` : `+${_nt!.pct}%`}
                    </span>
                  )}
                  {streak > 0 && _nt && _wn > 0 && (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                      · {_wn} {_wn === 1 ? "win" : "wins"} away
                    </span>
                  )}
                  {streak === 0 && (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em", flexShrink: 0 }}>
                      Win 3 in a row for +5% bonus pool
                    </span>
                  )}
                </div>
              );
            })()}
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