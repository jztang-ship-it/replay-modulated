import React, { useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { RosterGrid } from "../components/RosterGrid";
import { ScoreHeader } from "../components/ScoreHeader";
import { useResultsReveal } from "../ui/hooks/useResultsReveal";

const CAP_MAX = 180;

type GameState = "IDLE" | "HOLD" | "RESULTS";

function cardId(card: any): string {
  const v = card?.cardId ?? card?.id ?? card?.playerId ?? card?.basePlayerId ?? card?.uid ?? card?.name;
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

  const phase: GamePhase = useMemo(() => (gameState === "RESULTS" ? "RESULTS" : "HOLD"), [gameState]);

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const heldSalary = useMemo(() => {
    return roster.reduce((acc, c: any) => {
      const k = cardId(c);
      if (!lockedCardIds.has(k)) return acc;
      return acc + Number(c?.salary ?? 0);
    }, 0);
  }, [roster, lockedCardIds]);

  const { revealedIds, runningTotalFp, isRevealing, skipToEnd } = useResultsReveal({
    phase,
    roster,
    revealDelayMs: 450,
    order: "roster",
  });

  const displayRoster = useMemo(() => {
    if (phase !== "RESULTS") return roster;
    return roster.map((c: any) => {
      const id = cardId(c);
      if (revealedIds.has(id)) return c;
      return { ...c, actualFp: 0, fpDelta: 0, bonusFp: 0, bonusPoints: 0 } as PlayerCard;
    });
  }, [phase, roster, revealedIds]);

  const totalFp = useMemo(() => {
    if (phase === "RESULTS") return runningTotalFp;
    return roster.reduce((a, c: any) => a + Number(c?.projectedFp ?? 0), 0);
  }, [phase, roster, runningTotalFp]);

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
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }

  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      setFlippedIds(new Set());
      setLockedCardIds(new Set());
      setMvpId(undefined);

      const res: any = await dealInitialRoster();
      const nextRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? []) as PlayerCard[];
      setRoster(nextRoster);
      setGameState("HOLD");
      return;
    }

    if (gameState === "HOLD") {
      const res: any = await redrawRoster({ currentCards: roster, lockedCardIds });

      const drawnRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? res?.finalCards ?? roster) as PlayerCard[];

      const resolveRes: any = await resolveRoster({ finalCards: drawnRoster });

      const finalRoster: PlayerCard[] = (resolveRes?.roster ?? resolveRes?.cards ?? resolveRes?.finalCards ?? drawnRoster) as PlayerCard[];
      setRoster(finalRoster);

      const maybeMvp: string | undefined = resolveRes?.mvpId ?? resolveRes?.mvpCardId ?? resolveRes?.topCardId;
      if (typeof maybeMvp === "string") setMvpId(maybeMvp);

      setGameState("RESULTS");
      return;
    }

    setRoster([]);
    setLockedCardIds(new Set());
    setFlippedIds(new Set());
    setMvpId(undefined);
    setGameState("IDLE");
  }

  const primaryButtonLabel = useMemo(() => {
    if (gameState === "IDLE") return "PLAY";
    if (gameState === "HOLD") return "DRAW";
    if (gameState === "RESULTS") return "REPLAY";
    return "PLAY";
  }, [gameState]);

  const primaryButtonStyle = useMemo(() => {
    const base: React.CSSProperties = {
      width: "50%",
      height: 48, // 1/2 size feel
      margin: "0 auto",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      fontWeight: 950,
      fontSize: 14,
      cursor: "pointer",
      letterSpacing: 1,
      color: "#fff",
      boxShadow: "0 10px 24px rgba(0,0,0,0.32)",
    };

    if (gameState === "HOLD") return { ...base, background: "linear-gradient(180deg, #36D46B 0%, #1FA94B 100%)" };
    if (gameState === "RESULTS") return { ...base, background: "linear-gradient(180deg, #3AA0FF 0%, #1D6DD7 100%)" };
    return { ...base, background: "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)" };
  }, [gameState]);

  const cabinetBg = useMemo(() => {
    return {
      background:
        "radial-gradient(1200px 700px at 50% 0%, rgba(60,130,255,0.18) 0%, rgba(10,14,24,0) 55%)," +
        "radial-gradient(900px 700px at 20% 10%, rgba(255,140,60,0.14) 0%, rgba(10,14,24,0) 60%)," +
        "radial-gradient(900px 700px at 80% 15%, rgba(120,255,210,0.10) 0%, rgba(10,14,24,0) 60%)," +
        "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
    } as const;
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, ...cabinetBg, overflow: "hidden", color: "#EAF0FF" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingTop: "max(env(safe-area-inset-top), 8px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* HEADER */}
        <div style={{ flex: "0 0 auto", padding: "0 12px" }}>
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
              padding: "8px 10px",
              backdropFilter: "blur(10px)",
            }}
          >
            <ScoreHeader
              totalFp={totalFp}
              capUsed={capUsed}
              capMax={CAP_MAX}
              heldSalary={heldSalary}
              capRemaining={Math.max(0, CAP_MAX - capUsed)}
              phase={phase}
              subtitle={""}
            />
          </div>
        </div>

        {/* PLAYFIELD */}
        <div style={{ flex: "1 1 auto", minHeight: 0, padding: "0 12px" }}>
          <div
            onClick={phase === "RESULTS" && isRevealing ? skipToEnd : undefined}
            style={{
              height: "100%",
              minHeight: 0,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              padding: 10,
              overflow: "hidden",
              cursor: phase === "RESULTS" && isRevealing ? "pointer" : "default",
            }}
          >
            <RosterGrid
              roster={displayRoster}
              phase={phase}
              lockedIds={lockedCardIds}
              mvpId={mvpId}
              flippedIds={flippedIds}
              onToggleLock={(k) => toggleLock(k)}
              onToggleFlip={(k) => toggleFlip(k)}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ flex: "0 0 auto", padding: "0 12px" }}>
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
              padding: "8px 10px",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 8 }}>
              {[1, 3, 5, 10].map((mult) => {
                const active = betMultiplier === mult;
                const label = mult === 1 ? "Min" : mult === 10 ? "Max" : `${mult}x`;

                return (
                  <button
                    key={mult}
                    onClick={() => setBetMultiplier(mult)}
                    style={{
                      width: 74,
                      height: 34,
                      borderRadius: 12,
                      border: active ? "1px solid rgba(100,180,255,0.8)" : "1px solid rgba(255,255,255,0.14)",
                      background: active ? "rgba(80,150,255,0.18)" : "rgba(255,255,255,0.06)",
                      color: "#EAF0FF",
                      fontWeight: active ? 950 : 800,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button onClick={onPrimaryAction} style={primaryButtonStyle}>
              {primaryButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
