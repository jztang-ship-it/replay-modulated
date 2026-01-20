import { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { CardSlot } from "./CardSlot";
import { sportAdapter } from "../adapters/SportAdapter";

function cardKey(c: any): string {
  return String(c?.cardId ?? c?.id ?? c?.playerId ?? c?.basePlayerId ?? c?.uid ?? c?.name ?? "");
}

export function RosterGrid(props: {
  roster: PlayerCard[];
  phase: GamePhase;
  lockedIds: Set<string>;
  mvpId?: string;
  flippedIds: Set<string>;
  onToggleLock: (cardKey: string) => void;
  onToggleFlip: (cardKey: string) => void;
  columns?: 2 | 3;
}) {
  const { roster, phase, lockedIds, mvpId, flippedIds, onToggleLock, onToggleFlip, columns } = props;

  const cols = useMemo(() => {
    if (columns) return columns;
    if (typeof window === "undefined") return 2;
    return window.matchMedia?.("(min-width: 900px)")?.matches ? 3 : 2;
  }, [columns]);

  const sortedCards = useMemo(() => {
    const positionOrder = sportAdapter.positions; // e.g., ["FWD", "MID", "DEF", "GK"]

    return [...roster]
      .sort((a, b) => {
        const aIndex = positionOrder.indexOf(a.position);
        const bIndex = positionOrder.indexOf(b.position);
        return aIndex - bIndex;
      })
      .slice(0, 6);
  }, [roster]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "grid",
        gap: 10, // spacing stays constant
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "1fr", // cards eat extra space proportionally
        alignContent: "stretch",
      }}
    >
      {sortedCards.map((card) => {
        const key = cardKey(card); // IMPORTANT: no Math.random()
        return (
          <CardSlot
            key={key}
            card={card}
            phase={phase}
            isLocked={lockedIds.has(key)}
            isMvp={mvpId === key}
            isFlipped={flippedIds.has(key)}
            canFlip={phase === "RESULTS"}
            onToggleLock={() => onToggleLock(key)}
            onToggleFlip={() => onToggleFlip(key)}
          />
        );
      })}
    </div>
  );
}
