import { useMemo, useState, useCallback, useEffect } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { RosterGrid } from "../components/RosterGrid";
import { AppHeader } from "../components/AppHeader";
import { GameBar } from "../components/GameBar";
import { WinCelebration } from "../components/WinCelebration";
import { useEmotionalReveal, type RevealableCard } from "../ui/hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayout, type WinTier } from "../utils/payoutLogic";

const CAP_MAX = sportAdapter.salaryCap;
const ROSTER_SIZE = sportAdapter.rosterSize;
const STARTING_BALANCE = 1000;
const BASE_BET = 10;

function createPlaceholderCards(): PlayerCard[] {
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

type GameState =
  | "IDLE"
  | "DEALING"
  | "HOLD"
  | "DRAWING"
  | "REVEALING"
  | "RESULTS"
  | "WIN_CELEBRATION";

/**
 * IMPORTANT: Locks + UI identity should be driven by cardId.
 * We keep fallbacks for robustness while you iterate adapters, but cardId is the canonical key.
 */
function cardId(card: any): string {
  const v =
    card?.cardId ??
    card?.id ??
    card?.playerId ??
    card?.basePlayerId ??
    card?.uid ??
    card?.name;
  return String(v ?? "");
}

function salaryNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((acc, c: any) => acc + salaryNum(c?.salary), 0);
}

function sumLockedSalary(roster: PlayerCard[], lockedIds: Set<string>) {
  return roster.reduce((acc, c: any) => (lockedIds.has(cardId(c)) ? acc + salaryNum(c?.salary) : acc), 0);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards
    .map((c) => ({
      cardId: cardId(c),
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      tier: (c as any).tier ?? "WHITE",
      badges: (c.achievements || []).map((a) => ({
        id: a.id,
        icon: a.icon || "⭐",
        label: a.label,
        fp: a.fp || 0,
      })),
      slotIndex: c.slotIndex ?? 0,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

export default function GameView() {
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [roster, setRoster] = useState<PlayerCard[]>(createPlaceholderCards());

  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId] = useState<string | undefined>(undefined);
  const [betMultiplier, setBetMultiplier] = useState<number>(1);
  const [balance, setBalance] = useState<number>(STARTING_BALANCE);
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [displayBudget, setDisplayBudget] = useState<number>(CAP_MAX);
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const [noTransition, setNoTransition] = useState(false);

  // Debug handles (optional)
  useEffect(() => {
    (window as any).debugRoster = roster;
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      (window as any).debugResolvedRoster = roster;
    }
  }, [roster, gameState]);

  // ✅ Your phase logic is fine. Keeping it verbatim.
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    return "HOLD";
  }, [gameState]);

  const capUsed = useMemo(() => sumSalary(roster), [roster]);
  const lockedSalary = useMemo(() => sumLockedSalary(roster, lockedCardIds), [roster, lockedCardIds]);
  const currentBet = BASE_BET * betMultiplier;

  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);

  const {
    runningTotalFp,
    isCardVisible,
    isCardFlipping,
    getVisibleFp,
    flipMsMap,
    fpCountUpMsMap,
    performanceTagMap,
    pulseMap,
    skipToEnd: skipReveal,
    reset: resetReveal,
  } = useEmotionalReveal({
    cards: revealableCards,
    isActive: gameState === "REVEALING",
    onCardComplete: useCallback(
      (cId: string) => {
        const card = roster.find((c) => cardId(c) === cId);
        if (card && !(card as any).wasHeld) {
          const salary = Number((card as any).salary ?? 0);
          setRevealedSalary((prev) => prev + salary);
        }
      },
      [roster]
    ),
    onAllComplete: useCallback(
      (totalFp: number) => {
        const tier = calculateWinTier(totalFp);
        const payout = calculatePayout(tier, currentBet);
        setWinTier(tier);
        setWinPayout(payout);
        setGameState("WIN_CELEBRATION");
      },
      [currentBet]
    ),
  });

  // During REVEALING we render partial actualFp so cards animate their number up.
  const displayRoster = useMemo(() => {
    if (gameState !== "REVEALING") return roster;

    return roster.map((c) => {
      const id = cardId(c);
      const visFp = getVisibleFp(id);
      if (visFp === undefined) return c;
      return { ...c, actualFp: visFp };
    });
  }, [roster, gameState, getVisibleFp]);

  /**
   * ✅ FIX: Total FP must ALWAYS be sum of the card FPs you are showing.
   * - REVEALING: use runningTotalFp from hook
   * - RESULTS/WIN: sum actualFp from roster (ground truth)
   * - HOLD/others: 0
   */
  const totalFp = useMemo(() => {
    if (gameState === "REVEALING") return runningTotalFp;

    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      return roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
    }

    return 0;
  }, [gameState, runningTotalFp, roster]);

  // Cards start flipped (back face) for IDLE/DEALING/DRAWING; REVEALING unflips; RESULTS user flips for stats
  const flippedIds = useMemo(() => {
    if (gameState === "IDLE" || gameState === "DEALING" || gameState === "DRAWING") {
      const ids = new Set<string>();
      roster.forEach((c) => ids.add(cardId(c)));
      return ids;
    }

    if (gameState === "REVEALING") {
      const ids = new Set<string>();
      roster.forEach((c) => {
        const id = cardId(c);
        if (!isCardVisible(id) && !isCardFlipping(id)) ids.add(id);
      });
      return ids;
    }

    return statsFlippedIds;
  }, [gameState, roster, statsFlippedIds, isCardVisible, isCardFlipping]);

  const revealingIds = useMemo(() => {
    const ids = new Set<string>();
    if (gameState === "REVEALING") {
      roster.forEach((c) => {
        const id = cardId(c);
        if (isCardFlipping(id)) ids.add(id);
      });
    }
    return ids;
  }, [gameState, roster, isCardFlipping]);

  const heldCardIds = useMemo(() => {
    if (gameState === "HOLD") return lockedCardIds;
    const held = new Set<string>();
    roster.forEach((c) => {
      if (c.wasHeld) held.add(cardId(c));
    });
    return held;
  }, [gameState, roster, lockedCardIds]);

  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    setLockedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }

  function toggleStatsFlip(cardKey: string) {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    setStatsFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }

  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      if (balance < currentBet) {
        alert("Insufficient balance!");
        return;
      }

      resetReveal();
      setStatsFlippedIds(new Set());
      setLockedCardIds(new Set());
      setMvpId(undefined);
      setDisplayBudget(CAP_MAX);
      setRevealedSalary(0);

      const res: any = await dealInitialRoster();
      const nextRosterRaw: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? []) as PlayerCard[];
      const nextRoster = nextRosterRaw.map((c: any) => ({ ...c, wasHeld: false }));

      setNoTransition(true);
      setRoster(nextRoster);
      setGameState("DEALING");
      await sleep(50);
      setNoTransition(false);
      await sleep(400);

      setDisplayBudget(CAP_MAX - sumSalary(nextRoster));
      setGameState("HOLD");
      return;
    }

    if (gameState === "HOLD") {
      setBalance((prev) => prev - currentBet);

      const markedRoster = roster.map((c) => ({
        ...c,
        wasHeld: lockedCardIds.has(cardId(c)),
      }));

      // flip all to back
      setRoster(markedRoster);
      setGameState("DRAWING");
      await sleep(700);

      const res: any = await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster: PlayerCard[] =
        (res?.roster ?? res?.cards ?? res?.lineup ?? res?.finalCards ?? markedRoster) as PlayerCard[];

      const resolveRes: any = await resolveRoster({ finalCards: drawnRoster });
      const finalRosterRaw: PlayerCard[] =
        (resolveRes?.roster ?? resolveRes?.cards ?? resolveRes?.finalCards ?? drawnRoster) as PlayerCard[];

      // Re-attach wasHeld by slotIndex and cardId fallback
      const heldBySlot = new Map<number, boolean>();
      const heldById = new Map<string, boolean>();
      markedRoster.forEach((p: any, idx: number) => {
        const slot = Number(p.slotIndex ?? idx);
        heldBySlot.set(slot, !!p.wasHeld);
        heldById.set(cardId(p), !!p.wasHeld);
      });

      const finalRoster: PlayerCard[] = finalRosterRaw.map((c: any, idx: number) => {
        const slot = Number(c.slotIndex ?? idx);
        const held = heldBySlot.get(slot) ?? heldById.get(cardId(c)) ?? false;
        return { ...c, wasHeld: held };
      });

      const maybeMvp: string | undefined = resolveRes?.mvpId ?? resolveRes?.mvpCardId ?? resolveRes?.topCardId;
      if (typeof maybeMvp === "string") setMvpId(maybeMvp);

      const heldSalary = finalRoster.reduce((sum, c: any) => (c.wasHeld ? sum + Number(c.salary ?? 0) : sum), 0);

      // silent swap
      setNoTransition(true);
setRoster(finalRoster);
      setDisplayBudget(CAP_MAX - sumSalary(finalRoster));
      setStatsFlippedIds(new Set());
      setRevealedSalary(heldSalary);

      await sleep(50);
      setNoTransition(false);
      await sleep(50);

      setGameState("REVEALING");
      return;
    }

    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      resetReveal();
      setNoTransition(true);
      setRoster(createPlaceholderCards());
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setWinTier(null);
      setWinPayout(0);
      setDisplayBudget(CAP_MAX);
      setRevealedSalary(0);
      setGameState("IDLE");
      await sleep(50);
      setNoTransition(false);
    }
  }

  function onWinCelebrationComplete() {
    if (winPayout > 0) {
      setIsBalanceAnimating(true);
      setBalance((prev) => prev + winPayout);
      setTimeout(() => setIsBalanceAnimating(false), 2000);
    }
    setWinTier(null);
    setGameState("RESULTS");
  }

  function handleButtonClick() {
    if (gameState === "REVEALING") skipReveal();
    else onPrimaryAction();
  }

  function buttonStyle() {
    const base = {
      flex: 1,
      borderRadius: 14,
      border: "none",
      padding: "14px 0",
      fontWeight: 900,
      fontSize: 15,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      cursor: "pointer",
      boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
      transition: "transform 80ms, box-shadow 80ms",
    };
    if (gameState === "HOLD") return { ...base, background: "linear-gradient(180deg, #36D46B 0%, #1FA94B 100%)" };
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")
      return { ...base, background: "linear-gradient(180deg, #3AA0FF 0%, #1D6DD7 100%)" };
    return { ...base, background: "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)" };
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "clip",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {winTier && (
        <WinCelebration tier={winTier} payout={winPayout} multiplier={betMultiplier} onComplete={onWinCelebrationComplete} />
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "env(safe-area-inset-top, 8px) 12px env(safe-area-inset-bottom, 8px)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            padding: "8px 12px",
            backdropFilter: "blur(10px)",
          }}
        >
          <AppHeader revealFillPct={Math.min(100, (totalFp / 100) * 100)} betAdded={currentBet} jackpotTarget={100} />
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0 }}>
          <div
            onClick={gameState === "REVEALING" ? skipReveal : undefined}
            style={{
              height: "100%",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              padding: 10,
              cursor: gameState === "REVEALING" ? "pointer" : "default",
            }}
          >
            <RosterGrid
              flipMsMap={flipMsMap}
              fpCountUpMsMap={fpCountUpMsMap}
              performanceTagMap={performanceTagMap}
              pulseMap={pulseMap}
              roster={displayRoster}
              phase={phase}
              lockedIds={heldCardIds}
              mvpId={mvpId}
              flippedIds={flippedIds}
              revealingIds={revealingIds}
              noTransition={noTransition}
              visibleFpMap={(() => {
                const map = new Map<string, number>();
                if (gameState === "REVEALING" || gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
                  roster.forEach((c) => {
                    const id = cardId(c);
                    const fp = getVisibleFp(id);
                    if (fp !== undefined) map.set(id, fp);
                  });
                }
                return map;
              })()}
              canFlip={gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
              onToggleLock={(k) => toggleLock(k)}
              onToggleFlip={(k) => toggleStatsFlip(k)}
            />
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
            padding: "10px 12px",
            backdropFilter: "blur(10px)",
          }}
        >
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