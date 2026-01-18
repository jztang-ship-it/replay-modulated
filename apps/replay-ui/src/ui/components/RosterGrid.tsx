import { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../engine/types";
import { CardSlot } from "./CardSlot";

function cardKey(c: any): string {
  return String(c?.cardId ?? c?.id ?? c?.playerId ?? c?.basePlayerId ?? c?.uid ?? c?.name ?? "");
}


export function RosterGrid(props: {
  roster: PlayerCard[];
  phase: GamePhase;

  lockedIds: Set<string>;
  mvpId?: string;
  flippedId?: string | null;

  onToggleLock: (cardKey: string) => void;
  onToggleFlip: (cardKey: string) => void;

  columns?: 2 | 3;
}) {
  const { roster, phase, lockedIds, mvpId, flippedId, onToggleLock, onToggleFlip, columns } = props;

  const cols = useMemo(() => {
    if (columns) return columns;
    if (typeof window === "undefined") return 2;
    return window.matchMedia?.("(min-width: 900px)")?.matches ? 3 : 2;
  }, [columns]);

  const cards = roster.slice(0, 6);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "grid",
        gap: 10,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "1fr",
        alignContent: "stretch",
      }}
    >
      {cards.map((card) => {
        const key = cardKey(card) || String(Math.random());

        return (
          <CardSlot
            key={key}
            card={card}
            phase={phase}
            isLocked={lockedIds.has(key)}
            isMvp={mvpId === key}
            isFlipped={flippedId === key}
            canFlip={phase === "RESULTS"}
            onToggleLock={() => onToggleLock(key)}
            onToggleFlip={() => onToggleFlip(key)}
          />
        );
      })}
    </div>
  );
}
