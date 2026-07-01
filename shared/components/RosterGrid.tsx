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
import type { TopGameTier, TopGameResult } from "../commentary/types";

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
  /** Top Games tier for this card. null = no Top Games visual. */
  topGameTier?: TopGameTier | null;
  /** Top Games full result (tier + primaryReason). Used by the back-of-card
   *  achievement layout to render the featured stat + context line. */
  topGameResult?: TopGameResult | null;
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
  visibleBadgesMap?: Map<string, Array<{ id: string; icon: string; label: string; fp: number }>>;
  activeRevealCardId?: string | null;
  /** FTUE only: recovers the old spotlight treatment on the directed-hold card —
   *  the gold `ftueCardPulse` ring on the lit card + a deeper dim on the rest.
   *  Off (default) → normal play byte-identical. */
  isFTUE?: boolean;
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
  /** basePlayerId of the star card (if any). Used to pick which card receives topGameTier. */
  topGameStarBasePlayerId?: string | null;
  /** Top Games tier for the star card. Non-star cards always receive null. */
  topGameTier?: TopGameTier | null;
  /** Full Top Games result for the star card (tier + primaryReason). Drives
   *  the achievement-mode back layout. Non-star cards always receive null. */
  topGameResult?: TopGameResult | null;
  /** Optional per-slot label badge (e.g. football's FLEX rule "ANY OUTFIELD"
   *  with explainer tooltip). Keyed by slot index. Sport-agnostic — sports
   *  that don't set this see no change. */
  slotLabels?: Record<number, { label: string; tooltip?: string }>;
};

export function RosterGrid(props: Props) {
  const {
    columns, CardComponent,
    roster, phase, onCardRollComplete, lockedIds, mvpId,
    flippedIds, revealingIds, noTransition,
    visibleFpMap, canFlip, onToggleLock, onToggleFlip,
    flipMsMap, fpCountUpMsMap, performanceTagMap, pulseMap,
    shakingCardId, shakeType, cardShakeTypeMap, visibleBadgesMap, activeRevealCardId,
    isFTUE = false,
    revealMode = "auto", onTapReveal, heldFpVisible = false, heldRevealedIds, tappedCardIds, isRevealingPhase = false,
    glowCardId, glowTier, glowDurationMs,
    isSkipping = false,
    topGameStarBasePlayerId = null,
    topGameTier = null,
    topGameResult = null,
    slotLabels,
  } = props;

  const cards = useMemo(() => {
    return [...roster].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  }, [roster]);

  // FTUE directed-hold spotlight: recovered gold pulse on the lit card + deeper
  // dim on the rest. Confined to HOLD so the reveal phase is untouched.
  const ftueHold = isFTUE && phase === "HOLD";

  return (
    <div className="roster-grid" style={{
      width: "100%",
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      columnGap: 4,
      rowGap: 6,
      boxSizing: "border-box",
    }}>
      {/* Recovered from CardBackGeneric@21706b1e (isFTUE gold pulse) — verbatim
          keyframes: 1.4s ease-in-out infinite, gold #FFB14A ring 2px@.5 → 3px@1 + glow. */}
      {ftueHold && (
        <style>{`@keyframes ftueCardPulse {
          0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,177,74,0.5); }
          50%     { box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 3px rgba(255,177,74,1), 0 0 18px rgba(255,177,74,0.5); }
        }`}</style>
      )}
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
        const isShaking = shakingCardId === id;
        const liveShakeType: ShakeType = isShaking ? (shakeType ?? null) : null;
        const isSpotlight = activeRevealCardId === id;
        const isFaceDown = flippedIds.has(id);
        const isDimmed = !isSkipping && activeRevealCardId !== null && activeRevealCardId !== id && !isFaceDown;
        const cardShakeType = cardShakeTypeMap?.get(id) ?? null;
        const cardBasePlayerId = String((card as any)?.basePlayerId ?? "");
        const isTopGameStar = !!topGameStarBasePlayerId && cardBasePlayerId === topGameStarBasePlayerId;
        const cardTopGameTier: TopGameTier | null = isTopGameStar ? (topGameTier ?? null) : null;
        const cardTopGameResult: TopGameResult | null = isTopGameStar ? (topGameResult ?? null) : null;

        // tap mode: a card is "held" if it has wasHeld flag
        const wasHeld = (card as any).wasHeld === true;
        const isTapped = tappedCardIds?.has(id) ?? false;
        // In tap mode during REVEALING: unheld untapped cards are tappable
        const isTapTarget = revealMode === "tap" && isRevealingPhase
          && !wasHeld && !isTapped;
        // Per-card: held card FP shows when its ID is in heldRevealedIds OR
        // when heldFpVisible is true (set by skip path after rollup completes)
        const thisHeldRevealed = wasHeld && ((heldRevealedIds?.has(id) ?? false) || (heldFpVisible ?? false));
        const showHeldFp = thisHeldRevealed;
        // In tap mode, visibleFp for held card: undefined until revealed
        // For held cards: only pass visibleFp once the rollup has actually set it
        // (visibleFpMap value). Do NOT fall back to card.actualFp — that would
        // make visibleFp === actualFp immediately and fire the stamp before rollup.
        const effectiveFp = wasHeld
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
              background: "transparent",
              cursor: isTapTarget ? "pointer" : "default",
              boxShadow: "none",
              transition: "box-shadow 300ms ease",
            }}
          >
            {/* Dim overlay — sits above 3D card as a sibling, never touches preserve-3d.
                FTUE hold deepens it (0.45 → 0.72) so the lit card clearly pops. */}
            {isDimmed && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 18,
                background: `rgba(4,8,16,${ftueHold ? 0.72 : 0.45})`,
                pointerEvents: "none", zIndex: 120,
                transition: "opacity 0.3s ease",
              }} />
            )}
            {/* FTUE hold spotlight ring — recovered ftueCardPulse (gold #FFB14A,
                1.4s ease-in-out infinite), verbatim. As an OVERLAY ABOVE the card
                (z 130 > the card + the neighbor dims) so the scaled-up card can't
                cover it and the mirror of the working dim-overlay pattern renders
                it reliably. Was previously a box-shadow on the slot, which the
                scaled card painted over + the overflow:hidden wrappers clipped. */}
            {ftueHold && isSpotlight && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 18,
                pointerEvents: "none", zIndex: 130,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,177,74,0.6)",
                animation: "ftueCardPulse 1.4s ease-in-out infinite",
              }} />
            )}
            {/* Optional slot-label badge (e.g. football's FLEX rule). Only
                rendered when the adapter set slotLabels[slotIndex]. Native
                title=tooltip — PR 3 polish can replace with a custom UI. */}
            {slotLabels?.[card.slotIndex ?? 0] && (
              <div
                title={slotLabels[card.slotIndex ?? 0].tooltip ?? ""}
                style={{
                  position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)",
                  zIndex: 130, pointerEvents: "auto",
                  padding: "2px 6px", borderRadius: 999,
                  background: "rgba(7,10,18,0.85)", border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: 7, fontWeight: 900, letterSpacing: 0.6, color: "rgba(255,255,255,0.75)",
                  textTransform: "uppercase", whiteSpace: "nowrap",
                  cursor: "help",
                }}
              >
                {slotLabels[card.slotIndex ?? 0].label}
              </div>
            )}
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
                  (card as any).tier === "RED" ? 4 :
                    (card as any).tier === "ORANGE" ? 3 :
                      (card as any).tier === "PURPLE" ? 2 :
                        ((visibleBadgesMap?.get(id)?.length ?? 0) >= 2) ? 1 : 0
                ) : 0
              }
              isDimmed={isDimmed}
              topGameTier={cardTopGameTier}
              topGameResult={cardTopGameResult}
            />
          </div>
        );
      })}
    </div>
  );
}