import { useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { RosterGrid } from "../components/RosterGrid";
import { ScoreHeader } from "../components/ScoreHeader";

const CAP_MAX = 180;

type GameState = "IDLE" | "HOLD" | "RESULTS";

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

function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((acc, c: any) => acc + Number(c?.salary ?? 0), 0);
}

export default function GameView() {
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [roster, setRoster] = useState<PlayerCard[]>([]);
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId] = useState<string | undefined>(undefined);
  const [betMultiplier, setBetMultiplier] = useState<number>(1);

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const heldSalary = useMemo(() => {
    return roster.reduce((acc, c: any) => {
      const k = cardId(c);
      if (!lockedCardIds.has(k)) return acc;
      return acc + Number(c?.salary ?? 0);
    }, 0);
  }, [roster, lockedCardIds]);

  const capRemaining = useMemo(() => Math.max(0, CAP_MAX - capUsed), [capUsed]);

  const totalFp = useMemo(() => {
    if (gameState === "RESULTS") return roster.reduce((a, c: any) => a + Number(c?.actualFp ?? 0), 0);
    return roster.reduce((a, c: any) => a + Number(c?.projectedFp ?? 0), 0);
  }, [roster, gameState]);

  const subtitle = useMemo(() => {
    if (gameState === "IDLE") return "Tap PLAY to start";
    if (gameState === "HOLD") return "Tap cards to PROTECT, then hit DRAW";
    if (gameState === "RESULTS") return "Tap cards to view stats";
    return "";
  }, [gameState]);

  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS") return "RESULTS";
    return "HOLD";
  }, [gameState]);

  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    setLockedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }

  function toggleFlip(cardKey: string) {
    if (gameState !== "RESULTS") return;
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey); else next.add(cardKey);
      return next;
    });
  }
  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      setFlippedIds(new Set());
      setLockedCardIds(new Set());

      const res: any = await dealInitialRoster();
      const nextRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? []) as PlayerCard[];
      
      console.log("=== DEAL RECEIVED ===");
      console.log("nextRoster length:", nextRoster.length);
      console.log("nextRoster salaries:", nextRoster.map(c => c.salary));
      
      setRoster(nextRoster);
      setGameState("HOLD");
    } else if (gameState === "HOLD") {
      const res: any = await redrawRoster({
        currentCards: roster,
        lockedCardIds,
      });

      const drawnRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? res?.finalCards ?? roster) as PlayerCard[];
      
      console.log("=== AFTER REDRAW ===");
      console.log("drawnRoster length:", drawnRoster.length);
      console.log("drawnRoster salaries:", drawnRoster.map(c => c.salary));

      const resolveRes: any = await resolveRoster({
        finalCards: drawnRoster,
      });

      const finalRoster: PlayerCard[] = (resolveRes?.roster ?? resolveRes?.cards ?? resolveRes?.finalCards ?? drawnRoster) as PlayerCard[];
      
      console.log("=== AFTER RESOLVE ===");
      console.log("finalRoster length:", finalRoster.length);
      console.log("finalRoster salaries:", finalRoster.map(c => c.salary));

      setRoster(finalRoster);

      const maybeMvp: string | undefined = resolveRes?.mvpId ?? resolveRes?.mvpCardId ?? resolveRes?.topCardId;
      if (typeof maybeMvp === "string") setMvpId(maybeMvp);

      setGameState("RESULTS");
    } else if (gameState === "RESULTS") {
      setRoster([]);
      setLockedCardIds(new Set());
      setFlippedIds(new Set());
      setMvpId(undefined);
      setGameState("IDLE");
    }
  }

  const primaryButtonLabel = useMemo(() => {
    if (gameState === "IDLE") return "PLAY";
    if (gameState === "HOLD") return "DRAW";
    if (gameState === "RESULTS") return "PLAY AGAIN";
    return "PLAY";
  }, [gameState]);

  const primaryButtonStyle = useMemo(() => {
    const base = {
      flex: 1,
      height: 54,
      borderRadius: 16,
      border: "2px solid rgba(0,0,0,0.12)",
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      transition: "all 0.2s",
    };

    if (gameState === "HOLD") {
      return { ...base, background: "#4CAF50", color: "#fff", border: "2px solid #45a049" };
    }
    if (gameState === "RESULTS") {
      return { ...base, background: "#2196F3", color: "#fff", border: "2px solid #1976D2" };
    }
    return { ...base, background: "#FF9800", color: "#fff", border: "2px solid #F57C00" };
  }, [gameState]);

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#f6f7fb",
      }}
    >
      <div style={{ flex: "0 0 auto", padding: 12 }}>
        <ScoreHeader
          totalFp={totalFp}
          capUsed={capUsed}
          capMax={CAP_MAX}
          heldSalary={heldSalary}
          capRemaining={capRemaining}
          phase={phase}
          subtitle={subtitle}
        />
      </div>

      <div style={{ flex: "1 1 auto", padding: 12, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 16,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(0,0,0,0.06)",
            padding: 10,
            overflow: "hidden",
          }}
        >
          <RosterGrid
            roster={roster}
            phase={phase}
            lockedIds={lockedCardIds}
            mvpId={mvpId}
            flippedIds={flippedIds}
            onToggleLock={(k) => toggleLock(k)}
            onToggleFlip={(k) => toggleFlip(k)}
          />
        </div>
      </div>

      <div style={{ flex: "0 0 auto", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center" }}>
          {[1, 3, 5].map((mult) => (
            <button
              key={mult}
              onClick={() => setBetMultiplier(mult)}
              style={{
                width: 60,
                height: 36,
                borderRadius: 8,
                border: betMultiplier === mult ? "2px solid #2196F3" : "1px solid rgba(0,0,0,0.12)",
                background: betMultiplier === mult ? "#E3F2FD" : "#fff",
                fontWeight: betMultiplier === mult ? 900 : 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {mult}x
            </button>
          ))}
        </div>

        <button onClick={onPrimaryAction} style={primaryButtonStyle}>
          {primaryButtonLabel}
        </button>
      </div>
    </div>
  );
}
