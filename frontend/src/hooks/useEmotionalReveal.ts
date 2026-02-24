/**
 * useEmotionalReveal.ts
 *
 * Drives the card reveal sequence:
 * - Worst performers first, highest salary (anchor) last
 * - Per-card flip timing based on tier
 * - FP count-up animation after each flip
 * - Calls useCardFlipState actions to drive flip animations
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardFlipState } from "./useCardFlipState";

export type RevealableCard = {
  cardId: string;
  slotIndex: number;
  actualFp: number;
  projectedFp: number;
  salary: number;
  tier: string;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
};

type Params = {
  cards: RevealableCard[];
  isActive: boolean;
  flipState: CardFlipState;
  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function flipMsForTier(tier: string): number {
  switch (tier.toUpperCase()) {
    case "ORANGE": return 520;
    case "PURPLE": return 480;
    case "BLUE":   return 440;
    case "GREEN":  return 400;
    default:       return 380;
  }
}

function countMsForTier(tier: string): number {
  switch (tier.toUpperCase()) {
    case "ORANGE": return 900;
    case "PURPLE": return 820;
    case "BLUE":   return 760;
    case "GREEN":  return 700;
    default:       return 660;
  }
}

function perfTag(actual: number, proj: number): string {
  if (!proj || proj <= 0) return actual >= 10 ? "HOT" : "OK";
  const r = actual / proj;
  if (r >= 1.35) return "SMASH";
  if (r >= 1.12) return "HOT";
  if (r <= 0.72) return "COLD";
  return "OK";
}

export function useEmotionalReveal(params: Params) {
  const { cards, isActive, flipState, onCardComplete, onAllComplete } = params;

  const [visibleFpMap, setVisibleFpMap] = useState<Map<string, number>>(new Map());

  const runIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    runIdRef.current++;
    clearTimers();
    setVisibleFpMap(new Map());
  }, [clearTimers]);

  /**
   * Reveal order: cheapest salary first, highest salary (anchor) last.
   * Ties broken by worst actual FP first.
   */
  const revealOrder = useMemo(() => {
    return [...cards].sort((a, b) => {
      const salDiff = (a.salary ?? 0) - (b.salary ?? 0);
      if (salDiff !== 0) return salDiff;
      return (a.actualFp ?? 0) - (b.actualFp ?? 0);
    });
  }, [cards]);

  const getVisibleFp = useCallback((id: string): number | undefined => {
    if (visibleFpMap.has(id)) return visibleFpMap.get(id);
    const c = cards.find(x => x.cardId === id);
    if (!c) return undefined;
    if (flipState.isFront(id)) return Number(c.actualFp ?? 0);
    return undefined;
  }, [visibleFpMap, cards, flipState]);

  const runningTotalFp = useMemo(() => {
    let sum = 0;
    for (const c of cards) {
      const v = getVisibleFp(c.cardId);
      if (typeof v === "number" && Number.isFinite(v)) sum += v;
    }
    return sum;
  }, [cards, getVisibleFp]);

  const performanceTagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) {
      m.set(c.cardId, perfTag(Number(c.actualFp ?? 0), Number(c.projectedFp ?? 0)));
    }
    return m;
  }, [cards]);

  const pulseMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) {
      const proj = Number(c.projectedFp ?? 0);
      const actual = Number(c.actualFp ?? 0);
      m.set(c.cardId, clamp(Math.abs((actual - proj) / Math.max(1, proj)), 0, 1));
    }
    return m;
  }, [cards]);

  const flipMsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.cardId, flipMsForTier(c.tier ?? ""));
    return m;
  }, [cards]);

  const fpCountUpMsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.cardId, countMsForTier(c.tier ?? ""));
    return m;
  }, [cards]);

  const skipToEnd = useCallback(() => {
    clearTimers();
    runIdRef.current++;

    const nextMap = new Map<string, number>();
    for (const c of cards) {
      nextMap.set(c.cardId, Number(c.actualFp ?? 0));
      flipState.completeReveal(c.cardId);
    }
    setVisibleFpMap(nextMap);

    const total = cards.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
    onAllComplete?.(total);
  }, [cards, flipState, clearTimers, onAllComplete]);

  useEffect(() => {
    if (!isActive) return;

    reset();
    const myRunId = runIdRef.current;

    flipState.beginReveal();

    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;

      const c = revealOrder[idx];
      if (!c) {
        const total = revealOrder.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }

      const flipMs = flipMsForTier(c.tier ?? "");
      const countMs = countMsForTier(c.tier ?? "");

      // Start flip animation
      flipState.revealCard(c.cardId);

      // After flip completes, mark front and start count-up
      const t1 = window.setTimeout(() => {
        if (runIdRef.current !== myRunId) return;

        flipState.completeReveal(c.cardId);

        const start = nowMs();
        const target = Math.max(0, Number(c.actualFp ?? 0));

        const tick = () => {
          if (runIdRef.current !== myRunId) return;

          const elapsed = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
          const eased = 1 - Math.pow(1 - elapsed, 3); // easeOutCubic
          const val = Math.round(target * eased * 10) / 10;

          setVisibleFpMap(prev => new Map(prev).set(c.cardId, val));

          if (elapsed < 1) {
            const tt = window.setTimeout(tick, 16);
            timersRef.current.push(tt);
          } else {
            setVisibleFpMap(prev => new Map(prev).set(c.cardId, target));
            onCardComplete?.(c.cardId);
            revealOne(idx + 1);
          }
        };

        tick();
      }, flipMs);

      timersRef.current.push(t1);
    };

    revealOne(0);

    return () => { clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return {
    runningTotalFp,
    getVisibleFp,
    flipMsMap,
    fpCountUpMsMap,
    performanceTagMap,
    pulseMap,
    skipToEnd,
    reset,
  };
}

export type { Params as UseEmotionalRevealParams };
