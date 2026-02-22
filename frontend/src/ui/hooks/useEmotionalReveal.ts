import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RevealableCard = {
  cardId: string;
  slotIndex: number;
  actualFp: number;
  projectedFp: number;
  tier: any;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
};

type Params = {
  cards: RevealableCard[];
  isActive: boolean;

  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
};

type AnimMaps = {
  flipMsMap: Map<string, number>;
  fpCountUpMsMap: Map<string, number>;
  performanceTagMap: Map<string, string>;
  pulseMap: Map<string, number>;
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function defaultTimingsForTier(tier: any): { flipMs: number; countMs: number } {
  // Keep stable / predictable. Tune later.
  const t = String(tier ?? "").toUpperCase();
  if (t === "ORANGE") return { flipMs: 520, countMs: 900 };
  if (t === "PURPLE") return { flipMs: 480, countMs: 820 };
  if (t === "BLUE") return { flipMs: 440, countMs: 760 };
  if (t === "GREEN") return { flipMs: 400, countMs: 700 };
  return { flipMs: 380, countMs: 660 };
}

function perfTag(actual: number, proj: number) {
  if (!proj || proj <= 0) return actual >= 10 ? "HOT" : "OK";
  const r = actual / proj;
  if (r >= 1.35) return "SMASH";
  if (r >= 1.12) return "HOT";
  if (r <= 0.72) return "COLD";
  return "OK";
}

export function useEmotionalReveal(params: Params) {
  const { cards, isActive, onCardComplete, onAllComplete } = params;

  // Visible FP for each card (during reveal animation)
  const [visibleFpMap, setVisibleFpMap] = useState<Map<string, number>>(() => new Map());

  // Card state
  const [visibleSet, setVisibleSet] = useState<Set<string>>(() => new Set()); // fully revealed (front shown)
  const [flippingSet, setFlippingSet] = useState<Set<string>>(() => new Set()); // currently flipping

  // Timing maps (stable across the run)
  const animMapsRef = useRef<AnimMaps>({
    flipMsMap: new Map(),
    fpCountUpMsMap: new Map(),
    performanceTagMap: new Map(),
    pulseMap: new Map(),
  });

  // Internal run id, to cancel old timers
  const runIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const orderedCards = useMemo(() => {
    // Reveal worst performers first, anchors (highest salary) last
    return [...cards].sort((a, b) => {
      const salA = Number((a as any).salary ?? 0);
      const salB = Number((b as any).salary ?? 0);
      // Primary: salary ascending (cheapest first)
      if (salA !== salB) return salA - salB;
      // Secondary: actual FP ascending (worst first)
      return Number(a.actualFp ?? 0) - Number(b.actualFp ?? 0);
    });
  }, [cards]);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    runIdRef.current++;
    clearTimers();
    setVisibleFpMap(new Map());
    setVisibleSet(new Set());
    setFlippingSet(new Set());
    animMapsRef.current = {
      flipMsMap: new Map(),
      fpCountUpMsMap: new Map(),
      performanceTagMap: new Map(),
      pulseMap: new Map(),
    };
  }, [clearTimers]);

  // Build timing/perf maps any time cards change
  useEffect(() => {
    const flipMsMap = new Map<string, number>();
    const fpCountUpMsMap = new Map<string, number>();
    const performanceTagMap = new Map<string, string>();
    const pulseMap = new Map<string, number>();

    for (const c of orderedCards) {
      const { flipMs, countMs } = defaultTimingsForTier(c.tier);
      flipMsMap.set(c.cardId, flipMs);
      fpCountUpMsMap.set(c.cardId, countMs);
      performanceTagMap.set(c.cardId, perfTag(Number(c.actualFp ?? 0), Number(c.projectedFp ?? 0)));
      // pulse intensity (simple)
      pulseMap.set(c.cardId, clamp(Math.abs((Number(c.actualFp ?? 0) - Number(c.projectedFp ?? 0)) / Math.max(1, Number(c.projectedFp ?? 0))), 0, 1));
    }

    animMapsRef.current = { flipMsMap, fpCountUpMsMap, performanceTagMap, pulseMap };
  }, [orderedCards]);

  const isCardVisible = useCallback((id: string) => visibleSet.has(id), [visibleSet]);
  const isCardFlipping = useCallback((id: string) => flippingSet.has(id), [flippingSet]);

  const getVisibleFp = useCallback(
    (id: string) => {
      // If we have an animated number, return it; otherwise if card is fully visible return final actual.
      if (visibleFpMap.has(id)) return visibleFpMap.get(id);
      const c = orderedCards.find((x) => x.cardId === id);
      if (!c) return undefined;
      if (visibleSet.has(id)) return Number(c.actualFp ?? 0);
      return undefined;
    },
    [visibleFpMap, orderedCards, visibleSet]
  );

  // ✅ runningTotalFp is always sum of visible FP values (ground truth of what UI shows)
  const runningTotalFp = useMemo(() => {
    let sum = 0;
    for (const c of orderedCards) {
      const v = getVisibleFp(c.cardId);
      if (typeof v === "number" && Number.isFinite(v)) sum += v;
    }
    return sum;
  }, [orderedCards, getVisibleFp]);

  const skipToEnd = useCallback(() => {
    const nextVisible = new Set<string>();
    const nextMap = new Map<string, number>();

    for (const c of orderedCards) {
      nextVisible.add(c.cardId);
      nextMap.set(c.cardId, Number(c.actualFp ?? 0));
    }

    setFlippingSet(new Set());
    setVisibleSet(nextVisible);
    setVisibleFpMap(nextMap);

    const total = orderedCards.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
    onAllComplete?.(total);
  }, [orderedCards, onAllComplete]);

  useEffect(() => {
    if (!isActive) return;

    // Start a new run
    reset();
    const myRunId = runIdRef.current;

    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;
      const c = orderedCards[idx];
      if (!c) {
        const total = orderedCards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }

      // Mark flipping
      setFlippingSet((prev) => new Set(prev).add(c.cardId));

      const flipMs = animMapsRef.current.flipMsMap.get(c.cardId) ?? 420;
      const countMs = animMapsRef.current.fpCountUpMsMap.get(c.cardId) ?? 720;

      // After flip, count-up begins
      const t1 = window.setTimeout(() => {
        if (runIdRef.current !== myRunId) return;

        setFlippingSet((prev) => {
          const next = new Set(prev);
          next.delete(c.cardId);
          return next;
        });

        // Count-up animation
        const start = nowMs();
        const target = Math.max(0, Number(c.actualFp ?? 0));

        const tick = () => {
          if (runIdRef.current !== myRunId) return;

          const t = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
          const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
          const val = Math.round(target * eased * 10) / 10; // one decimal if you want

          setVisibleFpMap((prev) => {
            const next = new Map(prev);
            next.set(c.cardId, val);
            return next;
          });

          if (t < 1) {
            const tt = window.setTimeout(tick, 16);
            timersRef.current.push(tt);
          } else {
            // Finalize card as visible
            setVisibleFpMap((prev) => {
              const next = new Map(prev);
              next.set(c.cardId, target);
              return next;
            });
            setVisibleSet((prev) => new Set(prev).add(c.cardId));
            onCardComplete?.(c.cardId);

            // Next card
            revealOne(idx + 1);
          }
        };

        tick();
      }, flipMs);

      timersRef.current.push(t1);
    };

    revealOne(0);

    return () => {
      // If reveal stops, we don't auto-complete; GameView decides.
      // Just cancel timers.
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return {
    runningTotalFp,
    isCardVisible,
    isCardFlipping,
    getVisibleFp,
    flipMsMap: animMapsRef.current.flipMsMap,
    fpCountUpMsMap: animMapsRef.current.fpCountUpMsMap,
    performanceTagMap: animMapsRef.current.performanceTagMap,
    pulseMap: animMapsRef.current.pulseMap,
    skipToEnd,
    reset,
  };
}

export type { Params as UseEmotionalRevealParams };