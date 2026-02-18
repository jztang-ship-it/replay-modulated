// frontend/src/components/RosterGrid.tsx

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { AthleteCardLegacy } from "./AthleteCard";

export function RosterGrid(props: {
  roster: PlayerCard[];
  phase: GamePhase;

  lockedIds: Set<string>;
  mvpId?: string;

  flippedIds: Set<string>;
  faceDownIds: Set<string>;
  visibleFpMap?: Map<string, number>;

  canFlip: boolean;

  onToggleLock: (cardId: string) => void;
  onToggleFlip: (cardId: string) => void;
}) {
  const {
    roster,
    phase,
    lockedIds,
    mvpId,
    flippedIds,
    faceDownIds,
    visibleFpMap,
    canFlip,
    onToggleLock,
    onToggleFlip,
  } = props;

  const cards = useMemo(() => {
    // Always render in slot order so things don’t jump
    return [...roster].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  }, [roster]);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gridAutoRows: "1fr",
        gap: 10,
      }}
    >
      {cards.map((card) => {
        const id = String(card.cardId);
        const isLocked = lockedIds.has(id);
        const isFlipped = flippedIds.has(id);
        const isFaceDown = faceDownIds.has(id);
        const visibleFp = visibleFpMap?.get(id);

        // HOLD: tap locks
        // RESULTS: tap flips stats back
        const handleTap = () => {
          if (phase === "HOLD") onToggleLock(id);
          else if (canFlip) onToggleFlip(id);
        };

        return (
          <div key={id} onClick={handleTap} style={{ minHeight: 0 }}>
            <AthleteCardLegacy
              card={card}
              phase={phase}
              isLocked={isLocked}
              isMvp={mvpId === id}
              isFlipped={isFlipped}
              canFlip={canFlip}
              onToggleFlip={() => onToggleFlip(id)}
              isFaceDown={isFaceDown}
              visibleFp={visibleFp}
            />
          </div>
        );
      })}
    </div>
  );
}
