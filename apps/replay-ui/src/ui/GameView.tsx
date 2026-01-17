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
  const [topContrib, setTopContrib] = useState<Array<{ cardId: string; name: string; fp: number }>>([]);

  const [capMax, setCapMax] = useState(180);
  const capUsed = useMemo(() => cards.reduce((s, c) => s + (c.salary ?? 0), 0), [cards]);
  const heldSalary = useMemo(
    () => cards.filter((c) => locked.has(c.cardId)).reduce((s, c) => s + (c.salary ?? 0), 0),
    [cards, locked]
  );
  const capRemaining = Math.max(0, capMax - heldSalary);

  const subtitle = useMemo(() => {
    if (phase === "HOLD") return "Tap cards to PROTECT. Then REDRAW.";
    if (phase === "DRAW") return "Redrawing…";
    if (phase === "RESULTS") return winTierLabel ? `Result: ${winTierLabel}` : "Results";
    return "Press DEAL to draft your starting six.";
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
    setCapMax(res.capMax);
    setLocked(new Set());
    setTotalFp(0);
    setWinTierLabel("");
    setMvpCardId("");
    setTopContrib([]);
    setPhase("HOLD");
  };

  const onRedraw = async () => {
    setPhase("DRAW");

    const dealt = await redrawRoster({ currentCards: cards, lockedCardIds: locked });
    setCards(dealt.cards);
    setCapMax(dealt.capMax);

    const resolved = await resolveRoster({ finalCards: dealt.cards });
    setCards(resolved.cards);
    setTotalFp(resolved.totalFp);
    setWinTierLabel(resolved.winTierLabel);
    setMvpCardId(resolved.mvpCardId);
    setTopContrib(resolved.topContributors);

    setPhase("RESULTS");
  };

  const onReplay = () => {
    setPhase("DEAL");
    setCards([]);
    setLocked(new Set());
    setTotalFp(0);
    setWinTierLabel("");
    setMvpCardId("");
    setTopContrib([]);
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI" }}>
      <ScoreHeader
        totalFp={totalFp}
        capUsed={capUsed}
        capMax={capMax}
        heldSalary={heldSalary}
        capRemaining={capRemaining}
        phase={phase}
        subtitle={subtitle}
      />

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
          <ResultsPanel totalFp={totalFp} winTierLabel={winTierLabel} topCards={cards} topContributors={topContrib} />
        </div>
      )}
    </div>
  );
}
