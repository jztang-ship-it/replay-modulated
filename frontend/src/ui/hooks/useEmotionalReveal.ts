// src/ui/hooks/useEmotionalReveal.ts
// LAYER 1: Sport-agnostic reveal sequence with conditional drama
//
// REVEAL SEQUENCE:
// 1. Card flips face-up (fast or slow based on drama)
// 2. Base FP rolls up on card + total
// 3. If badges exist: each drops in with thud, FP added
// 4. Next card
//
// DRAMA TRIGGERS (slow reveal):
// - Overperformance: actual > projected * 1.30
// - Underperformance: actual < projected * 0.70
// - Has achievements/badges

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================
// TYPES
// ============================================================

export type RevealState = "IDLE" | "REVEALING" | "COMPLETE";

export type CardRevealPhase = 
  | "HIDDEN"         // Face down
  | "FLIPPING"       // Flip animation in progress
  | "SHOWING_FP"     // Base FP visible, rolling up
  | "DROPPING_BADGE" // Badge drop animation
  | "COMPLETE";      // Done

export type Badge = {
  id: string;
  icon: string;
  label: string;
  fp: number;
};

export type RevealableCard = {
  cardId: string;
  actualFp: number;
  projectedFp: number;
  badges: Badge[];
  slotIndex: number;
};

export type DramaReason = "overperform" | "underperform" | "achievement" | null;

export type CardRevealState = {
  cardId: string;
  phase: CardRevealPhase;
  visibleFp: number;
  visibleBadgeCount: number;
  isDramatic: boolean;
  dramaReason: DramaReason;
};

// ============================================================
// TIMING (Layer 1 - same for all sports)
// ============================================================

const TIMING = {
  FLIP_FAST_MS: 250,       // was 300
  FLIP_SLOW_MS: 450,       // was 600  — dramatic still weighty but not sluggish
  FP_ROLL_MS: 200,         // was 250
  BADGE_DROP_MS: 400,      // was 500
  BADGE_PAUSE_MS: 150,     // was 200
  CARD_GAP_FAST_MS: 80,    // was 120  — nearly instant between normal cards
  CARD_GAP_SLOW_MS: 280,   // was 400  — dramatic cards get a breath
  TENSION_PAUSE_MS: 200,   // was 300  — pre-flip suspense, tight
};

// ============================================================
// DRAMA DETECTION
// ============================================================

export function detectDrama(card: RevealableCard): { isDramatic: boolean; reason: DramaReason } {
  const { actualFp, projectedFp, badges } = card;
  
  if (badges && badges.length > 0) {
    return { isDramatic: true, reason: "achievement" };
  }
  
  if (projectedFp > 0) {
    const ratio = actualFp / projectedFp;
    if (ratio > 1.30) return { isDramatic: true, reason: "overperform" };
    if (ratio < 0.70) return { isDramatic: true, reason: "underperform" };
  }
  
  return { isDramatic: false, reason: null };
}

// ============================================================
// HOOK
// ============================================================

export function useEmotionalReveal(params: {
  cards: RevealableCard[];
  isActive: boolean;
  onCardFlipped?: (cardId: string) => void;
  onFpRevealed?: (cardId: string, fp: number) => void;
  onBadgeDropped?: (cardId: string, badge: Badge, newCardFp: number) => void;
  onCardComplete?: (cardId: string, totalCardFp: number) => void;
  onAllComplete?: (totalFp: number) => void;
}) {
  const { cards, isActive, onCardFlipped, onFpRevealed, onBadgeDropped, onCardComplete, onAllComplete } = params;
  
  const [revealState, setRevealState] = useState<RevealState>("IDLE");
  const [currentCardIndex, setCurrentCardIndex] = useState(-1);
  const [cardStates, setCardStates] = useState<Map<string, CardRevealState>>(new Map());
  const [runningTotalFp, setRunningTotalFp] = useState(0);
  
  const timersRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);
  const revealStartedRef = useRef(false);
  
  // --- Helpers ---
  
  const clearTimers = useCallback(() => {
    cancelledRef.current = true;
    timersRef.current.forEach(t => window.clearTimeout(t));
    timersRef.current = [];
  }, []);
  
  const addTimer = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      if (!cancelledRef.current) fn();
    }, ms);
    timersRef.current.push(t);
  }, []);
  
  const updateCard = useCallback((cardId: string, update: Partial<CardRevealState>) => {
    setCardStates(prev => {
      const next = new Map(prev);
      const curr = next.get(cardId);
      if (curr) next.set(cardId, { ...curr, ...update });
      return next;
    });
  }, []);
  
  // --- Reset ---
  
  const reset = useCallback(() => {
    clearTimers();
    cancelledRef.current = false;
    revealStartedRef.current = false;
    setRevealState("IDLE");
    setCurrentCardIndex(-1);
    setRunningTotalFp(0);
    
    const initial = new Map<string, CardRevealState>();
    cards.forEach(c => {
      const drama = detectDrama(c);
      initial.set(c.cardId, {
        cardId: c.cardId,
        phase: "HIDDEN",
        visibleFp: 0,
        visibleBadgeCount: 0,
        isDramatic: drama.isDramatic,
        dramaReason: drama.reason,
      });
    });
    setCardStates(initial);
  }, [cards, clearTimers]);
  
  // --- Skip to End ---
  
  const skipToEnd = useCallback(() => {
    clearTimers();
    cancelledRef.current = false;
    
    const finalStates = new Map<string, CardRevealState>();
    let total = 0;
    
    cards.forEach(c => {
      const badgeFp = c.badges?.reduce((sum, b) => sum + b.fp, 0) || 0;
      const totalCardFp = c.actualFp + badgeFp;
      const drama = detectDrama(c);
      
      finalStates.set(c.cardId, {
        cardId: c.cardId,
        phase: "COMPLETE",
        visibleFp: totalCardFp,
        visibleBadgeCount: c.badges?.length || 0,
        isDramatic: drama.isDramatic,
        dramaReason: drama.reason,
      });
      total += totalCardFp;
    });
    
    setCardStates(finalStates);
    setRunningTotalFp(total);
    setCurrentCardIndex(cards.length);
    setRevealState("COMPLETE");
    onAllComplete?.(total);
  }, [cards, clearTimers, onAllComplete]);
  
  // --- Reveal Single Card ---
  
  const revealCardAt = useCallback((index: number, currentTotal: number) => {
    if (index >= cards.length) {
      setRevealState("COMPLETE");
      onAllComplete?.(currentTotal);
      return;
    }
    
    const card = cards[index];
    const drama = detectDrama(card);
    const badges = card.badges || [];
    
    const flipMs = drama.isDramatic ? TIMING.FLIP_SLOW_MS : TIMING.FLIP_FAST_MS;
    const prePause = drama.isDramatic ? TIMING.TENSION_PAUSE_MS : 0;
    const postGap = drama.isDramatic ? TIMING.CARD_GAP_SLOW_MS : TIMING.CARD_GAP_FAST_MS;
    
    let t = 0;
    let cardFp = 0;
    let total = currentTotal;
    
    // Pre-flip tension
    t += prePause;
    
    // Flip
    addTimer(() => {
      setCurrentCardIndex(index);
      updateCard(card.cardId, { phase: "FLIPPING" });
      onCardFlipped?.(card.cardId);
    }, t);
    t += flipMs;
    
    // Show base FP
    addTimer(() => {
      cardFp = card.actualFp;
      total += card.actualFp;
      updateCard(card.cardId, { phase: "SHOWING_FP", visibleFp: cardFp });
      setRunningTotalFp(total);
      onFpRevealed?.(card.cardId, card.actualFp);
    }, t);
    t += TIMING.FP_ROLL_MS;
    
    // Drop badges
    badges.forEach((badge, i) => {
      addTimer(() => {
        cardFp += badge.fp;
        total += badge.fp;
        updateCard(card.cardId, { 
          phase: "DROPPING_BADGE", 
          visibleFp: cardFp, 
          visibleBadgeCount: i + 1 
        });
        setRunningTotalFp(total);
        onBadgeDropped?.(card.cardId, badge, cardFp);
      }, t);
      t += TIMING.BADGE_DROP_MS + TIMING.BADGE_PAUSE_MS;
    });
    
    // Complete card
    addTimer(() => {
      updateCard(card.cardId, { phase: "COMPLETE" });
      onCardComplete?.(card.cardId, cardFp);
    }, t);
    t += postGap;
    
    // Next card
    addTimer(() => {
      revealCardAt(index + 1, total);
    }, t);
    
  }, [cards, addTimer, updateCard, onCardFlipped, onFpRevealed, onBadgeDropped, onCardComplete, onAllComplete]);
  
  // --- Start on isActive ---
  
  useEffect(() => {
    if (!isActive) {
      reset();
      return;
    }
    
    if (cards.length === 0 || revealStartedRef.current) return;
    
    revealStartedRef.current = true;
    reset();
    cancelledRef.current = false;
    setRevealState("REVEALING");
    
    addTimer(() => {
      revealCardAt(0, 0);
    }, 100);
    
    return () => clearTimers();
  }, [isActive]);
  
  // --- Public API ---
  
  return {
    revealState,
    currentCardIndex,
    runningTotalFp,
    
    getCardState: (id: string) => cardStates.get(id),
    isCardVisible: (id: string) => {
      const s = cardStates.get(id);
      return s ? s.phase !== "HIDDEN" : false;
    },
    isCardFlipping: (id: string) => cardStates.get(id)?.phase === "FLIPPING",
    isCardComplete: (id: string) => cardStates.get(id)?.phase === "COMPLETE",
    getVisibleFp: (id: string) => cardStates.get(id)?.visibleFp || 0,
    getVisibleBadgeCount: (id: string) => cardStates.get(id)?.visibleBadgeCount || 0,
    isDramatic: (id: string) => cardStates.get(id)?.isDramatic || false,
    getDramaReason: (id: string) => cardStates.get(id)?.dramaReason || null,
    
    skipToEnd,
    reset,
  };
}
