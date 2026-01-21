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
  canFlip?: boolean;
}) {
  const { roster, phase, lockedIds, mvpId, flippedIds, onToggleLock, onToggleFlip, columns, canFlip } = props;

  const cols = useMemo(() => {
    if (columns) return columns;
    if (typeof window === "undefined") return 2;
    return window.matchMedia?.("(min-width: 900px)")?.matches ? 3 : 2;
  }, [columns]);

  const sortedCards = useMemo(() => {
    const positionOrder = sportAdapter.positions ?? []; // e.g., ["FW", "MD", "DE", "GK"]

    return [...roster]
      .sort((a, b) => {
        const aPos = String((a as any)?.position ?? "");
        const bPos = String((b as any)?.position ?? "");
        const aIndex = positionOrder.indexOf(aPos);
        const bIndex = positionOrder.indexOf(bPos);
        // unknown positions go last
        const ai = aIndex === -1 ? 999 : aIndex;
        const bi = bIndex === -1 ? 999 : bIndex;
        return ai - bi;
      })
      .slice(0, 6);
  }, [roster]);

  const allowFlip = canFlip ?? phase === "RESULTS";

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
      {sortedCards.map((card) => {
        const key = cardKey(card);
        return (
          <CardSlot
            key={key}
            card={card}
            phase={phase}
            isLocked={lockedIds.has(key)}
            isMvp={mvpId === key}
            isFlipped={flippedIds.has(key)}
            canFlip={allowFlip}
            onToggleLock={() => onToggleLock(key)}
            onToggleFlip={() => onToggleFlip(key)}
          />
        );
      })}
    </div>
  );
}
