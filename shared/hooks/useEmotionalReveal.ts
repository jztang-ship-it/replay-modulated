/**
 * shared/hooks/useEmotionalReveal.ts
 *
 * Orchestrates the sequential card reveal sequence. Sport-agnostic.
 *
 * Reveal order: all non-held (low→high salary), then held (low→high salary),
 * with the highest-salary card (anchor) always last.
 *
 * Per-card stages: glow flash → badges (staggered) → stamp → FP rollup → pause.
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
  wasHeld?: boolean;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
};

export type ShakeType = "legendary" | "big" | "hype" | "cold" | "frozen" | null;
export type ShakeInfo = { cardId: string; type: ShakeType } | null;

export interface RevealConfig {
  smokingHotRatio:  number;
  onFireRatio:      number;
  iceColdRatio:     number;
  freezingRatio:    number;
}

export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  smokingHotRatio:  1.6,
  onFireRatio:      1.4,
  iceColdRatio:     0.80,
  freezingRatio:    0.60,
};

type Params = {
  cards: RevealableCard[];
  isActive: boolean;
  flipState: CardFlipState;
  revealConfig?: RevealConfig;
  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
  revealMode?: "auto" | "tap";
  onBeforeHeldReveal?: (resume: () => void) => void;
};

const FLIP_MS                 = 450;
const BADGE_STAGGER_MS        = 80;
const STAMP_MS                = 300;
const BETWEEN_CARDS_PAUSE_MS  = 300;
const ANCHOR_PRE_FLIP_PAUSE_MS = 0;

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function salaryOf(c: RevealableCard): number {
  return Number(c.salary ?? 0);
}

/** Highest salary last; before that: all non-held (low→high), then held (low→high). */
export function buildRevealOrder(cards: RevealableCard[]): RevealableCard[] {
  if (cards.length === 0) return [];
  let anchor = cards[0];
  for (const c of cards) {
    if (salaryOf(c) > salaryOf(anchor)) anchor = c;
    else if (salaryOf(c) === salaryOf(anchor) && String(c.cardId) > String(anchor.cardId)) anchor = c;
  }
  const anchorId = anchor.cardId;
  const nonHeldNonAnchor = cards
    .filter(c => !c.wasHeld && c.cardId !== anchorId)
    .sort((a, b) => salaryOf(a) - salaryOf(b));
  const heldNonAnchor = cards
    .filter(c => !!c.wasHeld && c.cardId !== anchorId)
    .sort((a, b) => salaryOf(a) - salaryOf(b));
  return [...nonHeldNonAnchor, ...heldNonAnchor, anchor];
}

function buildHeldRevealOrder(heldCards: RevealableCard[], globalAnchorId: string): RevealableCard[] {
  const nonAnchor = heldCards
    .filter(c => c.cardId !== globalAnchorId)
    .sort((a, b) => salaryOf(a) - salaryOf(b));
  const anchor = heldCards.find(c => c.cardId === globalAnchorId);
  return anchor ? [...nonAnchor, anchor] : nonAnchor;
}

function glowFlashDurationMs(st: ShakeType): number {
  if (st === "legendary" || st === "big") return 600;
  if (st === "cold" || st === "frozen") return 200;
  return 300;
}

function fpRollupMs(c: RevealableCard): number {
  return (c.tier ?? "").toUpperCase() === "ORANGE" ? 700 : 400;
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
  if (ratio >= config.smokingHotRatio)  return "legendary";
  if (ratio >= config.onFireRatio)      return "big";
  if (ratio <= config.freezingRatio)    return "frozen";
  if (ratio <= config.iceColdRatio)     return "cold";
  return null;
}

export function useEmotionalReveal(params: Params) {
  const {
    cards, isActive, flipState,
    revealConfig = DEFAULT_REVEAL_CONFIG,
    onCardComplete, onAllComplete,
    revealMode = "auto",
  } = params;

  const [visibleFpMap,     setVisibleFpMap]     = useState<Map<string, number>>(new Map());
  const [lastCardProgress, setLastCardProgress] = useState(0);
  const [lastCardFp, setLastCardFp]             = useState(0);
  const [shakeInfo,        setShakeInfo]         = useState<ShakeInfo>(null);
  const [visibleBadgesMap, setVisibleBadgesMap]  = useState<Map<string, Array<{id:string;icon:string;label:string;fp:number}>>>(new Map());
  const [activeRevealCardId, setActiveRevealCardId] = useState<string | null>(null);
  const [tappedCardIds, setTappedCardIds]       = useState<Set<string>>(new Set());
  const [heldFpVisible, setHeldFpVisible]       = useState(false);
  const [heldRevealedIds, setHeldRevealedIds]   = useState<Set<string>>(new Set());

  const [glowCardId, setGlowCardId]             = useState<string | null>(null);
  const [glowTier, setGlowTier]                 = useState<string>("WHITE");
  const [glowDurationMs, setGlowDurationMs]     = useState(300);
  const [visibleBadgeCountMap, setVisibleBadgeCountMap] = useState<Map<string, number>>(new Map());
  const [stampRevealActiveId, setStampRevealActiveId] = useState<string | null>(null);

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
    setLastCardProgress(0);
    setLastCardFp(0);
    setVisibleBadgesMap(new Map());
    setShakeInfo(null);
    setGlowCardId(null);
    setGlowTier("WHITE");
    setGlowDurationMs(300);
    setVisibleBadgeCountMap(new Map());
    setStampRevealActiveId(null);
  }, [clearTimers]);

  const revealOrder = useMemo(() => {
    const base = revealMode === "tap"
      ? cards.filter(c => !c.wasHeld)
      : cards;
    return buildRevealOrder(base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, revealMode]);

  const anchorCardId = revealOrder[revealOrder.length - 1]?.cardId ?? null;

  const cardShakeTypeMap = useMemo(() => {
    const m = new Map<string, ShakeType>();
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    for (const c of cards) {
      m.set(c.cardId, getShakeType(c, c.cardId === anchorId, revealConfig));
    }
    return m;
  }, [cards, revealOrder, revealConfig]);

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
    const m = new Map<string, number>();
    for (const c of cards) {
      m.set(c.cardId, FLIP_MS);
    }
    return m;
  }, [cards]);

  const fpCountUpMsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) {
      m.set(c.cardId, fpRollupMs(c));
    }
    return m;
  }, [cards]);

  const schedule = useCallback((myRunId: number, delay: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      if (runIdRef.current !== myRunId) return;
      fn();
    }, delay);
    timersRef.current.push(id);
  }, []);

  const skipToEnd = useCallback(() => {
    clearTimers();
    runIdRef.current++;
    const myRunId = runIdRef.current;
    setShakeInfo(null);
    setActiveRevealCardId(null);
    setGlowCardId(null);
    setGlowTier("WHITE");
    setGlowDurationMs(300);
    setStampRevealActiveId(null);
    setVisibleBadgeCountMap(new Map());
    setTappedCardIds(new Set(cards.map(c => c.cardId)));

    const alreadyVisible = new Map<string, number>();
    setVisibleFpMap(prev => {
      const m = new Map<string, number>();
      for (const c of cards) {
        const seen = prev.get(c.cardId) ?? 0;
        m.set(c.cardId, seen);
        alreadyVisible.set(c.cardId, seen);
      }
      return m;
    });

    const badgeMap = new Map<string, Array<{id:string;icon:string;label:string;fp:number}>>();
    for (const c of cards) {
      if (c.badges?.length) badgeMap.set(c.cardId, c.badges);
    }
    setVisibleBadgesMap(badgeMap);

    const targets = new Map<string, number>();
    const total = cards.reduce((s, c) => {
      targets.set(c.cardId, Number(c.actualFp ?? 0));
      return s + Number(c.actualFp ?? 0);
    }, 0);

    const anchorId = anchorCardId;
    if (!anchorId) {
      onAllComplete?.(total);
      return;
    }

    const nonHeldIds = cards.filter(c => !c.wasHeld).map(c => c.cardId);
    for (const id of nonHeldIds) flipState.revealCard(id);

    schedule(myRunId, FLIP_MS, () => {
      if (runIdRef.current !== myRunId) return;
      for (const id of nonHeldIds) flipState.completeReveal(id);

      const nextFp = new Map<string, number>();
      for (const c of cards) {
        if (c.cardId === anchorId) continue;
        nextFp.set(c.cardId, targets.get(c.cardId) ?? 0);
      }
      setVisibleFpMap(prev => {
        const m = new Map(prev);
        for (const [id, v] of nextFp) m.set(id, v);
        return m;
      });

      const heldNonAnchor = cards.filter(c => c.wasHeld && c.cardId !== anchorId);
      if (heldNonAnchor.length === 0) {
        runAnchorSkipSequence(myRunId, anchorId, total);
        return;
      }
      for (const c of heldNonAnchor) flipState.revealCard(c.cardId);
      schedule(myRunId, FLIP_MS, () => {
        if (runIdRef.current !== myRunId) return;
        for (const c of heldNonAnchor) flipState.completeReveal(c.cardId);
        setVisibleFpMap(prev => {
          const m = new Map(prev);
          for (const c of heldNonAnchor) {
            m.set(c.cardId, targets.get(c.cardId) ?? 0);
          }
          return m;
        });
        runAnchorSkipSequence(myRunId, anchorId, total);
      });
    });

    function runAnchorSkipSequence(
      rid: number,
      aid: string,
      tot: number,
    ) {
      const anchorCard = cards.find(c => c.cardId === aid);
      if (!anchorCard) {
        setHeldFpVisible(true);
        onAllComplete?.(tot);
        return;
      }
      const anchorSkipFlip = !anchorCard.wasHeld;
      runCardRevealSequence(anchorCard, true, rid, () => {
        setHeldFpVisible(true);
        onAllComplete?.(tot);
      }, anchorSkipFlip);
    }
  }, [cards, flipState, clearTimers, onAllComplete, anchorCardId, schedule]);

  function runCardRevealSequence(
    c: RevealableCard,
    isAnchor: boolean,
    myRunId: number,
    onDone: () => void,
    skipFlip: boolean,
  ) {
    const st          = getShakeType(c, isAnchor, revealConfig);
    const glowMs      = glowFlashDurationMs(st);
    const countMs     = fpRollupMs(c);
    const badgeList   = c.badges ?? [];
    const nBadges     = badgeList.length;

    setShakeInfo(null);
    setActiveRevealCardId(c.cardId);

    const target = Math.max(0, Number(c.actualFp ?? 0));

    const afterFp = () => {
      setVisibleFpMap(prev => new Map(prev).set(c.cardId, target));
      if (isAnchor) {
        setLastCardProgress(1);
        setLastCardFp(target);
      }
      setVisibleBadgesMap(prev => new Map(prev).set(c.cardId, c.badges ?? []));
      setVisibleBadgeCountMap(prev => {
        const m = new Map(prev);
        m.delete(c.cardId);
        return m;
      });
      onCardComplete?.(c.cardId);
      schedule(myRunId, BETWEEN_CARDS_PAUSE_MS, () => {
        if (runIdRef.current !== myRunId) return;
        onDone();
      });
    };

    const startFpRollup = () => {
      const start = nowMs();
      const tick = () => {
        if (runIdRef.current !== myRunId) return;
        const elapsed = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
        const eased   = 1 - Math.pow(1 - elapsed, 3);
        const val     = Math.round(target * eased * 10) / 10;
        setVisibleFpMap(prev => new Map(prev).set(c.cardId, val));
        if (isAnchor) {
          setLastCardProgress(elapsed);
          setLastCardFp(target);
        }
        if (elapsed < 1) {
          schedule(myRunId, 16, tick);
        } else {
          setVisibleFpMap(prev => new Map(prev).set(c.cardId, target));
          afterFp();
        }
      };
      tick();
    };

    const doStampOrFp = () => {
      if (st === null) {
        startFpRollup();
        return;
      }
      setStampRevealActiveId(c.cardId);
      schedule(myRunId, STAMP_MS, () => {
        if (runIdRef.current !== myRunId) return;
        setStampRevealActiveId(null);
        startFpRollup();
      });
    };

    const doBadges = () => {
      if (nBadges === 0) {
        doStampOrFp();
        return;
      }
      let idx = 0;
      const step = () => {
        if (runIdRef.current !== myRunId) return;
        idx++;
        setVisibleBadgeCountMap(prev => new Map(prev).set(c.cardId, idx));
        if (idx < nBadges) {
          schedule(myRunId, BADGE_STAGGER_MS, step);
        } else {
          doStampOrFp();
        }
      };
      schedule(myRunId, 0, step);
    };

    const doGlow = () => {
      setGlowDurationMs(glowMs);
      setGlowCardId(c.cardId);
      setGlowTier((c.tier ?? "WHITE").toUpperCase());
      schedule(myRunId, glowMs, () => {
        if (runIdRef.current !== myRunId) return;
        setGlowCardId(null);
        setGlowTier("WHITE");
        setGlowDurationMs(300);
        doBadges();
      });
    };

    const afterFlip = () => {
      const pre = isAnchor ? ANCHOR_PRE_FLIP_PAUSE_MS : 0;
      schedule(myRunId, pre, doGlow);
    };

    if (!skipFlip) {
      flipState.revealCard(c.cardId);
      schedule(myRunId, FLIP_MS, () => {
        if (runIdRef.current !== myRunId) return;
        flipState.completeReveal(c.cardId);
        afterFlip();
      });
    } else {
      afterFlip();
    }
  }

  // ── AUTO mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || revealMode !== "auto") return;
    reset();
    setTappedCardIds(new Set());
    setHeldFpVisible(false);
    setHeldRevealedIds(new Set());
    const myRunId  = runIdRef.current;
    const anchorId = revealOrder[revealOrder.length - 1]?.cardId;
    flipState.beginReveal();

    const nonHeldIds = cards.filter(c => !c.wasHeld).map(c => c.cardId);
    for (const id of nonHeldIds) flipState.revealCard(id);

    schedule(myRunId, FLIP_MS, () => {
      if (runIdRef.current !== myRunId) return;
      for (const id of nonHeldIds) flipState.completeReveal(id);

      const revealOne = (idx: number) => {
        if (runIdRef.current !== myRunId) return;
        const card = revealOrder[idx];
        if (!card) {
          setActiveRevealCardId(null);
          setShakeInfo(null);
          setGlowCardId(null);
          setGlowDurationMs(300);
          const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
          onAllComplete?.(total);
          return;
        }
        const isAnchor = card.cardId === anchorId;
        const skipFlip = !card.wasHeld;
        runCardRevealSequence(card, isAnchor, myRunId, () => revealOne(idx + 1), skipFlip);
      };
      revealOne(0);
    });
    return () => { clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode]);

  // ── TAP mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || revealMode !== "tap") return;
    reset();
    setTappedCardIds(new Set());
    setHeldFpVisible(false);
    setHeldRevealedIds(new Set());
    flipState.beginReveal();

    const myRunId = runIdRef.current;
    if (revealOrder.length === 0) {
      revealHeldCards(myRunId);
    }

    return () => { clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode]);

  function revealHeldCards(myRunId: number) {
    const PRE_PAUSE_MS = 800;
    const globalAnchorId = anchorCardId;
    if (!globalAnchorId) {
      const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
      onAllComplete?.(total);
      return;
    }

    const heldCards = cards.filter(x => !!x.wasHeld);
    const heldOrder = buildHeldRevealOrder(heldCards, globalAnchorId);

    if (heldOrder.length === 0) {
      const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
      onAllComplete?.(total);
      return;
    }

    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;
      const hc = heldOrder[idx];
      if (!hc) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        setGlowCardId(null);
        setGlowDurationMs(300);
        setHeldFpVisible(true);
        const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }
      setHeldRevealedIds(prev => new Set(prev).add(hc.cardId));
      const isAnchor = hc.cardId === globalAnchorId;
      runCardRevealSequence(hc, isAnchor, myRunId, () => {
        onCardComplete?.(hc.cardId);
        revealOne(idx + 1);
      }, true);
    };

    schedule(myRunId, PRE_PAUSE_MS, () => {
      if (runIdRef.current !== myRunId) return;
      revealOne(0);
    });
  }

  const tapRevealCard = useCallback((cardId: string) => {
    if (!isActive || revealMode !== "tap") return;
    if (tappedCardIds.has(cardId)) return;

    const myRunId  = runIdRef.current;
    const unheldCards = revealOrder;
    const anchorId = unheldCards[unheldCards.length - 1]?.cardId;
    const c = unheldCards.find(x => x.cardId === cardId);
    if (!c) return;

    const newTapped = new Set(tappedCardIds).add(cardId);
    setTappedCardIds(newTapped);
    const isLast = newTapped.size === unheldCards.length;

    runCardRevealSequence(c, c.cardId === anchorId, myRunId, () => {
      if (isLast) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        setGlowCardId(null);
        if (params.onBeforeHeldReveal) {
          params.onBeforeHeldReveal(() => revealHeldCards(myRunId));
        } else {
          revealHeldCards(myRunId);
        }
      }
    }, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode, tappedCardIds, revealOrder, cards]);

  const performanceTagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) {
      const proj   = Number(c.projectedFp ?? 0);
      const actual = Number(c.actualFp ?? 0);
      if (proj <= 0) { m.set(c.cardId, ""); continue; }
      const r = actual / proj;
      if (r >= revealConfig.smokingHotRatio)  m.set(c.cardId, "SMOKING HOT");
      else if (r >= revealConfig.onFireRatio)      m.set(c.cardId, "ON FIRE");
      else if (r <= revealConfig.freezingRatio)    m.set(c.cardId, "FREEZING");
      else if (r <= revealConfig.iceColdRatio)     m.set(c.cardId, "ICE COLD");
      else                                         m.set(c.cardId, "");
    }
    return m;
  }, [cards, revealConfig]);

  return {
    runningTotalFp,
    lastCardProgress,
    lastCardFp,
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
    tapRevealCard,
    heldFpVisible,
    heldRevealedIds,
    tappedCardIds,
    anchorCardId,
    glowCardId,
    glowTier,
    glowDurationMs,
    visibleBadgeCountMap,
    stampRevealActiveId,
  };
}

export type { Params as UseEmotionalRevealParams };
