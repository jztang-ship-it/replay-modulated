import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { AthleteCard } from "./AthleteCard";

function keyOf(card: any): string {
  return String(
    card?.cardId ??
      card?.id ??
      card?.playerId ??
      card?.basePlayerId ??
      card?.uid ??
      card?.name ??
      ""
  );
}

export function RosterGrid(props: {
  roster: PlayerCard[];
  phase: GamePhase;
  lockedIds: Set<string>;
  mvpId?: string;

  flippedIds: Set<string>;
  revealingIds?: Set<string>;
  noTransition?: boolean;

  visibleFpMap?: Map<string, number>;

  // emotion maps
  flipMsMap?: Map<string, number>;
  fpCountUpMsMap?: Map<string, number>;
  performanceTagMap?: Map<string, any>;
  pulseMap?: Map<string, any>;

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
    revealingIds,
    noTransition,
    visibleFpMap,
    canFlip,
    onToggleLock,
    onToggleFlip,
    flipMsMap,
    fpCountUpMsMap,
    performanceTagMap,
    pulseMap,
  } = props;

  const cards = useMemo(() => {
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
        const id = keyOf(card);
        const isLocked = lockedIds.has(id);
        const isFlipped = flippedIds.has(id);
        const isRevealing = revealingIds?.has(id) ?? false;
        const visibleFp = visibleFpMap?.get(id);

        const flipMs = flipMsMap?.get(id);
        const fpCountUpMs = fpCountUpMsMap?.get(id);
        const performanceTag = performanceTagMap?.get(id);
        const pulse = pulseMap?.get(id);

        const handleTap = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (phase === "HOLD") onToggleLock(id);
          else if (canFlip) onToggleFlip(id);
        };

        return (
          <div
            // IMPORTANT: slotIndex key keeps DOM stable per slot (no “jumping”)
            key={card.slotIndex ?? id}
            onClick={handleTap}
            style={{ minHeight: 0, position: "relative", borderRadius: 18 }}
          >
            <AthleteCard
              card={card}
              phase={phase}
              locked={isLocked}
              onToggleLock={() => onToggleLock(id)}
              isMvp={mvpId === id}
              flipped={isFlipped && !isRevealing}
              onToggleFlip={() => onToggleFlip(id)}
              canFlip={canFlip}
              visibleFp={visibleFp}
              noTransition={noTransition}
              flipDurationMs={flipMs}
              fpCountUpMs={fpCountUpMs}
              performanceTag={performanceTag}
              pulse={pulse}
              isRevealing={isRevealing}
            />
          </div>
        );
      })}
    </div>
  );
}