import { useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "./engine/types";
import { dealInitialRoster, redrawRoster, resolveRoster } from "./engine/engineAdapter";
import { ScoreHeader } from "./components/ScoreHeader";
import { RosterGrid } from "./components/RosterGrid";
import { Controls } from "./components/Controls";
import { ResultsPanel } from "./components/ResultsPanel";

export function GameView() {
  const [phase, setPhase] = useState<GamePhase>("DEAL");
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [locked, setLocked] = useState<Set<string>>(new Set());

  const [totalFp, setTotalFp] = useState(0);
  const [winTierLabel, setWinTierLabel] = useState("");
  const [mvpCardId, setMvpCardId] = useState("");

  const capMax = 150;
  const capUsed = 150;

  const subtitle = useMemo(() => {
    if (phase === "HOLD") return "Tap cards to HOLD. Then REDRAW.";
    if (phase === "DRAW") return "Redrawing…";
    if (phase === "RESULTS") return winTierLabel ? `Result: ${winTierLabel}` : "Results";
    return "Press DEAL to start.";
  }, [phase, winTierLabel]);

  const toggleLock = (cardId: string) => {
    if (phase !== "HOLD") return;
    setLocked((prev) => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const onDeal = async () => {
    const res = await dealInitialRoster();
    setCards(res.cards);
    setLocked(new Set());
    setTotalFp(0);
    setWinTierLabel("");
    setMvpCardId("");
    setPhase("HOLD");
  };

  const onRedraw = async () => {
    setPhase("DRAW");
    const res = await redrawRoster({ currentCards: cards, lockedCardIds: locked });
    setCards(res.cards);

    const resolved = await resolveRoster({ finalCards: res.cards });
    setCards(resolved.cards);
    setTotalFp(resolved.totalFp);
    setWinTierLabel(resolved.winTierLabel);
    setMvpCardId(resolved.mvpCardId);
    setPhase("RESULTS");
  };

  const onReplay = () => {
    setPhase("DEAL");
    setCards([]);
    setLocked(new Set());
    setTotalFp(0);
    setWinTierLabel("");
    setMvpCardId("");
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI" }}>
      <ScoreHeader totalFp={totalFp} capUsed={capUsed} capMax={capMax} phase={phase} subtitle={subtitle} />

      <div style={{ marginTop: 16 }}>
        <RosterGrid
          cards={cards}
          phase={phase}
          lockedCardIds={locked}
          onToggleLock={toggleLock}
          mvpCardId={mvpCardId}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <Controls phase={phase} onDeal={onDeal} onRedraw={onRedraw} onReplay={onReplay} />
      </div>

      {phase === "RESULTS" && (
        <div style={{ marginTop: 16 }}>
          <ResultsPanel totalFp={totalFp} winTierLabel={winTierLabel} topCards={cards} />
        </div>
      )}
    </div>
  );
}
