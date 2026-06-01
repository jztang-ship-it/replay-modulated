// shared/components/H2HRecipientPlay.tsx
//
// Layout A / Layout B restructure
// (docs/layout-a-b-restructure-design-lock.md, Pass 1 — STRUCTURAL).
// Supersedes the prior single-fluid hold_select → column_flip → VS
// arc by introducing two formal named layouts with an ordered
// transition between them. Pre-deal is killed; the opponent card-flip
// is killed; the VS / Ready-Set-Go beat is killed.
//
// State machine (8 states, ordered):
//   loading:           !dataReady or load/engine error. Replaces the
//                      former pre_deal entry — auto-advances to
//                      deal_in the moment dataReady flips true and
//                      no error is set. Hosts the engine-error path
//                      that pre_deal used to host (loading copy +
//                      Try Again CTA on error).
//   deal_in:           Theatrical lay-down cascade. Bottom cards land
//                      one-by-one face-up from challengeCtx.
//                      initialRoster (server snapshot of the sender's
//                      deal — NOT a redraw). Opponent strip ABSENT
//                      throughout (Layout A). Stage-text slot in the
//                      top zone hosts the deal-intro beat (Pass 1:
//                      placeholder render; Pass 2 fills with the
//                      templated {opponent}/{score} bank).
//   hold_select:       6 face-up bottom cards; preview-then-hold
//                      (#11). Stage 1 / Stage 2 / instructional copy
//                      in the top-zone stage-text slot. Draw CTA.
//                      Opponent strip ABSENT (Layout A).
//   redraw_running:    Unheld flip face-down immediately on Draw tap;
//                      held stay face-up in place (held-position
//                      invariant). redrawRoster() runs ONCE; front
//                      faces for unheld slots stay unmounted until
//                      your_redraw_flip lights them up (path β
//                      no-flicker). Opponent strip ABSENT.
//   your_redraw_flip:  LEFT→RIGHT col 0→5 on the BOTTOM strip only.
//                      Held column: bottom stays face-up. Replacement
//                      column: bottom flips back→front (the recipient
//                      sees their own redraw resolve). Opponent strip
//                      is NOT touched here — design-lock §3 step 2.
//                      Still Layout A.
//   ab_transition:     ~250–300ms ONE coordinated beat. Opponent
//                      strip + opponent hero slot fade/slide IN
//                      face-up at the top (no flip — design lock §3
//                      step 3 kills the opponent flip). Your hero
//                      region expands from the Layout A small floor
//                      back to the Layout B full floor; the flex
//                      layout pushes your mini-strip down naturally
//                      (the "slide DOWN" of §3 step 3 IS the hero
//                      expansion). Opponent name stays fixed across
//                      the beat (it lives in the shell's top zone
//                      header through both layouts).
//   handoff_resolving: ~1000ms settle-pause (§3 step 4). Layout B
//                      fully composed: opponent strip face-up,
//                      your strip slid-down, BOTH hero slots EMPTY
//                      (two stacked dashed-border boxes). Empty
//                      headline; stillness. Replaces the prior VS /
//                      Ready-Set-Go beat. resolveRoster() fires
//                      partway through this hold (as before) and
//                      sets `arc` on resolve.
//   arc:               H2HRecipientReveal mounts inside the still-
//                      mounted playing canvas via compositeOverlay
//                      (Fix C2 single-canvas continuity). Reveal +
//                      results overlay take over from here.
//
// Engine reuse — UNCHANGED:
//   - dealInitialRoster() is NOT called from the recipient surface;
//     deal_in reads challengeCtx.initialRoster.
//   - redrawRoster() runs once at hold_select → redraw_running.
//   - resolveRoster() runs once during handoff_resolving (settle-
//     pause) on the POST-REDRAW finalRoster.
//
// The two flips — kept distinct:
//   YOUR replacement flip (kept): BottomStripCell owns its own
//     .h2h-play-flip-inner rotateY scaffold; driven by
//     your_redraw_flip's revealedColumns counter.
//   OPPONENT flip (killed): TopStripCell renders the sender card
//     face-up DIRECTLY — no rotateY, no perspective, no back face.
//     Visibility is gated by the strip-wrapper's height/opacity
//     transition between Layout A (0px / 0) and Layout B (80px / 1).
//
// Held-position invariant (carried forward): held cards never change
// slot position across states 1–5. wasHeld carries into arc's
// revealOrder which encodes "held revealed last" — position is
// anchor, not sequence.
//
// Carry-forward from the superseded hold_select-budget lock:
//   - Fluid clamp() text sizing + 3-line deterministic clamp.
//   - Hero floor smaller in Layout A states; full in Layout B states.
//   - Comfortable floor + scroll fallback (overflow-y:auto +
//     sticky-CTA) applies to ALL non-arc states (Layout A is denser
//     than the previous hold_select-only treatment; Layout B is the
//     densest — settle-pause + arc are where the floor most engages
//     and where the old img-5 CTA clip is fixed).
//
// Timings: PRE_REVEAL_HOLD_MS is bumped 800 → 1000ms for the settle-
// pause per design-lock §9. DEAL_CASCADE_INTERVAL_MS,
// COLUMN_FLIP_DURATION_MS, COLUMN_FLIP_INTERSTITIAL_MS,
// AB_TRANSITION_DURATION_MS are NOT design-locked; values here are
// the starting points for live verification.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedCard } from "@shared/types";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { H2HRecipientReveal } from "./H2HRecipientReveal";
import {
  TIER_ACCENT,
  usePrefersReducedMotion,
  type CardRenderer,
  type H2HCard,
} from "./H2HRevealScreen";
import { setActiveSeason, ensureLoaded, isLoaded } from "@shared/engines/dataEngine";
import { isRealName } from "@shared/utils/isRealName";
import {
  H2HBoardShell,
  HERO_MIN_HEIGHT_HOLD_SELECT_CSS,
} from "./H2HBoardShell";
import { PartsLine } from "./TierGauge";
import {
  selectIntroAnchor,
  selectRecipientIntro,
  selectRecipientDealNudge,
  type Line,
} from "@shared/commentary/chadChallenge";

const ROSTER_SIZE = 6;

/** Inter-card delay during the state-2 deal-in cascade. Each card
 *  lands one-by-one after Deal is tapped. Live-verification tunable. */
export const DEAL_CASCADE_INTERVAL_MS = 120;

/** Single column flip duration during the state-3 column-flip pass.
 *  Used by CSS rotateY transition + state-advance scheduling. */
export const COLUMN_FLIP_DURATION_MS = 250;

/** Delay between one column completing its flip and the next column
 *  beginning. Per design footer: not locked — live-verification tunable. */
export const COLUMN_FLIP_INTERSTITIAL_MS = 150;

/** Settle-pause (design-lock §3 step 4 / §9): hold after the A→B
 *  transition completes and before the reveal arc starts, with both
 *  lineups composed face-up and both hero slots EMPTY. Replaces the
 *  prior VS / Ready-Set-Go beat. Bumped 800 → 1000ms per the lock;
 *  tunable on device pass. */
export const PRE_REVEAL_HOLD_MS = 1000;

/** A→B transition (design-lock §3 step 3 / §9): the single
 *  coordinated beat where the opponent strip fades/slides in
 *  face-up at the top while the hero region expands to its full
 *  Layout B floor (the flex layout pushes the bottom strip down
 *  naturally — that IS the "slide DOWN" of step 3). One beat; no
 *  per-cell flip. Tunable on device pass. */
export const AB_TRANSITION_DURATION_MS = 300;

/** Cross-fade window for the playing-strip inner content when state
 *  advances to "arc" (Fix C2). Matches H2HRecipientReveal's own
 *  HOLD_TO_ARC_CROSSFADE_MS so the playing fade-out and the reveal
 *  fade-in finish in lockstep on the same canvas. */
export const ARC_COMPOSITE_CROSSFADE_MS = 250;

// Mini-cell dimensions — matches HAND_STRIP_HEIGHT_PX (80) and the
// derived STRIP_CARD_DISPLAY_WIDTH_PX ((80 * 329) / 478 ≈ 55) used by
// H2HRevealScreen's HandStrip. Same Y/X footprint so the eye doesn't
// reflow when the surface hands off to the arc.
const MINI_CELL_WIDTH_PX = 55;
const MINI_CELL_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;

// Strip-scale factor — VALUES COPIED FROM H2HRevealScreen.tsx:215-218
// (the working strip scaffold). Do not hand-derive: the natural-width
// constant + transform-origin combo is layout-sensitive, and JSDOM
// tests don't catch off-cell rendering caused by divergent values.
// 150 (not 329) is the deliberate strip-pattern wrap width — the
// renderer's intrinsic content sizes against 150 × 218, then a CSS
// scale shrinks the rendered output to MINI_CELL_WIDTH_PX × MINI_CELL_HEIGHT_PX.
// See the "Visual / layout changes" rule in CLAUDE.md.
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_SCALE = MINI_CELL_WIDTH_PX / STRIP_CARD_NATURAL_WIDTH_PX;

// Per piece 2a geometry (smoke artifact 2026-05-28): top strip
// marginBottom 18 / hero marginBottom 4 / bottom strip marginBottom 0 /
// reserved paddingTop 8. Same values as H2HResultsOverlay +
// H2HRevealScreen so the playing-mode surface visually anchors at the
// same Y positions for the top strip, hero zone, bottom strip, and CTA.
const TOP_STRIP_MARGIN_BOTTOM_PX = 18;
const HERO_ZONE_MARGIN_BOTTOM_PX = 4;
const BOTTOM_STRIP_MARGIN_BOTTOM_PX = 0;
const RESERVED_PADDING_TOP_PX = 8;
const RESERVED_MIN_HEIGHT_PX = 77;

// hold_select vertical-budget fix
// (docs/holdselect-vertical-budget-design-lock.md §2, 2026-06-01).
// Levers (1)–(5) are all state-scoped to hold_select. Outside
// hold_select the surface renders exactly as today (lock §4).
//
// (1) Fluid intro text + 3-line clamp. INTRO_FONT_CLAMP scales the
// font on viewport width so tight phones read 16px and roomy phones
// read up to 22px. The 3-line budget is reserved at the container so
// the stage-text height is DETERMINISTIC (kills the 64↔92px
// randomization).
const INTRO_FONT_CLAMP = "clamp(16px, 4.2vw, 22px)";
const INTRO_LINE_HEIGHT = 1.28;
const INTRO_3LINE_BUDGET_CSS = `calc((${INTRO_FONT_CLAMP}) * ${INTRO_LINE_HEIGHT} * 3)`;

// (4) Fluid inter-zone margin: TOP_ZONE marginBottom shrinks on tight
// viewports. Default (other states) remains 18 per the shell constant;
// during hold_select the shell receives a clamp() override.
const HOLD_SELECT_TOP_ZONE_MARGIN_CSS = "clamp(8px, 2.6vw, 18px)";
const HOLD_SELECT_HERO_MARGIN_CSS = "clamp(2px, 1vw, 4px)";

// Hold-state visual — accent ring + light scale. Visual polish is
// 2d-scope (re-scoped to VISUAL refinement per the 2026-05-30 EDIT);
// the functional tap here is load-bearing for the state machine.
const HOLD_ACCENT_RING_PX = 2;

/** Sport-agnostic state model. */
type PlayingState =
  | { kind: "loading" }
  | { kind: "deal_in"; cardsLanded: number }
  | {
      kind: "hold_select";
      held: Set<number>;
      /** Polish #11 — currently-previewed slot index (preview-then-hold
       *  interaction model). `null` on entry; tap on a non-previewed cell
       *  moves preview here without changing `held`; tap on the already-
       *  previewed cell flips its `held` bit. This field is orthogonal
       *  to `held` and is NOT threaded into redraw_running / your_redraw_flip /
       *  ab_transition / handoff_resolving — only `held` carries through.
       *  See docs/11-preview-then-hold-design-lock.md §5/§8. */
      previewedSlotIndex: number | null;
    }
  | { kind: "redraw_running"; held: Set<number> }
  | {
      kind: "your_redraw_flip";
      /** Number of columns whose flip animation has been kicked off ON
       *  THE BOTTOM STRIP ONLY (your replacements). The top strip is
       *  NOT touched here — design-lock §3 step 2 isolates your-flip
       *  from opponent-appear. CSS rotateY transition handles the
       *  actual 250ms flip animation per column. Range: 0..ROSTER_SIZE. */
      revealedColumns: number;
      held: Set<number>;
      finalRoster: GeneratedCard[];
    }
  | {
      kind: "ab_transition";
      /** Final roster + held carry through so the strip / Layout B
       *  composition keeps rendering correctly during the transition
       *  beat. The transition itself is CSS-animation-driven (height,
       *  opacity, hero min-height); this state exists to gate WHICH
       *  values those animations animate TO. */
      finalRoster: GeneratedCard[];
      held: Set<number>;
    }
  | { kind: "handoff_resolving"; finalRoster: GeneratedCard[]; held: Set<number> }
  | {
      kind: "arc";
      resolvedRoster: GeneratedCard[];
      resolvedScore: number;
      resolvedTier: string;
    };

export interface H2HRecipientPlayProps {
  challengeCtx: ChallengeCtx;
  sport: string;
  /** Sport-specific atomic redraw. Held positions preserved; unheld
   *  refilled. Returns full roster in one call (path β requires
   *  surface-controlled reveal timing). */
  redrawRoster: (args: {
    currentCards: GeneratedCard[];
    lockedCardIds: Set<string>;
  }) => Promise<{ roster?: GeneratedCard[]; cards?: GeneratedCard[] }>;
  /** Sport-specific roster resolver. Called once at handoff time on the
   *  post-redraw roster (NOT initialRoster) to populate actualFp for
   *  the arc. */
  resolveRoster: (args: { finalCards: GeneratedCard[] }) => Promise<{
    roster?: GeneratedCard[];
    cards?: GeneratedCard[];
    mvpCardId?: string;
  }>;
  /** Sport-specific win-tier calculator. */
  calculateWinTier: (totalFp: number) => string;
  /** Pre-reveal strip card renderer (photo, salary, position, AVG).
   *  Used as the front face of every playing-mode strip cell. The
   *  container applies STRIP_CARD_SCALE so a hero-sized renderer (e.g.
   *  basketball's h2hArcRenderer with revealed=false) renders at strip
   *  footprint. */
  renderPlayingStripCard: CardRenderer;
  /** Forwarded to the inner H2HRecipientReveal at handoff. */
  renderBattlefieldCard: CardRenderer;
  renderOverlayCard: CardRenderer;
  /** Reveal-overlay CTA handlers — forwarded to H2HRecipientReveal. */
  onSendItBack: () => void;
  onTryAgain: () => void;
  onPlayOwnHand: () => void;
  onDismiss: () => void;
}

export function H2HRecipientPlay(props: H2HRecipientPlayProps) {
  const {
    challengeCtx, sport,
    redrawRoster, resolveRoster, calculateWinTier,
    renderPlayingStripCard, renderBattlefieldCard, renderOverlayCard,
    onSendItBack, onTryAgain, onPlayOwnHand, onDismiss,
  } = props;

  // FIX 1 — data-engine load gate. The playing surface mounts OUTSIDE
  // DailySeasonReelGate (App.tsx left-branches into H2HRecipientPlay
  // when h2hPlayingMode && challengeCtx), so the data engine is NOT
  // pre-loaded by the gate. setActiveSeason() invalidates whatever
  // was previously loaded (when seasons differ — or freshly null on
  // first mount), so we must call ensureLoaded() before any engine
  // call (redrawRoster, resolveRoster). State machine is gated on
  // dataReady; engineError surfaces a recoverable error state to the
  // user. ensureLoaded is idempotent (dataEngine has isLoaded() guard
  // at shared/engines/dataEngine.ts:119), so a same-season remount
  // doesn't re-fetch.
  // dataReady starts true if the engine is ALREADY loaded for this
  // season (e.g., the user previously navigated through DailySeasonReelGate
  // with a matching season). Synchronous short-circuit avoids a
  // useless re-render and lets the tests render → tap Deal without a
  // microtask flush in between.
  const [dataReady, setDataReady] = useState(() => isLoaded());
  const [dataLoadError, setDataLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    setActiveSeason(challengeCtx.season);
    // setActiveSeason invalidates the cache when keys differ — re-check
    // and short-circuit if we're still loaded after the pin.
    if (isLoaded()) {
      setDataReady(true);
      setDataLoadError(false);
      return;
    }
    let cancelled = false;
    setDataReady(false);
    setDataLoadError(false);
    ensureLoaded()
      .then(() => { if (!cancelled) setDataReady(true); })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[h2h-play] dataEngine load failed:", err);
        setDataLoadError(true);
      });
    return () => { cancelled = true; };
  }, [challengeCtx.season, loadAttempt]);
  // FIX 2 — engine error guardrail. Set when redrawRoster or
  // resolveRoster throws (or returns invalid). Surfaces the same
  // error state on the shell so the user is never dropped into a
  // degenerate zeroed reveal.
  const [engineError, setEngineError] = useState<null | "redraw" | "resolve">(null);
  const retryDataLoad = useCallback(() => {
    setEngineError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  // Recipient's starting hand carries NO held state — invariant.
  // challengeCtx.initialRoster is the SENDER's serialized initial deal;
  // in production basketball's deserializeRoster already zeros wasHeld,
  // but the dev mock route bypasses that path AND any future snapshot
  // regression could re-introduce wasHeld. Zeroing here is the source-
  // of-truth guarantee: the recipient never inherits hold flags.
  // lockedCardIds below builds off this array via cardId, so the zeroed
  // hand still resolves correctly to the engine's held-set logic.
  const initialRoster = useMemo(
    () => challengeCtx.initialRoster.map((c) => ({ ...c, wasHeld: false })),
    [challengeCtx.initialRoster],
  );

  const [state, setState] = useState<PlayingState>({ kind: "loading" });

  // Phase 5c S3 — recipient contextual intro. Flag flips true on first
  // hold-tap; sticky so Stage 1 doesn't re-appear if the user un-holds
  // every card back to held.size === 0. Past `hold_select`, both Stage 1
  // and Stage 2 collapse — VS treatment + existing headline take over.
  const [introDismissed, setIntroDismissed] = useState(false);

  // Anchor + intro Lines — memoized so PartsLine receives stable parts
  // arrays across renders (its identity-keyed reset effect would
  // otherwise re-fire on every keystroke equivalent). Anchor identity is
  // keyed on ctx fields the selector actually reads.
  const introAnchor = useMemo(
    () =>
      selectIntroAnchor({
        triggerType: challengeCtx.triggerType,
        senderCards: challengeCtx.resolvedSenderHand?.cards,
        anchorBasePlayerId: challengeCtx.anchorBasePlayerId ?? null,
        topGameTier: challengeCtx.topGameTier ?? null,
        sport,
      }),
    [
      challengeCtx.triggerType,
      challengeCtx.resolvedSenderHand,
      challengeCtx.anchorBasePlayerId,
      challengeCtx.topGameTier,
      sport,
    ],
  );

  // Stage 1/Stage 2 lines: lock the picked Line into a ref keyed on a
  // STABLE string signature, not the object refs. selectRecipientIntro /
  // selectRecipientDealNudge call pickWithAntiRepeat internally, which
  // is RANDOM — a useMemo whose deps include resolvedSenderHand (an
  // object that the parent may rebuild every render) would re-fire the
  // pick on every parent rerender and swap the displayed paragraph
  // mid-hold. Ref + signature comparison guarantees one pick per
  // mounted (ctx + anchor) tuple. The anchor useMemo above is fine —
  // selectIntroAnchor is deterministic (same inputs → same output).
  const introSig = [
    challengeCtx.triggerType ?? "",
    challengeCtx.resolvedSenderHand?.handId ?? "",
    challengeCtx.anchorBasePlayerId ?? "",
    challengeCtx.topGameTier ?? "",
    challengeCtx.nearMissGap ?? "",
    challengeCtx.nearMissNextTier ?? "",
    challengeCtx.challengerName ?? "",
    String(challengeCtx.targetScore),
  ].join("|");

  const stage1Ref = useRef<{ sig: string; line: Line }>({ sig: "", line: [""] });
  if (stage1Ref.current.sig !== introSig) {
    stage1Ref.current = {
      sig: introSig,
      line: selectRecipientIntro({
        triggerType: challengeCtx.triggerType,
        challengerName: challengeCtx.challengerName,
        targetScore: challengeCtx.targetScore,
        anchor: introAnchor,
        nearMissGap: challengeCtx.nearMissGap,
        nearMissNextTier: challengeCtx.nearMissNextTier,
      }),
    };
  }
  const stage1Line = stage1Ref.current.line;

  const stage2Ref = useRef<{ sig: string; line: Line }>({ sig: "", line: [""] });
  if (stage2Ref.current.sig !== introSig) {
    stage2Ref.current = {
      sig: introSig,
      line: selectRecipientDealNudge({
        triggerType: challengeCtx.triggerType,
        challengerName: challengeCtx.challengerName,
        targetScore: challengeCtx.targetScore,
        anchor: introAnchor,
      }),
    };
  }
  const stage2Line = stage2Ref.current.line;

  // Stable callback refs — prevent effect cleanups from clearing
  // pending timers when parent re-renders churn prop identity.
  const redrawRef = useRef(redrawRoster);
  const resolveRef = useRef(resolveRoster);
  const calcTierRef = useRef(calculateWinTier);
  useEffect(() => { redrawRef.current = redrawRoster; }, [redrawRoster]);
  useEffect(() => { resolveRef.current = resolveRoster; }, [resolveRoster]);
  useEffect(() => { calcTierRef.current = calculateWinTier; }, [calculateWinTier]);

  // ── loading → deal_in auto-advance ──────────────────────────────
  // pre_deal was killed (design-lock §1) — challenge entry goes
  // straight into Layout A's deal-in. The "loading" state replaces
  // pre_deal as the resting state when !dataReady; the moment
  // dataReady flips true (and no error is set), we auto-advance into
  // deal_in. Errors keep us in loading; the headline/CTA overrides
  // below render the engine-error treatment that pre_deal used to
  // host.
  useEffect(() => {
    if (state.kind !== "loading") return;
    if (!dataReady) return;
    if (dataLoadError || engineError !== null) return;
    setState({ kind: "deal_in", cardsLanded: 0 });
  }, [state, dataReady, dataLoadError, engineError]);

  // ── deal_in cascade ──────────────────────────────────────────────
  // All 6 lay-down timers + the hold_select handoff are scheduled
  // up-front the first time state enters deal_in (cardsLanded === 0).
  // Timer IDs live on a ref so the effect's re-run (triggered by each
  // intermediate state advance) does NOT clear pending timers — early
  // versions used a cleanup that cancelled the whole cascade as soon
  // as the first card landed.
  //
  // The dataReady gate is belt-and-suspenders: the auto-advance above
  // already only enters deal_in once dataReady is true, but a future
  // refactor that allows entering deal_in another way must not race
  // the engine load. Explicit guard.
  const cascadeTimersRef = useRef<number[]>([]);
  useEffect(() => {
    if (state.kind !== "deal_in") return;
    if (state.cardsLanded !== 0) return;
    if (!dataReady) return;
    if (cascadeTimersRef.current.length > 0) return; // already scheduled
    const timers: number[] = [];
    for (let n = 1; n <= ROSTER_SIZE; n++) {
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "deal_in" ? { kind: "deal_in", cardsLanded: n } : s,
        );
      }, DEAL_CASCADE_INTERVAL_MS * n);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      setState((s) =>
        s.kind === "deal_in" && s.cardsLanded === ROSTER_SIZE
          ? { kind: "hold_select", held: new Set(), previewedSlotIndex: null }
          : s,
      );
    }, DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 1));
    timers.push(finalId);
    cascadeTimersRef.current = timers;
  }, [state, dataReady]);
  // Unmount-only cleanup for all cascade timers (Try Again key bump
  // remounts the surface; pending timers from a previous cascade get
  // cleared here).
  useEffect(() => () => {
    cascadeTimersRef.current.forEach(clearTimeout);
    cascadeTimersRef.current = [];
  }, []);

  // ── redraw_running → your_redraw_flip ───────────────────────────
  // Held inside a ref so React 18 strict-mode double-invoke doesn't
  // double-fire the redraw API call. The effect captures the held set
  // at run time, fires redraw once, and transitions on resolution.
  const redrawFiredRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "redraw_running") return;
    if (redrawFiredRef.current) return;
    redrawFiredRef.current = true;

    const heldSet = state.held;
    const lockedCardIds = new Set<string>();
    initialRoster.forEach((card, i) => {
      if (heldSet.has(i)) {
        const id = String((card as any).cardId ?? (card as any).basePlayerId ?? "");
        if (id) lockedCardIds.add(id);
      }
    });

    let cancelled = false;
    (async () => {
      let finalRoster: GeneratedCard[] = initialRoster;
      let redrawThrew = false;
      try {
        const res = await redrawRef.current({
          currentCards: initialRoster,
          lockedCardIds,
        });
        finalRoster = (res?.roster ?? res?.cards ?? initialRoster) as GeneratedCard[];
      } catch (err) {
        // FIX 2 guardrail: a redraw throw means the engine is unavailable
        // (most often dataEngine not loaded — but covers any future
        // failure mode). We do NOT fall through to a zeroed reveal —
        // setEngineError surfaces the error state to the user via the
        // shell's hero copy + retry CTA below.
        // eslint-disable-next-line no-console
        console.error("[h2h-play] redrawRoster failed:", err);
        redrawThrew = true;
      }
      if (cancelled) return;
      if (redrawThrew) {
        setEngineError("redraw");
        return;
      }
      setState({
        kind: "your_redraw_flip",
        revealedColumns: 0,
        held: heldSet,
        finalRoster,
      });
    })();

    return () => { cancelled = true; };
  }, [state, initialRoster]);

  // ── your_redraw_flip stepper ────────────────────────────────────
  // Design-lock §3 step 2: the column-by-column flip on the BOTTOM
  // strip only (your replacements). Top strip is NOT touched here —
  // it remains absent (Layout A's collapsed-height treatment).
  //
  // Scheduling is identical to the prior column_flip stepper, but the
  // final transition targets ab_transition (step 3 of the sequence)
  // instead of handoff_resolving. Same up-front timer scheduling +
  // ref + unmount-only cleanup pattern (this component has timer-race
  // scars — discrete-state transitions, not chained setTimeouts from
  // a single handler).
  const columnTimersRef = useRef<number[]>([]);
  useEffect(() => {
    if (state.kind !== "your_redraw_flip") return;
    if (state.revealedColumns !== 0) return;
    if (columnTimersRef.current.length > 0) return;
    const timers: number[] = [];
    // Column N's flip kicks off when revealedColumns crosses N → N+1.
    // The first column fires at delay=0 (engine just returned; the
    // recipient doesn't need a pause before the cascade starts).
    for (let n = 1; n <= ROSTER_SIZE; n++) {
      const delay = (n - 1) * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "your_redraw_flip" ? { ...s, revealedColumns: n } : s,
        );
      }, delay);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      setState((s) =>
        s.kind === "your_redraw_flip" && s.revealedColumns === ROSTER_SIZE
          ? {
              kind: "ab_transition",
              finalRoster: s.finalRoster,
              held: s.held,
            }
          : s,
      );
    }, ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS));
    timers.push(finalId);
    columnTimersRef.current = timers;
  }, [state]);
  useEffect(() => () => {
    columnTimersRef.current.forEach(clearTimeout);
    columnTimersRef.current = [];
  }, []);

  // ── ab_transition → handoff_resolving (settle-pause) ────────────
  // Design-lock §3 step 3: ONE coordinated ~250–300ms beat where the
  // opponent strip + opponent hero slot fade/slide in face-up at the
  // top, the hero region expands from the Layout A small floor back
  // to the Layout B full floor (the flex layout pushes the bottom
  // strip down naturally — that IS the §3 step 3 "slide DOWN"), and
  // the opponent name stays fixed. All motion is CSS-driven (height,
  // opacity, hero min-height transitions); this effect just times
  // out the beat and advances to settle-pause.
  const abTransitionTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.kind !== "ab_transition") return;
    if (abTransitionTimerRef.current !== null) return;
    const id = window.setTimeout(() => {
      setState((s) =>
        s.kind === "ab_transition"
          ? {
              kind: "handoff_resolving",
              finalRoster: s.finalRoster,
              held: s.held,
            }
          : s,
      );
    }, AB_TRANSITION_DURATION_MS);
    abTransitionTimerRef.current = id;
  }, [state]);
  useEffect(() => () => {
    if (abTransitionTimerRef.current !== null) {
      clearTimeout(abTransitionTimerRef.current);
      abTransitionTimerRef.current = null;
    }
  }, []);

  // ── handoff_resolving (settle-pause): 1000ms hold + resolveRoster ─
  // Design-lock §3 step 4 / §9. The hold is repurposed as the
  // settle-pause that replaces the prior VS / Ready-Set-Go beat.
  // Mechanically: still fires resolveRoster() once partway through
  // the timeout, still advances to arc on resolve. The change is
  // semantic — the hero block renders TWO empty hero slots (not a
  // VS treatment), and PRE_REVEAL_HOLD_MS bumped 800 → 1000ms.
  const handoffFiredRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "handoff_resolving") return;
    if (handoffFiredRef.current) return;
    handoffFiredRef.current = true;

    const final = state.finalRoster;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      let resolved: GeneratedCard[] = final;
      let resolveThrew = false;
      try {
        const res = await resolveRef.current({ finalCards: final });
        resolved = (res?.roster ?? res?.cards ?? final) as GeneratedCard[];
      } catch (err) {
        // FIX 2 guardrail: resolve throw → same surface treatment as
        // redraw throw. Do NOT fall through to a degenerate reveal
        // where actualFp is silently 0 on every card.
        // eslint-disable-next-line no-console
        console.error("[h2h-play] resolveRoster failed:", err);
        resolveThrew = true;
      }
      if (cancelled) return;
      if (resolveThrew) {
        setEngineError("resolve");
        return;
      }
      const score = resolved.reduce((s, c: any) => s + Number(c.actualFp ?? 0), 0);
      const tier = calcTierRef.current(score) ?? "BUST";
      setState({
        kind: "arc",
        resolvedRoster: resolved,
        resolvedScore: score,
        resolvedTier: tier,
      });
    }, PRE_REVEAL_HOLD_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [state]);

  // ── Arc-composite flag (state 4) ────────────────────────────────
  // Per Fix C2 (lock rationale "without changing surfaces / single
  // coherent experience"; doc EDIT 2026-05-30 clarifying that S4
  // "mounts the existing reveal surface" means REUSE the
  // H2HRevealScreen COMPONENT, not unmount the playing canvas):
  // when state.kind === "arc", we DO NOT early-return / unmount the
  // playing canvas. The root <div data-h2h-recipient-play> stays
  // mounted with its locked piece-2a geometry, and
  // <H2HRecipientReveal> renders as a child later in DOM order. The
  // playing inner content fades to opacity 0 in parallel with the
  // reveal's own opacity-0→1 crossfade so the user sees a single
  // canvas transitioning, not two surfaces swapping.
  const arcComposite = state.kind === "arc";

  // ── Derived render state ────────────────────────────────────────
  const namedChallenger = isRealName(challengeCtx.challengerName)
    ? challengeCtx.challengerName
    : null;
  // Headline + CTA default to the state-machine-derived values. The
  // load gate (Fix 1) and engine-error guardrail (Fix 2) override them
  // when those flags are set, surfacing a loading / error treatment
  // inside the "loading" state's hero copy. Same shell, same labels,
  // only the hero copy + CTA shift — the user never sees a separate
  // "loading screen."
  let headline: string = deriveHeadline(state, namedChallenger);
  let cta = deriveCta(state);
  if (dataLoadError || engineError !== null) {
    headline = "Couldn't load challenge data. Try again.";
    cta = { label: "Try again", disabled: false, onClick: "retry" };
  } else if (!dataReady) {
    headline = "Loading challenge data…";
    cta = { label: "Loading…", disabled: true, onClick: null };
  }

  // Layout A composition (design-lock §2): opponent strip absent,
  // hero region at the smaller floor, your strip in the bottom zone.
  // Layout B composition (design-lock §4): opponent strip present
  // face-up, hero region at the full floor (which pushes your strip
  // down naturally via flex layout), both visible.
  //
  // ab_transition is included in Layout B for rendering purposes —
  // it's the beat WHERE the opponent strip animates in and the hero
  // expands. The CSS transitions on height/opacity/min-height do the
  // animation; classifying ab_transition as Layout B lets the strip
  // wrapper read height:80px and the shell read the full hero
  // min-height immediately on state entry, and the transitions
  // animate the TO values.
  const inLayoutA =
    state.kind === "loading" ||
    state.kind === "deal_in" ||
    state.kind === "hold_select" ||
    state.kind === "redraw_running" ||
    state.kind === "your_redraw_flip";
  const inLayoutB =
    state.kind === "ab_transition" ||
    state.kind === "handoff_resolving" ||
    state.kind === "arc";
  // Settle-pause: hero hosts two empty hero slots (both during the
  // A→B transition beat — so the empty boxes are visible THROUGHOUT
  // the slide — and during the settle-pause hold itself).
  const inSettlePauseRender =
    state.kind === "ab_transition" || state.kind === "handoff_resolving";

  // Reveal-foundation Feature 1 — pre-reveal CHARGE animation on the
  // empty hero slots during settle-pause. Cloned (not reused) from
  // H2HRevealScreen.tsx's h2h-card-pulse keyframe: a single rise/peak/
  // fade pulse doesn't read like a charge. A "build, hold at peak,
  // then release" shape feels like energy gathering before the reveal
  // — see the @keyframes h2h-play-hero-charge in chargeAndFlipCss()
  // below. The release is owned by the existing arc-composite
  // crossfade (innerOpacity → 0 over ARC_COMPOSITE_CROSSFADE_MS when
  // state transitions to "arc"), so the keyframe itself just ramps up
  // and holds at peak.
  //
  // Tier color per slot: each combatant's own tier — the opponent slot
  // glows the OPPONENT's matchup-0 card tier; the YOU slot glows the
  // RECIPIENT's matchup-0 card tier. Matchup-0 is the FIRST card to
  // reveal in the arc; reveal-order is unheld-asc-by-salary then held-
  // asc-by-salary (see buildRevealOrder in useH2HReveal.ts).
  //
  // Reduced motion: skip the animation entirely — consistent with how
  // useH2HReveal's reducedMotion path skips entrance + pulse beats.
  const reducedMotion = usePrefersReducedMotion();
  const matchup0Cards = useMemo(() => {
    // Sender (opponent) matchup-0: lowest-salary unheld card in the
    // sender hand's CARDS array. Falls back to lowest-salary card
    // when every card is held.
    const senderCards = challengeCtx.resolvedSenderHand?.cards ?? [];
    const recipientFinal: GeneratedCard[] =
      state.kind === "handoff_resolving" || state.kind === "ab_transition"
        ? state.finalRoster
        : initialRoster;
    const firstReveal = <T extends { wasHeld?: boolean; salary: number }>(arr: T[]): T | null => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => {
        const aHeld = a.wasHeld ? 1 : 0;
        const bHeld = b.wasHeld ? 1 : 0;
        if (aHeld !== bHeld) return aHeld - bHeld;
        return a.salary - b.salary;
      });
      return sorted[0];
    };
    return {
      opponent: firstReveal(senderCards as Array<{ wasHeld?: boolean; salary: number; tier: string }>),
      you: firstReveal(recipientFinal as unknown as Array<{ wasHeld?: boolean; salary: number; tier: string }>),
    };
  }, [challengeCtx.resolvedSenderHand, state, initialRoster]);

  const chargeOpponentColor =
    (matchup0Cards.opponent as any)?.tier
      ? TIER_ACCENT[(matchup0Cards.opponent as any).tier] ?? "rgba(255,255,255,0.5)"
      : "rgba(255,255,255,0.5)";
  const chargeYouColor =
    (matchup0Cards.you as any)?.tier
      ? TIER_ACCENT[(matchup0Cards.you as any).tier] ?? "rgba(255,255,255,0.5)"
      : "rgba(255,255,255,0.5)";
  const chargeActive = inSettlePauseRender && !reducedMotion;

  const bottomCellSlot = (i: number): BottomSlot => {
    switch (state.kind) {
      case "loading":
        // Empty placeholder cells while data loads / on engine error.
        // Inherits the same dashed-empty treatment pre_deal used to
        // host — the auto-advance to deal_in fires the moment data is
        // ready, so this is normally a single render.
        return { mode: "empty" };
      case "deal_in":
        return i < state.cardsLanded
          ? { mode: "face_up", card: initialRoster[i], held: false }
          : { mode: "empty" };
      case "hold_select":
        return {
          mode: "face_up",
          card: initialRoster[i],
          held: state.held.has(i),
        };
      case "redraw_running": {
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        // Path β: unheld slots are face-down WITHOUT mounting any
        // replacement value on the front face. The replacement card
        // for this slot is held in component state but not bound to
        // the renderer until your_redraw_flip reaches it.
        return { mode: "face_down" };
      }
      case "your_redraw_flip": {
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        if (i < state.revealedColumns) {
          // First time the replacement enters the DOM.
          return {
            mode: "face_up",
            card: state.finalRoster[i],
            held: false,
          };
        }
        // Path β: still covered, still NOT in DOM.
        return { mode: "face_down" };
      }
      case "ab_transition":
      case "handoff_resolving": {
        // Layout B end-state composition: all 6 bottom cells face-up,
        // held cells render initialRoster + held-marker, replacement
        // cells render finalRoster. Held/replacement set matches what
        // your_redraw_flip ended with.
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        return { mode: "face_up", card: state.finalRoster[i], held: false };
      }
      default:
        return { mode: "empty" };
    }
  };

  // ── Event handlers ──────────────────────────────────────────────
  // handleDeal removed: pre_deal is killed (design-lock §1). The
  // loading → deal_in auto-advance effect above replaces the Deal-CTA
  // tap as the entry into the cascade.

  const handleRetry = () => {
    // FIX 2: on Try Again, route through the parent's onTryAgain so
    // the playing root is remounted with a clean state (parent bumps
    // h2hPlayKey). The new mount re-runs the ensureLoaded effect from
    // scratch. For transient data-load failures (network blip) this
    // recovers cleanly; for persistent failures the user sees the
    // same error state again. Either way, no degenerate reveal.
    onTryAgain();
  };

  const handleDraw = () => {
    if (state.kind !== "hold_select") return;
    setState({ kind: "redraw_running", held: state.held });
  };

  /** Polish #11 — preview-then-hold tap dispatch (per design-lock §3 truth table).
   *
   *  Truth table:
   *    previewedSlotIndex !== i  → set previewedSlotIndex = i        (preview)
   *    else if !held.has(i)      → held.add(i)                       (hold)
   *    else                      → held.delete(i)                    (unhold)
   *
   *  Moving the preview NEVER changes `held` — only the second tap on the
   *  same card (the confirmed-tap) toggles hold. Preview-only cards are
   *  excluded from the redraw payload at Draw time (per §8 invariant 2).
   *
   *  Intro dismissal fires on FIRST preview tap (any tap moves preview,
   *  so any tap dismisses). Idempotent — React bails on identical state.
   *  Stage 1 → Stage 2 swap continues to key on `held.size > 0` (existing
   *  logic naturally fires on the first confirmed hold). */
  const onTap = (i: number) => {
    if (state.kind !== "hold_select") return;
    setIntroDismissed(true);
    setState((s) => {
      if (s.kind !== "hold_select") return s;
      if (s.previewedSlotIndex !== i) {
        // Preview or move-preview. No hold change.
        return { kind: "hold_select", held: s.held, previewedSlotIndex: i };
      }
      // Second tap on the already-previewed card: flip its held bit.
      const next = new Set(s.held);
      if (next.has(i)) next.delete(i); else next.add(i);
      return { kind: "hold_select", held: next, previewedSlotIndex: s.previewedSlotIndex };
    });
  };

  // Compute name labels once near the top of the render so they're
  // byte-identical to what H2HRecipientReveal computes downstream
  // (no flicker across the S3→S4 boundary). Per doc EDIT B3 (lock
  // e6fe662): name labels show in ALL states, not only at reveal.
  const topLabel = isRealName(challengeCtx.challengerName)
    ? (challengeCtx.challengerName as string)
    : "your friend";
  // Design-lock §1 / §2 / §4 / §5: bottom-zone label is the literal
  // string "YOU" across all states — not the random handle. The
  // getNickname() resolution previously seeded a random nickname into
  // the label when no real name was set; "YOU" makes the recipient
  // unambiguous in both Layout A and Layout B.
  const bottomLabel = "YOU";

  // Stage text typography (introTypography hoisted up here so it's in
  // scope for the topStripSlot composition below). Both Stage 1/2 banks
  // and the instructional fallback share it.
  //
  // hold_select vertical-budget fix (docs/holdselect-vertical-budget-
  // design-lock.md §2(1), 2026-06-01): font is fluid via clamp() so
  // tight viewports tighten and roomy ones render generous. lineHeight
  // 1.28 (slightly tighter than the prior 1.3 to maximize legibility
  // within the 3-line budget). The 3-line budget is reserved at the
  // CONTAINER level (see topStripSlot below) so the stage-text height
  // is DETERMINISTIC regardless of which bank line was picked —
  // killing the 64↔92px randomization that wedged the prior layout.
  // Words are unchanged; this is display-only.
  const heldCount = state.kind === "hold_select" ? state.held.size : 0;
  const showStage2 = state.kind === "hold_select" && heldCount > 0;
  const showStage1 = state.kind === "hold_select" && heldCount === 0 && !introDismissed;
  const senderWinTier = challengeCtx.resolvedSenderHand?.tier;
  const missTierLabel = challengeCtx.nearMissNextTier ?? undefined;
  const introTypography: React.CSSProperties = {
    fontSize: INTRO_FONT_CLAMP,
    fontWeight: 800,
    lineHeight: INTRO_LINE_HEIGHT,
    maxWidth: 360,
    // -webkit-line-clamp triad — caps at 3 lines if a bank line ever
    // exceeds the budget (vetted banks shouldn't, but this is
    // belt-and-suspenders so the layout never destabilizes on a
    // surprise long line).
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  };

  // Top strip slot — sender's roster cells inside the shell's top frame.
  // Per doc EDIT B1, the bottom container's slots ARE the playing-mode
  // "strip" — no parallel bare strip. The cells keep the Fix B scaffold;
  // only WHERE they render moves into the shell.
  //
  // Layout A / Layout B restructure (design-lock §2 / §4):
  //   - Layout A states (loading, deal_in, hold_select, redraw_running,
  //     your_redraw_flip): opponent strip ABSENT. The strip wrapper
  //     collapses to ZERO HEIGHT (overflow:hidden, opacity 0, aria-hidden,
  //     pointer-events none) — reclaiming the 80px + 4px gap from the
  //     budget. The TopStripCell components stay mounted so the strip's
  //     reappearance in B doesn't trigger a layout-thrash on first paint.
  //   - Layout B states (ab_transition, handoff_resolving, arc): opponent
  //     strip PRESENT face-up. The CSS height/opacity transition (300ms,
  //     matched to AB_TRANSITION_DURATION_MS) animates the strip in
  //     during the A→B beat. No per-cell flip — opponent appears face-up
  //     directly (the recipient saw the lineup on the challenge landing
  //     page before accepting).
  //
  // Polish #11 (carried forward, docs/11-preview-then-hold-design-lock.md
  // §2/§10): the stage text (Stage 1 / Stage 2 / instructional headline)
  // is relocated INTO the top ZonePanel during Layout A's hold_select
  // sub-state, sitting directly under the opponent name label. The text
  // container reserves a DETERMINISTIC 3-line budget
  // (INTRO_3LINE_BUDGET_CSS) so different bank lines don't drive
  // different topZone heights.
  //
  // Pass 1 (Layout A/B restructure) extends the stage-text region to
  // render during deal_in too, as the deal-intro beat per §2 — Pass 1
  // renders a placeholder (the existing headline) so the structure is
  // in place; Pass 2 fills the placeholder with the templated
  // {opponent}/{score} bank.
  //
  // BUG-1 FIX (strip-jump): the region's container has a deterministic
  // INTRO_3LINE_BUDGET_CSS height (~63px), so its mount/unmount changes
  // the top-zone height by exactly that amount, which shifts the
  // recipient mini-strip's Y-position. The previous gate
  // ({deal_in, hold_select}) unmounted the region the moment Draw
  // was tapped (hold_select → redraw_running), jumping the strip UP
  // by ~67px BEFORE the deliberate ab_transition slide-down. The fix:
  // keep the container MOUNTED with its full height-budget across all
  // Layout A states EXCEPT loading (loading has no stage-text content
  // — the hero region hosts the loading copy). Strip Y is then
  // byte-identical across hold_select / redraw_running /
  // your_redraw_flip. The region content goes empty during
  // redraw_running / your_redraw_flip (the hero zone shows "Drawing…")
  // — the empty placeholder keeps the container's height stable so the
  // strip doesn't shift. The intended slide fires only at
  // ab_transition (where the hero region expands from the Layout A
  // small floor back to the Layout B full floor and the opponent strip
  // uncollapses — that's where the strip is SUPPOSED to move).
  const showStageTextRegion =
    state.kind === "deal_in" ||
    state.kind === "hold_select" ||
    state.kind === "redraw_running" ||
    state.kind === "your_redraw_flip";
  const topStripSlot = (
    <>
      <div
        data-h2h-play-top-strip="true"
        data-h2h-play-top-strip-collapsed={inLayoutA ? "true" : undefined}
        aria-hidden={inLayoutA ? "true" : undefined}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: STRIP_GAP_PX,
          height: inLayoutA ? 0 : MINI_CELL_HEIGHT_PX,
          overflow: "hidden",
          opacity: inLayoutA ? 0 : 1,
          pointerEvents: inLayoutA ? "none" : "auto",
          // Strip restore runs in lockstep with the hero expansion
          // (HERO_MIN_HEIGHT_TRANSITION_MS = 250ms) and the
          // AB_TRANSITION_DURATION_MS beat (300ms). All three motions
          // animate together for the one coordinated A→B beat
          // (design-lock §3 step 3).
          transition: `height ${AB_TRANSITION_DURATION_MS}ms ease, opacity ${AB_TRANSITION_DURATION_MS}ms ease`,
        }}
      >
        {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
          const senderCard = challengeCtx.resolvedSenderHand?.cards[i] ?? null;
          return (
            <TopStripCell
              key={`top-${i}`}
              i={i}
              card={senderCard as unknown as H2HCard | null}
              renderCard={renderPlayingStripCard}
            />
          );
        })}
      </div>
      {/* Stage-text region in the top ZonePanel.
          - hold_select: Stage 1 / Stage 2 / instructional headline
            (carried forward from #11).
          - deal_in: PASS 1 PLACEHOLDER — renders the existing headline
            ("Here's the same starting hand as {challenger}.") in the
            same slot. PASS 2 (deal-intro bank) fills this branch with
            the templated {opponent}/{score} line; the dismiss-on-state-
            transition (deal_in → hold_select replaces deal-intro with
            Stage 1 via state advance) is already wired by the
            showStageTextRegion gate below.
          Lock §2(1): outer container reserves a deterministic 3-line
          budget via INTRO_3LINE_BUDGET_CSS so the topZone height stays
          stable regardless of which bank line was picked. */}
      {showStageTextRegion && (
        <div
          data-h2h-play-stage-text="true"
          style={{
            display: "flex",
            justifyContent: "center",
            textAlign: "center",
            paddingLeft: 12,
            paddingRight: 12,
            color: "#EAF0FF",
            // Deterministic budget — kills the 64↔92px randomization.
            // 3 lines at the fluid font-size's natural lineHeight.
            // overflow:hidden caps any surprise long-line, but vetted
            // banks fit within 3 lines. content-box so the line-clamp
            // budget is the FULL height (padding doesn't eat into it).
            height: INTRO_3LINE_BUDGET_CSS,
            boxSizing: "content-box",
            overflow: "hidden",
          }}
        >
          {state.kind === "redraw_running" || state.kind === "your_redraw_flip" ? (
            // BUG-1 FIX: empty placeholder during the redraw beat so
            // the container keeps its INTRO_3LINE_BUDGET_CSS reserved
            // height (no strip Y-shift) without duplicating the
            // "Drawing…" headline (which lives in the hero region for
            // these states). The container itself owns the height
            // budget; this inner is purely a layout-stable spacer.
            <div
              data-h2h-play-intro="redraw-empty-spacer"
              style={{ width: "100%" }}
            />
          ) : state.kind === "deal_in" ? (
            // PASS 1 PLACEHOLDER — deal-intro beat. Pass 2 will replace
            // this branch with a templated bank (selectRecipientDealIntro)
            // that interpolates {opponent} and {score} via the existing
            // substituteRecipientLine pipeline in chadChallenge.ts (the
            // mechanism already supports {challengerName} / {targetScore}
            // tokens — adding the bank + selector is the only Pass-2
            // work needed here). For Pass 1, render the existing
            // deriveHeadline copy ("Here's the same starting hand as
            // {challenger}.") in the same slot so the structure is
            // visually validated. The dismiss-on-state-transition is
            // already wired: deal_in → hold_select naturally swaps in
            // Stage 1 via the showStage1 branch below.
            <div
              data-h2h-play-intro="deal-intro-placeholder"
              style={{ width: "100%" }}
            >
              <div data-h2h-play-headline="true" style={introTypography}>
                {headline}
              </div>
            </div>
          ) : showStage1 ? (
            <div data-h2h-play-intro="stage1" style={{ width: "100%" }}>
              <PartsLine
                key="recipient-stage1"
                parts={stage1Line}
                rush
                winTier={senderWinTier}
                missTier={missTierLabel}
                style={introTypography}
              />
            </div>
          ) : showStage2 ? (
            <div data-h2h-play-intro="stage2" style={{ width: "100%" }}>
              <PartsLine
                key="recipient-stage2"
                parts={stage2Line}
                rush
                winTier={senderWinTier}
                missTier={missTierLabel}
                style={introTypography}
              />
            </div>
          ) : (
            <div data-h2h-play-headline="true" style={introTypography}>
              {headline}
            </div>
          )}
        </div>
      )}
    </>
  );

  const bottomStripSlot = (
    <div
      data-h2h-play-bottom-strip="true"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: STRIP_GAP_PX,
        height: MINI_CELL_HEIGHT_PX,
      }}
    >
      {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
        const slot = bottomCellSlot(i);
        return (
          <BottomStripCell
            key={`bottom-${i}`}
            i={i}
            slot={slot}
            renderCard={renderPlayingStripCard}
            tappable={state.kind === "hold_select"}
            onTap={() => onTap(i)}
          />
        );
      })}
    </div>
  );

  // Hero slot — Layout A / Layout B restructure (design-lock §2 / §4).
  //
  // Layout A states render the preview window or a headline:
  //   - hold_select: PREVIEW WINDOW — a big card via renderBattlefieldCard
  //     when previewedSlotIndex !== null, or a defined empty box (dashed
  //     border) when null. Carried forward from Polish #11.
  //   - deal_in: empty preview box (the recipient hasn't tapped yet;
  //     the design-lock §2 "Your single hero preview box — empty
  //     bordered box" applies during deal-in too).
  //   - loading / redraw_running / your_redraw_flip: fall through to the
  //     headline div (loading copy / "Drawing…" / etc.).
  //
  // Layout B states (ab_transition + handoff_resolving / settle-pause)
  // render TWO STACKED EMPTY HERO SLOTS — the visual "stillness"
  // composition where both lineups are present but neither side's hero
  // card has been revealed yet (§3 step 4). The boxes use the same
  // dashed-border treatment the hold_select preview-empty uses, sized
  // to one battlefield card each, with a gap matching the reveal-time
  // grid.
  //
  // arc: composite overlay takes over (H2HRecipientReveal mounts as a
  // descendant and renders the reveal arc); the inner content fades
  // to opacity 0 so the hero block here is no longer visible.
  //
  // VS treatment (formerly handoff_resolving) is KILLED per
  // design-lock §1 / §5 — settle-pause's empty-hero composition
  // replaces it.

  // Preview card size — matches one hero card's natural footprint per
  // the shell's HERO_MIN_HEIGHT_CSS calc: width = min(145px, 32vw);
  // height = width * (478/329). Same shape and aspect as the reveal-
  // time hero cards.
  const previewCardWidthCss = "min(145px, 32vw)";
  const previewCardHeightCss = `calc(${previewCardWidthCss} * ${(478 / 329).toFixed(6)})`;
  const previewedSlotIndex =
    state.kind === "hold_select" ? state.previewedSlotIndex : null;
  const previewedCard =
    previewedSlotIndex !== null ? initialRoster[previewedSlotIndex] : null;
  // Held state overlay on the previewed card. Mirrors BottomStripCell's
  // pattern — override wasHeld on the card object so the sport
  // renderer's H-mark logic (CardFront's locked indicator) reads the
  // recipient's tap state, not the sender's snapshot.
  const previewedCardHeld =
    previewedSlotIndex !== null && state.kind === "hold_select"
      ? state.held.has(previewedSlotIndex)
      : false;
  // Layout B settle-pause gap between the two stacked empty hero slots
  // — matches H2HBoardShell.HERO_MIN_HEIGHT_CSS's "+ 14px" battlefield
  // row gap so the empty composition lands at the same Y-bounds as the
  // reveal arc's battlefield grid (no layout shift when the composite
  // arc mounts).
  const SETTLE_HERO_GAP_PX = 14;

  const heroSlot = (
    <div
      data-h2h-play-hero-zone="true"
      style={{
        flex: "1 1 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 20px",
      }}
    >
      {inSettlePauseRender ? (
        // Layout B settle-pause: two stacked empty hero slots
        // (opponent top, yours bottom). Dashed-border boxes, sized one
        // battlefield card each; gap matches the reveal-time grid.
        // Empty headline; stillness. Replaces the prior VS beat.
        <div
          data-h2h-play-settle-hero="true"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: SETTLE_HERO_GAP_PX,
            width: "100%",
          }}
        >
          <div
            data-h2h-play-settle-hero-slot="opponent"
            data-h2h-play-charge={chargeActive ? "true" : "false"}
            style={{
              width: previewCardWidthCss,
              height: previewCardHeightCss,
              borderRadius: 8,
              border: "1px dashed rgba(255,255,255,0.18)",
              background: "transparent",
              boxSizing: "border-box",
              // Reveal-foundation Feature 1 — tier-colored charge that
              // builds over the settle-pause hold (PRE_REVEAL_HOLD_MS).
              // Skipped under prefers-reduced-motion.
              animation: chargeActive
                ? `h2h-play-hero-charge ${PRE_REVEAL_HOLD_MS}ms ease-in forwards`
                : "none",
              ["--h2h-charge-color" as any]: chargeOpponentColor,
            }}
          />
          <div
            data-h2h-play-settle-hero-slot="you"
            data-h2h-play-charge={chargeActive ? "true" : "false"}
            style={{
              width: previewCardWidthCss,
              height: previewCardHeightCss,
              borderRadius: 8,
              border: "1px dashed rgba(255,255,255,0.18)",
              background: "transparent",
              boxSizing: "border-box",
              animation: chargeActive
                ? `h2h-play-hero-charge ${PRE_REVEAL_HOLD_MS}ms ease-in forwards`
                : "none",
              ["--h2h-charge-color" as any]: chargeYouColor,
            }}
          />
        </div>
      ) : state.kind === "hold_select" || state.kind === "deal_in" ? (
        // Preview window. Either the previewed card (big, via
        // renderBattlefieldCard) or a defined empty box with visible
        // border. Card wrapped in a sized container so both states
        // occupy the same vertical footprint (no layout jump on first
        // preview tap). deal_in always renders the empty variant —
        // the recipient hasn't tapped yet, and the design-lock §2
        // calls for "Your single hero preview box — empty bordered
        // box" during deal-in.
        state.kind === "hold_select" && previewedSlotIndex !== null && previewedCard ? (
          <div
            data-h2h-play-preview="card"
            data-h2h-play-preview-slot={previewedSlotIndex}
            data-h2h-play-preview-held={previewedCardHeld ? "true" : "false"}
            style={{
              width: previewCardWidthCss,
              height: previewCardHeightCss,
              borderRadius: 8,
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {renderBattlefieldCard(
              {
                ...(previewedCard as unknown as H2HCard),
                wasHeld: previewedCardHeld,
              } as H2HCard,
            )}
          </div>
        ) : (
          <div
            data-h2h-play-preview="empty"
            style={{
              width: previewCardWidthCss,
              height: previewCardHeightCss,
              borderRadius: 8,
              border: "1px dashed rgba(255,255,255,0.18)",
              background: "transparent",
              boxSizing: "border-box",
            }}
          />
        )
      ) : (
        // loading / redraw_running / your_redraw_flip / arc: headline
        // div. arc fades to opacity 0 via the inner-content composite
        // (compositeOverlay sibling owns the visible content); the
        // headline div under it is empty (deriveHeadline returns "").
        <div
          data-h2h-play-headline="true"
          style={{
            ...introTypography,
            opacity:
              state.kind === "redraw_running" ||
              state.kind === "your_redraw_flip"
                ? 0.7
                : 1,
            transition: "opacity 200ms ease",
          }}
        >
          {headline}
        </div>
      )}
    </div>
  );

  // Reserved CTA — sits BELOW the bottom zone, inside the shell's
  // reserved-bottom spacer region (via H2HBoardShell's belowBoard slot).
  // Bug 4: gate the play-shell CTA on a non-empty label. ab_transition,
  // handoff_resolving, and arc all return label="" from deriveCta — the
  // wrapper STAYS (preserves the reserved bottom height so the layout
  // doesn't jump when the results overlay crossfades in), but the
  // button doesn't render. The wrapper's minHeight is what reserves
  // the vertical slot; no flex jump.
  const ctaVisible = cta.label !== "";
  const belowBoardSlot = (
    <div
      data-h2h-play-reserved="true"
      style={{
        paddingTop: RESERVED_PADDING_TOP_PX,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: RESERVED_MIN_HEIGHT_PX,
        width: "100%",
      }}
    >
      {ctaVisible && (
        <button
          data-h2h-play-cta="true"
          data-cta-label={cta.label}
          disabled={cta.disabled}
          onClick={
            cta.onClick === "draw" ? handleDraw
              : cta.onClick === "retry" ? handleRetry
              : undefined
          }
          style={{
            padding: "16px 32px",
            borderRadius: 14,
            background: cta.disabled ? "rgba(255,177,74,0.25)" : "#FFB14A",
            border: "none",
            color: "#070A12",
            fontSize: 17,
            fontWeight: 900,
            cursor: cta.disabled ? "default" : "pointer",
            minWidth: 200,
            fontFamily: "inherit",
            transition: "background 150ms ease",
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );

  // State-4 composite — Fix C2: <H2HRecipientReveal/> mounts INSIDE
  // the playing shell's outer fixed div (via the compositeOverlay slot)
  // so the reveal is a DESCENDANT of the playing root (Fix C2 assertion
  // `playingRoot.contains(revealRoot)`). The reveal then renders its
  // own H2HBoardShell internally via H2HRevealScreen — identical chrome,
  // identical labels (via challengeCtx threading through the same
  // isRealName + getNickname paths). The user sees one coherent framed
  // board across the S3→S4 boundary; only the slot CONTENTS visibly
  // transition (playing-inner fades to 0; reveal arc fades in).
  const compositeOverlay = arcComposite && state.kind === "arc" ? (
    <H2HRecipientReveal
      challengeCtx={challengeCtx}
      myScore={state.resolvedScore}
      myRoster={state.resolvedRoster}
      myWinTier={state.resolvedTier}
      gameState={"REVEALING" as any}
      bypassGameStateGate
      sport={sport}
      renderBattlefieldCard={renderBattlefieldCard}
      renderOverlayCard={renderOverlayCard}
      onSendItBack={onSendItBack}
      onTryAgain={onTryAgain}
      onPlayOwnHand={onPlayOwnHand}
      onDismiss={onDismiss}
    />
  ) : null;

  return (
    <>
      <H2HBoardShell
        surfaceKind="playing"
        topLabel={topLabel}
        bottomLabel={bottomLabel}
        topStrip={topStripSlot}
        bottomStrip={bottomStripSlot}
        hero={heroSlot}
        belowBoard={belowBoardSlot}
        rootDataAttrs={{
          "data-h2h-recipient-play": "true",
          "data-playing-state": state.kind,
        }}
        innerOpacity={arcComposite ? 0 : 1}
        innerTransitionMs={ARC_COMPOSITE_CROSSFADE_MS}
        innerDataAttr="data-h2h-play-inner"
        compositeOverlay={compositeOverlay}
        // Vertical-budget overrides — design-lock §6 / Carry-forward:
        // the responsive sizing + scroll-floor rules now apply to BOTH
        // Layout A AND Layout B (the prior lock scoped them to
        // hold_select only). Hero floor stays compressed throughout
        // Layout A (opponent strip absent; the single-card preview
        // window sits at a smaller minHeight) and expands to the full
        // two-card floor for Layout B (the expansion IS the §3 step 3
        // "your strip slides down" — the flex layout pushes the bottom
        // strip down naturally as the hero region grows). The shell's
        // min-height transition (HERO_MIN_HEIGHT_TRANSITION_MS = 250ms)
        // does the animation, synced with AB_TRANSITION_DURATION_MS.
        //
        // Inter-zone margins + scroll-fallback engage across ALL
        // non-arc states. Layout B is denser (two strips + two empty
        // hero slots in settle-pause; battlefield grid + scores +
        // headline + CTAs in arc) — that's where the comfortable
        // floor most engages and the prior img-5 CTA clip surfaces.
        // Above the floor: no scroll, sticky degrades to relative,
        // no visible change.
        heroMinHeight={
          inLayoutA ? HERO_MIN_HEIGHT_HOLD_SELECT_CSS : undefined
        }
        topZoneMarginBottom={
          inLayoutA ? HOLD_SELECT_TOP_ZONE_MARGIN_CSS : undefined
        }
        heroMarginBottom={
          inLayoutA ? HOLD_SELECT_HERO_MARGIN_CSS : undefined
        }
        // Scroll fallback engages across all NON-arc states (arc
        // composites the reveal shell over the playing inner, which
        // fades to opacity 0 — making the playing inner scrollable
        // beneath an invisible layer would only confuse touch routing).
        innerScrollable={!arcComposite}
        belowBoardSticky={!arcComposite}
      />
      {/* Flip animation keyframe + 3D scaffold styles. Lives outside
          the shell so the <style> element doesn't interact with the
          shell's flex children — it's a sibling of the shell. The
          flip CSS now only governs BottomStripCell (your-redraw
          flip); TopStripCell renders front-only with no flip. */}
      <style>{flipCss(COLUMN_FLIP_DURATION_MS)}</style>
    </>
  );
}

// ── Sub-types + sub-components ──────────────────────────────────────

type BottomSlot =
  | { mode: "empty" }
  | { mode: "face_down" }
  | { mode: "face_up"; card: GeneratedCard; held: boolean };

function deriveHeadline(
  state: PlayingState,
  namedChallenger: string | null,
): string {
  switch (state.kind) {
    case "loading":
      // Overridden by the !dataReady / dataLoadError / engineError
      // block above to "Loading challenge data…" or the error copy.
      // The bare loading state without those flags is only visible
      // for a microtask before the auto-advance fires.
      return "";
    case "deal_in":
      // PASS 1 PLACEHOLDER: this copy renders in the top-zone stage-
      // text region under the deal-intro-placeholder branch, NOT in
      // the hero region (hero shows the empty preview box during
      // deal_in per design-lock §2). PASS 2 swaps this copy out for
      // a templated bank line interpolating {opponent}/{score}.
      return `Here's the same starting hand as ${namedChallenger ?? "your friend"}.`;
    case "hold_select":
      // Polish #11 — instructional copy describes the preview-then-hold
      // interaction. Surfaced as the headline-fallback in the top
      // stage-text region when Stage 1 has dismissed but no card is
      // confirmed-held yet (heldCount===0 && introDismissed).
      return "Tap a card to preview. Tap again to hold.";
    case "redraw_running":
    case "your_redraw_flip":
      return "Drawing…";
    case "ab_transition":
    case "handoff_resolving":
      // Design-lock §3 step 4: settle-pause is stillness — empty
      // headline. The hero region renders the two stacked empty hero
      // slots ([data-h2h-play-settle-hero]); no VS, no copy.
      return "";
    case "arc":
      return "";
  }
}

function deriveCta(state: PlayingState): {
  label: string;
  disabled: boolean;
  onClick: "draw" | "retry" | null;
} {
  switch (state.kind) {
    case "loading":
      // Overridden by the !dataReady / dataLoadError / engineError
      // block above to "Loading…" disabled (or "Try again" enabled
      // on error). The bare loading state without those flags is
      // only visible for a microtask before the auto-advance fires.
      return { label: "Loading…", disabled: true, onClick: null };
    case "deal_in":
      // Deal CTA is killed (design-lock §1) — challenge entry goes
      // straight into deal_in. The CTA sits in its Draw slot
      // disabled until hold_select.
      return { label: "Draw", disabled: true, onClick: null };
    case "hold_select":
      return { label: "Draw", disabled: false, onClick: "draw" };
    case "redraw_running":
    case "your_redraw_flip":
      return { label: "Drawing…", disabled: true, onClick: null };
    case "ab_transition":
    case "handoff_resolving":
    case "arc":
      // Bug 4: settle-pause + reveal states have no real user action —
      // the prior "Revealing…" disabled label was a dead placeholder
      // (no onClick, no visual progress, just static text). HIDE the
      // CTA entirely during these beats. The empty label is the
      // structural signal to the render below not to mount the
      // button — the reserved-bottom wrapper STAYS so the layout
      // height is reserved (no jump when the results overlay
      // crossfades in with its own CTA). When the play-shell fades
      // out at arc-composite and H2HResultsOverlay mounts, the
      // overlay's own primary CTA (Send It Back / Try Again /
      // Play your own hand) takes over.
      return { label: "", disabled: true, onClick: null };
  }
}

/** Top strip cell — sender slot. Always renders FACE-UP directly: no
 *  rotateY flip, no perspective, no back-face scaffold. The opponent
 *  card-flip is killed per design-lock §1 / §3 (the recipient saw the
 *  lineup on the challenge landing page before accepting — they were
 *  never face-down in the recipient flow).
 *
 *  Visibility in Layout A is owned by the parent strip-wrapper's
 *  height/opacity transition (height:0 + opacity:0 during Layout A,
 *  height:80 + opacity:1 during Layout B). The cells stay mounted
 *  throughout so the strip's reappearance in B doesn't trigger a
 *  layout-thrash on first paint.
 *
 *  When card is null (sender hand not yet present in challengeCtx —
 *  rare in production; the prefetch typically lands before the
 *  recipient finishes hold_select), falls back to the generic "?"
 *  placeholder. */
function TopStripCell({
  i,
  card,
  renderCard,
}: {
  i: number;
  card: H2HCard | null;
  renderCard: CardRenderer;
}) {
  return (
    <div
      data-testid={`top-strip-up-${i}`}
      data-h2h-play-top-cell={i}
      data-face-up="true"
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <div
        data-h2h-play-top-front="true"
        style={{
          position: "absolute",
          inset: 0,
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {card ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: STRIP_CARD_NATURAL_WIDTH_PX,
              height: STRIP_CARD_NATURAL_HEIGHT_PX,
              transform: `scale(${STRIP_CARD_SCALE})`,
              transformOrigin: "top left",
              pointerEvents: "none",
            }}
          >
            {renderCard(card, { revealed: false })}
          </div>
        ) : (
          <SenderUpPlaceholder />
        )}
      </div>
    </div>
  );
}

/** Bottom strip cell. Owns the 3D flip wrapper. Front face renders the
 *  sport-provided playing-strip card (only mounted when face-up — path
 *  β). Back face is the card-back visual. Tap-to-toggle hold during
 *  state 2 hold_select. */
function BottomStripCell({
  i,
  slot,
  renderCard,
  tappable,
  onTap,
}: {
  i: number;
  slot: BottomSlot;
  renderCard: CardRenderer;
  tappable: boolean;
  onTap: () => void;
}) {
  if (slot.mode === "empty") {
    return (
      <div
        data-testid={`bottom-strip-empty-${i}`}
        data-h2h-play-bottom-cell={i}
        data-face-up="false"
        data-empty="true"
        style={{
          width: MINI_CELL_WIDTH_PX,
          height: MINI_CELL_HEIGHT_PX,
          flexShrink: 0,
          borderRadius: 6,
          border: "1px dashed rgba(255,255,255,0.18)",
          background: "transparent",
        }}
      />
    );
  }

  const faceUp = slot.mode === "face_up";
  const heldRing = faceUp && slot.held;
  const testId = faceUp ? `bottom-strip-up-${i}` : `bottom-strip-down-${i}`;
  // path-β assertion-friendly: when face_down, the front face's
  // renderer subtree is NOT mounted (no replacement value in DOM).
  return (
    <div
      data-testid={testId}
      data-h2h-play-bottom-cell={i}
      data-face-up={faceUp ? "true" : "false"}
      data-held={heldRing ? "true" : "false"}
      onClick={tappable ? onTap : undefined}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        flexShrink: 0,
        perspective: 600,
        cursor: tappable ? "pointer" : "default",
      }}
    >
      <div
        className="h2h-play-flip-inner"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* Back face (card-back). Always mounted so it covers during
            face-down. Sits at rotateY(180) so it's visible when wrapper
            is rotated 180deg. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardBack side="back" />
        </div>
        {/* Front face (sport renderer). ONLY mounted when face-up —
            path β: replacement values must not be in the DOM until the
            column-flip exposes them.
            Inner scaffold matches H2HRevealScreen.tsx:575-591 exactly:
            position:absolute + top/left:0 + explicit natural width AND
            height + transform:scale + transformOrigin:"top left". The
            outer is NOT a flex container — flex-centering with
            transformOrigin:top-left positions the scaled card off the
            visible cell (negative coords clipped by overflow:hidden). */}
        {faceUp && (
          <div
            data-h2h-play-front="true"
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              border: heldRing
                ? `${HOLD_ACCENT_RING_PX}px solid #FFB14A`
                : "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                height: STRIP_CARD_NATURAL_HEIGHT_PX,
                transform: `scale(${STRIP_CARD_SCALE})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              {/* H badge is wired to slot.held (the user's tap state) by
                  overriding wasHeld on the card object handed to the
                  renderer. CardFront's H indicator reads card.wasHeld via
                  h2hArcRenderer's `locked` mapping; left to the snapshot,
                  the badge tracks the SENDER's holds, not the recipient's
                  taps. State 2 starts with state.held empty (no badges);
                  taps toggle slot.held; H badge follows. The
                  redraw/resolve chain is unaffected — lockedCardIds is
                  built from state.held above and still resolves cardIds
                  off the zeroed initialRoster. */}
              {renderCard(
                { ...(slot.card as unknown as H2HCard), wasHeld: slot.held },
                { revealed: false },
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Card-back visual — diagonal stripe + deep navy gradient. Matches
 *  the prior FaceDownCell visual (preserved for visual continuity). */
function CardBack({ side: _side }: { side: "back" | "front-when-down" }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.18)",
        background: `
          repeating-linear-gradient(45deg,
            rgba(255,255,255,0.05) 0,
            rgba(255,255,255,0.05) 2px,
            transparent 2px,
            transparent 6px),
          linear-gradient(135deg, #1a2540 0%, #0d1530 50%, #1a2540 100%)
        `,
        boxShadow: "inset 0 0 8px rgba(0,0,0,0.4)",
      }}
    />
  );
}

/** Fallback for the rare case where challengeCtx.resolvedSenderHand
 *  is not yet populated when the top strip first flips face-up. Rendered
 *  inside the TopStripCell front-face container, so positioning + flip
 *  scaffolding are owned by the parent — this is content only. */
function SenderUpPlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 6,
        background: "linear-gradient(160deg, #2a1f10 0%, #1a140a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,177,74,0.85)",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      ?
    </div>
  );
}

function flipCss(durationMs: number) {
  return `
    .h2h-play-flip-inner {
      transition: transform ${durationMs}ms cubic-bezier(0.4, 0.0, 0.2, 1);
    }
    /* Reveal-foundation Feature 1 — pre-reveal CHARGE on the empty
       hero slots during settle-pause. CLONED (not reused) from
       H2HRevealScreen's h2h-card-pulse keyframe — that one is a
       single rise/peak/fade pulse, while a CHARGE reads more like
       energy gathering: a sustained build that holds at peak intensity
       until the arc composite crossfades the slot away. Each slot sets
       its own --h2h-charge-color via inline style (the matchup-0
       sender / recipient card's tier color) so the two slots glow
       independently in their own tier hues. */
    @keyframes h2h-play-hero-charge {
      /* Layout-3 fix (a): border stays NEUTRAL/WHITE through the whole
         charge — only the GLOW (box-shadow) is tier-colored. Previously
         the border ramped to the tier color too, which read as a
         "tier-colored box" rather than a "white box with tier-colored
         glow". The dashed white border belongs to the slot's identity;
         the tier color is the energy. */
      0%   { box-shadow: 0 0 0 0 transparent; transform: scale(1); border-color: rgba(255,255,255,0.18); }
      60%  { box-shadow: 0 0 12px 4px var(--h2h-charge-color, transparent); transform: scale(1.012); border-color: rgba(255,255,255,0.18); }
      100% { box-shadow: 0 0 24px 8px var(--h2h-charge-color, transparent); transform: scale(1.025); border-color: rgba(255,255,255,0.18); }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-h2h-play-charge="true"] { animation: none !important; }
    }
  `;
}
