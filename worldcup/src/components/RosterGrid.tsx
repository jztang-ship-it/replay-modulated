/**
 * RosterGrid.tsx — World Cup
 * Ported from basketball RosterGrid.tsx — identical structure, 2-column grid.
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { PlayerCard as PlayerCardComponent } from "./PlayerCard";
import type { ShakeType } from "../hooks/useEmotionalReveal";

function keyOf(card: any): string {
  return String(card?.cardId ?? card?.id ?? card?.basePlayerId ?? card?.name ?? "");
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
  flipMsMap?: Map<string, number>;
  fpCountUpMsMap?: Map<string, number>;
  performanceTagMap?: Map<string, any>;
  pulseMap?: Map<string, any>;
  shakingCardId?: string | null;
  shakeType?: ShakeType | null;
  cardShakeTypeMap?: Map<string, ShakeType | null>;
  visibleBadgesMap?: Map<string, Array<{id:string;icon:string;label:string;fp:number}>>;
  activeRevealCardId?: string | null;
  canFlip: boolean;
  onToggleLock: (cardId: string) => void;
  onToggleFlip: (cardId: string) => void;
  onCardRollComplete?: (cardId: string) => void;
}) {
  const {
    roster, phase, onCardRollComplete, lockedIds, mvpId,
    flippedIds, revealingIds, noTransition,
    visibleFpMap, canFlip, onToggleLock, onToggleFlip,
    flipMsMap, fpCountUpMsMap, pulseMap,
    shakingCardId, shakeType, cardShakeTypeMap, visibleBadgesMap, activeRevealCardId,
  } = props;

  const cards = useMemo(() => {
    return [...roster].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  }, [roster]);

  return (
    <div style={{
      height: "100%", width: "100%",
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gridAutoRows: "1fr",
      gap: 10,
      overflow: "visible",
    }}>
      {cards.map((card) => {
        const id            = keyOf(card);
        const isLocked      = lockedIds.has(id);
        const isFlipped     = flippedIds.has(id);
        const isRevealing   = revealingIds?.has(id) ?? false;
        const visibleFp     = visibleFpMap?.get(id);
        const flipMs        = flipMsMap?.get(id);
        const fpCountUpMs   = fpCountUpMsMap?.get(id);
        const pulse         = pulseMap?.get(id);
        const isShaking     = shakingCardId === id;
        const liveShakeType: ShakeType = isShaking ? (shakeType ?? null) : null;
        const isSpotlight   = activeRevealCardId === id;
        const cardShakeType = cardShakeTypeMap?.get(id) ?? null;

        const handleTap = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (phase === "HOLD") onToggleLock(id);
          else if (canFlip) onToggleFlip(id);
        };

        return (
          <div
            key={card.slotIndex ?? id}
            onClick={handleTap}
            style={{
              minHeight: 0, position: "relative", borderRadius: 18,
              overflow: "visible",
              zIndex: isSpotlight ? 100 : isShaking ? 10 : 1,
              background: "#0a0c10",
            }}
          >
            <PlayerCardComponent
              card={card}
              phase={phase}
              locked={isLocked}
              onToggleLock={() => onToggleLock(id)}
              isMvp={mvpId === id}
              flipped={isFlipped}
              onToggleFlip={() => onToggleFlip(id)}
              canFlip={canFlip}
              visibleFp={visibleFp}
              noTransition={noTransition}
              flipDurationMs={flipMs}
              fpCountUpMs={fpCountUpMs}
              pulse={pulse}
              isRevealing={isRevealing}
              shakeType={liveShakeType}
              onRollComplete={() => onCardRollComplete?.(id)}
              cardShakeType={cardShakeType}
              badges={visibleBadgesMap?.get(id) ?? []}
              isSpotlight={activeRevealCardId === id}
              spotlightLevel={
                activeRevealCardId === id ? (
                  (card as any).tier === "ORANGE" ? 3 :
                  (card as any).tier === "PURPLE" ? 2 :
                  ((visibleBadgesMap?.get(id)?.length ?? 0) >= 2) ? 1 : 0
                ) : 0
              }
              isDimmed={activeRevealCardId !== null && activeRevealCardId !== id}
            />
          </div>
        );
      })}
    </div>
  );
}
