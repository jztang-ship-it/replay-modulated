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

const CAP_MAX        = sportAdapter.salaryCap;
const ROSTER_SIZE    = sportAdapter.rosterSize;
const STARTING_BALANCE = 1000;

// ── Reveal mode toggle ─────────────────────────────────────────────────────
// "auto" = cards flip automatically in sequence (original behaviour)
// "tap"  = user taps each unheld card to reveal it; held FP fades in at end
const REVEAL_MODE: "auto" | "tap" = "tap";

function loadBalance(): number {
  try {
    const v = localStorage.getItem("replaymod_balance");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : STARTING_BALANCE;
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

function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards.map(c => ({
    cardId: cardId(c),
    slotIndex: c.slotIndex ?? 0,
    actualFp: Number(c.actualFp ?? 0),
    projectedFp: Number(c.projectedFp ?? 0),
    salary: Number((c as any).salary ?? 0),
    tier: (c as any).tier ?? "WHITE",
    wasHeld: (c as any).wasHeld ?? false,
    badges: (c.achievements ?? []).map((a: any) => ({
      id: a.id, icon: a.icon || "⭐", label: a.label, fp: a.fp || 0,
    })),
  }));
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

// ── BonusRow — streak-based bonus pool with next milestone hint ─────────────

const BONUS_TIERS = [
  { wins: 3, pct: 5,   color: "#FFD700", glow: "#FFD70099" },
  { wins: 5, pct: 15,  color: "#FFD700", glow: "#FFD70099" },
];

// Dot config: 5 total — 3 for first tier, 2 for second
const BONUS_DOTS = [
  { threshold: 1, tierIdx: 0 },
  { threshold: 2, tierIdx: 0 },
  { threshold: 3, tierIdx: 0 },
  { threshold: 4, tierIdx: 1 },
  { threshold: 5, tierIdx: 1 },
];

function BonusRow({ betAdded, streak }: { betAdded: number; streak: number }) {
  const [amount, setAmount] = useState(JACKPOT_SEED);
  const [prevStreak, setPrevStreak] = useState(streak);
  const [pulsingDot, setPulsingDot] = useState<number | null>(null);
  const prevBetRef = useRef(0);

  // Detect streak increment → pulse the newly lit dot
  useEffect(() => {
    if (streak > prevStreak && streak > 0) {
      setPulsingDot(streak); // dot at this position just lit
      const t = setTimeout(() => setPulsingDot(null), 1200);
      setPrevStreak(streak);
      return () => clearTimeout(t);
    }
    setPrevStreak(streak);
  }, [streak]); // eslint-disable-line

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

  // What milestone are we working toward?
  const nextTier = BONUS_TIERS.find(t => streak < t.wins);
  const earnedTier = [...BONUS_TIERS].reverse().find(t => streak >= t.wins);
  const winsNeeded = nextTier ? nextTier.wins - streak : 0;

  return (
    <div style={{
      flex: "0 0 auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0px 12px",
      marginTop: 0,
      gap: 1,
    }}>
      {/* Bonus pool amount */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 14px", borderRadius: 20,
        background: "rgba(255,215,0,0.06)",
        border: "1px solid rgba(255,215,0,0.18)",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,215,0,0.6)", textTransform: "uppercase" }}>
          Bonus Pool
        </span>
        <span style={{ fontSize: 12, fontWeight: 950, color: "#FFD700", fontVariantNumeric: "tabular-nums", textShadow: "0 0 8px rgba(255,215,0,0.5)" }}>
          ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Dot tracker + reward label */}
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {BONUS_DOTS.map((dot, i) => {
          const filled = streak >= dot.threshold;
          const isPulsing = pulsingDot === dot.threshold;
          const tierColor = BONUS_TIERS[dot.tierIdx].color;
          const tierGlow  = BONUS_TIERS[dot.tierIdx].glow;
          const isBreak = i === 2;

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{
                width: filled ? 8 : 7,
                height: filled ? 8 : 7,
                borderRadius: "50%",
                background: filled ? tierColor : "rgba(255,255,255,0.12)",
                boxShadow: isPulsing
                  ? `0 0 0 4px ${tierGlow}, 0 0 12px ${tierColor}`
                  : filled
                  ? `0 0 6px ${tierGlow}`
                  : "none",
                transform: isPulsing ? "scale(1.5)" : "scale(1)",
                transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }} />
              {isBreak && (
                <div style={{
                  width: 14, height: 1,
                  background: "rgba(255,255,255,0.1)",
                  margin: "0 2px",
                }} />
              )}
            </div>
          );
        })}

        {/* Reward label — what you get or what you're chasing */}
        <span style={{
          fontSize: 9, fontWeight: 700, marginLeft: 6,
          color: earnedTier ? earnedTier.color : "rgba(255,255,255,0.25)",
          letterSpacing: "0.06em",
          textShadow: earnedTier ? `0 0 8px ${earnedTier.glow}` : "none",
          transition: "color 0.4s ease",
        }}>
          {earnedTier ? `+${earnedTier.pct}%` : nextTier ? `+${nextTier.pct}%` : ""}
        </span>
      </div>

      {/* Contextual hint line */}
      {nextTier && (
        <div style={{
          fontSize: 8, fontWeight: 600,
          color: "rgba(255,255,255,0.25)",
          letterSpacing: "0.05em",
        }}>
          {winsNeeded} more {winsNeeded === 1 ? "win" : "wins"} for {nextTier.pct}% of pool
        </div>
      )}
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

  // Hand count — drives Protected mode (hands 2-30 get top-60% log sampling)
  // Hand 1 is always FTUE. Persisted across sessions.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10)
  );

  // Zone 1: Hooks
  useEffect(() => {
    ensureLoaded().then(() => setDataReady(true)).catch(console.error);
  }, []);

  const flipState       = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet      = BASE_BET * betMultiplier;
  const gameAnalytics   = useGameAnalytics("basketball");

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
    onCardComplete: useCallback((cId: string) => {
      setRevealIndex(prev => prev + 1);
      setLastRevealedCardId(cId);
      // FTUE: start gauge oscillation shortly after Booker's stamp lands
      // 100ms delay lets onAllComplete fire first (sets winTier/winPayout)
      if (isFTUE && cId === "ftue-booker") {
        setTimeout(() => setFtueOscillating(true), 100);
      }
    }, [isFTUE]),
    onAllComplete: useCallback((totalFp: number) => {
      clearActiveCard();
      if (isFTUE) ftueLastHandFpRef.current = totalFp;
      const tier = calculateWinTier(totalFp);
      const payout = calculatePayout(tier, currentBet);
      setWinTier(tier);
      setWinPayout(payout);
      const bust = !tier || tier === "BUST";
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
    return "HOLD";
  }, [gameState]);

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

  // Regular mode: let final anchor card FP count up first, then animate gauge jump.
  // While anchor is actively rolling up, freeze gauge at pre-anchor total.
  const gaugeTotalFp = useMemo(() => {
    if (isFTUE || gameState !== "REVEALING" || !anchorCardId) return totalFp;
    if (activeRevealCardId !== anchorCardId) return totalFp;
    if (lastCardProgress >= 1) return totalFp;
    const anchorVisible = getVisibleFp(anchorCardId) ?? 0;
    return Math.max(0, totalFp - anchorVisible);
  }, [isFTUE, gameState, anchorCardId, activeRevealCardId, lastCardProgress, getVisibleFp, totalFp]);

  const regularFinalGaugeKick =
    !isFTUE &&
    gameState === "REVEALING" &&
    !!anchorCardId &&
    lastRevealedCardId === anchorCardId &&
    lastCardProgress >= 1 &&
    !regularFinalGaugeKickFiredRef.current;

  useEffect(() => {
    if (regularFinalGaugeKick) regularFinalGaugeKickFiredRef.current = true;
  }, [regularFinalGaugeKick]);

  useEffect(() => {
    if (isFTUE) return;
    if (gameState === "REVEALING") regularFinalGaugeKickFiredRef.current = false;
  }, [gameState, isFTUE]);

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
      if (next.has(cardKey)) { next.delete(cardKey); } else { next.add(cardKey); const c = roster.find(x => cardId(x) === cardKey); if (c) gameAnalytics.cardHeld(c); }
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
    // Increment hand count for Protected mode tracking
    if (!isFTUE) {
      setHandCount(prev => {
        const next = prev + 1;
        localStorage.setItem("replaymod_hand_count", String(next));
        return next;
      });
    }
    if (winPayout > 0) {
      setIsBalanceAnimating(true);
      setBalance(prev => prev + winPayout);
      setTimeout(() => setIsBalanceAnimating(false), 2000);
      setStreak(prev => {
        const next = prev + 1;
        localStorage.setItem("replaymod_streak", String(next));
        return next;
      });
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
          REPLAY <span style={{ color: "#FFB14A" }}>FS</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: "100vw",
      height: "100dvh",
      maxHeight: "-webkit-fill-available",
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
      {/* ── Inner game column — 14+48+14+20 = 96dvh (4 bands; ~4dvh buffer) ── */}
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
          flex: "0 0 14dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 10px 2px",
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
          flex: "0 0 48dvh",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "2px 4px 6px 4px",
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
            <RosterGrid
  roster={displayRoster}
  phase={phase}
  lockedIds={heldCardIds}
  mvpId={mvpId}
  flippedIds={flippedIds}
  revealingIds={revealingIds}
  noTransition={noTransition}
  visibleFpMap={visibleFpMap}
  canFlip={gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
  ftueFlipTargetId={isFTUE && ftueBookerPulse ? "ftue-booker" : null}
  flipMsMap={flipMsMap}
  fpCountUpMsMap={fpCountUpMsMap}
  performanceTagMap={performanceTagMap}
  pulseMap={pulseMap}
  shakingCardId={shakeInfo?.cardId ?? null}
  shakeType={shakeInfo?.type ?? null}
  cardShakeTypeMap={cardShakeTypeMap}
  visibleBadgesMap={visibleBadgesMap}
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

        {/* 3 — Score + TierGauge (8+6 = 14dvh) */}
        <div
          {...(isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")
            ? { "data-ftue-anchor": "ftue-darnit-focus" }
            : {})}
          style={{
          flex: "0 0 14dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          minHeight: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}>
        <div
          data-ftue-anchor="score-row"
          onClick={gameState === "WIN_CELEBRATION" ? onWinCelebrationComplete : undefined}
          style={{
            flex: "0 0 8dvh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 10px",
            boxSizing: "border-box",
            overflow: "hidden",
            cursor: gameState === "WIN_CELEBRATION" ? "pointer" : "default",
          }}
        >
          {gameState === "WIN_CELEBRATION" && winTier && celebrationData ? (
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
                  </>
                );
              })()}
            </div>
          ) : isFTUE && gameState === "RESULTS" && winTier ? (
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

        <div style={{
          flex: "0 0 6dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "center",
          padding: "0 10px",
          paddingTop: 2,
          marginBottom: 6,
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div data-ftue-anchor="tier-gauge" style={{ width: "100%", overflow: "hidden" }}>
            <TierGauge
              totalFp={gaugeTotalFp}
              thresholds={[
                { tier: "ROOKIE",   minFP: 155 },
                { tier: "STARTER",  minFP: 175 },
                { tier: "ALL_STAR", minFP: 195 },
                { tier: "MVP",      minFP: 215 },
                { tier: "GOAT" as any, minFP: 235 },
              ]}
              winTier={winTier ?? undefined}
              lastCardFp={lastCardFp}
              isSkip={wasSkipped}
              visible={gameState === "REVEALING" || gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
              ftueSuppressNormal={isFTUE && gameState === "REVEALING" && !ftueOscillating}
              ftueOscillate={isFTUE && ftueOscillating}
              ftueLockStaticBar={isFTUE && ftueGaugeOscDone}
              regularFinalCardKick={regularFinalGaugeKick}
              onFtueOscillateComplete={() => {
                setFtueGaugeOscDone(true);
                setFtueOscillating(false);
                setCelebrationHeld(false);
                pendingCelebration.current = null;
                setGameState("RESULTS");
                // CoachLayer listens for this to enqueue darnit → results_devin (RESULTS effect also schedules — backup if that timeout is cleared)
                setTimeout(() => setFtueWinCelebrationActive(true), 300);
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", width: "100%" }}>
            {winTier && gameState === "RESULTS" && !isFTUE && (() => {
              const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
              const label = formatTierLabel(winTier);
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 900, letterSpacing: 2,
                    textTransform: "uppercase", color: tc.color,
                    textShadow: `0 0 10px ${tc.glow}`,
                    fontStyle: "italic",
                  }}>
                    {label}
                  </span>
                  {winPayout > 0 && (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
                      +{winPayout} coins
                    </span>
                  )}
                  {winTier === "BUST" && (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      Better luck next hand
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        </div>

        {/* 4 — Bottom: multipliers + controls (20dvh), pinned to end */}
        <div style={{
          flex: "0 0 20dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 4,
          minHeight: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}>
        <div
          data-ftue-chrome="true"
          ref={(el) => setMultipliersHost(el)}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 10px",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        />

        <div
          ref={(el) => setControlsHost(el)}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "0 10px calc(env(safe-area-inset-bottom, 0px) + 16px)",
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
      />

    </div>
  );
}