 /**
 * useCardFlipState.ts
 *
 * Single source of truth for ALL card flip state.
 *
 * Each card has exactly one phase:
 *   "BACK"              — showing generic back face
 *   "FLIPPING_TO_FRONT" — mid-animation, back→front
 *   "FRONT"             — showing front face (stays here forever once reached)
 *   "FLIPPING_TO_BACK"  — mid-animation, front→back (only during DRAWING)
 *
 * RULES:
 * - A card that has reached FRONT never goes back to BACK due to state race conditions.
 * - GameView drives phase transitions by calling the provided actions.
 * - No boolean sets. No computed flippedIds from multiple sources.
 */

import { useCallback, useRef, useState } from "react";

export type CardPhase =
  | "BACK"
  | "FLIPPING_TO_FRONT"
  | "FRONT"
  | "FLIPPING_TO_BACK";

type PhaseMap = Map<string, CardPhase>;

export interface CardFlipState {
  /** Is this card currently showing back face? */
  isBack: (cardId: string) => boolean;
  /** Is this card mid-flip in either direction? */
  isFlipping: (cardId: string) => boolean;
  /** Has this card fully revealed its front? */
  isFront: (cardId: string) => boolean;
  /** The raw phase (for AthleteCard flipped prop) */
  getPhase: (cardId: string) => CardPhase;

  // ── Actions called by GameView ──────────────────────────────────────────

  /** Call when new roster is dealt. All cards start BACK. */
  initCards: (cardIds: string[]) => void;

  /** Call when REVEALING starts. Cards will flip to front one by one via revealCard(). */
  beginReveal: () => void;

  /** Begin flipping a specific card to front. */
  revealCard: (cardId: string) => void;

  /** Mark card as fully revealed (front face showing). */
  completeReveal: (cardId: string) => void;

  /** Call when DRAWING starts — flip all non-held cards to back. */
  beginDraw: (nonHeldIds: string[]) => void;

  /** Reset all cards to BACK (between hands). */
  resetAll: (cardIds: string[]) => void;
}

export function useCardFlipState(): CardFlipState {
  const [phaseMap, setPhaseMap] = useState<PhaseMap>(new Map());

  // Use ref for synchronous reads inside callbacks
  const phaseMapRef = useRef<PhaseMap>(new Map());

  const setPhase = useCallback((cardId: string, phase: CardPhase) => {
    phaseMapRef.current = new Map(phaseMapRef.current).set(cardId, phase);
    setPhaseMap(new Map(phaseMapRef.current));
  }, []);

  const setPhases = useCallback((updates: Array<[string, CardPhase]>) => {
    const next = new Map(phaseMapRef.current);
    for (const [id, phase] of updates) next.set(id, phase);
    phaseMapRef.current = next;
    setPhaseMap(new Map(next));
  }, []);

  const getPhase = useCallback((cardId: string): CardPhase => {
    return phaseMapRef.current.get(cardId) ?? "BACK";
  }, []);

  const isBack = useCallback((cardId: string) => {
    const p = phaseMapRef.current.get(cardId) ?? "BACK";
    return p === "BACK" || p === "FLIPPING_TO_BACK";
  }, []);

  const isFlipping = useCallback((cardId: string) => {
    const p = phaseMapRef.current.get(cardId) ?? "BACK";
    return p === "FLIPPING_TO_FRONT" || p === "FLIPPING_TO_BACK";
  }, []);

  const isFront = useCallback((cardId: string) => {
    return phaseMapRef.current.get(cardId) === "FRONT";
  }, []);

  const initCards = useCallback((cardIds: string[]) => {
    const next = new Map<string, CardPhase>();
    for (const id of cardIds) next.set(id, "BACK");
    phaseMapRef.current = next;
    setPhaseMap(new Map(next));
  }, []);

  const beginReveal = useCallback(() => {
    // No-op: cards stay BACK until revealCard() is called per card
  }, []);

  const revealCard = useCallback((cardId: string) => {
    const current = phaseMapRef.current.get(cardId) ?? "BACK";
    // Only flip if currently BACK — never re-flip a FRONT card
    if (current === "BACK" || current === "FLIPPING_TO_BACK") {
      setPhase(cardId, "FLIPPING_TO_FRONT");
    }
  }, [setPhase]);

  const completeReveal = useCallback((cardId: string) => {
    // Only advance if currently flipping to front — never go backwards
    if (phaseMapRef.current.get(cardId) === "FLIPPING_TO_FRONT") {
      setPhase(cardId, "FRONT");
    }
  }, [setPhase]);

  const beginDraw = useCallback((nonHeldIds: string[]) => {
    // Only flip cards that are currently FRONT or FLIPPING_TO_FRONT
    // Never touch cards that are already BACK
    const updates: Array<[string, CardPhase]> = nonHeldIds
      .filter(id => {
        const p = phaseMapRef.current.get(id) ?? "BACK";
        return p === "FRONT" || p === "FLIPPING_TO_FRONT";
      })
      .map(id => [id, "FLIPPING_TO_BACK"]);

    if (updates.length) setPhases(updates);

    // After animation completes, mark as BACK
    setTimeout(() => {
      const backUpdates: Array<[string, CardPhase]> = nonHeldIds
        .filter(id => phaseMapRef.current.get(id) === "FLIPPING_TO_BACK")
        .map(id => [id, "BACK"]);
      if (backUpdates.length) setPhases(backUpdates);
    }, 700); // matches DRAWING sleep duration
  }, [setPhases]);

  const resetAll = useCallback((cardIds: string[]) => {
    const next = new Map<string, CardPhase>();
    for (const id of cardIds) next.set(id, "BACK");
    phaseMapRef.current = next;
    setPhaseMap(new Map(next));
  }, []);

  return {
    isBack,
    isFlipping,
    isFront,
    getPhase,
    initCards,
    beginReveal,
    revealCard,
    completeReveal,
    beginDraw,
    resetAll,
  };
}
