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
import { soundManager } from "@shared/utils/soundManager";

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
  smokingHotRatio:  number;  /** ≥ this → SMOKING HOT stamp */
  onFireRatio:      number;  /** ≥ this → ON FIRE stamp */
  iceColdRatio:     number;  /** ≤ this → ICE COLD stamp */
  freezingRatio:    number;  /** ≤ this → FREEZING stamp */
}

/** Sensible defaults — basketball values */
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
  onCardRevealStart?: (cardId: string, tier: string, shakeType: ShakeType) => void;
  /** Fires the instant a card's FP rollup RAF starts — use to drive side animations (e.g. budget counter) synced with FP roll-up. */
  onCardFpStart?: (cardId: string) => void;
  onAllComplete?: (totalFp: number) => void;
  /** Fires the instant the anchor card's FP count-up RAF finishes — before badge/stamp delay.
   *  Use this to start spring oscillation seamlessly as a continuation of the roll-up. */
  onAnchorFpComplete?: (totalFp: number) => void;
  /** "auto" = sequential auto-reveal (default). "tap" = user taps each card. */
  revealMode?: "auto" | "tap";
  /**
   * FTUE gate: called after last unheld card completes. Call the provided
   * resume() callback when ready to start the held-card (anchor) reveal.
   * If not provided, held reveal starts immediately.
   */
  onBeforeHeldReveal?: (resume: () => void) => void;
  /**
   * FP that's "already locked in" at REVEAL start (held cards' actualFp,
   * minus the held anchor — its FP is the spring's payload). The gauge
   * baseline starts here instead of 0 so the bar doesn't rebound to 0
   * when the user has held cards. Default 0 = legacy behavior.
   * Held cards' visibleFp still animates on the card face for the
   * roll-up effect, but those entries are excluded from runningTotalFp
   * (the bar) since they're already accounted for in seedFp.
   */
  seedFp?: number;
};

const ANCHOR_PRE_FLIP_PAUSE_MS = 200;
/** Dwell after HOLD→DRAWING before kicking off the redraw network call.
 *  Long enough to register as a deliberate shuffle beat, short enough not to lull. */
export const DRAWING_DWELL_MS = 450;
// Shake pre-duration varies by result intensity
const SHAKE_DURATION_MS_DEFAULT   = 400;
const SHAKE_DURATION_MS_BIG       = 550;  // ON FIRE
const SHAKE_DURATION_MS_LEGENDARY = 700;  // SMOKING HOT — maximum buildup
const ANCHOR_COUNT_MULTIPLIER  = 1.5;
// ── Skip-mode timing constants ─────────────────────────────────────────────
const SKIP_GLOW_HIGH_TIER_MS   = null;   // null = use full normal duration
const SKIP_BADGE_INTERVAL_MS   = 30;     // vs 80ms normal
const SKIP_COUNT_MS            = 300;    // fast but visibly animating on mobile (150 was too quick)
const SKIP_INTER_CARD_PAUSE_MS = 100;    // vs 300ms normal

// ── Blast (glow) duration by tier + result ────────────────────────────────
function glowMsForReveal(tier: string, st: ShakeType, isSkip: boolean): number {
  const t = tier.toUpperCase();
  // Base duration by tier
  const base = t === "RED"    ? 1000  // "bug" tier — maximum suspense
             : t === "ORANGE" ? 900
             : t === "PURPLE" ? 700
             : t === "BLUE"   ? 400
             : t === "GREEN"  ? 350
             :                  250;  // WHITE
  // Result modifier: big scores extend suspense, bad scores cut it short
  const modifier = st === "legendary" ?  300   // SMOKING HOT: +300ms
                 : st === "big"       ?  150   // ON FIRE:     +150ms
                 : st === "frozen"    ? -100   // FREEZING:    -100ms (get it over with)
                 : st === "cold"      ?  -50   // ICE COLD:    -50ms
                 :                        0;
  const normal = Math.max(150, base + modifier);
  if (!isSkip) return normal;
  // Skip: compress but preserve relative feel — high tiers still noticeably longer
  return t === "RED"    ? (st === "legendary" ? 550 : 450)
       : t === "ORANGE" ? (st === "legendary" ? 500 : 400)
       : t === "PURPLE" ? (st === "legendary" || st === "big" ? 350 : 300)
       : t === "BLUE"   ? 200
       : t === "GREEN"  ? 175
       :                  125;  // WHITE
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function flipMsForTier(tier: string, isBig = false): number {
  const base = (() => {
    switch (tier.toUpperCase()) {
      case "RED":    return 420;
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
      case "RED":    return 650;
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
  if (ratio >= config.smokingHotRatio)  return "legendary";  // SMOKING HOT  >=1.6x
  if (ratio >= config.onFireRatio)      return "big";        // ON FIRE      >=1.4x
  if (ratio <= config.freezingRatio)    return "frozen";     // FREEZING     <=0.6x
  if (ratio <= config.iceColdRatio)     return "cold";       // ICE COLD     <=0.8x
  // Anchor gets no forced stamp — the card's actual performance determines the stamp
  return null;
}

export function useEmotionalReveal(params: Params) {
  const {
    cards, isActive, flipState,
    revealConfig = DEFAULT_REVEAL_CONFIG,
    onCardComplete, onCardRevealStart, onAllComplete, onAnchorFpComplete, onCardFpStart,
    revealMode = "auto",
    seedFp = 0,
  } = params;

  const [visibleFpMap,     setVisibleFpMap]     = useState<Map<string, number>>(new Map());
  // 0→1 progress of the last card's FP rollup — used to drive gauge overshoot in sync
  const [lastCardProgress, setLastCardProgress] = useState(0);
  // Actual FP of the last card — so gauge knows how big the overshoot should be
  const [lastCardFp, setLastCardFp]             = useState(0);
  const [shakeInfo,        setShakeInfo]         = useState<ShakeInfo>(null);
  const [visibleBadgesMap, setVisibleBadgesMap]  = useState<Map<string, Array<{id:string;icon:string;label:string;fp:number}>>>(new Map());
  const [activeRevealCardId, setActiveRevealCardId] = useState<string | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  // tap mode: tracks which unheld cards the user has tapped
  const [tappedCardIds, setTappedCardIds]       = useState<Set<string>>(new Set());
  // tap mode: true after all held cards revealed (used to gate onAllComplete)
  const [heldFpVisible, setHeldFpVisible]       = useState(false);
  // tap mode: set of held card IDs whose FP has been revealed (per-card sequential)
  const [heldRevealedIds, setHeldRevealedIds]   = useState<Set<string>>(new Set());
  // tap mode: ref to the revealOne function so tapRevealCard can call it
  const tapRevealFnRef = useRef<((cardId: string) => void) | null>(null);

  const runIdRef  = useRef(0);
  const isSkippingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const isTapRevealingRef = useRef(false);   // mutex: one card fully completes before next starts
  const pendingTapQueue   = useRef<string[]>([]); // queued card IDs waiting to reveal
  const tappedCountRef    = useRef(0);            // ref-based count — never stale inside closures

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) {
      window.clearTimeout(t);
      window.cancelAnimationFrame(t);
    }
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    setActiveRevealCardId(null);
    runIdRef.current++;
    isSkippingRef.current = false;
    setIsSkipping(false);
    clearTimers();
    isTapRevealingRef.current = false;
    pendingTapQueue.current = [];
    tappedCountRef.current = 0;
    setVisibleFpMap(new Map());
    setLastCardProgress(0);
    setLastCardFp(0);
    setVisibleBadgesMap(new Map());
    setShakeInfo(null);
    // Held-card reveal state must reset between hands. Without this, heldFpVisible
    // stays true from the previous hand and leaks the next hand's held actualFp
    // through RosterGrid → CardFront during the DRAWING shuffle beat.
    setHeldFpVisible(false);
    setHeldRevealedIds(new Set());
    setTappedCardIds(new Set());
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
  const anchorCardId = revealOrder[revealOrder.length - 1]?.cardId ?? null;

  // Pre-computed shake types — known before reveal starts, no timing dependency
  const cardShakeTypeMap = useMemo(() => {
    const m = new Map<string, ShakeType>();
    // Keep map populated even after reveal completes so stamps stay visible
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
    // seedFp = held cards' FP (minus the held anchor) — already counted at
    // REVEAL start, so the bar baseline doesn't rebound to 0. Held cards'
    // visibleFp entries are excluded from the running sum to avoid
    // double-counting; their card-face roll-up still animates from
    // visibleFpMap directly via getVisibleFp.
    let sum = seedFp;
    for (const c of cards) {
      if ((c as any).wasHeld) continue;
      const v = getVisibleFp(c.cardId);
      if (typeof v === "number" && Number.isFinite(v)) sum += v;
    }
    return sum;
  }, [cards, getVisibleFp, seedFp]);

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
    const myRunId = runIdRef.current;
    isSkippingRef.current = true;
    setIsSkipping(true);

    setShakeInfo(null);
    setActiveRevealCardId(null);
    const alreadyTappedIds = new Set(tappedCardIds);
    setTappedCardIds(new Set(cards.map(c => c.cardId)));
    setVisibleFpMap(new Map());   // clear stale mid-values so every card animates from 0
    isTapRevealingRef.current = false;
    pendingTapQueue.current = [];
    tappedCountRef.current = 0;

    // DO NOT bulk-flip all cards. Each card flips individually in sequence
    // so blast fires during the flip before anything is revealed.
    // Order: non-held lowest→highest salary, then held lowest→highest salary.
    // Anchor (highest salary overall) always goes last at full speed.
    const nonHeld = [...cards.filter(c => !(c as any).wasHeld)]
      .sort((a, b) => (a.salary ?? 0) - (b.salary ?? 0));
    const held = [...cards.filter(c => (c as any).wasHeld)]
      .sort((a, b) => (a.salary ?? 0) - (b.salary ?? 0));

    const allSorted = [...cards].sort((a, b) => (a.salary ?? 0) - (b.salary ?? 0));
    const anchorId = allSorted[allSorted.length - 1]?.cardId;

    const sequence = [...nonHeld, ...held].filter(c => c.cardId !== anchorId);
    const anchor = cards.find(c => c.cardId === anchorId);
    if (anchor) sequence.push(anchor);

    const revealOne = (idx: number) => {
      if (runIdRef.current !== myRunId) return;
      const c = sequence[idx];
      if (!c) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        isSkippingRef.current = false;
        setIsSkipping(false);
        setHeldFpVisible(true);
        const total = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
        onAllComplete?.(total);
        return;
      }
      const isAnchor = c.cardId === anchorId;
      const wasHeld  = !!(c as any).wasHeld;
      // For held cards: mark as revealed NOW so RosterGrid passes visibleFp through
      // to CardFront. Without this, effectiveFp stays undefined and FP never animates.
      if (wasHeld) setHeldRevealedIds(prev => new Set(prev).add(c.cardId));
      // skipFlip=wasHeld: held cards already face-up, skip the 3D flip
      // isSkip=true for ALL cards during skipToEnd so each FP rolls up at the same pace
      runCardReveal(c, isAnchor, myRunId, () => {
        const pause = isAnchor ? 300 : Math.max(SKIP_INTER_CARD_PAUSE_MS, 50);
        const t = window.setTimeout(() => revealOne(idx + 1), pause);
        timersRef.current.push(t);
      }, wasHeld, true /* isSkip */, alreadyTappedIds.has(c.cardId) /* skipBlast */);
    };

    revealOne(0);
  }, [cards, flipState, clearTimers, onAllComplete]);

  // ── Core reveal function — runs one card through flip + FP rollup ──────────
  // Shared by both auto and tap modes.
  function runCardReveal(
    c: RevealableCard,
    isAnchor: boolean,
    myRunId: number,
    onDone: () => void,
    skipFlip = false,   // held cards are already FRONT — skip the 3D flip
    isSkip = false,
    skipBlast = false
  ) {
    console.log("[Reveal] runCardReveal called", c.cardId, c.tier, "myRunId:", myRunId, "currentRunId:", runIdRef.current);
    const st          = getShakeType(c, isAnchor, revealConfig);
    const flipMs = skipFlip ? 0 : flipMsForTier(c.tier ?? "", st === "big");
    const countMs = isSkip
      ? SKIP_COUNT_MS
      : countMsForTier(c.tier ?? "", isAnchor);
    const anchorDelay = isAnchor ? ANCHOR_PRE_FLIP_PAUSE_MS : 0;
    // Shake pre-duration scales with result intensity for more buildup on big cards
    const shakePre = st === "legendary" ? SHAKE_DURATION_MS_LEGENDARY
                   : st === "big"       ? SHAKE_DURATION_MS_BIG
                   : st !== null        ? SHAKE_DURATION_MS_DEFAULT
                   : 0;
    const totalPre    = skipFlip ? 0 : (shakePre + anchorDelay);

    if (st !== null) setShakeInfo({ cardId: c.cardId, type: st });
    setActiveRevealCardId(c.cardId);

    const t0 = window.setTimeout(() => {
      if (runIdRef.current !== myRunId) return;
      console.log("[Reveal] t0 fired ok", c.cardId);
      if (!skipFlip) {
        soundManager.playRevealAmbience(); // starts on first flip, no-ops if already playing
        soundManager.playCardFlip();
        flipState.revealCard(c.cardId);
      }

      // Blast duration: tiered by color + boosted/reduced by result.
      // Passes st so GameView can set the correct CSS animation duration.
      const glowMs = glowMsForReveal(c.tier ?? "WHITE", st, isSkip);
      if (!skipBlast) onCardRevealStart?.(c.cardId, c.tier ?? "WHITE", st);

      const t1 = window.setTimeout(() => {
        if (runIdRef.current !== myRunId) return;
        console.log("[Reveal] t1 fired ok — flip complete, blast clearing", c.cardId, c.tier);
        setShakeInfo(null);
        if (!skipFlip) flipState.completeReveal(c.cardId);

        // FP starts after blast clears but capped — long blasts fade while FP rolls,
        // avoiding excessive delay. 200ms max post-flip wait feels snappy but intentional.
        const postBlastDelay = Math.min(200, Math.max(0, glowMs - flipMs));
        const t2 = window.setTimeout(() => {
          if (runIdRef.current !== myRunId) return;

          // Post-blast celebration shake for SMOKING HOT — fires the moment player is revealed,
          // as FP starts rolling up. Double-impact: suspense before, celebration after.
          if (st === "legendary") {
            setShakeInfo({ cardId: c.cardId, type: "legendary" });
            window.setTimeout(() => {
              if (runIdRef.current !== myRunId) return;
              setShakeInfo(null);
            }, SHAKE_DURATION_MS_DEFAULT);
          }

          const target = Math.max(0, Number(c.actualFp ?? 0));
          if (isAnchor) setLastCardFp(target);

          // Signal CardFront to START its animation by setting a small non-zero value.
          // CardFront's own RAF loop handles all visual interpolation from 0 → target.
          // The hook only needs to signal start, drive the gauge progress, then fire onDone.
          setVisibleFpMap(prev => new Map(prev).set(c.cardId, 0.001));
          onCardFpStart?.(c.cardId);

          const start = nowMs();
          const gaugeTickInterval = 16;
          const driveTick = () => {
            if (runIdRef.current !== myRunId) return;
            const elapsed = clamp((nowMs() - start) / Math.max(1, countMs), 0, 1);
            const eased   = 1 - Math.pow(1 - elapsed, 3);
            if (isAnchor) setLastCardProgress(eased);
            // For anchor card: only animate the CARD face number, NOT the tier bar.
            // The tier bar stays frozen at the 5-card total until onAnchorFpComplete fires.
            setVisibleFpMap(prev => new Map(prev).set(c.cardId, Math.max(0.001, eased * target)));
            if (elapsed < 1) {
              const tt = window.setTimeout(driveTick, gaugeTickInterval);
              timersRef.current.push(tt);
            } else {
              setVisibleFpMap(prev => new Map(prev).set(c.cardId, target));
              if (isAnchor) setLastCardProgress(1);
              // Card 6 number has settled — NOW fire the tier bar spring
              if (isAnchor) {
                const allTotal = cards.reduce((s, x) => s + Number(x.actualFp ?? 0), 0);
                onAnchorFpComplete?.(allTotal);
              }
              const cardBadges = c.badges ?? [];
              if (cardBadges.length > 0) {
                setVisibleBadgesMap(prev => new Map(prev).set(c.cardId, cardBadges));
              }
              const badgeMs = cardBadges.length > 0
                ? (isSkip ? 60 + (cardBadges.length - 1) * SKIP_BADGE_INTERVAL_MS : 400 + (cardBadges.length - 1) * 120)
                : 0;
              const stampMs = st !== null ? (isSkip ? 150 : 300) : 0;
              const doneT = window.setTimeout(() => {
                if (runIdRef.current !== myRunId) return;
                onCardComplete?.(c.cardId);
                onDone();
              }, badgeMs + stampMs);
              timersRef.current.push(doneT);
            }
          };
          driveTick();
        }, postBlastDelay);
        timersRef.current.push(t2);
      }, flipMs);
      timersRef.current.push(t1);
    }, totalPre);
    timersRef.current.push(t0);
  }

  // ── AUTO mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || revealMode !== "auto") return;
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
      runCardReveal(hc, hc.cardId === anchorId, myRunId, () => {
        onCardComplete?.(hc.cardId);
        revealOne(idx + 1);
      }, true, hc.cardId !== anchorId /* isSkip: non-anchor held cards roll up fast */);
    };

    // Pre-pause before first held card
    window.setTimeout(() => {
      if (runIdRef.current !== myRunId) return;
      revealOne(0);
    }, PRE_PAUSE_MS);
  }

  // tapRevealCard: called when user taps an unheld card in tap mode.
  // Uses a queue + mutex so each card fully completes before the next starts,
  // even if user taps multiple cards rapidly.
  const tapRevealCard = useCallback((cardId: string) => {
    if (!isActive || revealMode !== "tap") return;
    if (tappedCardIds.has(cardId)) return;
    if (pendingTapQueue.current.includes(cardId)) return; // already queued

    pendingTapQueue.current.push(cardId);
    processTapQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, revealMode, tappedCardIds, revealOrder, cards]);

  // Internal: drains the tap queue one card at a time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function processTapQueue() {
    if (isTapRevealingRef.current) return; // busy — queue will drain when current card finishes
    if (pendingTapQueue.current.length === 0) return;

    const cardId = pendingTapQueue.current.shift()!;
    // Re-check — might have been tapped by a previous drain
    if (tappedCardIds.has(cardId)) { processTapQueue(); return; }

    const myRunId     = runIdRef.current;
    const unheldCards = revealOrder;
    const anchorId    = unheldCards[unheldCards.length - 1]?.cardId;
    const c           = unheldCards.find(x => x.cardId === cardId);
    if (!c) { processTapQueue(); return; }

    // Use ref-based counter — tappedCardIds is React state and is stale inside this closure
    tappedCountRef.current += 1;
    const isLast = tappedCountRef.current >= unheldCards.length;

    setTappedCardIds(prev => new Set(prev).add(cardId));
    isTapRevealingRef.current = true;

    runCardReveal(c, isLast, myRunId, () => {
      isTapRevealingRef.current = false;
      if (isLast) {
        setActiveRevealCardId(null);
        setShakeInfo(null);
        if (params.onBeforeHeldReveal) {
          params.onBeforeHeldReveal(() => revealHeldCards(myRunId));
        } else {
          revealHeldCards(myRunId);
        }
      } else {
        processTapQueue(); // reveal next queued card
      }
    });
  }

  // performanceTagMap — neutral ratio bucket, sport-agnostic labels.
  // Each sport's GameView can use this or ignore it; nothing in shared renders it.
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
    // tap mode
    tapRevealCard,
    heldFpVisible,
    heldRevealedIds,
    tappedCardIds,
    anchorCardId,
    isSkipping,
    isSkippingRef,

  };
}

export type { Params as UseEmotionalRevealParams };