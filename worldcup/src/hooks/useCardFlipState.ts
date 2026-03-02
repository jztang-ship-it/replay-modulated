/**
 * useCardFlipState.ts — World Cup (ported from basketball, sport-agnostic)
 *
 * Single source of truth for ALL card flip state.
 *
 * Each card has exactly one phase:
 *   "BACK"              — showing generic back face
 *   "FLIPPING_TO_FRONT" — mid-animation, back→front
 *   "FRONT"             — showing front face
 *   "FLIPPING_TO_BACK"  — mid-animation, front→back (only during DRAWING)
 */

import { useCallback, useRef, useState } from "react";

export type CardPhase =
  | "BACK"
  | "FLIPPING_TO_FRONT"
  | "FRONT"
  | "FLIPPING_TO_BACK";

type PhaseMap = Map<string, CardPhase>;

export interface CardFlipState {
  isBack: (cardId: string) => boolean;
  isFlipping: (cardId: string) => boolean;
  isFront: (cardId: string) => boolean;
  getPhase: (cardId: string) => CardPhase;
  initCards: (cardIds: string[]) => void;
  beginReveal: () => void;
  revealCard: (cardId: string) => void;
  completeReveal: (cardId: string) => void;
  beginDraw: (nonHeldIds: string[]) => void;
  resetAll: (cardIds: string[]) => void;
}

export function useCardFlipState(): CardFlipState {
  const [phaseMap, setPhaseMap] = useState<PhaseMap>(new Map());
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
    if (current === "BACK" || current === "FLIPPING_TO_BACK") {
      setPhase(cardId, "FLIPPING_TO_FRONT");
    }
  }, [setPhase]);

  const completeReveal = useCallback((cardId: string) => {
    if (phaseMapRef.current.get(cardId) === "FLIPPING_TO_FRONT") {
      setPhase(cardId, "FRONT");
    }
  }, [setPhase]);

  const beginDraw = useCallback((nonHeldIds: string[]) => {
    const updates: Array<[string, CardPhase]> = nonHeldIds
      .filter(id => {
        const p = phaseMapRef.current.get(id) ?? "BACK";
        return p === "FRONT" || p === "FLIPPING_TO_FRONT";
      })
      .map(id => [id, "FLIPPING_TO_BACK"]);

    if (updates.length) setPhases(updates);

    setTimeout(() => {
      const backUpdates: Array<[string, CardPhase]> = nonHeldIds
        .filter(id => phaseMapRef.current.get(id) === "FLIPPING_TO_BACK")
        .map(id => [id, "BACK"]);
      if (backUpdates.length) setPhases(backUpdates);
    }, 700);
  }, [setPhases]);

  const resetAll = useCallback((cardIds: string[]) => {
    const next = new Map<string, CardPhase>();
    for (const id of cardIds) next.set(id, "BACK");
    phaseMapRef.current = next;
    setPhaseMap(new Map(next));
  }, []);

  return {
    isBack, isFlipping, isFront, getPhase,
    initCards, beginReveal, revealCard, completeReveal, beginDraw, resetAll,
  };
}
