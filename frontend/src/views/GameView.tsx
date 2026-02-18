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

// ============================================================
// CONSTANTS
// ============================================================

const CAP_MAX = sportAdapter.salaryCap;
const ROSTER_SIZE = sportAdapter.rosterSize;
const STARTING_BALANCE = 1000;
const BASE_BET = 10;

// Create empty placeholder cards for IDLE state display
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

// ============================================================
// TYPES
// ============================================================

type GameState = 
  | "IDLE"              // No cards dealt
  | "DEALING"           // Cards being dealt (face down → face up)
  | "HOLD"              // Player choosing which to hold
  | "DRAWING"           // Non-held cards flipping to back, loading new cards
  | "REVEALING"         // Cards flipping one by one with drama
  | "RESULTS"           // All revealed, can tap to see stats
  | "WIN_CELEBRATION";  // Showing win overlay

// ============================================================
// HELPERS
// ============================================================

function cardId(card: any): string {
  const v = card?.cardId ?? card?.id ?? card?.playerId ?? card?.basePlayerId ?? card?.uid ?? card?.name;
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
  return roster.reduce((acc, c: any) => 
    lockedIds.has(cardId(c)) ? acc + salaryNum(c?.salary) : acc, 0
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Convert PlayerCard[] to RevealableCard[] for the reveal hook
// Sorted by slotIndex for fixed reveal order: top-left → bottom-right
function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards
    .map(c => ({
      cardId: cardId(c),
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      badges: (c.achievements || []).map(a => ({
        id: a.id,
        icon: a.icon || "⭐",
        label: a.label,
        fp: a.fp || 0,
      })),
      slotIndex: c.slotIndex ?? 0,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function GameView() {
  // Core game state
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [roster, setRoster] = useState<PlayerCard[]>(createPlaceholderCards());
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set()); // For tap-to-view stats
  const [mvpId, setMvpId] = useState<string | undefined>(undefined);
  const [betMultiplier, setBetMultiplier] = useState<number>(1);
  
  // Balance
  const [balance, setBalance] = useState<number>(STARTING_BALANCE);
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  
  // Budget display
  const [displayBudget, setDisplayBudget] = useState<number>(CAP_MAX);
  
  // Win state
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [finalTotalFp, setFinalTotalFp] = useState<number | null>(null);
  
  // Real-time salary deduction during reveal
  // Starts with salary of held cards, grows as each new card is revealed
  const [revealedSalary, setRevealedSalary] = useState(0);

  useEffect(() => {
    console.log("[STATE]", gameState);
  }, [gameState]);
  useEffect(() => {
    console.log("[FLIPPED IDS]", Array.from(statsFlippedIds));
  }, [statsFlippedIds]);
  
  // ============================================================
  // DERIVED STATE
  // ============================================================
  
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") {
      return "RESULTS";
    }
    return "HOLD";
  }, [gameState]);

  const holdRemaining = useMemo(() => {
    return Math.max(0, CAP_MAX - sumLockedSalary(roster, lockedCardIds));
  }, [roster, lockedCardIds]);

  const capUsed = useMemo(() => sumSalary(roster), [roster]);
  // Salary of currently locked cards — used during HOLD to track deductions per hold/unhold
  const lockedSalary = useMemo(() => sumLockedSalary(roster, lockedCardIds), [roster, lockedCardIds]);
  const currentBet = BASE_BET * betMultiplier;

  // ============================================================
  // EMOTIONAL REVEAL HOOK
  // ============================================================
  
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  
  const {
    runningTotalFp,
    isCardVisible,
    getVisibleFp,
    skipToEnd: skipReveal,
  } = useEmotionalReveal({
    cards: revealableCards,
    isActive: gameState === "REVEALING",
    onCardComplete: useCallback((cardId: string) => {
      // Only add salary for NEW (non-held) cards — held cards are already
      // seeded into revealedSalary before REVEALING starts, so adding them
      // again would push the budget negative.
      const card = roster.find(c => String(c.cardId) === cardId);
      if (card && !(card as any).wasHeld) {
        const salary = Number((card as any).salary ?? 0);
        setRevealedSalary(prev => prev + salary);
      }
    }, [roster]),
    onAllComplete: useCallback((totalFp: number) => {
      // Store final FP so it persists after reveal
      setFinalTotalFp(totalFp);
      
      // Reveal done, calculate win
      const tier = calculateWinTier(totalFp);
      const payout = calculatePayout(tier, currentBet);
      
      setWinTier(tier);
      setWinPayout(payout);
      setGameState("WIN_CELEBRATION");
    }, [currentBet]),
  });

  // ============================================================
  // DISPLAY ROSTER
  // ============================================================
  
  // Build display roster with reveal state info
  const displayRoster = useMemo(() => {
    return roster.map((c) => {
      const id = cardId(c);
      
      // During reveal, override actualFp with visible FP from reveal engine
      if (gameState === "REVEALING") {
        const visFp = getVisibleFp(id);
        return { ...c, actualFp: visFp };
      }
      
      return c;
    });
  }, [roster, gameState, getVisibleFp]);

  // Total FP display
  const totalFp = useMemo(() => {
    // After reveal complete, use stored final value
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && finalTotalFp !== null) {
      return finalTotalFp;
    }
    // During reveal, use running total from hook (ticks per card)
    if (gameState === "REVEALING") {
      return runningTotalFp;
    }
    // All other states (IDLE, DEALING, HOLD, DRAWING) — show zero
    // Team FP is unknown until game logs are revealed
    return 0;
  }, [gameState, roster, runningTotalFp, finalTotalFp]);

  // ============================================================
  // CARD STATE HELPERS (for RosterGrid)
  // ============================================================
  
  // Cards showing generic back (face down / mystery state)
  const faceDownIds = useMemo(() => {
    const faceDown = new Set<string>();
    
    if (gameState === "IDLE") {
      // All placeholder cards face down before deal
      roster.forEach(c => {
        const id = cardId(c);
        faceDown.add(id);
      });
    } else if (gameState === "DEALING") {
      // All cards face down during initial deal
      roster.forEach(c => {
        const id = cardId(c);
        faceDown.add(id);
      });
    } else if (gameState === "DRAWING") {
      // ALL cards flip to back (held AND non-held)
      roster.forEach(c => {
        const id = cardId(c);
        faceDown.add(id);
      });
    } else if (gameState === "REVEALING") {
      // Cards not yet visible are face down (ALL cards, including held)
      roster.forEach(c => {
        const id = cardId(c);
        if (!isCardVisible(id)) {
          faceDown.add(id);
        }
      });
    }
    
    return faceDown;
  }, [gameState, roster, lockedCardIds, isCardVisible]);

  // Cards showing hold indicator (yellow H tag)
  // During HOLD: use lockedCardIds (active selection)
  // All other states: use wasHeld from card
  const heldCardIds = useMemo(() => {
    const held = new Set<string>();
    
    if (gameState === "HOLD") {
      // Use active locks during hold phase
      return lockedCardIds;
    } else {
      // Use wasHeld flag from cards (DRAWING, REVEALING, RESULTS, etc.)
      roster.forEach(c => {
        if (c.wasHeld) {
          held.add(cardId(c));
        }
      });
    }
    
    return held;
  }, [gameState, roster, lockedCardIds]);

  // Cards showing stats back (user tapped to view)
  // Only used in RESULTS / WIN_CELEBRATION

  // ============================================================
  // ACTIONS
  // ============================================================
  
  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    
    setLockedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
      } else {
        next.add(cardKey);
      }
      return next;
    });
  }

  function toggleStatsFlip(cardKey: string) {
    console.log("[FLIP TRY]", { gameState, cardKey });
  
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") {
      console.log("[FLIP BLOCKED] bad state", gameState);
      return;
    }
  
    setStatsFlippedIds((prev) => {
      console.log("[FLIP SETTER] prev =", Array.from(prev));
  
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
  
      console.log("[FLIP SETTER] next =", Array.from(next));
      return next;
    });
  }
  
  

  async function onPrimaryAction() {
    // === DEAL ===
    if (gameState === "IDLE") {
      if (balance < currentBet) {
        alert("Insufficient balance!");
        return;
      }

      setStatsFlippedIds(new Set());
      setLockedCardIds(new Set());
      setMvpId(undefined);
      setDisplayBudget(CAP_MAX);
      setFinalTotalFp(null);
      
      // First load cards but show them face down
      const res: any = await dealInitialRoster();
      const nextRosterRaw: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? []) as PlayerCard[];
      const nextRoster = nextRosterRaw.map((c: any) => ({ ...c, wasHeld: false }));
      
      setRoster(nextRoster);
      setGameState("DEALING");
      
      // Brief pause to show face down cards
      await sleep(400);
      
      // Now flip to reveal (transition to HOLD)
      setDisplayBudget(CAP_MAX - sumSalary(nextRoster));
      setGameState("HOLD");
      return;
    }

    // === DRAW ===
    if (gameState === "HOLD") {
      setBalance((prev) => prev - currentBet);
      
      // Mark current roster with wasHeld BEFORE changing state
      // This ensures hold indicator stays visible during DRAWING
      const markedRoster = roster.map(c => ({
        ...c,
        wasHeld: lockedCardIds.has(cardId(c))
      }));
      setRoster(markedRoster);
      
      setGameState("DRAWING");
      
      // Show cards flipping to back
      await sleep(500);

      // Load new cards
      const res: any = await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster: PlayerCard[] =
        (res?.roster ?? res?.cards ?? res?.lineup ?? res?.finalCards ?? markedRoster) as PlayerCard[];

      const resolveRes: any = await resolveRoster({ finalCards: drawnRoster });
      const finalRosterRaw: PlayerCard[] =
        (resolveRes?.roster ?? resolveRes?.cards ?? resolveRes?.finalCards ?? drawnRoster) as PlayerCard[];

      // Mark held cards on final roster
      const finalRoster = finalRosterRaw.map((c: any, i: number) => {
        const prev = markedRoster[i];
        return { ...c, wasHeld: prev?.wasHeld ?? false };
      });

      setRoster(finalRoster);
      setDisplayBudget(CAP_MAX - sumSalary(finalRoster));
      
      const maybeMvp: string | undefined = resolveRes?.mvpId ?? resolveRes?.mvpCardId ?? resolveRes?.topCardId;
      if (typeof maybeMvp === "string") setMvpId(maybeMvp);

      // Small delay then start reveal
      await sleep(300);
      setStatsFlippedIds(new Set());
      
      // Seed revealedSalary with held cards (they're already "deducted")
      const heldSalary = finalRoster.reduce((sum, c: any) => 
        c.wasHeld ? sum + Number(c.salary ?? 0) : sum, 0
      );
      setRevealedSalary(heldSalary);
      
      setGameState("REVEALING");
      
      return;
    }

    // === REPLAY ===
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      setRoster(createPlaceholderCards());
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setWinTier(null);
      setWinPayout(0);
      setFinalTotalFp(null);
      setDisplayBudget(CAP_MAX);
      setRevealedSalary(0);
      setGameState("IDLE");
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

  // ============================================================
  // UI HELPERS
  // ============================================================
  
  function buttonLabel() {
    if (gameState === "IDLE") return "DEAL";
    if (gameState === "DEALING") return "...";
    if (gameState === "HOLD") return "DRAW";
    if (gameState === "DRAWING") return "...";
    if (gameState === "REVEALING") return "SKIP";
    return "REPLAY";
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
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") return { ...base, background: "linear-gradient(180deg, #3AA0FF 0%, #1D6DD7 100%)" };
    return { ...base, background: "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)" };
  }

  function handleButtonClick() {
    if (gameState === "REVEALING") {
      skipReveal();
    } else {
      onPrimaryAction();
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background:
          "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {winTier && (
        <WinCelebration
          tier={winTier}
          payout={winPayout}
          multiplier={betMultiplier}
          onComplete={onWinCelebrationComplete}
        />
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
        {/* ── TOP: App Header (nav + jackpot bar) ── */}
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
          <AppHeader
            revealFillPct={Math.min(100, (totalFp / 100) * 100)}
            betAdded={currentBet}
            jackpotTarget={100}
          />
        </div>

        {/* ── MIDDLE: Card Grid ── */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
          }}
        >
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
              overflow: "hidden",
              cursor: gameState === "REVEALING" ? "pointer" : "default",
            }}
          >
            <RosterGrid
              roster={displayRoster}
              phase={phase}
              lockedIds={heldCardIds}
              mvpId={mvpId}
              flippedIds={statsFlippedIds}
              faceDownIds={faceDownIds}
              visibleFpMap={(() => {
                const map = new Map<string, number>();
                if (gameState === "REVEALING" || gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
                  roster.forEach(c => {
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

        {/* ── BOTTOM: Game Bar (stats + bet + action) ── */}
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