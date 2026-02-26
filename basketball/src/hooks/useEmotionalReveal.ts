/**
 * useEmotionalReveal.ts
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

export type ShakeType = "big" | "hype" | "cold" | null;
export type ShakeInfo = { cardId: string; type: ShakeType } | null;

type Params = {
  cards: RevealableCard[];
  isActive: boolean;
  flipState: CardFlipState;
  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
};

const ANCHOR_PRE_FLIP_PAUSE_MS = 200;
const SHAKE_DURATION_MS        = 400;
const ANCHOR_COUNT_MULTIPLIER  = 1.5;
const CAREER_NIGHT_RATIO       = 1.4;
const ICE_COLD_RATIO           = 0.60;

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function flipMsForTier(tier: string, isBig = false): number {
  const base = (() => {
    switch (tier.toUpperCase()) {
      case "ORANGE": return 380;
      case "PURPLE": return 340;
      case "BLUE":   return 300;
      case "GREEN":  return 280;
      default:       return 260;
    }
  })();
  return isBig ? Math.round(base * 1.8) : base;
}
function countMsForTier(tier: string, isAnchor = false): number {
  const base = (() => {
    switch (tier.toUpperCase()) {
      case "ORANGE": return 600;
      case "PURPLE": return 550;
      case "BLUE":   return 500;
      case "GREEN":  return 450;
      default:       return 400;
    }
  })();
  return isAnchor ? Math.round(base * ANCHOR_COUNT_MULTIPLIER) : base;
}
function perfTag(actual: number, proj: number): string {
  if (!proj || proj <= 0) return actual >= 10 ? "HOT" : "OK";
  const r = actual / proj;
  if (r >= 1.35) return "SMASH";
  if (r >= 1.12) return "HOT";
  if (r <= 0.72) return "COLD";
  return "OK";
}
export function getShakeType(card: RevealableCard, isAnchor: boolean): ShakeType {
  const proj   = Number(card.projectedFp ?? 0);
  const actual = Number(card.actualFp ?? 0);
  if (proj <= 0) return isAnchor ? "big" : null;
  const ratio = actual / proj;
  const isCareerNight = ratio >= CAREER_NIGHT_RATIO;
  const isIceCold     = ratio <= ICE_COLD_RATIO;
  if (isAnchor && isCareerNight) return "big";
  if (isCareerNight)             return "hype";
  if (isIceCold)                 return "cold";
  if (isAnchor)                  return "big";
  return null;
}

export function useEmotionalReveal(params: Params) {
  const { cards, isActive, flipState, onCardComplete, onAllComplete } = params;

  const [visibleFpMap, setVisibleFpMap] = useState<Map<string, number>>(new Map());
  const [shakeInfo, setShakeInfo]       = useState<ShakeInfo>(null);
  const [visibleBadgesMap, setVisibleBadgesMap] = useState<Map<string, Array<{id:string;icon:string;label:string;fp:number}>>>(new Map());
  const [activeRevealCardId, setActiveRevealCardId] = useState<string | null>(null);

  const runIdRef  = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    setActiveRevealCardId(null);
    runIdRef.current++;
    clearTimers();
    setVisibleFpMap(new Map());
    setVisibleBadgesMap(new Map());
    setShakeInfo(null);
  }, [clearTimers]);

  const revealOrder = useMemo(() => {
    return [...cards].sort((a, b) => {
      const salDiff = (a.salary ?? 0) - (b.salary ?? 0);
      if (salDiff !== 0) return salDiff;
      return (a.actualFp ?? 0) - (b.actualFp ?? 0);
    });
  }, [cards]);

  // Pre-computed shake types — known before reveal starts, no timing dependency
  const cardShakeTypeMap = useMemo(() => {
    const m = new Map<string, ShakeType>();
    if (!isActive) return m;  // only compute during reveal
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    for (const c of cards) {
      m.set(c.cardId, getShakeType(c, c.cardId === anchorId));
    }
    return m;
  }, [cards, revealOrder, isActive]);

  const getVisibleFp = useCallback((id: string): number | undefined => {
    if (visibleFpMap.has(id)) return visibleFpMap.get(id);
    return undefined;
  }, [visibleFpMap]);

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
      const proj   = Number(c.projectedFp ?? 0);
      const actual = Number(c.actualFp ?? 0);
      m.set(c.cardId, clamp(Math.abs((actual - proj) / Math.max(1, proj)), 0, 1));
    }
    return m;
  }, [cards]);

  const flipMsMap = useMemo(() => {
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    const m = new Map<string, number>();
    for (const c of cards) {
      const isAnchor  = c.cardId === anchorId;
      const st        = getShakeType(c, isAnchor);
      m.set(c.cardId, flipMsForTier(c.tier ?? "", st === "big"));
    }
    return m;
  }, [cards, revealOrder]);

  const fpCountUpMsMap = useMemo(() => {
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    const m = new Map<string, number>();
    for (const c of cards) {
      m.set(c.cardId, countMsForTier(c.tier ?? "", c.cardId === anchorId));
    }
    return m;
  }, [cards, revealOrder]);

  const skipToEnd = useCallback(() => {
    clearTimers();
    runIdRef.current++;
    setShakeInfo(null);
    const nextMap = new Map<string, number>();
    for (const c of cards) {
      nextMap.set(c.cardId, Number(c.actualFp ?? 0));
      flipState.completeReveal(c.cardId);
    }
    setVisibleFpMap(nextMap);
    const badgeMap = new Map<string, Array<{id:string;icon:string;label:string;fp:number}>>();
    for (const c of cards) {
      if (c.badges?.length) badgeMap.set(c.cardId, c.badges);
    }
    setVisibleBadgesMap(badgeMap);
    const total = cards.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
    onAllComplete?.(total);
  }, [cards, flipState, clearTimers, onAllComplete]);

  useEffect(() => {
    if (!isActive) return;
    reset();
    const myRunId  = runIdRef.current;
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;

    flipState.beginReveal();

    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;
      const c = revealOrder[idx];
      if (!c) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        const total = revealOrder.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }
      setActiveRevealCardId(c.cardId);

      const isAnchor  = c.cardId === anchorId;
      const st        = getShakeType(c, isAnchor);
      const flipMs    = flipMsForTier(c.tier ?? "", st === "big");
      const countMs   = countMsForTier(c.tier ?? "", isAnchor);
      const anchorDelay = isAnchor ? ANCHOR_PRE_FLIP_PAUSE_MS : 0;
      const shakePre    = st !== null ? SHAKE_DURATION_MS : 0;
      const totalPre    = shakePre + anchorDelay;

      if (st !== null) setShakeInfo({ cardId: c.cardId, type: st });

      const t0 = window.setTimeout(() => {
        if (runIdRef.current !== myRunId) return;
        flipState.revealCard(c.cardId);

        const t1 = window.setTimeout(() => {
          if (runIdRef.current !== myRunId) return;
          setShakeInfo(null);
          flipState.completeReveal(c.cardId);

          const start  = nowMs();
          const target = Math.max(0, Number(c.actualFp ?? 0));
          const tick = () => {
            if (runIdRef.current !== myRunId) return;
            const elapsed = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
            const eased   = 1 - Math.pow(1 - elapsed, 3);
            const val     = Math.round(target * eased * 10) / 10;
            setVisibleFpMap(prev => new Map(prev).set(c.cardId, val));
            if (elapsed < 1) {
              const tt = window.setTimeout(tick, 16);
              timersRef.current.push(tt);
            } else {
              setVisibleFpMap(prev => new Map(prev).set(c.cardId, target));
              const cardBadges = c.badges ?? [];
              if (cardBadges.length > 0) {
                const badgeBonus = cardBadges.reduce((s: number, b: any) => s + b.fp, 0);
                setVisibleBadgesMap(prev => new Map(prev).set(c.cardId, cardBadges));
                const bt = window.setTimeout(() => {
                  setVisibleFpMap(prev => new Map(prev).set(c.cardId, target + badgeBonus));
                  const nt = window.setTimeout(() => {
                    onCardComplete?.(c.cardId);
                    revealOne(idx + 1);
                  }, 300);
                  timersRef.current.push(nt);
                }, 500);
                timersRef.current.push(bt);
              } else {
                onCardComplete?.(c.cardId);
                revealOne(idx + 1);
              }
            }
          };
          tick();
        }, flipMs);
        timersRef.current.push(t1);
      }, totalPre);
      timersRef.current.push(t0);
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
    shakeInfo,
    cardShakeTypeMap,
    skipToEnd,
    reset,
    visibleBadgesMap,
    activeRevealCardId,
    clearActiveCard: () => setActiveRevealCardId(null),
  };
}

export type { Params as UseEmotionalRevealParams };