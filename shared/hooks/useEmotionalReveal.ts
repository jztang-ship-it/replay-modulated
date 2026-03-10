/**
 * shared/hooks/useEmotionalReveal.ts
 *
 * Orchestrates the sequential card reveal sequence. Sport-agnostic.
 *
 * Sport-specific thresholds (what counts as a great/bad performance)
 * are injected via RevealConfig so each sport can tune its own feel:
 *   - careerNightRatio: actual/proj ratio that triggers "big" shake
 *   - hotRatio:         ratio that triggers "hype" shake
 *   - coldRatio:        ratio that triggers "cold" shake
 *
 * The CAREER NIGHT / ICE COLD stamp labels are fixed brand identity
 * (same as the card shell stamps) — the ratios are what differs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardFlipState } from "@shared/hooks/useCardFlipState";

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

export interface RevealConfig {
  /** actual/proj ratio at or above which anchor gets "big", others get "hype" */
  careerNightRatio: number;
  /** actual/proj ratio at or above which non-anchor gets "hype" (if < careerNightRatio) */
  hotRatio: number;
  /** actual/proj ratio at or below which card gets "cold" */
  coldRatio: number;
}

/** Sensible defaults — basketball values */
export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  careerNightRatio: 1.6,
  hotRatio:         1.4,
  coldRatio:        0.75,
};

type Params = {
  cards: RevealableCard[];
  isActive: boolean;
  flipState: CardFlipState;
  revealConfig?: RevealConfig;
  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
};

const ANCHOR_PRE_FLIP_PAUSE_MS = 200;
const SHAKE_DURATION_MS        = 400;
const ANCHOR_COUNT_MULTIPLIER  = 1.5;

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

export function getShakeType(
  card: RevealableCard,
  isAnchor: boolean,
  config: RevealConfig = DEFAULT_REVEAL_CONFIG,
): ShakeType {
  const proj   = Number(card.projectedFp ?? 0);
  const actual = Number(card.actualFp ?? 0);
  if (proj <= 0) return isAnchor ? "big" : null;
  const ratio = actual / proj;
  if (isAnchor && ratio >= config.careerNightRatio) return "big";
  if (ratio >= config.careerNightRatio)             return "hype";
  if (ratio >= config.hotRatio)                     return "hype";
  if (ratio <= config.coldRatio)                    return "cold";
  if (isAnchor)                                     return "big";
  return null;
}

export function useEmotionalReveal(params: Params) {
  const {
    cards, isActive, flipState,
    revealConfig = DEFAULT_REVEAL_CONFIG,
    onCardComplete, onAllComplete,
  } = params;

  const [visibleFpMap,     setVisibleFpMap]     = useState<Map<string, number>>(new Map());
  const [shakeInfo,        setShakeInfo]         = useState<ShakeInfo>(null);
  const [visibleBadgesMap, setVisibleBadgesMap]  = useState<Map<string, Array<{id:string;icon:string;label:string;fp:number}>>>(new Map());
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
    if (!isActive) return m;
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    for (const c of cards) {
      m.set(c.cardId, getShakeType(c, c.cardId === anchorId, revealConfig));
    }
    return m;
  }, [cards, revealOrder, isActive, revealConfig]);

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
      const isAnchor = c.cardId === anchorId;
      const st       = getShakeType(c, isAnchor, revealConfig);
      m.set(c.cardId, flipMsForTier(c.tier ?? "", st === "big"));
    }
    return m;
  }, [cards, revealOrder, revealConfig]);

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

      const isAnchor    = c.cardId === anchorId;
      const st          = getShakeType(c, isAnchor, revealConfig);
      const flipMs      = flipMsForTier(c.tier ?? "", st === "big");
      const countMs     = countMsForTier(c.tier ?? "", isAnchor);
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
                setVisibleBadgesMap(prev => new Map(prev).set(c.cardId, cardBadges));
              }
              const badgeMs  = cardBadges.length > 0 ? 400 + (cardBadges.length - 1) * 120 : 0;
              const stampMs  = st !== null ? 300 : 0;
              const postFpMs = badgeMs + stampMs;
              const doneT = window.setTimeout(() => {
                if (runIdRef.current !== myRunId) return;
                onCardComplete?.(c.cardId);
                revealOne(idx + 1);
              }, postFpMs);
              timersRef.current.push(doneT);
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

  // performanceTagMap — neutral ratio bucket, sport-agnostic labels.
  // Each sport's GameView can use this or ignore it; nothing in shared renders it.
  const performanceTagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) {
      const proj   = Number(c.projectedFp ?? 0);
      const actual = Number(c.actualFp ?? 0);
      if (proj <= 0) { m.set(c.cardId, ""); continue; }
      const r = actual / proj;
      if (r >= revealConfig.careerNightRatio) m.set(c.cardId, "GREAT");
      else if (r >= revealConfig.hotRatio)    m.set(c.cardId, "GOOD");
      else if (r <= revealConfig.coldRatio)   m.set(c.cardId, "COLD");
      else                                    m.set(c.cardId, "");
    }
    return m;
  }, [cards, revealConfig]);

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