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
import { RosterGrid } from "../components/RosterGrid";
import { AppHeader } from "../components/AppHeader";
import { resetAllOverlays } from "../components/AthleteCard";
import { GameBar } from "../components/GameBar";
import { WinCelebration } from "../components/WinCelebration";
import { useCardFlipState } from "../hooks/useCardFlipState";
import { useEmotionalReveal, type RevealableCard } from "../hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayout, type WinTier } from "../utils/payoutLogic";

const CAP_MAX        = sportAdapter.salaryCap;
const ROSTER_SIZE    = sportAdapter.rosterSize;
const STARTING_BALANCE = 1000;
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
    badges: (c.achievements ?? []).map((a: any) => ({
      id: a.id, icon: a.icon || "⭐", label: a.label, fp: a.fp || 0,
    })),
  }));
}

// ── JackpotRow — live ticking community jackpot, centered between header and cards ──

function JackpotRow({ betAdded }: { betAdded: number }) {
  const [amount, setAmount] = useState(JACKPOT_SEED);
  const prevBetRef = useRef(0);

  // Tick up every 3s (simulated community activity)
  useEffect(() => {
    const id = setInterval(() => {
      setAmount(p => parseFloat((p + TICK_AMOUNT).toFixed(2)));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Each bet contributes 5% rake to the pot
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
      display: "flex", justifyContent: "center",
      padding: "0px 12px",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 14px", borderRadius: 20,
        background: "rgba(255,215,0,0.06)",
        border: "1px solid rgba(255,215,0,0.18)",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,215,0,0.6)", textTransform: "uppercase" }}>
          🏆 Jackpot
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
  const [roster, setRoster]                 = useState<PlayerCard[]>(createPlaceholders());
  const [lockedCardIds, setLockedCardIds]   = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId]                   = useState<string | undefined>();
  const [betMultiplier, setBetMultiplier]   = useState(1);
  const [balance, setBalance]               = useState(STARTING_BALANCE);
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [winTier, setWinTier]               = useState<WinTier | null>(null);
  const [winPayout, setWinPayout]           = useState(0);
  const [noTransition, setNoTransition]     = useState(false);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const rosterRef = useRef<PlayerCard[]>([]);
  const completedCardsRef = useRef<Set<string>>(new Set());

  // Zone 1: Hooks
  const flipState       = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet      = BASE_BET * betMultiplier;

  const {
    runningTotalFp,
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
    flipState,
    onCardComplete: useCallback((cId: string) => {
      const card = rosterRef.current.find(c => cardId(c) === cId);
      if (card && !(card as any).wasHeld) {
        setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
      }
    }, []),
    onAllComplete: useCallback((totalFp: number) => {
      clearActiveCard();
      window.setTimeout(() => {
        const tier = calculateWinTier(totalFp);
        const payout = calculatePayout(tier, currentBet);
        setWinTier(tier);
        setWinPayout(payout);
        setGameState("WIN_CELEBRATION");
      }, 800);
    }, [currentBet]),
  });

  // Zone 2: Derived values
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    return "HOLD";
  }, [gameState]);

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
    setLockedCardIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
  }

  function toggleStatsFlip(cardKey: string) {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
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
      const res: any       = await dealInitialRoster();
      const nextRoster     = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      rosterRef.current    = nextRoster;
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
      setBalance(prev => prev - currentBet);
      const markedRoster = roster.map(c => ({ ...c, wasHeld: lockedCardIds.has(cardId(c)) }));
      flipState.beginDraw(markedRoster.map(cardId));
      setRoster(markedRoster);
      setGameState("DRAWING");
      await sleep(700);
      const drawRes: any    = await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster     = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
      const resolveRes: any = await resolveRoster({ finalCards: drawnRoster });
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
      flipState.initCards(finalRoster.map(cardId));
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

  function onWinCelebrationComplete() {
    if (winPayout > 0) {
      setIsBalanceAnimating(true);
      setBalance(prev => prev + winPayout);
      setTimeout(() => setIsBalanceAnimating(false), 2000);
    }
    setWinTier(null);
    setGameState("RESULTS");
  }

  function handleButtonClick() {
    if (gameState === "REVEALING") skipReveal();
    else onPrimaryAction();
  }

  // Zone 3: JSX
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "clip",
      display: "flex", flexDirection: "column", alignItems: "center",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif", userSelect: "none",
    }}>
      {winTier && (
        <WinCelebration tier={winTier} payout={winPayout} multiplier={betMultiplier} onComplete={onWinCelebrationComplete} />
      )}
      <div style={{
        width: "100%", maxWidth: 460, height: "100%",
        display: "flex", flexDirection: "column", gap: 4,
        padding: "env(safe-area-inset-top, 8px) 12px calc(env(safe-area-inset-bottom, 8px) + 6px)",
        boxSizing: "border-box",
      }}>

        {/* Header: wordmark + tabs */}
        <div style={{
          flex: "0 0 auto", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.05)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
          padding: "8px 12px", backdropFilter: "blur(10px)",
        }}>
          <AppHeader />
        </div>

        {/* Community jackpot — own centered row */}
        <JackpotRow betAdded={currentBet} />

        {/* Card grid */}
        <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative", zIndex: 10, overflow: "hidden" }}>
          <div
            onClick={gameState === "REVEALING" ? skipReveal : undefined}
            style={{
              height: "100%", borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "#070A12",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)", padding: 10,
              cursor: gameState === "REVEALING" ? "pointer" : "default",
              overflow: "hidden",
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
/>

          </div>
        </div>

        {/* Bottom bar: tier progress + balance/fp/budget + bet + action */}
        <div style={{
          flex: "0 0 auto", borderRadius: 18, position: "relative", zIndex: 30,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
          padding: "10px 12px", backdropFilter: "blur(10px)",
          
        }}>
          <GameBar
            gameState={gameState}
            balance={balance}
            isBalanceAnimating={isBalanceAnimating}
            totalFp={totalFp}
            capMax={CAP_MAX}
            capUsed={capUsed}
            lockedSalary={lockedSalary}
            revealedSalary={revealedSalary}
            betMultiplier={betMultiplier}
            baseBet={BASE_BET}
            onBetMultiplier={setBetMultiplier}
            onAction={handleButtonClick}
          />
        </div>
      </div>
    </div>
  );
}