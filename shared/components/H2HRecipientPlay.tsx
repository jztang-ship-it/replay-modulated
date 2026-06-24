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
//     transition between Layout A (0px / 0) and Layout B
//     (HAND_STRIP_HEIGHT_PX / 1).
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
import { GlobalChallengeHeader } from "./GlobalChallengeHeader";
import {
  HAND_STRIP_HEIGHT_PX,
  TIER_ACCENT,
  usePrefersReducedMotion,
  type CardRenderer,
  type H2HCard,
} from "./H2HRevealScreen";
import { ScoreCell } from "./H2HScoreRail";
import { setActiveSeason, ensureLoaded, isLoaded } from "@shared/engines/dataEngine";
import { chDebug } from "@shared/lib/chDebug";
import { isRealName } from "@shared/utils/isRealName";
import { commitRound } from "@shared/views/_roundMachine";
import {
  H2HBoardShell,
  HERO_CARD_ROW_HEIGHT_CSS,
  TargetCornerScore,
} from "./H2HBoardShell";
import { PartsLine } from "./TierGauge";
import { type Line } from "@shared/commentary/chadChallenge";

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
 *  per-cell flip. Tunable on device pass.
 *
 *  RD6.1-e (2026-06-12): the OPPONENT-STRIP portion of this beat
 *  (height + opacity uncollapse) is moved EARLIER — onto the
 *  your_redraw_flip entry — so the top strip materializes WHILE
 *  the bottom cascade runs rather than after it. The hero
 *  expansion + bottom-strip slide-down still fire at ab_transition.
 *  This constant remains the structural-shift duration (height
 *  growth on the wrapper); the opacity + translateY fade-up uses
 *  topStripFadeUpMs(rosterSize) below. */
export const AB_TRANSITION_DURATION_MS = 300;

/** RD6.1-e (2026-06-12) opponent-strip fade-up window. After Draw,
 *  Mike's top strip fades opacity 0→1 with a small translateY rise,
 *  ALL TOGETHER (no per-card stagger — there's no mystery; the
 *  recipient already saw his lineup on the challenge landing per
 *  design-lock §1/§3). Synced to the bottom cascade so both rows
 *  finish populating together. Derived from the cascade duration
 *  (`rosterSize × (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS)`
 *  = 5 × 400ms = 2000ms for basketball's 5-card hand) so any tune of
 *  those constants keeps the two motions synced. rosterSize comes from
 *  the replayed hand (initialRoster.length), not a literal. */
export const topStripFadeUpMs = (rosterSize: number) =>
  rosterSize * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);

/** Cross-fade window for the playing-strip inner content when state
 *  advances to "arc" (Fix C2). Matches H2HRecipientReveal's own
 *  HOLD_TO_ARC_CROSSFADE_MS so the playing fade-out and the reveal
 *  fade-in finish in lockstep on the same canvas. */
export const ARC_COMPOSITE_CROSSFADE_MS = 250;

// Mini-cell dimensions — keyed to the imported HAND_STRIP_HEIGHT_PX
// (single source of truth in H2HRevealScreen). Same Y/X footprint as
// the reveal-arc HandStrip so the eye doesn't reflow when the play
// surface hands off to the arc.
//
// RD2.1 (2026-06-09): play strip cells now use the same
// aspect-ratio + flexShrink:1 scaffold as the reveal/results cells
// (was: explicit width MINI_CELL_WIDTH_PX + flexShrink:0). The fixed-
// width model produced strip overflow on viewports where 6×55 + 5×4
// (350) > strip wrapper width (~332 on iPhone 14 portrait); the
// leftmost + rightmost cells got clipped by the top-strip wrapper's
// overflow:hidden. Switching to aspect-ratio + flexShrink:1 lets the
// cells shrink uniformly to fit, matching reveal/results behavior.
// The inner card's scale now reads container queries (100cqw / 150px)
// so it tracks the actual flex-resolved cell width with no overhang.
const MINI_CELL_HEIGHT_PX = HAND_STRIP_HEIGHT_PX;
const STRIP_GAP_PX = 4;

// Strip natural rendering size — the inner AthleteCard renders against
// this 150 × 218.18 canvas, and the cell's container-query unit (cqw)
// drives a transform: scale(calc(100cqw / 150px)) that lands the
// scaled content at the cell's actual rendered width. 150 (not 329)
// is the deliberate strip-pattern wrap width carried forward from the
// pre-RD2.1 scaffold so AthleteCard's absolute-pixel font sizes
// (16px salary, 22px FP, 32px initials) shrink uniformly with the
// container — see H2HRevealScreen for the long-form rationale.
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_SCALE_CSS = `calc(100cqw / ${STRIP_CARD_NATURAL_WIDTH_PX}px)`;

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
// (1) Fluid intro text. INTRO_FONT_CLAMP scales the font on viewport
// width so tight phones read 16px and roomy phones read up to 22px.
// (The old INTRO_3LINE_BUDGET_CSS top-zone height-reservation was
// removed 2026-06-24 when the stage text moved into slot c, which has
// its own locked one-card-row height.)
const INTRO_FONT_CLAMP = "clamp(16px, 4.2vw, 22px)";
const INTRO_LINE_HEIGHT = 1.28;

// (2026-06-24 Option A) The hold_select margin overrides
// (HOLD_SELECT_TOP_ZONE_MARGIN_CSS / HOLD_SELECT_HERO_MARGIN_CSS) are retired —
// play now uses the shell's default margins (12/12), matching result.

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
      /** Holds COMMITTED in PRIOR rounds — permanent + non-toggleable (doc
       *  da292be: cumulative/permanent ACROSS rounds). `held` is always a
       *  superset of `lockedHeld`; the toggleable slots are `held \ lockedHeld`
       *  (this round's own holds). On Next, the round's holds lock — the NEXT
       *  hold_select gets lockedHeld = this round's full held. Round 1 starts
       *  with lockedHeld empty (all round-1 holds are reversible until Next). */
      lockedHeld: Set<number>;
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
       *  actual 250ms flip animation per column. Range: 0..rosterSize. */
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
  /** 4a SWAP — rounds of hold/redraw the recipient runs before resolve.
   *  Defaults to 1 (single-shot, the pre-4a behavior — keeps existing single
   *  Draw→arc tests valid). App passes the adapter's value (basketball = 3) so
   *  the recipient inherits the sender's five and runs the full 3 rounds. Mirrors
   *  GameView's `adapter.maxRounds ?? 1`. */
  maxRounds?: number;
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
   *  container applies a container-query-derived scale so a hero-sized
   *  renderer (e.g. basketball's h2hArcRenderer with revealed=false)
   *  renders at strip footprint. */
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
        chDebug("dataLoadError:set", {
          message: err instanceof Error ? err.message : String(err),
          seasonKey: challengeCtx.season,
          attempt: loadAttempt,
        });
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
  const inheritedRoster = useMemo(
    () => challengeCtx.initialRoster.map((c) => ({ ...c, wasHeld: false })),
    [challengeCtx.initialRoster],
  );
  // 4a SWAP (3-round loop): the recipient inherits the sender's five as the
  // ROUND-1 base, then holds/redraws on it across maxRounds. `redrawnBase`
  // carries the prior round's redrawn roster forward (wasHeld zeroed — each round
  // is a fresh hold selection per the no-held-state invariant). Every existing
  // base read (deal / hold / redraw / strip) consumes `initialRoster`, which now
  // resolves to the CURRENT round's base — no per-site rewiring needed.
  const [redrawnBase, setRedrawnBase] = useState<GeneratedCard[] | null>(null);
  const initialRoster = redrawnBase ?? inheritedRoster;
  // The deal is lineup 1 (GameView convention); each redraw commits a round
  // through commitRound. maxRounds=3 → 2 redraws → 3 lineups. Ref is read inside
  // the async commit callback so it never sees a stale closure.
  const maxRounds = props.maxRounds ?? 1;
  const roundsUsedRef = useRef(1);
  // State mirror of the ref — drives the round-position signage (N/maxRounds).
  // The deal is lineup 1; on the locking commit it jumps to maxRounds so the
  // signage reads e.g. 3/3 at the reveal (including the collapse jump).
  const [roundsUsed, setRoundsUsed] = useState(1);

  // Roster size for this replay = the recipient's actual dealt hand. Drives
  // the deal-in / column-flip cascade counts, the fade-up window, and the
  // strip cell counts. Data-derived (NOT a literal 6, NOT a shared→sport
  // adapter import — `sport` is only a key string here) so the replay follows
  // whatever config produced the challenge: 5 for basketball today.
  const rosterSize = initialRoster.length;

  const [state, setState] = useState<PlayingState>({ kind: "loading" });

  // Phase 5c S3 — recipient contextual intro. Flag flips true on first
  // hold-tap; sticky so Stage 1 doesn't re-appear if the user un-holds
  // every card back to held.size === 0. Past `hold_select`, both Stage 1
  // and Stage 2 collapse — VS treatment + existing headline take over.
  const [introDismissed, setIntroDismissed] = useState(false);

  // Static recipient commentary (lock: docs/h2h-recipient-static-commentary-lock.md).
  // Dynamic per-draw picks (selectRecipientIntro / selectRecipientDealNudge) were
  // DISABLED for the investor demo while #4b voice-engine repair is out of scope.
  // The ref/sig scaffolding stays — it gives PartsLine's identity-keyed reset
  // effect a stable Line reference. Only the picked value is now a constant.
  const introSig = [
    challengeCtx.triggerType ?? "",
    challengeCtx.challengerName ?? "",
    String(challengeCtx.targetScore),
  ].join("|");

  const stage1Ref = useRef<{ sig: string; line: Line }>({ sig: "", line: [""] });
  if (stage1Ref.current.sig !== introSig) {
    stage1Ref.current = {
      sig: introSig,
      // RD7.9.2b (2026-06-15): initial instruction.
      line: ["Same hand to start — tap the cards you want to hold"],
    };
  }
  const stage1Line = stage1Ref.current.line;

  const stage2Ref = useRef<{ sig: string; line: Line }>({ sig: "", line: [""] });
  if (stage2Ref.current.sig !== introSig) {
    stage2Ref.current = {
      sig: introSig,
      // RD6.1-c (2026-06-11): the body-text target mention is retired
      // — Mike's box name line now renders "Target: X" via
      // TargetCornerScore. Stage 2 drops the redundant number and
      // keeps a CTA framing only. Keeps the Stage 2 intro band
      // reserved (preserves the vertical layout) without echoing the
      // target value twice on screen.
      line: ["Draw the rest when you're ready."],
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
    for (let n = 1; n <= rosterSize; n++) {
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "deal_in" ? { kind: "deal_in", cardsLanded: n } : s,
        );
      }, DEAL_CASCADE_INTERVAL_MS * n);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      setState((s) =>
        s.kind === "deal_in" && s.cardsLanded === rosterSize
          ? { kind: "hold_select", held: new Set(), lockedHeld: new Set(), previewedSlotIndex: null }
          : s,
      );
    }, DEAL_CASCADE_INTERVAL_MS * (rosterSize + 1));
    timers.push(finalId);
    cascadeTimersRef.current = timers;
  }, [state, dataReady, rosterSize]);
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
        chDebug("engineError:set", { which: "redraw" });
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
    // Captured at schedule time (revealedColumns===0); finalRoster/held don't
    // change during the flip. The async commit callback reads these, not `state`.
    const flipFinalRoster = state.finalRoster;
    const flipHeld = state.held;
    const timers: number[] = [];
    // Column N's flip kicks off when revealedColumns crosses N → N+1.
    // The first column fires at delay=0 (engine just returned; the
    // recipient doesn't need a pause before the cascade starts).
    for (let n = 1; n <= rosterSize; n++) {
      const delay = (n - 1) * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "your_redraw_flip" ? { ...s, revealedColumns: n } : s,
        );
      }, delay);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      // 4a SWAP: route the round's loop/lock decision through commitRound as a
      // BLACK BOX (entryFee:0, no-op economics; _roundMachine.ts untouched).
      // commitRound's resolvedRoster is never economically read here (no-op
      // resolveOutcome), so the single real resolveRoster stays in
      // handoff_resolving — the finalRoster→resolveRoster→arc seam does NOT move.
      void (async () => {
        const decision = await commitRound({
          roundsUsed: roundsUsedRef.current,
          maxRounds,
          userTappedReveal: false,
          entryFee: 0,
          streak: 0,
          resolvedRoster: flipFinalRoster as any,
          resolveOutcome: () => ({ totalFp: 0, tier: "", payout: 0 }),
          effects: {
            telemetry: () => {},
            persistLock: async () => ({ ok: false, handId: "" }),
            charge: () => {},
            rake: () => {},
          },
        });
        roundsUsedRef.current = decision.roundsUsed;
        // Signage was already advanced on the committing Next tap (handleDraw,
        // leading the flip — consistent with the collapse path); only the ref
        // updates here, feeding commitRound's next-round input.
        if (decision.next === "REVEALING") {
          // Lock → the EXISTING ab_transition → handoff_resolving → arc seam
          // (resolve unmoved). ONE path — boss and human alike.
          setState((s) =>
            s.kind === "your_redraw_flip" && s.revealedColumns === rosterSize
              ? { kind: "ab_transition", finalRoster: flipFinalRoster, held: flipHeld }
              : s,
          );
        } else {
          // HOLD → another round. CUMULATIVE + PERMANENT holds (one-path model):
          // carry the held set forward (held once = held forever, never re-held,
          // never flips) and carry the redrawn roster as the next base WITH its
          // wasHeld flags intact (held cards stay marked + untouched; only the
          // still-unheld slots will redraw next round). Reset the per-round timer/
          // fire guards so redraw_running + your_redraw_flip re-arm.
          redrawFiredRef.current = false;
          columnTimersRef.current.forEach(clearTimeout);
          columnTimersRef.current = [];
          setRedrawnBase(flipFinalRoster);
          setState((s) =>
            s.kind === "your_redraw_flip" && s.revealedColumns === rosterSize
              ? { kind: "hold_select", held: flipHeld, lockedHeld: flipHeld, previewedSlotIndex: null }
              : s,
          );
        }
      })();
    }, rosterSize * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS));
    timers.push(finalId);
    columnTimersRef.current = timers;
  }, [state, rosterSize]);
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
        chDebug("engineError:set", { which: "resolve" });
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
  // wrapper read height:HAND_STRIP_HEIGHT_PX and the shell read the
  // full hero min-height immediately on state entry, and the
  // transitions animate the TO values.
  // (2026-06-24 Option A) inLayoutA / inLayoutB are retired — the shell
  // sizing/margin overrides they gated are gone (play now uses the shell
  // defaults in every state). topStripVisible (below) drives the opponent
  // strip directly by state.kind.
  // RD6.1-e (2026-06-12): the top strip becomes visible at
  // your_redraw_flip ENTRY (not deferred to ab_transition). It still
  // sits collapsed during loading / deal_in / hold_select /
  // redraw_running (no cascade yet — Mike's box belongs empty during
  // intro/pick beats). At your_redraw_flip the wrapper expands
  // structurally (height 0→80 over AB_TRANSITION_DURATION_MS) and
  // Mike's row fades opacity 0→1 + translateY rise over
  // topStripFadeUpMs(rosterSize) (= the full bottom-cascade window). The
  // hero region's Layout-A→B expansion stays at ab_transition (per
  // inLayoutA above) — that's the bigger structural shift.
  // 2026-06-24 Option A locked layout (BEHAVIORAL CHANGE — glass item):
  // the opponent mini-row (slot b) is now visible from deal_in/hold_select,
  // not just Layout B. This REVERSES the deliberate "Mike's box isn't empty
  // during the bottom cascade" hide — John wants the opponent lineup shown up
  // top so the player can size up the target from the first screen. The
  // opponent cards are already wired (resolvedSenderHand.cards → TopStripCell);
  // this only un-collapses the existing strip. The bottom deal-in cascade is
  // untouched.
  const topStripVisible =
    state.kind === "deal_in" ||
    state.kind === "hold_select" ||
    state.kind === "your_redraw_flip" ||
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
    chDebug("handleRetry:tap", { loadAttempt });
    onTryAgain();
  };

  const handleDraw = () => {
    if (state.kind !== "hold_select") return;
    const held = state.held;
    if (held.size === rosterSize) {
      // COLLAPSE (one-path model): every slot is held → there are NO unheld slots
      // to flip. Skip the flip step and lock the current lineup straight to the
      // matchup reveal; signage jumps to maxRounds (e.g. 1/3 → 3/3). The lock is
      // routed through commitRound as a black box (userTappedReveal:true forces
      // it); the finalRoster→resolveRoster→arc seam is unchanged (resolve still
      // happens in handoff_resolving). All cards are held → mark wasHeld so the H
      // persists to the reveal (no redraw runs here to mark them).
      const finalRoster = initialRoster.map((c) => ({ ...c, wasHeld: true }));
      roundsUsedRef.current = maxRounds;
      setRoundsUsed(maxRounds);
      void (async () => {
        await commitRound({
          roundsUsed: roundsUsedRef.current,
          maxRounds,
          userTappedReveal: true,
          entryFee: 0,
          streak: 0,
          resolvedRoster: finalRoster as any,
          resolveOutcome: () => ({ totalFp: 0, tier: "", payout: 0 }),
          effects: {
            telemetry: () => {},
            persistLock: async () => ({ ok: false, handId: "" }),
            charge: () => {},
            rake: () => {},
          },
        });
        setState((s) =>
          s.kind === "hold_select"
            ? { kind: "ab_transition", finalRoster, held }
            : s,
        );
      })();
      return;
    }
    // FIX 1: advance the round signage NOW, on the committing Next tap, so it
    // LEADS the flip (consistent with the collapse path's on-tap jump) — not
    // after the flip completes. Destination = the next lineup, capped at
    // maxRounds (entering the final round, rd2's Next reads 3/3 as the last
    // replacements begin flipping). The ref still advances in the commit
    // callback for commitRound; this only moves the displayed value.
    setRoundsUsed(Math.min(roundsUsedRef.current + 1, maxRounds));
    setState({ kind: "redraw_running", held });
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
    // Prior-round holds are PERMANENTLY locked — never toggleable now (the
    // commit-lock happens at Next, not at tap; see the lockedHeld threading).
    if (state.lockedHeld.has(i)) return;
    setIntroDismissed(true);
    setState((s) => {
      if (s.kind !== "hold_select") return s;
      if (s.lockedHeld.has(i)) return s; // prior-round lock (stale-closure guard)
      if (s.previewedSlotIndex !== i) {
        // Preview or move-preview. No hold change.
        return { kind: "hold_select", held: s.held, lockedHeld: s.lockedHeld, previewedSlotIndex: i };
      }
      // Second tap on the previewed card: TOGGLE this round's own hold (hold ↔
      // unhold). Reversible within the round; it locks permanently at Next.
      // Only THIS round's holds toggle — lockedHeld (prior rounds) is untouched,
      // so held can never drop below the prior-round committed count.
      const next = new Set(s.held);
      if (next.has(i)) next.delete(i); else next.add(i);
      return { kind: "hold_select", held: next, lockedHeld: s.lockedHeld, previewedSlotIndex: s.previewedSlotIndex };
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
  //     pointer-events none) — reclaiming the HAND_STRIP_HEIGHT_PX +
  //     4px gap from the budget. The TopStripCell components stay
  //     mounted so the strip's
  //     reappearance in B doesn't trigger a layout-thrash on first paint.
  //   - Layout B states (ab_transition, handoff_resolving, arc): opponent
  //     strip PRESENT face-up. The CSS height/opacity transition (300ms,
  //     matched to AB_TRANSITION_DURATION_MS) animates the strip in
  //     during the A→B beat. No per-cell flip — opponent appears face-up
  //     directly (the recipient saw the lineup on the challenge landing
  //     page before accepting).
  //
  // 2026-06-24 (b->c relocation): the instructional / intro stage text no
  // longer renders in the top ZonePanel — it moved to slot c (hero-zone
  // row 1). With slot b carrying no text in any state, the old
  // showStageTextRegion / stageTextHasContent gates and their
  // INTRO_3LINE_BUDGET_CSS height-reservation + RD6.1-f collapse dance
  // (which existed only to keep the top-zone height — and thus the strip
  // Y — stable as the in-zone text mounted/collapsed) are obsolete and
  // removed. Slot b is now constant-height by construction. The deal_in /
  // Stage-1 / Stage-2 / headline conditional lives in slot c verbatim.
  const topStripSlot = (
    <>
      <div
        data-h2h-play-top-strip="true"
        data-h2h-play-top-strip-collapsed={!topStripVisible ? "true" : undefined}
        aria-hidden={!topStripVisible ? "true" : undefined}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: STRIP_GAP_PX,
          height: topStripVisible ? MINI_CELL_HEIGHT_PX : 0,
          overflow: "hidden",
          opacity: topStripVisible ? 1 : 0,
          // RD6.1-e: small upward rise that settles to 0 along with
          // the opacity fade. translateY on the wrapper is paint-only
          // (no layout impact on siblings) — Mike's row visually
          // descends ~6px into its final position over the cascade
          // window, reading as a confident settle.
          transform: topStripVisible ? "translateY(0)" : "translateY(-6px)",
          pointerEvents: topStripVisible ? "auto" : "none",
          // RD6.1-e (2026-06-12): split transitions —
          //   height       runs over AB_TRANSITION_DURATION_MS (300ms):
          //     structural growth of the wrapper at your_redraw_flip
          //     entry; the bottom strip + reserved-bottom slot absorb
          //     the +80px in 300ms.
          //   opacity      runs over topStripFadeUpMs(rosterSize) (= cascade
          //     window, 2000ms at 5 cards): Mike's row fades in WHILE the
          //     bottom cascade flips, both finishing together.
          //   transform    same window as opacity for the settle feel.
          // Pre-RD6.1-e this fired the whole motion at ab_transition
          // (a single coordinated A→B beat). RD6.1-e moves the strip
          // visibility onto your_redraw_flip so Mike's box isn't
          // empty during the bottom cascade.
          transition: `height ${AB_TRANSITION_DURATION_MS}ms ease, opacity ${topStripFadeUpMs(rosterSize)}ms ease-out, transform ${topStripFadeUpMs(rosterSize)}ms ease-out`,
        }}
      >
        {Array.from({ length: rosterSize }).map((_, i) => {
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
      {/* 2026-06-24 (b->c relocation): the stage-text region that used to
          stack the instructional / intro line UNDER the opponent mini-row
          HERE (in the top ZonePanel) has moved to slot c — the hero-zone
          row-1 text area (see data-h2h-play-slot-c below). Slot b is now a
          stable rail: opponent mini-row only, with the shell's top ZonePanel
          supplying the opponent name + Target band around it. No
          instructional/explanatory text renders in b in any state, so the
          old INTRO_3LINE_BUDGET_CSS height-reservation + RD6.1-f collapse
          dance is gone — b is constant-height by construction. The exact
          deal_in / Stage-1 / Stage-2 / headline conditional + its markers
          were moved verbatim into slot c; behavior is unchanged. */}
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
      {Array.from({ length: rosterSize }).map((_, i) => {
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
  // the shell's HERO_MIN_HEIGHT_CSS calc: width = min(125px, 28vw);
  // height = width * (478/329). Same shape and aspect as the reveal-
  // time hero cards.
  // RD6.2-prep-C (2026-06-12): tracked the shared hero shrink (was
  // min(145px, 32vw)); must stay equal to BATTLEFIELD_CARD_MAX_WIDTH /
  // HERO_CARD_MAX_WIDTH so the hold-select preview pop matches the
  // hero footprint.
  const previewCardWidthCss = "min(125px, 28vw)";
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

  // RD3 — armed-rail visibility. Spans the full pre-arc window so the
  // rail is one continuous mount across redraw_running → your_redraw_flip
  // → ab_transition → handoff_resolving. Unmounts on arc entry; the
  // composited H2HRecipientReveal owns the rail from there. HARDENING 2:
  // no appear→vanish→reappear — see no-snap test gate.
  const showArmedRail =
    state.kind === "redraw_running" ||
    state.kind === "your_redraw_flip" ||
    state.kind === "ab_transition" ||
    state.kind === "handoff_resolving";

  const heroSlot = (
    <div
      data-h2h-play-hero-zone="true"
      style={{
        flex: "1 1 auto",
        // RD6.1 (2026-06-11): the RD3 inline ArmedRail overlay is
        // retired — armed totals now render in the box corners via
        // H2HBoardShell.topScore / bottomScore (see the shell render
        // below). The hero region returns to a plain flex centerer
        // (no position:relative anchor needed).
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
        // 2026-06-24 Option A: 2-row hero (matches result/reveal). Row 1 =
        // slot-c reserved at the locked one-card-row height (instructional
        // text lands here in a later copy pass — reserved now so the c-row
        // locks across states); row 2 = the my-hero preview card. The card's
        // own footprint logic (big card vs empty bordered box, no jump on
        // first preview tap) is unchanged — only re-parented into row 2.
        <div
          data-h2h-play-hero-2row="true"
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
            data-h2h-play-slot-c="true"
            style={{
              width: "100%",
              height: HERO_CARD_ROW_HEIGHT_CSS,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              paddingLeft: 12,
              paddingRight: 12,
              boxSizing: "border-box",
              // The text lives INSIDE the locked one-card-row height; height
              // never grows (it stays HERO_CARD_ROW_HEIGHT_CSS whether c
              // holds this text on play or the opponent card on reveal —
              // the no-jump guarantee). overflow:hidden caps a surprise
              // long line without changing the row's height.
              overflow: "hidden",
            }}
          >
            {/* slot c — 2026-06-24 (b->c relocation): the single text-area
                for the non-reveal play states. The instructional / intro
                line moved here OUT of slot b (now a stable rail). The exact
                deal_in / Stage-1 / Stage-2 / headline conditional + markers
                are preserved verbatim from the old top-zone region so the
                behavior gates (introDismissed, heldCount) are unchanged —
                only the parent zone moved. Copy itself is a later pass. */}
            {state.kind === "deal_in" ? (
              <div data-h2h-play-intro="deal-intro-placeholder" style={{ width: "100%" }}>
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
          {state.kind === "hold_select" && previewedSlotIndex !== null && previewedCard ? (
          <div
            data-h2h-play-preview="card"
            data-h2h-play-preview-slot={previewedSlotIndex}
            data-h2h-play-preview-held={previewedCardHeld ? "true" : "false"}
            // RD7.9.2c (2026-06-15): the BIG center card toggles HOLD/UNHOLD on
            // a single tap once it's previewed (being the big card already IS
            // the previewed state — no second preview step). onTap(i) with
            // i === previewedSlotIndex flips the held bit (design-lock §3
            // truth table), so this unifies with the mini-slot's tap-again.
            onClick={() => onTap(previewedSlotIndex)}
            style={{
              width: previewCardWidthCss,
              height: previewCardHeightCss,
              borderRadius: 8,
              overflow: "hidden",
              boxSizing: "border-box",
              cursor: "pointer",
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
        )}
        </div>
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
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        gap: 8,
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
    // Terminal at arc: the two-sided battlefield reveal vs the opponent's five
    // (human sender five or boss five — same reveal). ONE path; the opponent
    // lineup is a precondition (always present). Resolves through the unchanged
    // finalRoster → resolveRoster → arc seam.
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
      // Step (i): the reveal surface shows the signage in-band (riding its
      // recipient row), at the final locked round (roundsUsed = maxRounds → 3/3).
      roundSignageLabel={`${roundsUsed}/${maxRounds}`}
    />
  ) : null;

  return (
    <>
      <H2HBoardShell
        surfaceKind="playing"
        // RD7.1 (2026-06-13): in-flow global challenge header on the play
        // states (Hold / Challenge intro / Draw). During arc the play
        // shell's inner subtree fades to opacity 0, so the visible header
        // there comes from the composited reveal/results surfaces (which
        // mount their own identical GlobalChallengeHeader). No transform —
        // DON'T-BREAK #1.
        globalHeader={<GlobalChallengeHeader />}
        topLabel={topLabel}
        bottomLabel={bottomLabel}
        topStrip={topStripSlot}
        bottomStrip={bottomStripSlot}
        hero={heroSlot}
        belowBoard={belowBoardSlot}
        // RD6.1 (2026-06-11): the armed YOU/JOHN ScoreCells (RD3-C
        // contract: JOHN target/leading/size=1, YOU 0/trailing/size=0)
        // ride in the box corners via the shell's score slots. They
        // mount continuously across the redraw window so the redraw→
        // arc handoff is no-snap byte-identical to the arc's first
        // revealing frame (which renders the same ScoreCell props at
        // the same DOM position via H2HRevealScreen). See the named
        // gate at H2HRecipientPlay.test.tsx.
        // RD6.1-c FIX-2 (2026-06-11): Mike's "Target: X" corner total
        // renders across ALL pre-arc states (loading / deal_in /
        // hold_select / redraw_running / your_redraw_flip /
        // ab_transition / handoff_resolving) so the target is
        // uniformly visible from page load through the start of the
        // arc. Pre FIX-2 this was gated on showArmedRail, which left
        // loading / deal_in / hold_select with Mike's name centered
        // and NO Target — the user-reported bug.
        //
        // YOU's bottom corner stays gated on showArmedRail: rendering
        // "0.0" in the bottom box during pick / hold_select would
        // imply YOU is already in the race when in fact the user is
        // still selecting holds. Once the redraw window starts
        // (Draw tap), the armed YOU=0/trailing/0 corner mounts and
        // bridges seamlessly into the arc's first revealing frame
        // (HARDENING 2 — continuous mount).
        //
        // During arc state, the playing shell's inner subtree fades
        // to opacity 0 (innerOpacity below); H2HRecipientReveal's
        // own topScore wrapping on the H2HRevealScreen surface
        // becomes the visible Target: X. The duplicate render on the
        // hidden playing-shell chrome is a no-op visually and a no-op
        // for tests (the no-snap gates query inside the active
        // surface).
        topScore={buildArmedTopScore(challengeCtx.targetScore)}
        bottomScore={showArmedRail ? buildArmedBottomScore(challengeCtx.targetScore) : undefined}
        rootDataAttrs={{
          "data-h2h-recipient-play": "true",
          "data-playing-state": state.kind,
        }}
        innerOpacity={arcComposite ? 0 : 1}
        innerTransitionMs={ARC_COMPOSITE_CROSSFADE_MS}
        innerDataAttr="data-h2h-play-inner"
        compositeOverlay={compositeOverlay}
        // 2026-06-24 Option A locked geometry: the prior Layout-A
        // vertical-budget overrides (compressed single-card hero +
        // tighter margins for the hold_select preview window) are
        // RETIRED. Play now passes NO heroMinHeight / topZoneMarginBottom
        // / heroMarginBottom override, so every state falls to the shell
        // defaults RESULT uses — HERO_MIN_HEIGHT_CSS (two card-rows),
        // TOP_ZONE_MARGIN_BOTTOM_PX (12), HERO_MARGIN_BOTTOM_PX (12).
        // The hero zone is now the 2-row form (slot-c one-card-row +
        // my-hero) in EVERY state, so play / reveal / result share fixed
        // slot positions and don't jump. (Measured fit at 375×667 /
        // 360×640 — slot-c fills the zone's existing slack, net ~±1px.)
        // Scroll fallback engages across all NON-arc states (arc
        // composites the reveal shell over the playing inner, which
        // fades to opacity 0 — making the playing inner scrollable
        // beneath an invisible layer would only confuse touch routing).
        innerScrollable={!arcComposite}
        belowBoardSticky={!arcComposite}
        // 2026-06-24 Option A (step iii): the x/3 round signage moves from a
        // fixed bottom:18% sibling INTO the shell's roundSignage slot, which
        // renders directly below the my-mini row (slot e) — the locked a–f
        // position, "tucked closely below e". Gated off at arc (the reveal
        // renders its own in-band signage there, same as before).
        roundSignage={
          state.kind !== "arc" ? (
            <div
              data-h2h-round-signage="true"
              style={{
                textAlign: "center",
                pointerEvents: "none",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: "rgba(234,240,255,0.55)",
                textTransform: "uppercase",
              }}
            >
              {roundsUsed}/{maxRounds}
            </div>
          ) : undefined
        }
      />
      {/* Round-position signage now renders in-band via the shell's
          roundSignage slot above (directly below slot e, the locked a–f
          position). The former fixed bottom:18% sibling was removed
          2026-06-24 (Option A step iii) — it double-rendered x/3 during
          non-arc play. Arc still gated off there; the reveal renders its
          own in-band signage at arc, unchanged. */}
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

// ── RD3 armed totals (RD6.1 form: box-corner ScoreCells) ────────────
// Slim YOU/JOHN running-score race. Pre-RD6.1 these lived in an inline
// right-column overlay (ArmedRail) inside the hero zone. RD6.1
// relocates both ScoreCells to the box CORNERS via
// H2HBoardShell.topScore / bottomScore — same component, same RD3-C
// values, new DOM home. Mounted continuously across redraw_running →
// your_redraw_flip → ab_transition → handoff_resolving (HARDENING 2:
// one mount, one handoff at arc).
//
// Values (RD3-C contract, unchanged):
//   JOHN: displayTotal=target, state="leading", sizeProgress=1 — mirrors
//         the arc's first revealing frame under the fixed-bar contract
//         so redraw→arc has no glow snap.
//   YOU:  displayTotal=0,      state="trailing", sizeProgress=0 — the
//         recipient still climbs from 0 once the arc takes over.
//
// JOHN's target is rendered as "Target: X" on his name line (RD6.1-c
// uniform treatment across loading / pick / draw / reveal / results).
// The body-text "Draw to beat X." / "<X> to beat." sentences that
// previously surfaced the target are retired — the corner-score is
// the single, consistent home.
function buildArmedTopScore(targetScore: number) {
  return (
    <TargetCornerScore
      scoreCell={
        <ScoreCell
          total={targetScore}
          displayTotal={targetScore}
          state="leading"
          sizeProgress={1}
          surface="reveal"
          teamPosition="opponent"
        />
      }
    />
  );
}
function buildArmedBottomScore(targetScore: number) {
  return (
    <ScoreCell
      total={targetScore}
      displayTotal={0}
      state="trailing"
      sizeProgress={0}
      surface="reveal"
      teamPosition="user"
    />
  );
}

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
      // RD7.9.2a (2026-06-15): the transient "Here's the same starting hand
      // as {challenger}" line that flashed on entry is DROPPED — the deal-in
      // stage-text region renders empty (the new Stage-1 copy carries the
      // "same hand" framing once hold_select begins).
      return "";
    case "hold_select":
      // RD7.9.2b: the headline-fallback shown once a card is previewed but
      // none is held yet (heldCount===0 && introDismissed).
      return "Tap once to preview, tap again to hold";
    case "redraw_running":
    case "your_redraw_flip":
      // RD3 (2026-06-11): the "Drawing…" headline beat is dead — the
      // armed YOU/JOHN/delta rail in the hero owns this window instead
      // (see the right-rail overlay below). Empty string + the existing
      // hero-headline div renders the rail beneath it without copy.
      return "";
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
      // One-path advance control: a single "Next" label, every advance (doc
      // ONE-PATH MODEL CORRECTION). Disabled during deal_in; enabled at
      // hold_select. Round position lives in SEPARATE signage, not on the button.
      return { label: "Next", disabled: true, onClick: null };
    case "hold_select":
      return { label: "Next", disabled: false, onClick: "draw" };
    case "redraw_running":
    case "your_redraw_flip":
    case "ab_transition":
    case "handoff_resolving":
    case "arc":
      // RD3 (2026-06-11) folds redraw_running + your_redraw_flip into
      // this hidden-CTA branch — the prior "Drawing…" disabled label
      // read as dead/broken. Same pattern Bug 4 already used for the
      // settle-pause + reveal states: empty label is the structural
      // signal to the render below not to mount the button — the
      // reserved-bottom wrapper STAYS so the layout height is reserved
      // (no jump when the results overlay crossfades in with its own
      // CTA). When the play-shell fades out at arc-composite and
      // H2HResultsOverlay mounts, the overlay's own primary CTA (Send
      // It Back / Try Again / Play your own hand) takes over.
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
 *  height:HAND_STRIP_HEIGHT_PX + opacity:1 during Layout B). The cells
 *  stay mounted
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
        // RD2.1: was width/height fixed + flexShrink:0 (produced strip
        // overflow on narrow viewports). Now flex-shrinkable like the
        // reveal/results cells; the inner front-face wrapper carries
        // containerType so the scaled card tracks the resolved width.
        height: "100%",
        aspectRatio: "329 / 478",
        flexShrink: 1,
        minWidth: 0,
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
          // RD2.1: container-query source for the scaled card below.
          // Placed on the bordered wrapper so 100cqw reads its content
          // box (the area INSIDE the 1px border), making the scaled
          // card fill exactly the visible area with no clip.
          containerType: "inline-size",
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
              transform: `scale(${STRIP_CARD_SCALE_CSS})`,
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
          // RD2.1: flex-shrinkable to match the face-up cell scaffold;
          // no card content here, so no containerType needed.
          height: "100%",
          aspectRatio: "329 / 478",
          flexShrink: 1,
          minWidth: 0,
          borderRadius: 6,
          border: "1px dashed rgba(255,255,255,0.18)",
          boxSizing: "border-box",
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
        // RD2.1: flex-shrinkable (matches TopStripCell and the
        // reveal/results cells); containerType is on the inner
        // front-face wrapper below.
        height: "100%",
        aspectRatio: "329 / 478",
        flexShrink: 1,
        minWidth: 0,
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
              // RD2.1: container-query source for the scaled card.
              // The 1px (or 2px-when-held) border means cqw reads
              // (cell-2) or (cell-4); scaled card sizes to that
              // visible inner area exactly. Held-ring transition
              // shifts the scale by 1px sub-pixel — imperceptible
              // and arrives with the ring change visually.
              containerType: "inline-size",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                height: STRIP_CARD_NATURAL_HEIGHT_PX,
                transform: `scale(${STRIP_CARD_SCALE_CSS})`,
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
         the tier color is the energy.

         abc-8(a) follow-up: during the charge, switch the border from
         the resting dashed faint-white (1px dashed rgba(255,255,255,0.18),
         set inline at the slot) to a SOLID high-opacity white. The glow's
         8px box-shadow spread paints a solid tier-colored band hugging
         the box edge; on bright tiers (GREEN / ORANGE) the dashed faint
         border was visually swallowed by that band and read as a tier-
         colored edge. A solid bright-white edge holds its own over the
         spread band. Animation cascade beats the inline shorthand —
         keyframe-set border-style and border-color override the inline
         "border: 1px dashed rgba(255,255,255,0.18)" only while the
         animation is active (chargeActive). Resting / empty drop-zone
         slots keep the inline dashed look. The glow (box-shadow values,
         spread, color) is unchanged. */
      0%   { box-shadow: 0 0 0 0 transparent; transform: scale(1); border-style: solid; border-color: rgba(255,255,255,0.95); }
      60%  { box-shadow: 0 0 12px 4px var(--h2h-charge-color, transparent); transform: scale(1.012); border-style: solid; border-color: rgba(255,255,255,0.95); }
      100% { box-shadow: 0 0 24px 8px var(--h2h-charge-color, transparent); transform: scale(1.025); border-style: solid; border-color: rgba(255,255,255,0.95); }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-h2h-play-charge="true"] { animation: none !important; }
    }
  `;
}
