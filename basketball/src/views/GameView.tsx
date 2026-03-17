/**
 * GameView.tsx
 * Orchestration only. No flip logic lives here.
 * Flip state is owned by useCardFlipState.
 * Reveal sequence is owned by useEmotionalReveal.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
import PostGameScreen, { PostGameOverlay } from "@shared/components/PostGameScreen";
import { buildPostGameResult } from "../utils/buildPostGameResult";
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

// ── BonusRow — streak-based bonus pool with next milestone hint ─────────────

const BONUS_TIERS = [
  { wins: 3, pct: 5,   color: "#FFD700", glow: "#FFD70099" },
  { wins: 5, pct: 15,  color: "#FB923C", glow: "#FB923C99" },
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
      marginTop: -1,
      gap: 5,
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
  const pendingCelebration   = useRef<{totalFp:number}|null>(null);
  const heldRevealResumeRef  = useRef<(() => void) | null>(null);
  const completedCardsRef = useRef<Set<string>>(new Set());
  // Near your other useState declarations in GameView.tsx
const [streak, setStreak] = useState<number>(() =>
  parseInt(localStorage.getItem("replaymod_streak") ?? "0", 10)
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
      const card = rosterRef.current.find(c => cardId(c) === cId);
      if (card && !(card as any).wasHeld) {
        setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
      }
      setRevealIndex(prev => prev + 1);
      setLastRevealedCardId(cId);
    }, []),
    onAllComplete: useCallback((totalFp: number) => {
      clearActiveCard();
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
      if (isFTUE) {
        // In FTUE: hold celebration until Booker bubble is dismissed
        pendingCelebration.current = { totalFp };
        setCelebrationHeld(true);
      } else {
        setGameState("WIN_CELEBRATION");
      }
    }, [currentBet, gameAnalytics, isFTUE, recordHandPlayed, recordHandWon, recordHandLost]),
  });

  // Zone 2: Derived values
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    return "HOLD";
  }, [gameState]);

  // Tier color map — mirrors WIN_TIERS in basketball/GameBar.tsx
  const CELEBRATION_TIER_COLORS: Record<string, { color: string; glow: string }> = {
    JACKPOT:  { color: "#FFD700", glow: "#FFD70099" },
    MVP:      { color: "#FB923C", glow: "#FB923C55" },
    ALL_STAR: { color: "#C084FC", glow: "#C084FC55" },
    STARTER:  { color: "#FFD700", glow: "#FFD70055" },
    ROOKIE:   { color: "#CD7F32", glow: "#CD7F3233" },
    BUST:     { color: "#6B7280", glow: "#6B728033" },
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    return {
      tierLabel: winTier.replace("_", "-"),
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
      return roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
    }
    return 0;
  }, [gameState, runningTotalFp, roster]);

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
      // Lift dim once Booker is flipped
      setTimeout(() => setFtueResultsDim(false), 300);
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
      pendingCelebration.current = null;
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
        : await resolveRoster({ finalCards: drawnRoster });
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

  // FTUE: when RESULTS starts, dim non-Booker, show TAP hint on Booker
  // User must manually tap Booker to flip — no auto-flip
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    setFtueResultsDim(true);
    // Clear any pre-flipped state so Booker starts face-up
    setStatsFlippedIds(new Set());
    return () => setFtueResultsDim(false);
  }, [gameState, isFTUE]); // eslint-disable-line

  function onWinCelebrationComplete() {
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
  
  function handleButtonClick() {
    if (gameState === "REVEALING") skipReveal();
    else onPrimaryAction();
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
      width: "100vw", height: "100vh", maxHeight: "-webkit-fill-available", overflow: "clip",
      display: "flex", flexDirection: "column", alignItems: "center",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif", userSelect: "none",
    }}>
      <div style={{
        width: "100%", maxWidth: 460, height: "100%",
        display: "flex", flexDirection: "column", gap: 2,
        padding: "env(safe-area-inset-top, 4px) 12px calc(env(safe-area-inset-bottom, 0px) + 2px)",
        boxSizing: "border-box",
      }}>

        {/* Header: wordmark + tabs */}
        <div style={{
          flex: "0 0 auto", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.05)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
          padding: "5px 12px", backdropFilter: "blur(10px)",
        }}>
          <AppHeader
            onCollect={() => setShowCollect(true)}
            hasUncollected={taskStates.some(t => t.progress >= t.target && !t.collected)}
          />
        </div>

        {/* Bonus pool row */}
        <BonusRow betAdded={currentBet} streak={streak} />

        {/* Card grid */}
        <div style={{ flex: "1 1 auto", minHeight: 0, maxHeight: "55dvh", position: "relative", zIndex: 20, overflow: "visible" }}>
          <div
            onClick={gameState === "REVEALING" && REVEAL_MODE === "auto" ? skipReveal : undefined}
            style={{
              height: "100%", borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "#070A12",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)", padding: 10,
              cursor: gameState === "REVEALING" && REVEAL_MODE === "auto" ? "pointer" : "default",
              overflow: "visible",
            }}
          >
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
  ftueFlipTargetId={isFTUE && ftueResultsDim ? "ftue-booker" : null}
  flipMsMap={flipMsMap}
  fpCountUpMsMap={fpCountUpMsMap}
  performanceTagMap={performanceTagMap}
  pulseMap={pulseMap}
  shakingCardId={shakeInfo?.cardId ?? null}
  shakeType={shakeInfo?.type ?? null}
  cardShakeTypeMap={cardShakeTypeMap}   // ← add this
  visibleBadgesMap={visibleBadgesMap}
  activeRevealCardId={activeRevealCardId}
  onToggleLock={toggleLock}
  onToggleFlip={toggleStatsFlip}
  revealMode={REVEAL_MODE}
  onTapReveal={isFTUE && ftueCardsBlocked ? undefined : (isFTUE ? (cardId: string) => {
    setFtueCardsBlocked(true); // block immediately, before bubble delay
    tapRevealCard(cardId);
  } : tapRevealCard)}
  heldFpVisible={heldFpVisible}
  heldRevealedIds={heldRevealedIds}
  tappedCardIds={tappedCardIds}
  isRevealingPhase={gameState === "REVEALING"}
  ftueLockedSlot={(isFTUE && gameState === "HOLD" && !heldCardIds.has("ftue-booker")) || (isFTUE && ftueResultsDim) ? 0 : null}
/>

          </div>
        </div>

        {/* Bottom bar: tier progress + balance/fp/budget + bet + action */}
        <div style={{
          flex: "0 0 auto", position: "relative", zIndex: 30, padding: "6px 12px 2px",
          
        }}>
          {/* FTUE Coach Bubbles */}
          <CoachLayer
            isFTUE={isFTUE}
            gameState={gameState}
            lockedCount={lockedCardIds.size}
            revealIndex={revealIndex}
            legendaryCardName={legendaryCardName}
            lastRevealedCardId={lastRevealedCardId}
            ftueBookerFlipped={ftueBookerFlipped}
            onResumeHeldReveal={() => {
              // Called by CoachLayer after last non-Booker card bubble dismissed
              const resume = heldRevealResumeRef.current;
              heldRevealResumeRef.current = null;
              resume?.();
            }}
            onCelebrationReady={() => {
              setCelebrationHeld(false);
              if (pendingCelebration.current) {
                pendingCelebration.current = null;
                setGameState("WIN_CELEBRATION");
              }
            }}
            onBubbleActive={(active) => setFtueCardsBlocked(active)}
            onReplayReady={() => setFtueReplayReady(true)}
            onReplay={() => {
              // Mark FTUE complete — next visit goes straight to real game
              completeFTUE();
              setLastRevealedCardId(null);
              setCelebrationHeld(false);
              setFtueCardsBlocked(false);
              setFtueReplayReady(false);
              setFtueBookerFlipped(false);
              pendingCelebration.current = null;
              heldRevealResumeRef.current = null;
              handleButtonClick();
            }}
          />

<div style={{ position: 'relative', width: '100%' }}>
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
    ftuePulseNearMiss={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")}
    ftueReplayBlocked={isFTUE && gameState === "RESULTS" && !ftueReplayReady}
    tierGaugeSlot={!isFTUE ? (
      <TierGauge
        totalFp={totalFp}
        thresholds={[
          { tier: 'ROOKIE',   minFP: 133 },
          { tier: 'STARTER',  minFP: 160 },
          { tier: 'ALL_STAR', minFP: 183 },
          { tier: 'MVP',      minFP: 207 },
          { tier: 'JACKPOT',  minFP: 225 },
        ]}
        visible={gameState === 'REVEALING' || gameState === 'RESULTS' || gameState === 'WIN_CELEBRATION'}
      />
    ) : undefined}
  />
</div>

{/* ── Hot Streak Overlay ── */}
<HotStreakOverlay active={hotStreak} winCount={sessionWins} />

{/* ── Collect full screen ── */}
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

{/* ── PostGameScreen Overlay ── */}
{gameState === "WIN_CELEBRATION" && winTier && (
        <PostGameOverlay>
          <PostGameScreen
            result={buildPostGameResult(
              roster,
              winTier,
              winPayout,
              balance,
              streak,
              !winTier || winTier === 'BUST',
            )}
            onPlayAgain={onWinCelebrationComplete}
          />
        </PostGameOverlay>
      )}

</div>
  </div>
</div>
);
}