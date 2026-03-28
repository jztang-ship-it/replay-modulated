/**
 * shared/components/RosterGrid.tsx
 * LAYER 1: Sport-agnostic roster grid layout.
 *
 * Parameterized via:
 *   - columns: number of grid columns (3 for basketball, 2 for worldcup/soccer)
 *   - CardComponent: the sport's card component (AthleteCard, PlayerCard, etc.)
 *
 * All game logic (lock, flip, reveal, spotlight) lives here — identical across sports.
 * Sports import from "@shared/components/RosterGrid".
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../types/index";
import type { ShakeType } from "./types";

function keyOf(card: any): string {
  return String(
    card?.cardId ?? card?.id ?? card?.playerId ??
    card?.basePlayerId ?? card?.uid ?? card?.name ?? ""
  );
}

export type RosterGridCardProps = {
  card: PlayerCard;
  phase: GamePhase;
  locked: boolean;
  onToggleLock: () => void;
  isMvp: boolean;
  flipped: boolean;
  onToggleFlip: () => void;
  canFlip: boolean;
  visibleFp?: number;
  noTransition?: boolean;
  flipDurationMs?: number;
  fpCountUpMs?: number;
  performanceTag?: any;
  pulse?: any;
  isRevealing: boolean;
  shakeType: ShakeType | null;
  onRollComplete: () => void;
  cardShakeType: ShakeType | null;
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight: boolean;
  spotlightLevel: number;
  isDimmed: boolean;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
};

type Props = {
  /** Number of grid columns — 3 for basketball, 2 for worldcup */
  columns: number;
  /** The sport's card component — receives RosterGridCardProps */
  CardComponent: React.ComponentType<RosterGridCardProps>;
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
  /** FTUE: slot indices to dim (all except Booker at slot 0) */
  ftueDimmedSlots?: Set<number>;
  visibleBadgesMap?: Map<string, Array<{ id: string; icon: string; label: string; fp: number }>>;
  activeRevealCardId?: string | null;
  canFlip: boolean;
  onToggleLock: (cardId: string) => void;
  onToggleFlip: (cardId: string) => void;
  onCardRollComplete?: (cardId: string) => void;
  // tap-to-reveal
  revealMode?: "auto" | "tap";
  onTapReveal?: (cardId: string) => void;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  heldRevealedIds?: Set<string>;
  tappedCardIds?: Set<string>;
  isRevealingPhase?: boolean;  // true when gameState === "REVEALING"
  glowCardId?: string | null;
  glowTier?: string;
  glowDurationMs?: number;
  isSkipping?: boolean;
  ftueLockedSlot?: number | null;  // FTUE: slot index that stays lit; all others dim
  ftueFlipTargetId?: string | null; // FTUE: show TAP hint on this card in RESULTS
};

export function RosterGrid(props: Props) {
  const {
    columns, CardComponent,
    roster, phase, onCardRollComplete, lockedIds, mvpId,
    flippedIds, revealingIds, noTransition,
    visibleFpMap, canFlip, onToggleLock, onToggleFlip,
    flipMsMap, fpCountUpMsMap, performanceTagMap, pulseMap,
    shakingCardId, shakeType, cardShakeTypeMap, visibleBadgesMap, activeRevealCardId, ftueDimmedSlots,
    revealMode = "auto", onTapReveal, heldFpVisible = false, heldRevealedIds, tappedCardIds, isRevealingPhase = false, ftueLockedSlot = null, ftueFlipTargetId = null,
    glowCardId, glowTier, glowDurationMs,
    isSkipping = false,
  } = props;

  const cards = useMemo(() => {
    return [...roster].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  }, [roster]);

  return (
    <div className="roster-grid" style={{
      width: "100%",
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 8,
      boxSizing: "border-box",
    }}>
      {cards.map((card) => {
        const id             = keyOf(card);
        const isLocked       = lockedIds.has(id);
        const isFlipped      = flippedIds.has(id);
        const isRevealing    = revealingIds?.has(id) ?? false;
        const visibleFp      = visibleFpMap?.get(id);
        const flipMs         = flipMsMap?.get(id);
        const fpCountUpMs    = fpCountUpMsMap?.get(id);
        const performanceTag = performanceTagMap?.get(id);
        const pulse          = pulseMap?.get(id);
        const isShaking      = shakingCardId === id;
        const liveShakeType: ShakeType = isShaking ? (shakeType ?? null) : null;
        const isSpotlight    = activeRevealCardId === id;
        const isDimmed       = !isSkipping && activeRevealCardId !== null && activeRevealCardId !== id;
        const cardShakeType  = cardShakeTypeMap?.get(id) ?? null;

        // tap mode: a card is "held" if it has wasHeld flag
        const wasHeld        = (card as any).wasHeld === true;
        const isTapped       = tappedCardIds?.has(id) ?? false;
        // In tap mode during REVEALING: unheld untapped cards are tappable
        const isTapTarget    = (revealMode === "tap" && isRevealingPhase
                               && !wasHeld && !isTapped)
                               || (ftueFlipTargetId !== null && id === ftueFlipTargetId);
        // Per-card: held card FP shows when its ID is in heldRevealedIds OR
        // when heldFpVisible is true (set by skip path after rollup completes)
        const thisHeldRevealed = wasHeld && ((heldRevealedIds?.has(id) ?? false) || (heldFpVisible ?? false));
        const showHeldFp     = thisHeldRevealed;
        // In tap mode, visibleFp for held card: undefined until revealed
        // For held cards: only pass visibleFp once the rollup has actually set it
        // (visibleFpMap value). Do NOT fall back to card.actualFp — that would
        // make visibleFp === actualFp immediately and fire the stamp before rollup.
        const effectiveFp    = wasHeld
          ? (thisHeldRevealed ? visibleFp : undefined)
          : visibleFp;

        const handleTap = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (phase === "HOLD") onToggleLock(id);
          else if (canFlip) onToggleFlip(id);
          else if (isTapTarget) onTapReveal?.(id);
        };

        return (
          <div
            key={card.slotIndex ?? id}
            className="card-slot"
            data-slot={card.slotIndex ?? 0}
            data-ftue-card={id}
            onClick={handleTap}
            style={{
              position: "relative",
              overflow: "visible",
              width: "100%",
              aspectRatio: "329 / 478",
              zIndex: isSpotlight ? 100 : isShaking ? 10 : 1,
              filter: isDimmed ? "brightness(0.35)" : "none",
              background: "#0a0c10",
              cursor: isTapTarget ? "pointer" : "default",
              boxShadow: isTapTarget ? "0 0 0 2px rgba(255,255,255,0.25)" : "none",
              transition: "box-shadow 300ms ease, opacity 0.3s ease, filter 0.3s ease",
              ...(ftueLockedSlot !== null && (card.slotIndex ?? 0) !== ftueLockedSlot
                ? { opacity: 0.18, filter: "brightness(0.4)", pointerEvents: "none" as const }
                : {}),
            }}
          >
            <CardComponent
              card={card}
              phase={phase}
              locked={isLocked}
              onToggleLock={() => onToggleLock(id)}
              isMvp={mvpId === id}
              flipped={isFlipped}
              onToggleFlip={() => onToggleFlip(id)}
              canFlip={canFlip}
              visibleFp={effectiveFp}
              noTransition={noTransition}
              flipDurationMs={flipMs}
              fpCountUpMs={fpCountUpMs}
              performanceTag={performanceTag}
              heldFpVisible={thisHeldRevealed}
              isTapTarget={isTapTarget}
              pulse={pulse}
              isRevealing={isRevealing}
              shakeType={liveShakeType}
              onRollComplete={() => onCardRollComplete?.(id)}
              cardShakeType={cardShakeType}
              badges={visibleBadgesMap?.get(id) ?? []}
              glowActive={glowCardId === (card as any).cardId}
              glowTier={glowTier}
              glowDurationMs={glowDurationMs}
              isSpotlight={activeRevealCardId === id}
              spotlightLevel={
                activeRevealCardId === id ? (
                  (card as any).tier === "ORANGE" ? 3 :
                  (card as any).tier === "PURPLE" ? 2 :
                  ((visibleBadgesMap?.get(id)?.length ?? 0) >= 2) ? 1 : 0
                ) : 0
              }
              isDimmed={isDimmed}
            />
          </div>
        );
      })}
    </div>
  );
}