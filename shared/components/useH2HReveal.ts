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
import type { ShakeType } from "@shared/components/types";

/** Per-side shake state. Mirrors `ShakeInfo` from useEmotionalReveal.ts:31
 *  but tracked per-side (sender / recipient) so the two cards in a matchup
 *  can shake in parallel. */
export type H2HShakeInfo = { cardId: string; type: ShakeType } | null;

/** Per-side glow state. Mirrors GameView's `glowState` shape (the
 *  `cardId` field is implicit per side and not stored). */
export type H2HGlowState = { tier: string; durationMs: number } | null;

// ── Shake / blast durations ────────────────────────────────────────────────
// Re-declared locally (not imported) to avoid coupling to useEmotionalReveal's
// internal constants. Source-of-truth: useEmotionalReveal.ts:86-88.
const SP_SHAKE_DURATION_MS_DEFAULT = 400;
const SP_SHAKE_DURATION_MS_BIG = 550;
const SP_SHAKE_DURATION_MS_LEGENDARY = 700;

/** H2H dead-band hype shake. Cards outside the fire/ice bands
 *  (cardShakeType === null) fire a short plain wobble using the
 *  pcs-shake-hype keyframe (PlayerCardShell.tsx:155). The CSS keyframe
 *  is 600ms long but we clear the class at 200ms so only the first
 *  third of the wobble plays — a quick visual acknowledgment that
 *  distinguishes the moment of reveal without competing with the
 *  band-tier emphasis. */
const H2H_HYPE_SHAKE_MS = 200;

/** Glow (blast) duration formula — port of GameView.handleCardRevealStart
 *  at shared/views/GameView.tsx:1014-1033. Base value per tier; modifier
 *  per shake type. RED falls through to the default (250). H2H always
 *  runs full duration; no skip-mode override. */
function glowDurationForTier(tier: string, shakeType: ShakeType): number {
  const t = (tier ?? "").toUpperCase();
  const base = t === "ORANGE" ? 900
    : t === "PURPLE" ? 700
      : t === "BLUE" ? 400
        : t === "GREEN" ? 350
          : 250;
  const modifier = shakeType === "legendary" ? 300
    : shakeType === "big" ? 150
      : shakeType === "frozen" ? -100
        : shakeType === "cold" ? -50
          : 0;
  return Math.max(150, base + modifier);
}

export interface RevealBeatPlan {
  shakeType: ShakeType;
  shakePre: number;
  blastEnabled: boolean;
  glowTier: string;
  glowDurationMs: number;
  postBlastDelay: number;
  legendaryCelebrationShake: boolean;
}

/** Reveal-foundation Feature 2 — completion-gate computation. Returns
 *  the max duration of any post-rollup effect that should keep the set
 *  in-flight before runMatchup(N+1) advances. Today the only post-
 *  rollup effect is the legendary celebration shake
 *  (SP_SHAKE_DURATION_MS_DEFAULT = 400ms). Exported for unit-testability
 *  + so future post-rollup beats (e.g. relay/lead-swing tail) can be
 *  added in ONE place and propagate to the advance-gate formula.
 *
 *  Returns 0 when neither side has a post-rollup effect — the
 *  advance falls back to MATCHUP_RESOLVE_PAUSE_MS as the structural
 *  floor. */
export function computePostRollupEffectMs(
  senderBeats: RevealBeatPlan,
  recipientBeats: RevealBeatPlan,
): number {
  const senderMs = senderBeats.legendaryCelebrationShake
    ? SP_SHAKE_DURATION_MS_DEFAULT
    : 0;
  const recipientMs = recipientBeats.legendaryCelebrationShake
    ? SP_SHAKE_DURATION_MS_DEFAULT
    : 0;
  return Math.max(senderMs, recipientMs);
}

/** Compute the pre-rollup beat plan for a single card. Band-tier cards
 *  (cardShakeType ∈ {legendary, big, cold, frozen}) get the full single-
 *  player treatment — shake + blast + (legendary only) post-rollup
 *  celebration shake. Dead-band cards get a short plain hype wobble
 *  with no blast. Cardshake classification mirrors getShakeType at
 *  useEmotionalReveal.ts:156-171 (ratio thresholds 1.6 / 1.4 / 0.8 / 0.6). */
export function planRevealBeats(card: H2HCard): RevealBeatPlan {
  const proj = Number(card.projectedFp ?? 0);
  const actual = Number(card.actualFp ?? 0);
  let cardShakeType: ShakeType = null;
  if (proj > 0) {
    const ratio = actual / proj;
    if (ratio >= 1.6) cardShakeType = "legendary";
    else if (ratio >= 1.4) cardShakeType = "big";
    else if (ratio <= 0.6) cardShakeType = "frozen";
    else if (ratio <= 0.8) cardShakeType = "cold";
  }
  const tier = String((card as any).tier ?? "WHITE").toUpperCase();
  if (cardShakeType === null) {
    return {
      shakeType: "hype",
      shakePre: H2H_HYPE_SHAKE_MS,
      blastEnabled: false,
      glowTier: tier,
      glowDurationMs: 0,
      postBlastDelay: 0,
      legendaryCelebrationShake: false,
    };
  }
  const shakePre =
    cardShakeType === "legendary" ? SP_SHAKE_DURATION_MS_LEGENDARY
      : cardShakeType === "big" ? SP_SHAKE_DURATION_MS_BIG
        : SP_SHAKE_DURATION_MS_DEFAULT;
  const glowDurationMs = glowDurationForTier(tier, cardShakeType);
  // postBlastDelay = min(200, max(0, glowMs - flipMs)). H2H has no flip
  // → flipMs = 0 → simplifies to min(200, glowMs).
  const postBlastDelay = Math.min(200, Math.max(0, glowDurationMs));
  return {
    shakeType: cardShakeType,
    shakePre,
    blastEnabled: true,
    glowTier: tier,
    glowDurationMs,
    postBlastDelay,
    legendaryCelebrationShake: cardShakeType === "legendary",
  };
}

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
  /** Phase 5a amend3 (2026-05-27): controls the hook's initial state.
   *  Defaults to "done" — preserves the dev-route phase-2 invariant
   *  that mounting the hook without calling play() renders the static
   *  end-state (final totals, all cards settled, last matchup active).
   *  Production wrappers (`H2HRecipientReveal`) pass "idle" so the
   *  initial paint shows a pre-play state (zero totals, no entrance
   *  staged) — eliminates the spoiler flash during the HOLD-to-arc
   *  crossfade where the overlay would otherwise mount visible at
   *  `phase === "done"`. Only "idle" and "done" produce stable
   *  starting states; other phases require runtime state that play()
   *  populates. */
  initialPhase?: "idle" | "done";
  /** FIX A (2026-05-30 — composited-canvas H2H, doc EDIT B2 + Fix C2).
   *  When true, play() SKIPS the entering phase entirely and goes
   *  idle → revealing directly. entranceStages init as "settled" so
   *  HandStrip cells render at their strip-slot position with no
   *  deck-to-hand animation. showEntranceDeck (gated on
   *  phase === "entering") never triggers. Used by H2HRecipientReveal
   *  when the reveal is composited onto an H2HRecipientPlay canvas
   *  where the column-flip pass has already placed cards on the strip
   *  slots — the deck entrance would re-deal cards that are already
   *  there. Standalone reveal callers (H2HSenderReveal, dev mock
   *  routes) leave this undefined to preserve the existing deck
   *  entrance behavior. The BattlefieldSlot card-pull animation
   *  handles the board-slot → hero-slot move per matchup, which is
   *  the locked motion for this surface. */
  skipEntrance?: boolean;
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
  /** Cards whose per-card rollup has completed (`visibleFp >= actualFp`).
   *  Consumed by H2HRevealScreen + the H2H renderers to drive the
   *  pre-reveal vs post-reveal visual split — pre-reveal cards show
   *  greyed projected FP / no badges / no stamp; post-reveal cards
   *  show actual FP / badges / stamp (same as the overlay end-state).
   *  Derived from `visibleFpMap`; updates on every render tick that
   *  advances a card past actualFp. */
  revealedCardIds: Set<string>;
  /** Per-side shake state. Non-null while a card is shaking (during
   *  the pre-rollup band-tier shake OR dead-band hype wobble OR the
   *  legendary post-rollup celebration shake). Consumed by
   *  H2HRevealScreen → BattlefieldSlot → renderCard → AthleteCard's
   *  `shakeType` prop (which drives the pcs-shake-* CSS class). */
  senderShakeInfo: H2HShakeInfo;
  recipientShakeInfo: H2HShakeInfo;
  /** Per-side blast (glow) state. Non-null only for band-tier cards
   *  while their tier-colored blast is animating. Drives the
   *  `glowActive` / `glowTier` / `glowDurationMs` props on AthleteCard. */
  senderGlowState: H2HGlowState;
  recipientGlowState: H2HGlowState;
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

/** Reveal-order sort: **unheld ascending by salary, then held ascending
 *  by salary**. Held cards form a finale block at the end of the reveal
 *  sequence; within each group, the cheapest card reveals first.
 *
 *  This is the TEMPORAL contract — it dictates the ORDER in which
 *  matchups fire over time. It does NOT dictate the SPATIAL ORDER of
 *  cells on the strip; cells render in `slotIndex` order regardless
 *  (post-2026-05-30 strip-sort EDIT — see doc lock in
 *  docs/h2h-reveal-arc-design.md "Strip-component sort contract").
 *
 *  Per the doc lock's reveal sequence: "swap cards first, cheapest to
 *  most expensive; held cards last, cheapest to most expensive."
 *  Stated in current vocabulary as: unheld asc by salary → held asc
 *  by salary. */
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
  const { sender, recipient, reducedMotion, onMatchupResolved, onArcResolved, initialPhase = "done", skipEntrance = false } = args;
  const startIdle = initialPhase === "idle";

  // Reveal-order matchups. Memoized on the card arrays so static-prop
  // mocks don't churn; phase-4 data fetches will produce stable
  // references after the initial load.
  const matchups = useMemo(
    () => buildMatchups(sender.cards, recipient.cards),
    [sender.cards, recipient.cards],
  );
  const senderRevealOrder = useMemo(() => buildRevealOrder(sender.cards), [sender.cards]);
  const recipientRevealOrder = useMemo(() => buildRevealOrder(recipient.cards), [recipient.cards]);

  // INITIAL state — branches on `initialPhase` (default "done").
  //   - "done" (default; dev-route phase-2): end-state on mount.
  //     The H2HRevealScreen renders the final matchup with full
  //     totals before any animation runs. `visibleFpMap` stays
  //     EMPTY: CardFront's `phase=RESULTS` path renders `actualFp`
  //     directly when visibleFp is undefined (CardFront.tsx:446-449),
  //     so the static end-state shows correctly without populated
  //     entries. Populating entries would re-trigger CardFront's RAF.
  //   - "idle" (phase 5a amend3; production wrapper): pre-play
  //     state on mount. Zero totals, all entrance stages "pre".
  //     `showOverlay = phase === "done"` is false, so the overlay
  //     doesn't mount visible during the wrapper's HOLD-to-arc
  //     crossfade — fixes the spoiler flash.
  const [phase, setPhase] = useState<RevealPhase>(initialPhase);
  const [matchupIndex, setMatchupIndex] = useState(startIdle ? -1 : matchups.length - 1);
  const [visibleFpMap, setVisibleFpMap] = useState<Map<string, number>>(() => new Map());
  const [senderRunningTotal, setSenderRunningTotal] = useState(startIdle ? 0 : sender.totalFp);
  const [recipientRunningTotal, setRecipientRunningTotal] = useState(startIdle ? 0 : recipient.totalFp);
  // FIX A: when skipEntrance is true, init entranceStages to "settled"
  // even for the idle starting phase. HandStrip cells then render at
  // their strip-slot position from mount — no per-cell deck-stage
  // translate. (Without this, idle-mount cells would render at the
  // deck Y until play() ran, briefly flashing the deck position.)
  const [entranceStages, setEntranceStages] = useState<EntranceStage[]>(() =>
    new Array(matchups.length).fill((startIdle && !skipEntrance ? "pre" : "settled") as const),
  );
  const [pulseActive, setPulseActive] = useState(false);
  // Per-side shake + glow state. Pre-rollup beat (shake + blast) fires
  // simultaneously on both sides at matchup entry; both clear before
  // the rollup begins. Legendary cards get a post-rollup celebration
  // shake re-using the same per-side slot.
  const [senderShakeInfo, setSenderShakeInfo] = useState<H2HShakeInfo>(null);
  const [recipientShakeInfo, setRecipientShakeInfo] = useState<H2HShakeInfo>(null);
  const [senderGlowState, setSenderGlowState] = useState<H2HGlowState>(null);
  const [recipientGlowState, setRecipientGlowState] = useState<H2HGlowState>(null);

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

    // ── Pre-rollup beats (post-prior-turn pre-reveal-rule, 2026-05-27) ──
    // Match single-player's reveal language: shake (+ blast for band-tier
    // cards) fires BEFORE the rollup. Both cards' shakes run in parallel;
    // the matchup waits for the slower of the two to finish, plus a
    // postBlastDelay, before the rollup begins. See planRevealBeats above
    // for the band vs dead-band branching.
    const senderBeats = planRevealBeats(m.sender);
    const recipientBeats = planRevealBeats(m.recipient);

    setSenderShakeInfo({ cardId: m.sender.cardId, type: senderBeats.shakeType });
    setRecipientShakeInfo({ cardId: m.recipient.cardId, type: recipientBeats.shakeType });
    if (senderBeats.blastEnabled) {
      setSenderGlowState({ tier: senderBeats.glowTier, durationMs: senderBeats.glowDurationMs });
      scheduleTimeout(senderBeats.glowDurationMs + 50, () => {
        if (myRunId !== runIdRef.current) return;
        setSenderGlowState(null);
      });
    }
    if (recipientBeats.blastEnabled) {
      setRecipientGlowState({ tier: recipientBeats.glowTier, durationMs: recipientBeats.glowDurationMs });
      scheduleTimeout(recipientBeats.glowDurationMs + 50, () => {
        if (myRunId !== runIdRef.current) return;
        setRecipientGlowState(null);
      });
    }

    const maxShakePre = Math.max(senderBeats.shakePre, recipientBeats.shakePre);
    const maxPostBlastDelay = Math.max(senderBeats.postBlastDelay, recipientBeats.postBlastDelay);

    // Clear pre-rollup shake props together at the slower card's
    // shakePre boundary.
    scheduleTimeout(maxShakePre, () => {
      if (myRunId !== runIdRef.current) return;
      setSenderShakeInfo(null);
      setRecipientShakeInfo(null);
    });

    // Defer the rollup itself until both shakes (and the post-blast
    // settle) have completed.
    scheduleTimeout(maxShakePre + maxPostBlastDelay, () => {
      if (myRunId !== runIdRef.current) return;

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
      // Advance per-card visibleFp so PlayerCardShell's stamp effect can
      // observe rollup completion. Mirrors useEmotionalReveal.ts:490 — the
      // single-player advance. CardFront ignores these updates after its
      // first-trigger RAF latches (CardFront.tsx:379), so the visual
      // count-up is unaffected; only the stamp pipeline gains the signal.
      setVisibleFpMap(prev => new Map(prev).set(m.sender.cardId, senderTarget * eased));
      setVisibleFpMap(prev => new Map(prev).set(m.recipient.cardId, recipientTarget * eased));

      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Lock final totals exactly (in case rAF didn't land at t=1).
        const newSenderTotal = senderPrevTotal + senderTarget;
        const newRecipientTotal = recipientPrevTotal + recipientTarget;
        setSenderRunningTotal(newSenderTotal);
        setRecipientRunningTotal(newRecipientTotal);
        // Lock per-card visibleFp at actualFp — mirrors useEmotionalReveal.ts:495.
        setVisibleFpMap(prev => new Map(prev).set(m.sender.cardId, senderTarget));
        setVisibleFpMap(prev => new Map(prev).set(m.recipient.cardId, recipientTarget));

        // Legendary post-rollup celebration shake — mirrors single-player
        // useEmotionalReveal.ts:459-465. Re-uses the same per-side shake
        // slot; auto-clears after SHAKE_DURATION_MS_DEFAULT.
        if (senderBeats.legendaryCelebrationShake) {
          setSenderShakeInfo({ cardId: m.sender.cardId, type: "legendary" });
          scheduleTimeout(SP_SHAKE_DURATION_MS_DEFAULT, () => {
            if (myRunId !== runIdRef.current) return;
            setSenderShakeInfo(null);
          });
        }
        if (recipientBeats.legendaryCelebrationShake) {
          setRecipientShakeInfo({ cardId: m.recipient.cardId, type: "legendary" });
          scheduleTimeout(SP_SHAKE_DURATION_MS_DEFAULT, () => {
            if (myRunId !== runIdRef.current) return;
            setRecipientShakeInfo(null);
          });
        }

        // Phase 5 hook — commentary engine wires here.
        onMatchupResolvedRef.current?.(index, m, {
          senderTotal: newSenderTotal,
          recipientTotal: newRecipientTotal,
        });

        // Reveal-foundation Feature 2 — COMPLETION-GATE the per-set
        // advance. Previously the next-set timer was fixed at
        // MATCHUP_RESOLVE_PAUSE_MS regardless of any in-flight
        // post-rollup effects; the legendary celebration shake
        // (SP_SHAKE_DURATION_MS_DEFAULT = 400ms) only fit inside the
        // 850ms pause COINCIDENTALLY, not structurally. The fix takes
        // the max of the base pause and any pending post-rollup
        // effect duration, so a set with a legendary card waits for
        // its celebration shake to resolve before the next set begins;
        // a plain set still advances on the base pause. This is the
        // structural foundation for the relay/lead-swing tension —
        // future post-rollup beats added to the matchup tail will
        // automatically extend the gate without per-callsite work.
        const pendingPostRollupMs = computePostRollupEffectMs(
          senderBeats,
          recipientBeats,
        );
        const isFinalMatchup = index + 1 >= matchups.length;
        const intermediateAdvanceDelay = Math.max(
          MATCHUP_RESOLVE_PAUSE_MS,
          pendingPostRollupMs,
        );
        setPhase(isFinalMatchup ? "end-hold" : "paused");
        scheduleTimeout(
          isFinalMatchup ? END_OF_ARC_HOLD_MS : intermediateAdvanceDelay,
          () => {
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
          },
        );
      }
    };
      rafRef.current = requestAnimationFrame(tick);
    });
  }, [matchups, scheduleTimeout]);

  const play = useCallback(() => {
    cancelAll();
    runIdRef.current++;
    const myRunId = runIdRef.current;
    // Clean slate — visibleFpMap empty so CardFront's reset path runs
    // when the matchup switches in. Totals at zero.
    setMatchupIndex(-1);
    setVisibleFpMap(new Map());
    setSenderRunningTotal(0);
    setRecipientRunningTotal(0);
    setPulseActive(false);
    setSenderShakeInfo(null);
    setRecipientShakeInfo(null);
    setSenderGlowState(null);
    setRecipientGlowState(null);
    const N = matchups.length;

    if (skipEntrance) {
      // FIX A: composited-canvas path. Cards are already at strip
      // slots on the still-mounted H2HRecipientPlay canvas; the deck
      // entrance would re-deal cards that are visibly there. Skip
      // phase "entering" entirely, mark stages settled, and proceed
      // straight to matchup 0. The BattlefieldSlot card-pull
      // animation per matchup handles the board-slot → hero-slot
      // move, which is the locked motion for this surface.
      setPhase("revealing");
      setEntranceStages(new Array(N).fill("settled" as const));
      scheduleTimeout(200, () => {
        if (myRunId !== runIdRef.current) return;
        runMatchup(0, myRunId);
      });
      return;
    }

    setPhase("entering");

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
  }, [cancelAll, scheduleTimeout, matchups.length, runMatchup, reducedMotion, skipEntrance]);

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
    setSenderShakeInfo(null);
    setRecipientShakeInfo(null);
    setSenderGlowState(null);
    setRecipientGlowState(null);
  }, [cancelAll, matchups.length, sender.totalFp, recipient.totalFp]);

  const activeMatchup = useMemo(() => {
    if (phase === "idle") {
      return { sender: null, recipient: null };
    }
    // Phase 4 amend5 fix 1 (2026-05-27): during `entering`, show
    // matchups[0] in the hero zone as soon as the deck has emptied
    // (i.e., the last card has at least started laying — no
    // "pre"-stage cards remain). This eliminates the ~750ms empty-
    // middle window between deck depletion and the
    // `setPhase("anticipating")` tick that previously held the
    // hero zone visually empty while the last card was still mid-
    // flight to its strip slot. The deck has handed off all its
    // cards; the hero slots reveal who the first matchup is.
    if (phase === "entering") {
      const deckEmpty = !entranceStages.some(s => s === "pre");
      if (!deckEmpty) {
        return { sender: null, recipient: null };
      }
      const m0 = matchups[0];
      return m0 ? { sender: m0.sender, recipient: m0.recipient } : { sender: null, recipient: null };
    }
    // Amend4: during `anticipating`, anchor on matchups[0] so the
    // pre-reveal pulse window has hero cards visible.
    const idx = phase === "anticipating"
      ? 0
      : phase === "done" || phase === "end-hold"
        ? matchups.length - 1
        : matchupIndex < 0
          ? 0
          : matchupIndex;
    const m = matchups[idx];
    return m ? { sender: m.sender, recipient: m.recipient } : { sender: null, recipient: null };
  }, [phase, matchupIndex, matchups, entranceStages]);

  const entranceSettledCount = useMemo(
    () => entranceStages.filter(s => s === "settled").length,
    [entranceStages],
  );

  // Cards whose rollup has reached actualFp. Mirrors the per-card check
  // used by PlayerCardShell's stamp effect; consumed by H2HRevealScreen
  // to drive the pre-reveal vs post-reveal visual split.
  const revealedCardIds = useMemo(() => {
    const set = new Set<string>();
    const check = (c: H2HCard) => {
      const v = visibleFpMap.get(c.cardId);
      if (v === undefined) return;
      const target = c.actualFp;
      const done = target === 0 ? true : target > 0 ? v >= target : v <= target;
      if (done) set.add(c.cardId);
    };
    sender.cards.forEach(check);
    recipient.cards.forEach(check);
    return set;
  }, [visibleFpMap, sender.cards, recipient.cards]);

  return {
    phase,
    matchupIndex,
    matchupCount: matchups.length,
    entranceStages,
    entranceSettledCount,
    pulseActive,
    visibleFpMap,
    revealedCardIds,
    senderShakeInfo,
    recipientShakeInfo,
    senderGlowState,
    recipientGlowState,
    senderRunningTotal,
    recipientRunningTotal,
    activeMatchup,
    senderRevealOrder,
    recipientRevealOrder,
    play,
    skipToEnd,
  };
}
