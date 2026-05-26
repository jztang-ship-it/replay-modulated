/**
 * shared/components/useH2HReveal.ts
 *
 * Phase 3 of the H2H reveal arc — choreography orchestrator. Drives
 * the entrance (poker lay-down) animation, the matchup walk in reveal
 * order, and the end-state settle.
 *
 * Three-stage flow when play() is called:
 *   1. ENTRANCE: all N hand-strip cards lay down. Recipient (bottom)
 *      lands left→right (display pos 0→N-1). Sender (top) lands
 *      right→left (display pos N-1→0). Both sides simultaneous —
 *      stage 0 on each side lands at the same instant. Per-card
 *      ~125ms with ~100ms stagger between stages.
 *   2. ENTRANCE → REVEAL pause: ~400ms breathing room.
 *   3. REVEAL ARC: matchup-by-matchup walk (existing). Per matchup,
 *      both battlefield cards' FP rolls + running totals tick over
 *      MATCHUP_DURATION_MS. Pause MATCHUP_PAUSE_MS between matchups.
 *
 * Reveal order: each player's cards sort independently by
 * (wasHeld ASC, salary ASC). Matchup N pairs senderOrder[N] with
 * recipientOrder[N].
 *
 * Per-matchup FP rollup is owned by CardFront's internal RAF — this
 * hook sets a 0.001 sentinel in `visibleFpMap` to trigger it. Running
 * totals are owned by THIS hook's parallel RAF, configured to the
 * same MATCHUP_DURATION_MS window so the two animations visually sync.
 *
 * Callbacks: `onMatchupResolved` fires after each matchup's rollup
 * completes, BEFORE the inter-matchup pause. `onArcResolved` fires
 * when the final matchup's pause completes.
 *
 * Cancellation: every scheduled timeout + RAF is tracked under a
 * `runId`. cancelAll() bumps the id; in-flight callbacks short-circuit
 * by id check. Survives strict-mode double-invoke and replay racing.
 *
 * NOT reused: shared/hooks/useEmotionalReveal.ts — too tightly coupled
 * to single-player's sequential reveal. See
 * docs/h2h-reveal-arc-design.md for the rationale.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { H2HCard, H2HHand } from "./H2HRevealScreen";

// ─── Timing constants ──────────────────────────────────────────────────────
// All animation durations live here so the arc can be re-paced from one
// place. Defaults are calibrated for the "shared moment" feel — a 6-card
// arc completes in ~17s, which is intentionally longer than a function
// call should feel. See docs/h2h-reveal-arc-design.md "Phase 3.5 — entrance
// + card-pull animations" + the "Phase 3.6 — pacing" section.

/** Per-matchup FP rollup window. Drives both CardFront's internal RAF
 *  (via the renderer passing fpCountUpMs) and this hook's running-total
 *  RAF, so the per-card display and the running total settle at the
 *  same instant. */
export const MATCHUP_DURATION_MS = 1500;

// ── Entrance per-card stage timings ────────────────────────────────────────
// Each entrance card walks through PRE → LAY → BEAT → TRAVEL → SETTLED.
// Cards are dealt SEQUENTIALLY (one pair at a time): card N's lifecycle
// completes before card N+1 starts. Total entrance ≈ N × (lifecycle +
// stagger) ms; for 6 cards ≈ 5.25s. Intentionally slow — the entrance
// should feel like a deliberate dealing motion, not a function call.

/** Card fades in (opacity 0 → 1) at the middle-of-screen position. */
export const CARD_LAY_MS = 200;

/** Beat after lay — card sits visible at the middle, full opacity,
 *  before traveling to its strip slot. Long enough for the user's eye
 *  to register the card. */
export const CARD_LAY_BEAT_MS = 200;

/** Card travels from the middle-of-screen position to its hand-strip
 *  slot (translate + shrink from hero scale to mini scale). */
export const CARD_TRAVEL_MS = 350;

/** Pause after card N's TRAVEL completes (settled in slot) before
 *  card N+1 begins its LAY phase. Yields the staircased dealing feel. */
export const CARD_STAGGER_MS = 150;

/** Convenience: full per-card lifecycle (LAY + BEAT + TRAVEL). */
export const CARD_LIFECYCLE_MS = CARD_LAY_MS + CARD_LAY_BEAT_MS + CARD_TRAVEL_MS;
/** Per-card cycle time including the inter-card stagger pause. */
export const CARD_CYCLE_MS = CARD_LIFECYCLE_MS + CARD_STAGGER_MS;

// ── Pre-reveal anticipation beat ──────────────────────────────────────────
// After the entrance completes (all cards settled in their strips), the
// arc holds for an anticipation moment before the first matchup. The
// beat is three phases: stillness → energy pulse → settle. The pulse
// gives the cards a "charging for battle" effect — each card glows in
// its own tier color, simultaneously across all 12 cards.

/** Silent hold after the last entrance card settles. No animation —
 *  the user registers "wait, something's about to happen." */
export const POST_ENTRANCE_STILLNESS_MS = 700;

/** Energy pulse — all 12 cards' tier-colored glow rises, peaks, fades.
 *  Single pulse (not repeated). */
export const ENERGY_PULSE_MS = 700;

/** Settle after the pulse fades and before matchup 0 starts. */
export const POST_PULSE_SETTLE_MS = 250;

/** Pause between intermediate matchups, after onMatchupResolved fires
 *  and before the next matchup begins. Long enough that the user can
 *  absorb the matchup that just resolved (and that phase-5 commentary
 *  has time to land). */
export const MATCHUP_RESOLVE_PAUSE_MS = 850;

/** Hold after the LAST matchup resolves, before phase transitions to
 *  "done" and onArcResolved fires. The static end-state is visible
 *  throughout; this lets the user absorb the climax before any
 *  next-step UI (replay button, results overlay, etc.) appears. */
export const END_OF_ARC_HOLD_MS = 1700;

/** Battlefield card-pull travel window — used by H2HRevealScreen's
 *  BattlefieldSlot for the in/out keyframe animations. Fits inside
 *  MATCHUP_RESOLVE_PAUSE_MS so both the outgoing and incoming motions
 *  finish before the next matchup begins. */
export const BATTLEFIELD_TRAVEL_DURATION_MS = 420;

/** Sentinel value placed in `visibleFpMap` for a card whose matchup
 *  has started. CardFront treats any non-zero `visibleFp` (when not
 *  already animating + not already rolled) as the trigger to start
 *  its internal RAF rollup — the value itself is ignored
 *  (CardFront reads `actualFp` from the card prop). 0.001 matches
 *  the single-player pattern at useEmotionalReveal.ts:476. */
const VISIBLE_FP_TRIGGER = 0.001;

/** Phase states:
 *   - idle: never played (only briefly during play() transition;
 *     initial mount state is "done").
 *   - entering: cards dealing in sequence (pre→lay→beat→travel→settled).
 *   - anticipating: post-entrance beat. Cards settled in their strips;
 *     the hook sequences POST_ENTRANCE_STILLNESS_MS → ENERGY_PULSE_MS →
 *     POST_PULSE_SETTLE_MS. `pulseActive` toggles true during the
 *     middle window.
 *   - revealing: a matchup is mid-animation (battlefield FP rollup +
 *     running totals ticking).
 *   - paused: between matchups, MATCHUP_RESOLVE_PAUSE_MS hold.
 *   - end-hold: after the last matchup's RAF + onMatchupResolved
 *     fires. Static end-state visible. Replay button / next-step UI
 *     deliberately suppressed during this hold so the user can
 *     absorb the climax.
 *   - done: after END_OF_ARC_HOLD_MS hold. onArcResolved has fired.
 *     Ready for user action. */
export type RevealPhase = "idle" | "entering" | "anticipating" | "revealing" | "paused" | "end-hold" | "done";

/** Per-card entrance stages. Both sides' card at the same stage_index
 *  advance together (paired). The HandStrip side maps display position
 *  to stage_index:
 *   - recipient (bottom): stage_index = displayPos (left → right)
 *   - sender (top): stage_index = (N-1) - displayPos (right → left)
 *  so each side's "card 1" (recipient bottom-left, sender top-right)
 *  shares stage_index 0 and animates simultaneously. */
export type EntranceStage = "pre" | "lay" | "beat" | "travel" | "settled";

export interface Matchup {
  sender: H2HCard;
  recipient: H2HCard;
}

export interface ResolvedMatchupState {
  senderTotal: number;
  recipientTotal: number;
}

export interface UseH2HRevealArgs {
  sender: H2HHand;
  recipient: H2HHand;
  /** When true, the entrance animation is collapsed (all cards
   *  treated as immediately "settled") and matchup 0 fires after a
   *  small fixed delay instead of waiting for the full entrance to
   *  complete. Matches `prefers-reduced-motion: reduce`. Detected by
   *  the H2HRevealScreen and passed through. */
  reducedMotion?: boolean;
  /** Fires after each matchup's FP rollup completes, BEFORE the
   *  inter-matchup pause. `state.senderTotal`/`recipientTotal` reflect
   *  the running totals AFTER this matchup is added. Phase 5 will
   *  wire commentary trigger evaluation here. */
  onMatchupResolved?: (index: number, matchup: Matchup, state: ResolvedMatchupState) => void;
  /** Fires after the last matchup's pause completes. Final totals
   *  equal sender.totalFp / recipient.totalFp. Phase 5 fires the
   *  end-of-arc summary commentary here; phase 6 transitions to the
   *  results overlay. */
  onArcResolved?: (state: ResolvedMatchupState) => void;
}

export interface UseH2HRevealReturn {
  phase: RevealPhase;
  /** Index into the reveal-order matchup array. -1 when idle/entering. */
  matchupIndex: number;
  /** Total matchups (= min(sender.cards.length, recipient.cards.length)). */
  matchupCount: number;
  /** Per-card entrance stage, indexed by stage_index (paired across
   *  both sides — see EntranceStage docs). Length = matchupCount.
   *  Initial state: all "settled" (so the static end-state renders
   *  without any entrance animation). play() flips them to "pre",
   *  then steps each through lay → beat → travel → settled with
   *  CARD_STAGGER_MS between cards. */
  entranceStages: EntranceStage[];
  /** Convenience: count of cards in "settled" state. The dev controls
   *  use this to show "N/M dealt" progress during the entering phase.
   *  When entranceStages is all "settled" (initial state, end-state,
   *  reducedMotion), this equals matchupCount. */
  entranceSettledCount: number;
  /** True during the ENERGY_PULSE_MS window of the anticipating phase.
   *  All 12 hand-strip cells apply a tier-colored glow pulse during
   *  this window. Otherwise false. Cells observe this and gate their
   *  pulse keyframe animation on it. */
  pulseActive: boolean;
  /** Per-cardId trigger map. Cards whose matchup has started have an
   *  entry set to the sentinel (0.001); CardFront sees the transition
   *  from undefined→non-zero and runs its rollup. Cards not yet
   *  animated have no entry; CardFront sees `visibleFp === undefined`
   *  and (with `phase=RESULTS`) renders `actualFp` directly. */
  visibleFpMap: Map<string, number>;
  /** Animated sender running total — feeds TeamScore's displayTotal. */
  senderRunningTotal: number;
  recipientRunningTotal: number;
  /** The active matchup pair (or the final matchup when phase==="done").
   *  Returns {null, null} during idle/entering — battlefield empty
   *  during entrance. */
  activeMatchup: { sender: H2HCard | null; recipient: H2HCard | null };
  /** Reveal-order arrays — exposed so callers can render hand strips
   *  in the order cards will reveal (cheapest swap → most expensive
   *  held), not in deal order. */
  senderRevealOrder: H2HCard[];
  recipientRevealOrder: H2HCard[];
  /** Start the full sequence (entrance → reveal arc → done). Cancels
   *  any in-flight animation. Replay works by calling play() again
   *  from any state. */
  play: () => void;
  /** Skip directly to the end-state. Cancels in-flight RAFs/timers,
   *  collapses entrance to fully-landed, totals to final values. */
  skipToEnd: () => void;
}

/** Reveal-order sort: swap cards first (cheapest → most expensive),
 *  then held cards (cheapest → most expensive). Per the design doc's
 *  "Reveal sequence" section. The H2H component re-sorts independently
 *  rather than trusting `slotIndex`, so phase 4's real data (where
 *  slotIndex may be deal-order, not reveal-order) works correctly. */
export function buildRevealOrder(cards: H2HCard[]): H2HCard[] {
  return [...cards].sort((a, b) => {
    if (a.wasHeld !== b.wasHeld) return a.wasHeld ? 1 : -1;
    return a.salary - b.salary;
  });
}

/** Build the matchup pair array by zipping reveal-orders. */
export function buildMatchups(sender: H2HCard[], recipient: H2HCard[]): Matchup[] {
  const senderOrder = buildRevealOrder(sender);
  const recipientOrder = buildRevealOrder(recipient);
  const N = Math.min(senderOrder.length, recipientOrder.length);
  return Array.from({ length: N }, (_, i) => ({
    sender: senderOrder[i],
    recipient: recipientOrder[i],
  }));
}

export function useH2HReveal(args: UseH2HRevealArgs): UseH2HRevealReturn {
  const { sender, recipient, reducedMotion, onMatchupResolved, onArcResolved } = args;

  // Reveal-order matchups. Memoized on the card arrays so static-prop
  // mocks don't churn; phase-4 data fetches will produce stable
  // references after the initial load.
  const matchups = useMemo(
    () => buildMatchups(sender.cards, recipient.cards),
    [sender.cards, recipient.cards],
  );
  const senderRevealOrder = useMemo(() => buildRevealOrder(sender.cards), [sender.cards]);
  const recipientRevealOrder = useMemo(() => buildRevealOrder(recipient.cards), [recipient.cards]);

  // INITIAL state = end-state. The H2HRevealScreen renders the final
  // matchup with full totals before any animation runs, matching
  // phase 2 exactly. `visibleFpMap` is intentionally EMPTY here:
  // CardFront's `phase=RESULTS` path renders `actualFp` directly when
  // visibleFp is undefined (CardFront.tsx:446-449), so the static
  // end-state shows correctly without populated entries. Populating
  // entries would re-trigger CardFront's RAF on mount.
  const [phase, setPhase] = useState<RevealPhase>("done");
  const [matchupIndex, setMatchupIndex] = useState(matchups.length - 1);
  const [visibleFpMap, setVisibleFpMap] = useState<Map<string, number>>(() => new Map());
  const [senderRunningTotal, setSenderRunningTotal] = useState(sender.totalFp);
  const [recipientRunningTotal, setRecipientRunningTotal] = useState(recipient.totalFp);
  // Initial: all cards "settled" at their strip slots (matches the
  // static end-state). play() resets all to "pre" and re-staggers
  // through lay → beat → travel → settled per card.
  const [entranceStages, setEntranceStages] = useState<EntranceStage[]>(() =>
    new Array(matchups.length).fill("settled" as const),
  );
  const [pulseActive, setPulseActive] = useState(false);

  // Run-id pattern from useEmotionalReveal: bump on every cancel so
  // in-flight callbacks short-circuit. Survives strict-mode double-
  // invoke and cleanup interleavings.
  const runIdRef = useRef(0);
  const rafRef = useRef<number>(0);
  // All scheduled timeouts (entrance staggers, inter-matchup pauses,
  // entrance→reveal settle). cancelAll() walks this set and clears
  // each.
  const timersRef = useRef<Set<number>>(new Set());

  // Stable refs to the callbacks so re-creating play() doesn't kill
  // the animation mid-flight. Callbacks read the latest closure at
  // each matchup boundary.
  const onMatchupResolvedRef = useRef(onMatchupResolved);
  const onArcResolvedRef = useRef(onArcResolved);
  useEffect(() => { onMatchupResolvedRef.current = onMatchupResolved; }, [onMatchupResolved]);
  useEffect(() => { onArcResolvedRef.current = onArcResolved; }, [onArcResolved]);

  const scheduleTimeout = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const cancelAll = useCallback(() => {
    runIdRef.current++;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current.clear();
    rafRef.current = 0;
  }, []);

  // Unmount cleanup
  useEffect(() => () => cancelAll(), [cancelAll]);

  // Animate a single matchup. Trigger CardFront's RAF for both cards,
  // then drive the running totals in a parallel RAF over the same
  // window. After the running totals settle: fire onMatchupResolved,
  // pause MATCHUP_PAUSE_MS, then either runMatchup(N+1) or settle to
  // "done" + fire onArcResolved.
  const runMatchup = useCallback((index: number, myRunId: number) => {
    if (myRunId !== runIdRef.current) return;
    if (index < 0 || index >= matchups.length) return;
    const m = matchups[index];

    setMatchupIndex(index);
    setPhase("revealing");

    // Trigger CardFront's internal RAF for both battlefield cards.
    // CardFront ignores the sentinel value — it animates 0→actualFp
    // using its own duration (fpCountUpMs).
    setVisibleFpMap(prev => {
      const next = new Map(prev);
      next.set(m.sender.cardId, VISIBLE_FP_TRIGGER);
      next.set(m.recipient.cardId, VISIBLE_FP_TRIGGER);
      return next;
    });

    // Pre-totals = sum of all prior matchups' actualFps. Running totals
    // animate from pre-total → pre-total + this matchup's actualFp.
    let senderPrevTotal = 0;
    let recipientPrevTotal = 0;
    for (let i = 0; i < index; i++) {
      senderPrevTotal += matchups[i].sender.actualFp;
      recipientPrevTotal += matchups[i].recipient.actualFp;
    }
    const senderTarget = m.sender.actualFp;
    const recipientTarget = m.recipient.actualFp;

    const startTime = performance.now();
    const tick = () => {
      if (myRunId !== runIdRef.current) return;
      const elapsed = Math.min((performance.now() - startTime) / MATCHUP_DURATION_MS, 1);
      // Ease-out cubic — same curve as useEmotionalReveal.ts:484.
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setSenderRunningTotal(senderPrevTotal + senderTarget * eased);
      setRecipientRunningTotal(recipientPrevTotal + recipientTarget * eased);

      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Lock final totals exactly (in case rAF didn't land at t=1).
        const newSenderTotal = senderPrevTotal + senderTarget;
        const newRecipientTotal = recipientPrevTotal + recipientTarget;
        setSenderRunningTotal(newSenderTotal);
        setRecipientRunningTotal(newRecipientTotal);

        // Phase 5 hook — commentary engine wires here.
        onMatchupResolvedRef.current?.(index, m, {
          senderTotal: newSenderTotal,
          recipientTotal: newRecipientTotal,
        });

        // Last matchup uses end-hold; intermediates use the regular pause.
        const isFinalMatchup = index + 1 >= matchups.length;
        setPhase(isFinalMatchup ? "end-hold" : "paused");
        scheduleTimeout(isFinalMatchup ? END_OF_ARC_HOLD_MS : MATCHUP_RESOLVE_PAUSE_MS, () => {
          if (myRunId !== runIdRef.current) return;
          if (!isFinalMatchup) {
            runMatchup(index + 1, myRunId);
          } else {
            // End-hold complete — settle to "done" and fire onArcResolved.
            setPhase("done");
            onArcResolvedRef.current?.({
              senderTotal: newSenderTotal,
              recipientTotal: newRecipientTotal,
            });
          }
        });
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [matchups, scheduleTimeout]);

  const play = useCallback(() => {
    cancelAll();
    runIdRef.current++;
    const myRunId = runIdRef.current;
    // Clean slate — visibleFpMap empty so CardFront's reset path runs
    // when the matchup switches in. Totals at zero.
    setPhase("entering");
    setMatchupIndex(-1);
    setVisibleFpMap(new Map());
    setSenderRunningTotal(0);
    setRecipientRunningTotal(0);
    setPulseActive(false);
    const N = matchups.length;

    if (reducedMotion) {
      // Reduced-motion path: skip the entrance schedule + anticipation
      // beat entirely. Cards snap to "settled" immediately; matchup 0
      // fires after a small fixed delay so the user has a beat to
      // register the dealt hand before the rollup begins.
      setEntranceStages(new Array(N).fill("settled" as const));
      scheduleTimeout(200, () => {
        if (myRunId !== runIdRef.current) return;
        runMatchup(0, myRunId);
      });
      return;
    }

    // Full entrance: schedule each card through its per-stage
    // transitions. Cards are sequential — card N starts its LAY at
    // t_N = N * CARD_CYCLE_MS, after card (N-1) has fully settled
    // (CARD_LIFECYCLE_MS) plus CARD_STAGGER_MS breathing room.
    setEntranceStages(new Array(N).fill("pre" as const));

    const updateStage = (stageIndex: number, next: EntranceStage) => {
      setEntranceStages(prev => {
        if (prev[stageIndex] === next) return prev;
        const out = prev.slice();
        out[stageIndex] = next;
        return out;
      });
    };

    for (let i = 0; i < N; i++) {
      const t0 = i * CARD_CYCLE_MS;
      scheduleTimeout(t0, () => {
        if (myRunId !== runIdRef.current) return;
        updateStage(i, "lay");
      });
      scheduleTimeout(t0 + CARD_LAY_MS, () => {
        if (myRunId !== runIdRef.current) return;
        updateStage(i, "beat");
      });
      scheduleTimeout(t0 + CARD_LAY_MS + CARD_LAY_BEAT_MS, () => {
        if (myRunId !== runIdRef.current) return;
        updateStage(i, "travel");
      });
      scheduleTimeout(t0 + CARD_LIFECYCLE_MS, () => {
        if (myRunId !== runIdRef.current) return;
        updateStage(i, "settled");
      });
    }

    // After the last card settles, sequence the anticipation beat:
    //   stillness (POST_ENTRANCE_STILLNESS_MS) — silent hold, no animation.
    //   pulse (ENERGY_PULSE_MS) — all 12 cards' tier-colored glow.
    //   settle (POST_PULSE_SETTLE_MS) — glow fades; then matchup 0.
    const entranceTotalMs = (N - 1) * CARD_CYCLE_MS + CARD_LIFECYCLE_MS;
    const t_anticipateStart = entranceTotalMs;
    const t_pulseStart = t_anticipateStart + POST_ENTRANCE_STILLNESS_MS;
    const t_pulseEnd = t_pulseStart + ENERGY_PULSE_MS;
    const t_matchupStart = t_pulseEnd + POST_PULSE_SETTLE_MS;

    scheduleTimeout(t_anticipateStart, () => {
      if (myRunId !== runIdRef.current) return;
      setPhase("anticipating");
    });
    scheduleTimeout(t_pulseStart, () => {
      if (myRunId !== runIdRef.current) return;
      setPulseActive(true);
    });
    scheduleTimeout(t_pulseEnd, () => {
      if (myRunId !== runIdRef.current) return;
      setPulseActive(false);
    });
    scheduleTimeout(t_matchupStart, () => {
      if (myRunId !== runIdRef.current) return;
      runMatchup(0, myRunId);
    });
  }, [cancelAll, scheduleTimeout, matchups.length, runMatchup, reducedMotion]);

  const skipToEnd = useCallback(() => {
    cancelAll();
    setPhase("done");
    setMatchupIndex(matchups.length - 1);
    // Empty map — CardFront falls through to actualFp via phase=RESULTS.
    setVisibleFpMap(new Map());
    setSenderRunningTotal(sender.totalFp);
    setRecipientRunningTotal(recipient.totalFp);
    setEntranceStages(new Array(matchups.length).fill("settled" as const));
    setPulseActive(false);
  }, [cancelAll, matchups.length, sender.totalFp, recipient.totalFp]);

  const activeMatchup = useMemo(() => {
    if (phase === "idle" || phase === "entering" || phase === "anticipating" || matchupIndex < 0) {
      return { sender: null, recipient: null };
    }
    // During end-hold and done, anchor on the final matchup (matchupIndex
    // is already N-1 in both cases, but the explicit clamp is defensive).
    const idx = phase === "done" || phase === "end-hold"
      ? matchups.length - 1
      : matchupIndex;
    const m = matchups[idx];
    return m ? { sender: m.sender, recipient: m.recipient } : { sender: null, recipient: null };
  }, [phase, matchupIndex, matchups]);

  const entranceSettledCount = useMemo(
    () => entranceStages.filter(s => s === "settled").length,
    [entranceStages],
  );

  return {
    phase,
    matchupIndex,
    matchupCount: matchups.length,
    entranceStages,
    entranceSettledCount,
    pulseActive,
    visibleFpMap,
    senderRunningTotal,
    recipientRunningTotal,
    activeMatchup,
    senderRevealOrder,
    recipientRevealOrder,
    play,
    skipToEnd,
  };
}
