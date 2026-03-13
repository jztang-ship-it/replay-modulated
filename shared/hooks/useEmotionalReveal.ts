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

export type ShakeType = "legendary" | "big" | "hype" | "cold" | "frozen" | null;
export type ShakeInfo = { cardId: string; type: ShakeType } | null;

export interface RevealConfig {
  legendaryRatio:   number;  /** ≥ this → LEGENDARY stamp */
  careerNightRatio: number;  /** ≥ this → CAREER NIGHT stamp */
  hotRatio:         number;  /** ≥ this → ON FIRE stamp */
  coldRatio:        number;  /** ≤ this → BRICK CITY stamp */
  frozenRatio:      number;  /** ≤ this → ICE COLD stamp */
}

/** Sensible defaults — basketball values */
export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  legendaryRatio:   1.6,
  careerNightRatio: 1.4,
  hotRatio:         1.2,
  coldRatio:        0.60,
  frozenRatio:      0.40,
};

type Params = {
  cards: RevealableCard[];
  isActive: boolean;
  flipState: CardFlipState;
  revealConfig?: RevealConfig;
  onCardComplete?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
  /** "auto" = sequential auto-reveal (default). "tap" = user taps each card. */
  revealMode?: "auto" | "tap";
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
  if (ratio >= config.legendaryRatio)   return "legendary";   // LEGENDARY   >=1.6x
  if (ratio >= config.careerNightRatio) return "big";         // CAREER NIGHT >=1.4x
  if (ratio >= config.hotRatio)         return "hype";        // ON FIRE      >=1.2x
  if (ratio <= config.frozenRatio)      return "frozen";      // ICE COLD     <0.4x
  if (ratio <= config.coldRatio)        return "cold";        // BRICK CITY   <0.6x
  if (isAnchor)                         return "big";
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
  // 0→1 progress of the last card's FP rollup — used to drive gauge overshoot in sync
  const [lastCardProgress, setLastCardProgress] = useState(0);
  // Actual FP of the last card — so gauge knows how big the overshoot should be
  const [lastCardFp, setLastCardFp]             = useState(0);
  const [shakeInfo,        setShakeInfo]         = useState<ShakeInfo>(null);
  const [visibleBadgesMap, setVisibleBadgesMap]  = useState<Map<string, Array<{id:string;icon:string;label:string;fp:number}>>>(new Map());
  const [activeRevealCardId, setActiveRevealCardId] = useState<string | null>(null);
  // tap mode: tracks which unheld cards the user has tapped
  const [tappedCardIds, setTappedCardIds]       = useState<Set<string>>(new Set());
  // tap mode: true after all held cards revealed (used to gate onAllComplete)
  const [heldFpVisible, setHeldFpVisible]       = useState(false);
  // tap mode: set of held card IDs whose FP has been revealed (per-card sequential)
  const [heldRevealedIds, setHeldRevealedIds]   = useState<Set<string>>(new Set());
  // tap mode: ref to the revealOne function so tapRevealCard can call it
  const tapRevealFnRef = useRef<((cardId: string) => void) | null>(null);

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
  }, [clearTimers]);

  const revealOrder = useMemo(() => {
    // Tap mode: only reveal unheld cards; held cards show FP separately.
    // Auto mode: also filters wasHeld since the auto effect guards it inline.
    const base = revealMode === "tap"
      ? cards.filter(c => !(c as any).wasHeld)
      : cards;
    return [...base].sort((a, b) => {
      const salDiff = (a.salary ?? 0) - (b.salary ?? 0);
      if (salDiff !== 0) return salDiff;
      return (a.actualFp ?? 0) - (b.actualFp ?? 0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, revealMode]);

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

  // ── Core reveal function — runs one card through flip + FP rollup ──────────
  // Shared by both auto and tap modes.
  function runCardReveal(
    c: RevealableCard,
    isAnchor: boolean,
    myRunId: number,
    onDone: () => void,
    skipFlip = false   // held cards are already FRONT — skip the 3D flip
  ) {
    const st          = getShakeType(c, isAnchor, revealConfig);
    const flipMs      = skipFlip ? 0 : flipMsForTier(c.tier ?? "", st === "big");
    const countMs     = countMsForTier(c.tier ?? "", isAnchor);
    const anchorDelay = isAnchor ? ANCHOR_PRE_FLIP_PAUSE_MS : 0;
    const shakePre    = st !== null ? SHAKE_DURATION_MS : 0;
    const totalPre    = skipFlip ? 0 : (shakePre + anchorDelay);

    if (st !== null) setShakeInfo({ cardId: c.cardId, type: st });
    setActiveRevealCardId(c.cardId);

    const t0 = window.setTimeout(() => {
      if (runIdRef.current !== myRunId) return;
      if (!skipFlip) flipState.revealCard(c.cardId);

      const t1 = window.setTimeout(() => {
        if (runIdRef.current !== myRunId) return;
        setShakeInfo(null);
        if (!skipFlip) flipState.completeReveal(c.cardId);

        const start  = nowMs();
        const target = Math.max(0, Number(c.actualFp ?? 0));
        if (isAnchor) setLastCardFp(target);
        const tick = () => {
          if (runIdRef.current !== myRunId) return;
          const elapsed = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
          const eased   = 1 - Math.pow(1 - elapsed, 3);
          const val     = Math.round(target * eased * 10) / 10;
          setVisibleFpMap(prev => new Map(prev).set(c.cardId, val));
          if (isAnchor) setLastCardProgress(elapsed);
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
            const doneT = window.setTimeout(() => {
              if (runIdRef.current !== myRunId) return;
              onCardComplete?.(c.cardId);
              onDone();
            }, badgeMs + stampMs);
            timersRef.current.push(doneT);
          }
        };
        tick();
      }, flipMs);
      timersRef.current.push(t1);
    }, totalPre);
    timersRef.current.push(t0);
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
      runCardReveal(c, c.cardId === anchorId, myRunId, () => revealOne(idx + 1));
    };

    revealOne(0);
    return () => { clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode]);

  // ── TAP mode ──────────────────────────────────────────────────────────────
  // On activation: just wait. Cards sit face-down. User taps each unheld card.
  // Edge case: if ALL cards are held, skip tap phase and reveal held cards directly.
  useEffect(() => {
    if (!isActive || revealMode !== "tap") return;
    reset();
    setTappedCardIds(new Set());
    setHeldFpVisible(false);
    setHeldRevealedIds(new Set());
    flipState.beginReveal();

    // All-held edge case: no unheld cards to tap, reveal immediately
    const myRunId = runIdRef.current;
    if (revealOrder.length === 0) {
      revealHeldCards(myRunId);
    }

    return () => { clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode]);

  // ── revealHeldCards: sequential FP reveal for held cards ─────────────────
  // Reveals held cards one by one lowest→highest salary via runCardReveal,
  // so the last (highest) card drives the tier gauge exactly like auto mode.
  function revealHeldCards(myRunId: number) {
    const PRE_PAUSE_MS = 800; // suspense pause before first held card

    const heldCards = [...cards.filter(x => (x as any).wasHeld)]
      .sort((a, b) => (Number(a.salary ?? 0)) - (Number(b.salary ?? 0)));

    if (heldCards.length === 0) {
      const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
      onAllComplete?.(total);
      return;
    }

    // Last held card = anchor: gets 1.5x count time and drives the gauge
    const anchorId = heldCards[heldCards.length - 1].cardId;

    // Chain reveals sequentially: each card calls revealOne(i+1) when done
    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;
      const hc = heldCards[idx];
      if (!hc) {
        // All done
        setActiveRevealCardId(null);
        setShakeInfo(null);
        setHeldFpVisible(true);
        const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }
      // Mark this card as revealed (shows FP strip)
      setHeldRevealedIds(prev => new Set(prev).add(hc.cardId));
      // Run the full flip+rollup reveal for this held card
      runCardReveal(hc, hc.cardId === anchorId, myRunId, () => revealOne(idx + 1), true);
    };

    // Pre-pause before first held card
    window.setTimeout(() => {
      if (runIdRef.current !== myRunId) return;
      revealOne(0);
    }, PRE_PAUSE_MS);
  }

  // tapRevealCard: called when user taps an unheld card in tap mode.
  // Only acts if card hasn't been tapped yet and reveal is active.
  const tapRevealCard = useCallback((cardId: string) => {
    if (!isActive || revealMode !== "tap") return;
    if (tappedCardIds.has(cardId)) return;

    const myRunId  = runIdRef.current;
    const unheldCards = revealOrder; // revealOrder only contains unheld cards
    const anchorId = unheldCards[unheldCards.length - 1]?.cardId;
    const c = unheldCards.find(x => x.cardId === cardId);
    if (!c) return;

    const newTapped = new Set(tappedCardIds).add(cardId);
    setTappedCardIds(newTapped);
    const isLast = newTapped.size === unheldCards.length;

    runCardReveal(c, c.cardId === anchorId, myRunId, () => {
      if (isLast) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        revealHeldCards(myRunId);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode, tappedCardIds, revealOrder, cards]);

  // performanceTagMap — neutral ratio bucket, sport-agnostic labels.
  // Each sport's GameView can use this or ignore it; nothing in shared renders it.
  const performanceTagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) {
      const proj   = Number(c.projectedFp ?? 0);
      const actual = Number(c.actualFp ?? 0);
      if (proj <= 0) { m.set(c.cardId, ""); continue; }
      const r = actual / proj;
      if (r >= revealConfig.legendaryRatio)   m.set(c.cardId, "LEGENDARY");
      else if (r >= revealConfig.careerNightRatio) m.set(c.cardId, "GREAT");
      else if (r <= revealConfig.frozenRatio)      m.set(c.cardId, "FROZEN");
      else if (r <= revealConfig.coldRatio)        m.set(c.cardId, "COLD");
      else                                    m.set(c.cardId, "");
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
    // tap mode
    tapRevealCard,
    heldFpVisible,
    heldRevealedIds,
    tappedCardIds,
  };
}

export type { Params as UseEmotionalRevealParams };