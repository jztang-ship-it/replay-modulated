/**
 * shared/components/H2HResultsOverlay.tsx
 *
 * Phase 4 of the H2H reveal arc — full-viewport results overlay. The
 * overlay IS the H2H layout in a "result state," NOT a separate
 * surface — same three-zone vertical structure (top strip / hero zone /
 * bottom strip) + same two rails (left / right) the reveal arc uses.
 * What changes from the arc's static end-state is the CONTENT of the
 * rails and the interactive behavior of the hero zone.
 *
 *   ┌──────────────┬─────────────┬──────────┐
 *   │             OPPONENT STRIP (top)      │
 *   ├──────────────┼─────────────┼──────────┤
 *   │ Headline +   │ HERO TOP    │ opp     │   row 1
 *   │ trash-talk   │  (empty by  │ total   │
 *   │ (left rail)  │   default)  │         │
 *   │              ├─────────────┤         │
 *   │              │   (empty)   │  (empty)│   row 2
 *   │              ├─────────────┤         │
 *   │              │ HERO BOTTOM │ user    │   row 3
 *   │              │  (empty by  │ total   │
 *   │              │   default)  │         │
 *   ├──────────────┴─────────────┴──────────┤
 *   │               YOUR STRIP (bottom)     │
 *   ├───────────────────────────────────────┤
 *   │            countdown (LOSS_OPEN)      │
 *   │              Primary CTA              │
 *   └───────────────────────────────────────┘
 *
 * Tap-to-flip mechanic (phase 4 fix 3, 2026-05-27):
 *   - Default: both hero slots empty.
 *   - Top strip tap → that card flips into the TOP hero slot.
 *   - Bottom strip tap → that card flips into the BOTTOM hero slot.
 *   - Each strip has its OWN selection. Both can be filled at the
 *     same time for 1v1 comparison.
 *   - Tap the same card again → un-flips, that slot returns to empty.
 *   - Tap a different card in the same strip → that strip's previous
 *     selection un-flips; the new card takes that strip's hero slot.
 *     The OTHER strip's selection is unaffected.
 *   - Strip cell dims to ~0.35 opacity when its card is the active
 *     selection for that strip.
 *
 * Right rail: just two FP totals stacked. Top FP anchored to top hero
 * row, bottom FP to bottom hero row. NO delta pill in the middle —
 * the user already saw the delta land during the arc; the headline +
 * trash-talk on the left rail carries the result framing now.
 *
 * CTAs: single primary CTA below bottom strip in the unused space.
 * Dismiss is handled by the × close button only — no secondary CTA.
 * LOSS_OPEN adds a countdown pill above the CTA; LOSS_CLOSED changes
 * the CTA label to "Play your own hand".
 *
 * No scale-up hack from the prior amend — the hero zone is sized for
 * hero cards (same `BATTLEFIELD_CARD_MAX_WIDTH` as the arc), so the
 * back face is naturally readable.
 *
 * See docs/h2h-reveal-arc-design.md "Results overlay" for the locked
 * structural decisions this component encodes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { H2HCard, H2HHand, CardRenderer } from "./H2HRevealScreen";
import { HAND_STRIP_HEIGHT_PX, HAND_STRIP_CARD_CONTENT_WIDTH_PX } from "./H2HRevealScreen";
import { CORNER_SCORE_MIN_WIDTH_PX, TargetCornerScore, H2HBoardShell, HERO_CARD_ROW_HEIGHT_CSS } from "./H2HBoardShell";
import {
  trashTalkBucket,
  type TrashTalkBucket,
  selectChallengeResolution,
} from "../commentary/chadChallenge";
import {
  ScoreCell,
  RIGHT_RAIL_WIDTH_PX,
  LEFT_RAIL_WIDTH_PX,
  WINNING_COLOR,
} from "./H2HScoreRail";

// ── Variant types ────────────────────────────────────────────────────────

/** Big-picture result state — preserved verbatim from the prior
 *  `ChallengeComparisonScreen.tsx`. */
export type ResultsOverlayState = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";

/** Margin bucket — drives headline copy + trash-talk pick. Matches
 *  `trashTalkBucket(delta)`'s internal naming (`_big` / `_narrow`). */
export type ResultsMarginBucket = TrashTalkBucket;

export interface H2HResultsOverlayProps {
  sender: H2HHand;
  recipient: H2HHand;
  /** Same renderer the H2HRevealScreen uses. The dev route passes an
   *  AthleteCard wrapper that reads `options.flipped` and forwards
   *  via `isFlipped` + `canFlip=true` so PlayerCardShell renders the
   *  back face when flipped is true. */
  renderCard: CardRenderer;
  state: ResultsOverlayState;
  /** Unix ms the 1-hour window closes. Drives the LOSS_OPEN countdown.
   *  Null/undefined hides the pill. */
  windowClosesAtMs?: number | null;
  onSendItBack?: () => void;
  onTryAgain?: () => void;
  onPlayOwnHand?: () => void;
  onDismiss?: () => void;
  /** RD7.1 (2026-06-13): optional in-flow global challenge header,
   *  rendered as the FIRST child of the overlay's inner column so it
   *  shifts the results board DOWN by the SAME height the reveal shell
   *  shifts (identical GlobalChallengeHeader) — preserving the
   *  reveal→results no-snap. Passed only by H2HRecipientReveal (the
   *  recipient flow); omitted by sender/mock so it never leaks. */
  globalHeader?: React.ReactNode;
  /** Crossfade visibility. When false, the overlay fades to opacity 0
   *  and disables pointer events; when true, fades in. Phase 4 ships
   *  a 350ms crossfade as a placeholder for the phase 6 climax. */
  visible?: boolean;
  /** Seeds the TOP strip's selection on initial mount — used by smoke
   *  captures (`?topFlipped=cardId`) and tests. Card id must belong to
   *  the sender hand; ignored otherwise. */
  initialTopFlippedCardId?: string | null;
  /** Seeds the BOTTOM strip's selection on initial mount. Card id must
   *  belong to the recipient hand. */
  initialBottomFlippedCardId?: string | null;
  /** Phase 5a amend2 (2026-05-27): canonical strip ordering produced by
   *  useH2HReveal's buildRevealOrder (wasHeld ASC, salary ASC). When
   *  provided, ResultsStrip displays cards in this order; otherwise
   *  falls back to slotIndex for static dev/test paths. Mirrors the
   *  same prop on H2HRevealScreen's HandStrip. */
  senderRevealOrder?: H2HCard[];
  recipientRevealOrder?: H2HCard[];
  /** Phase 5b commit 3 (2026-05-28): tactical escape hatch for the
   *  sender-side wrapper. When supplied, replaces the state-derived
   *  primary CTA wholesale — `state` still drives headline color, copy
   *  bucket, etc. Sender-side surface needs ONE uniform "Play another
   *  hand" CTA regardless of state per the locked placeholder; the
   *  recipient surface keeps its three state-driven CTAs unchanged.
   *  Surfaced for next session: phase 8 should refactor CTA config to a
   *  regular prop and lift the state-derived logic into the recipient
   *  wrapper, avoiding the override pattern compounding. */
  primaryCtaOverride?: { label: string; handler?: () => void };
  /** RD7.2 (2026-06-14): the Resolution Engine's causally-honest "why" line,
   *  computed by the recipient flow (H2HRecipientReveal) and passed in. When
   *  present it REPLACES the legacy selectChallengeResolution flavor line as
   *  the primary why-line (no duplicate/contradiction, no extra height — it
   *  renders in the same resolution slot). Consumers that don't pass it
   *  (sender reveal / dev mock) fall back to the legacy line. */
  explanation?: string;
  /** 2026-06-23 boss-result unification. Optional CTA-region slot. When
   *  supplied (the boss path: H2HRecipientReveal passes the boss share/replay
   *  block), it REPLACES the state-derived primaryCta button inside the
   *  reserved CTA region — and ONLY that button. The boss now renders the SAME
   *  human results board (opponent strip + heroes + user strip + verdict);
   *  only its CTAs differ (share/replay vs rivalry). The overlay stays boss-
   *  agnostic — it renders whatever node is passed. Absent for human challenges
   *  and all non-basketball sports → the state-derived primaryCta renders
   *  unchanged (human board byte-identical). */
  ctaSlot?: React.ReactNode;
}

/** Cross-fade duration. */
export const OVERLAY_CROSSFADE_MS = 350;

// Results overlay stacking layer. The single results container (human board;
// boss now renders through it too post-unification) uses this value. A prior
// drift (a separate boss branch hardcoded zIndex:50, below the reveal board's
// z-9000) left the boss result rendering BEHIND the final card while
// mounted+visible. Must sit above H2HBoardShell's root (zIndex 9000).
const H2H_RESULTS_OVERLAY_Z = 9100;

// ── Layout constants ────────────────────────────────────────────────────
//
// LEFT_RAIL_WIDTH_PX (100) and RIGHT_RAIL_WIDTH_PX (80) are imported
// from H2HScoreRail and shared with H2HRevealScreen so the arc → overlay
// transition holds the "no movement" invariant by construction (rather
// than by two-files-typed-the-same-by-hand, which is how the values
// landed in the prior amend2). HERO_ROW_GAP_PX stays local — there's
// no shared rail home for it and the value matches the arc's
// BATTLEFIELD_ROW_GAP_PX by separate intent.

const HERO_ROW_GAP_PX = 14;
// RD6.2-prep-C (2026-06-12): shrunk min(145px, 32vw) → min(125px, 28vw)
// for real-phone vertical fit. MUST match arc's BATTLEFIELD_CARD_MAX_WIDTH
// exactly or the reveal→results crossfade snaps. Companion edits:
// H2HRevealScreen.BATTLEFIELD_CARD_MAX_WIDTH, H2HBoardShell.HERO_MIN_HEIGHT_CSS,
// H2HBoardShell.HERO_MIN_HEIGHT_HOLD_SELECT_CSS, and the hold-select
// preview-card override in H2HRecipientPlay all carry the same value.
// boss-mobile-fit §1.7 (2026-06-27): 125 → 110 cap, lockstep with arc's
// BATTLEFIELD_CARD_MAX_WIDTH + shell HERO_* + play preview (asymmetry snaps).
const HERO_CARD_MAX_WIDTH = "min(110px, 28vw)"; // matches arc's BATTLEFIELD_CARD_MAX_WIDTH

// Step 3: explicit per-row hero height for the hero grid. Pinning each
// row to this prevents row-1 from collapsing when the opponent HeroCell
// is removed (replaced by the commentary block) — without it, row 1
// would auto-size to commentary's intrinsic height (~60-90px), pulling
// the user hero up and breaking the no-jump invariant locked in step 1.
// Value: HERO_CARD_MAX_WIDTH × 478/329 (the hero card's aspect-ratio-
// derived height). Step-1 no-jump assertion stays green because the
// user hero in row 2 retains the exact X/Y it had before.
// 2026-06-24: sourced from the shell's locked-layout vocabulary so play /
// reveal / result share ONE one-card-row height (value-identical to the prior
// local calc(HERO_CARD_MAX_WIDTH * 478/329)).
const HERO_ROW_HEIGHT_CSS = HERO_CARD_ROW_HEIGHT_CSS;

// RD7.5 Move 4 (2026-06-14): verdict-row (grid row 1) MIN height. Pre-
// RD7.5 the floor was HERO_ROW_HEIGHT_CSS (~158px @390) — a holdover
// from when row 1 held the opponent hero card; RD7.4 kept it as the
// minmax floor. But RD7.5 Move 2 collapsed the verdict to ONE compact
// line, so a full hero-card-height floor just bakes in ~130px of dead
// space that pushes the hero/strip/CTA down and forces the results
// screen to scroll on the phone (header rides off-screen). This smaller
// floor gives the single verdict line a deliberate breathing band (and
// holds a worst-case 2–3-line engine explanation without the row
// growing) while reclaiming the rest — pulling everything below UP so
// the screen fits with the URL bar showing. Row 2 (the user hero card)
// still uses the full HERO_ROW_HEIGHT_CSS; the no-jump hero X/Y is
// preserved because the hero remains in row 2. Tuned against the
// real-browser fit check at 390 & 430.
const VERDICT_ROW_MIN_PX = 72;

// Docked-score target minimum width inside each ZoneHeader.
// Reserves right-aligned space for the score that will glide in at
// step 4.
//
// C1 (step-4 prep): bumped 60 → 68 to satisfy the rect-identity
// guarantee for the dormant populate path. C1 lifts the slot's font
// to match H2HScoreRail.ScoreCell at rest (fontSize 22, fontWeight 950,
// tabular-nums) so a glide clone lands on a pixel-identical box. At
// those values a populated 5-char score (e.g. "182.4") measures
// 64.33px wide in headless Chromium at viewport 390 — the previous
// 60 floor let populated content expand the bounding box from
// RD6.1-c (2026-06-11): the local CORNER_SCORE_MIN_WIDTH_PX = 68
// is retired in favor of CORNER_SCORE_MIN_WIDTH_PX (imported from
// H2HBoardShell) so both surfaces' name-band reserves are kept in
// sync from a single source. The constant bumped to 110 to host the
// "Target:" label that wraps Mike's corner score.

// Hand-strip cell sizing — sourced from the shared HAND_STRIP_HEIGHT_PX
// in H2HRevealScreen. RD2 unified-80 lock (2026-06-08): one mini-slot
// geometry across all four states of the H2H surface (hold/draw → play
// → reveal → results), with results as the canonical reference
// (#7 tap-to-flip floor). The local STRIP_HEIGHT_PX = 80 literal this
// file used to declare is retired; drift between reveal and results is
// no longer possible without removing the import. See
// docs/h2h-reveal-arc-design.md "Amendment 2026-06-08 — RD2 unified at
// 80px (results-referenced)" for the lock.
const STRIP_GAP_PX = 4;
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
// RD2.1 (2026-06-09): inner card scale is container-derived (cqw) so
// it tracks the flex-resolved cell width exactly. See H2HRevealScreen
// for the lock rationale (and the validation that confirmed Chromium
// + WebKit both resolve calc(100cqw / 150px) to a unitless transform
// scale). The cell scaffold below sets container-type: inline-size.
const STRIP_CARD_SCALE_CSS = `calc(100cqw / ${STRIP_CARD_NATURAL_WIDTH_PX}px)`;

const ZONE_HEADER_HEIGHT_PX = 24;

// Bug 5 fix: scroll-clearance below the user-zone so the recipient
// "YOU" label can scroll fully above the sticky CTA at scrollTop=max
// without being visually occluded.
//
// Applied as marginBottom on the user ZonePanel (not as paddingBottom
// on the scroll container) because position:sticky;bottom:0 measures
// from the scroll container's content-box bottom — adding padding-
// bottom to the inner just shrinks the content box, moving the sticky
// pin UP by the same amount the user-zone moves UP, leaving the gap
// unchanged.
//
// marginBottom on user-zone creates extra space BETWEEN the user-zone
// and the reserved-bottom in the flex stack. In the overflow case,
// at scrollTop=max the user-zone-bottom ends marginBottom pixels
// above the sticky CTA's pinned position (verified empirically). In
// the non-overflow case, the reserved-bottom's marginTop:auto still
// pushes the CTA to the bottom of the inner column for thumb reach;
// the marginBottom just adds visible breathing room above the CTA.
//
// RD6.1-g (2026-06-11): trimmed 100 → 30. The original 100 was sized
// for a layout where the LOSS_OPEN countdown was a SEPARATE pill above
// the CTA button (paddingTop 8 + countdown ~28 + gap 10 + CTA ~46 ≈
// 92). #7 merged the countdown INSIDE the CTA button (absolute span,
// right-aligned), so the reserved-bottom content is now just a single
// CTA button — actual content height ~42–50px. 30px gives visual
// breathing room between bottom strip and CTA without the obsolete
// 100px reserve. Reducing this is safe for the no-snap: marginBottom
// sits BELOW the bottom strip, so it doesn't shift the strip's Y.
// RD6.2-prep-C (2026-06-12): 30 → 20. RD6.1-g's 30 was the
// post-countdown-merge breathing room above the CTA; further trimmed
// to 20 for real-phone fit. Still preserves a visible gap between
// bottom strip and CTA (the CTA's own 10px padding + the outer
// safe-area padding keep it from kissing the strip).
const RESERVED_BOTTOM_CLEARANCE_PX = 20;
const ZONE_GAP_PX = 4;
const URGENT_THRESHOLD_MS = 5 * 60 * 1000;

// Win/loss colors (WINNING_COLOR, TRAILING_COLOR, DELTA_NEUTRAL) are
// imported from H2HScoreRail and shared with H2HRevealScreen.

// ── Headline copy (RD1 — rivalry results) ───────────────────────────────
//
// Outcome-first headline; the margin number lives in the stacked FP hero,
// not in the headline string. Outcome is determined by the SIGN of
// `delta` plus the tie threshold (|delta| < 0.05) — NOT by trashTalkBucket.
// A sub-1-FP loss reads as "YOU LOST TO {NAME}" (not "photo finish") so
// the result is impossible to miss. Function returns name-cased text;
// the JSX applies textTransform:uppercase for the visual hierarchy.

const TIE_EPSILON = 0.05;

export function selectHeadline(args: {
  delta: number;
  challengerName: string | null;
}): string {
  const { delta, challengerName } = args;
  if (Math.abs(delta) < TIE_EPSILON) {
    return challengerName ? `YOU TIED ${challengerName}` : "YOU TIED";
  }
  if (delta > 0) {
    return challengerName ? `YOU BEAT ${challengerName}` : "YOU WON";
  }
  return challengerName ? `YOU LOST TO ${challengerName}` : "YOU LOST";
}

/** Signed FP-margin string for the stacked hero element. U+2212 minus
 *  on losses so it reads as a typographic minus rather than a hyphen at
 *  fontWeight 950. Tie renders literal "0.0 FP" (no sign prefix). */
export function formatFpHero(delta: number): string {
  if (Math.abs(delta) < TIE_EPSILON) return "0.0 FP";
  const mag = Math.abs(delta).toFixed(1);
  return delta > 0 ? `+${mag} FP` : `−${mag} FP`;
}

/** Outcome-driven color for the headline + hero. Replaces the
 *  pre-RD1 bucket+state-keyed map at the overlay's render site. */
export function selectOutcomeColor(delta: number): string {
  if (Math.abs(delta) < TIE_EPSILON) return "#FFB14A";
  if (delta > 0) return WINNING_COLOR;
  return "#EF4444";
}

// ── Zone panel — glass chrome (matches arc) ──────────────────────────────

// 2026-06-24 result→shell re-host (safe half): the private ZonePanel and
// ZoneHeader recipes that hand-mirrored H2HBoardShell's chrome are RETIRED.
// H2HResultsOverlay now consumes <H2HBoardShell>, so the shell's own
// ZonePanel/ZoneHeader render the framed zones + name/score bands. The one
// intended visual delta is the panel boxShadow (shell 0 4px 12px /0.20 vs
// the old overlay 0 8px 24px /0.28) — drift-elimination, glass-verified.

// (private ZoneHeader retired — see the note above; the shell's exported
//  ZoneHeader now renders the name/score band via topLabel/topScore and
//  bottomLabel/bottomScore, emitting data-h2h-board-* attrs.)

// ── Results strip — hand-strip-density cells, tap-to-flip ────────────────
//
// Visually identical to `H2HRevealScreen.HandStrip` at the static
// end-state (no entrance animation, no per-cell pulse). Adds:
//   - onClick per cell → toggle `selectedCardId`.
//   - The cell whose card is the current selection dims to 0.35
//     opacity to signal "this card is currently shown in the hero
//     zone."

interface ResultsStripProps {
  cards: H2HCard[];
  renderCard: CardRenderer;
  selectedCardId: string | null;
  onCardTap: (cardId: string) => void;
  revealOrder?: H2HCard[];
}

function ResultsStrip({ cards, renderCard, selectedCardId, onCardTap, revealOrder: _revealOrder }: ResultsStripProps) {
  // #4 (2026-05-30): strip LAYOUT is slotIndex-only — matches HandStrip.
  // revealOrder is the TEMPORAL contract (kept on the props surface for
  // backward compatibility with H2HRecipientReveal's threading) but no
  // longer drives spatial order. Held cards stay in their slotIndex
  // positions (S5 invariant). Prior code laid cells in revealOrder when
  // provided, which dragged held cards to the rightmost slots since
  // `buildRevealOrder` puts held last.
  const ordered = useMemo(
    () => [...cards].sort((a, b) => a.slotIndex - b.slotIndex),
    [cards],
  );
  return (
    <div
      data-h2h-overlay-strip="true"
      style={{
        display: "flex",
        gap: STRIP_GAP_PX,
        height: HAND_STRIP_HEIGHT_PX,
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {ordered.map(card => {
        const isSelected = selectedCardId === card.cardId;
        // Phase 4 amend5 fix 2 (2026-05-27): brightness invariant —
        // active mini-card (whose back is in the hero slot) is
        // BRIGHT; others on the same strip are DIMMED. When NO card
        // is selected on this strip, all cards render bright
        // (default "no focus" state). Top + bottom strips drive
        // independently.
        const stripHasSelection = selectedCardId != null;
        const cellOpacity = !stripHasSelection
          ? 1
          : isSelected
            ? 1
            : 0.35;
        return (
          <div
            key={card.cardId}
            data-h2h-overlay-cell="true"
            data-card-id={card.cardId}
            data-card-selected={isSelected ? "true" : "false"}
            onClick={() => onCardTap(card.cardId)}
            style={{
              height: "100%",
              aspectRatio: "329 / 478",
              // Match HandStrip's cell model exactly so the reveal→results
              // crossfade is byte-identical on both X and Y. Mini-slot
              // geometry unified across all four states of the H2H
              // surface (hold/draw → play → reveal → results) via the
              // shared HAND_STRIP_HEIGHT_PX constant imported above.
              // flexShrink:1 + aspectRatio + minWidth:0 lets the cell
              // shrink uniformly when the strip wrapper is narrower
              // than 6×55 + 5×4 = 350 (every mobile portrait viewport).
              // RD2.1: container-type:inline-size makes the cell a
              // CSS containment context so the inner card's
              // transform: scale(calc(100cqw / 150px)) tracks the
              // flex-resolved cell width exactly — no scale/flex
              // divorce, no 3px right-edge overhang, no card-back FP
              // clip. The cell must keep box-sizing:border-box AND no
              // internal border/padding so the content box == border
              // box (cqw reads content box).
              flexShrink: 1,
              minWidth: 0,
              containerType: "inline-size",
              position: "relative",
              overflow: "visible",
              cursor: "pointer",
              opacity: cellOpacity,
              transition: "opacity 180ms ease",
              boxSizing: "border-box",
            }}
          >
            {/* Render the card at natural size + scale down to fit
                the cell. Cards in the strip are never flipped — the
                flipped view lives in the hero zone. */}
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
              {renderCard(card, { flipped: false })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Hero cell — empty placeholder OR flipped card at hero size ───────────
//
// Phase 4 amend4 bug 2 fix (2026-05-27): the empty hero cell now uses
// the SAME aspectRatio + maxWidth as the arc's `CardCenterCell`. The
// previous `EMPTY_HERO_CELL_MIN_HEIGHT 60px` collapsed the empty cell
// to ~60px tall, while the arc's hero cell is ~211px tall — that
// difference (~150px × 2 rows = ~300px) pulled the overlay's bottom
// strip UP by ~300px relative to the arc, breaking the locked-
// geometry invariant. With aspectRatio set unconditionally, the
// empty cell reserves the exact same Y span as the arc's hero card,
// so the bottom strip Y matches pixel-for-pixel between surfaces.

function HeroCell({
  card,
  renderCard,
  flipped = false,
  onTap,
  showEmptyBorder = false,
}: {
  card: H2HCard | null;
  renderCard: CardRenderer;
  /** #7 (2026-06-08): the hero shows the card FRONT on first preview;
   *  the back face appears only after a deliberate flip tap. Owned by
   *  the parent so switching cards always resets to front. */
  flipped?: boolean;
  /** Tap on the OCCUPIED hero card → toggle its flip. The card's own
   *  onToggleFlip is intentionally not wired in this surface, so the
   *  overlay owns the flip at the wrapper. No stopPropagation exists in
   *  PlayerCardShell/CardFront, so the card tap bubbles here cleanly. */
  onTap?: () => void;
  /** #7 req 1: when empty, the cell still reserves the same Y span AND
   *  paints a dashed border so the slot reads as a tap target before
   *  any mini-card has been tapped. */
  showEmptyBorder?: boolean;
}) {
  return (
    <div
      data-h2h-overlay-hero-cell="true"
      data-occupied={card ? "true" : "false"}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <div
        onClick={card ? onTap : undefined}
        data-h2h-overlay-hero-flipped={card ? (flipped ? "true" : "false") : undefined}
        style={{
          // position: relative anchors the discoverability caption below,
          // which is absolutely positioned (out of flow) so it can never
          // shift the hero↔strip geometry locked to H2H-reveal parity.
          position: "relative",
          width: "100%",
          maxWidth: HERO_CARD_MAX_WIDTH,
          // Locked: empty AND occupied cells reserve the same Y span
          // (matches the arc's hero card size). #7 req 1: when empty the
          // wrapper paints a dashed border so the slot is a visible tap
          // target; once occupied the card covers it.
          aspectRatio: "329 / 478",
          cursor: card ? "pointer" : "default",
          border: !card && showEmptyBorder ? "1.5px dashed rgba(255,255,255,0.22)" : undefined,
          borderRadius: !card && showEmptyBorder ? 18 : undefined,
          boxSizing: "border-box",
          // RD6.2 FIX 2b (2026-06-13): the EMPTY dashed slot + its hint
          // (absolutely positioned inside this box) move to the board's
          // true horizontal center — same goal as the verdict block's
          // FIX 2, NOT the middle grid column (~10px right). The verdict
          // used a full-column span; the hero cell can't span because the
          // OCCUPIED hero card's X is LOCKED byte-identical to the arc
          // (no-snap geometry parity). So the centering is EMPTY-only via
          // a DERIVED shift = (RIGHT_RAIL − LEFT_RAIL)/2, exactly the
          // center-column-vs-board-center offset implied by the asymmetric
          // [100px 1fr 80px] rails. Occupied path (card present) → no
          // transform → LOCKED X/Y untouched.
          transform:
            !card && showEmptyBorder
              ? `translateX(calc((${RIGHT_RAIL_WIDTH_PX}px - ${LEFT_RAIL_WIDTH_PX}px) / 2))`
              : undefined,
        }}
      >
        {/* RD7.10-c (2026-06-15): the "game logs" discoverability hint moved
            OUT of the hero zone to a permanent footer row (above the CTA, see
            data-h2h-overlay-logs-hint below). Both former in-hero leaves are
            retired:
              • the OCCUPIED-front caption ("Tap again — game logs are on the
                back") — relocated + reworded to the position-neutral global
                "Tap any card for game logs";
              • the EMPTY in-box prompt ("tap a card to see game logs", RD7.5
                Move 3) — STRIPPED; the dashed box is now a clean placeholder
                (the footer hint carries the affordance in every state).
            Removing the absolute hero caption frees the visual gap above the
            card (RD7.11 substance-line runway). The empty-state wrapper
            translate (RD6.2 FIX 2b, :634) is UNTOUCHED. */}
        {card && renderCard(card, { flipped })}
      </div>
    </div>
  );
}

// ── RD7.7 resolution celebration (full-screen, transient) ──────────────────
// The ONE place the app abandons restraint. On win/loss resolution a TRUE
// full-screen overlay (position:fixed, its own top stacking layer, pointer-
// events:none) paints OVER the entire results screen, animates ITSELF, and
// clears after ~RD77_CELEBRATION_MS — revealing the untouched clean results
// screen. It NEVER wraps / scales / transforms the results content underneath
// (a transformed ancestor of the delta glyph / score cells would reintroduce
// the RD6.2 centering bug + the RD7.1 fit bug); being OUT OF FLOW is exactly
// how it goes BIG yet stays fit-safe — the zero-scroll resting screen is never
// touched. Win and loss are OPPOSITE in KIND:
//   WIN  = RELEASE  — expand / bright / loud: a full-screen flash, an expanding
//                     ignite ring, sparks radiating outward; the score SLAMS up
//                     + ignites. Fast attack, brief linger, then clears.
//   LOSS = COLLAPSE — contract / cold / heavy: a desaturate + darken sweep over
//                     the whole screen, a downward settle; energy IMPLODES.
//                     Slow, still, then clears. NOT a dimmer win.
//   TIE  = nothing.
// The score still counts up (anticipation) and, on win, SLAMS via the ScoreCell
// pop (transient WAAPI on the cell ITSELF — allowed); on loss it sags cold.
// HONESTY: loud is fine, skill-bragging is not — there are NO words in the
// celebration; the engine's honest line stays the only text. prefers-reduced-
// motion → no celebration (settle straight to the clean resolved screen).
const RD76_COUNT_UP_MS = 1200;
const RD76_EXPLANATION_STAGGER_MS = 200;
const RD77_CELEBRATION_MS = 1400;
// RD7.8 the held breath: the result stays illegible for this long (both score
// cells reel + the margin hero rolls with its sign hidden) before the lock
// fires the celebration. The reel display refreshes every REEL_TICK_MS so it
// reads as churning digits, not a blur.
const RD78_SUSPENSE_MS = 1000;
const RD78_REEL_TICK_MS = 55;

const _rd76PrefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

let _rd77KeyframesInjected = false;
function ensureRd77Keyframes() {
  if (_rd77KeyframesInjected || typeof document === "undefined") return;
  _rd77KeyframesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-rd77-celebration-keyframes", "true");
  style.textContent = `
    @keyframes rd77-win-flash {
      0%   { opacity: 0; }
      9%   { opacity: 0.95; }
      28%  { opacity: 0.40; }
      100% { opacity: 0; }
    }
    @keyframes rd77-win-rays {
      0%   { transform: translate(-50%,-50%) scale(0.15); opacity: 0; }
      14%  { opacity: 0.9; }
      100% { transform: translate(-50%,-50%) scale(3.6); opacity: 0; }
    }
    @keyframes rd77-loss-sweep {
      0%   { opacity: 0; }
      30%  { opacity: 1; }
      68%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes rd77-loss-drop {
      0%   { transform: translateY(-12%); }
      100% { transform: translateY(0); }
    }
    @keyframes rd78-margin-in {
      0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.9); }
      100% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
    }
    @keyframes rd78-margin-win {
      0%   { transform: translate(-50%,-50%) scale(1); }
      32%  { transform: translate(-50%,-50%) scale(1.5); }
      100% { transform: translate(-50%,-50%) scale(1.18); opacity: 0; }
    }
    @keyframes rd78-margin-loss {
      0%   { transform: translate(-50%,-50%) translateY(0) scale(1); opacity: 1; }
      30%  { transform: translate(-50%,-50%) translateY(7px) scale(0.96); opacity: 1; }
      100% { transform: translate(-50%,-50%) translateY(14px) scale(0.9); opacity: 0; }
    }`;
  document.head.appendChild(style);
}

/** Full-screen, transient resolution celebration. A fixed top-layer overlay
 *  (pointer-events:none) that self-clears after RD77_CELEBRATION_MS, then
 *  renders null — leaving the clean results screen untouched. Renders nothing
 *  for tie / inactive. NEVER wraps or transforms the results content. */
function ResolutionCelebration({ outcome, fireKey }: { outcome: "win" | "loss" | "tie"; fireKey: number }) {
  useEffect(ensureRd77Keyframes, []);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (fireKey <= 0 || outcome === "tie") {
      setActive(false);
      return;
    }
    setActive(true);
    const t = window.setTimeout(() => setActive(false), RD77_CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [fireKey, outcome]);

  // Win sparks radiate from screen centre to the edges (vmin units → scales to
  // any phone). Re-randomized each fire via the fireKey dep.
  const sparks = useMemo(() => {
    if (outcome !== "win") return [];
    return Array.from({ length: 22 }, (_, i) => {
      const ang = (Math.PI * 2 * i) / 22 + (Math.random() - 0.5) * 0.35;
      const dist = 38 + Math.random() * 44;
      return {
        id: i,
        dx: +(Math.cos(ang) * dist).toFixed(1),
        dy: +(Math.sin(ang) * dist).toFixed(1),
        scale: +(0.5 + Math.random() * 0.9).toFixed(2),
        c: ["#FFD700", "#FFE066", WINNING_COLOR, "#FFFFFF"][Math.floor(Math.random() * 4)],
        delay: Math.floor(Math.random() * 60),
      };
    });
  }, [outcome, fireKey]);

  if (!active || outcome === "tie") return null;

  const layer: React.CSSProperties = { position: "fixed", inset: 0, pointerEvents: "none" };

  if (outcome === "win") {
    return (
      <div data-h2h-resolution-celebration="win" aria-hidden="true" style={{ ...layer, zIndex: 2147483000, overflow: "hidden" }}>
        {/* RELEASE — full-screen bright flash */}
        <div
          style={{
            ...layer,
            background: `radial-gradient(circle at 50% 52%, rgba(255,255,255,0.95) 0%, ${WINNING_COLOR} 26%, rgba(34,197,94,0) 64%)`,
            mixBlendMode: "screen",
            animation: "rd77-win-flash 720ms ease-out forwards",
          }}
        />
        {/* expanding ignite ring */}
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "52%",
            width: "44vmin",
            height: "44vmin",
            borderRadius: "50%",
            boxShadow: `0 0 36px 10px ${WINNING_COLOR}, inset 0 0 24px ${WINNING_COLOR}`,
            animation: "rd77-win-rays 900ms cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        />
        {/* sparks radiating to the edges */}
        {sparks.map((s) => (
          <div
            key={s.id}
            style={{
              position: "fixed",
              left: "50%",
              top: "52%",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: s.c,
              boxShadow: `0 0 8px ${s.c}`,
              animation: `rd77-spark-${s.id} 1000ms cubic-bezier(0.16,1,0.3,1) ${s.delay}ms forwards`,
            }}
          />
        ))}
        <style>
          {sparks
            .map(
              (s) => `@keyframes rd77-spark-${s.id} {
              0%   { transform: translate(-50%,-50%) scale(${s.scale}); opacity: 1; }
              75%  { opacity: 1; }
              100% { transform: translate(calc(-50% + ${s.dx}vmin), calc(-50% + ${s.dy}vmin)) scale(0); opacity: 0; }
            }`,
            )
            .join("")}
        </style>
      </div>
    );
  }

  // LOSS — cold, heavy collapse: a desaturate + darken sweep + a downward settle.
  return (
    <div data-h2h-resolution-celebration="loss" aria-hidden="true" style={{ ...layer, zIndex: 2147483000, overflow: "hidden" }}>
      <div
        style={{
          ...layer,
          backdropFilter: "grayscale(0.9) brightness(0.5)",
          WebkitBackdropFilter: "grayscale(0.9) brightness(0.5)",
          background: "rgba(6,8,16,0.40)",
          animation: "rd77-loss-sweep 1400ms ease-in-out forwards",
        }}
      />
      <div
        style={{
          ...layer,
          background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
          animation: "rd77-loss-sweep 1400ms ease-in-out forwards, rd77-loss-drop 1400ms ease-out forwards",
        }}
      />
    </div>
  );
}

/** Signed margin text for the hero — "+3.2" / "−1.8" / "0.0" (U+2212 minus). */
function formatMargin(m: number): string {
  if (Math.abs(m) < 0.05) return "0.0";
  const mag = Math.abs(m).toFixed(1);
  return m > 0 ? `+${mag}` : `−${mag}`;
}

/** RD7.8 MARGIN HERO — the suspense instrument AND the reveal's visual hero. A
 *  fixed, centred, pointer-events:none overlay (zero layout impact). While
 *  `phase === "resolving"` it shows the margin ROLLING with its sign hidden (the
 *  user genuinely doesn't know yet) in a NEUTRAL colour, so it never leaks the
 *  outcome. At the lock (`phase === "revealed"`) it shows the FINAL signed
 *  margin and plays the reveal beat — WIN: emphatic scale-up then settle+fade;
 *  LOSS: cold drop+fade — landing on a brain that didn't know. The margin (not
 *  the totals) is the felt quantity, especially apt for a head-to-head. */
function MarginHero({
  phase,
  value,
  outcome,
  revealKey,
}: {
  phase: "resolving" | "revealed";
  value: number;
  outcome: "win" | "loss" | "tie";
  revealKey: number;
}) {
  useEffect(ensureRd77Keyframes, []);
  const color =
    phase === "resolving"
      ? "rgba(234,240,255,0.92)"
      : outcome === "win"
        ? WINNING_COLOR
        : outcome === "loss"
          ? "#EF4444"
          : "#FFB14A";
  const anim =
    phase === "resolving"
      ? "rd78-margin-in 240ms ease-out"
      : outcome === "win"
        ? `rd78-margin-win ${RD77_CELEBRATION_MS}ms cubic-bezier(0.16,1,0.3,1) forwards`
        : outcome === "loss"
          ? `rd78-margin-loss ${RD77_CELEBRATION_MS}ms ease-in forwards`
          : "rd78-margin-in 240ms ease-out";
  return (
    // `key` flips on the revealed beat so the win/loss keyframe re-fires fresh.
    <div
      key={phase === "revealed" ? `r${revealKey}` : "resolving"}
      data-h2h-margin-hero={phase}
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "50%",
        top: "44%",
        transform: "translate(-50%,-50%)",
        pointerEvents: "none",
        zIndex: 2147483600,
        fontSize: 72,
        fontWeight: 950,
        letterSpacing: -2,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        color,
        textShadow: "0 2px 18px rgba(0,0,0,0.55)",
        animation: anim,
      }}
    >
      {formatMargin(value)}
    </div>
  );
}

/** The user's score cell, wired for the RD7.8 reveal beat. The PARENT owns the
 *  suspense timeline and feeds `displayTotal` (the reel during suspense, then
 *  undefined → the final). When `revealNonce` flips (the lock), this fires the
 *  win SLAM (ScoreCell pop) or the loss cold sag — transient WAAPI on the cell
 *  itself, so the cross-surface no-snap is intact at rest. */
function AnimatedUserScore({
  total,
  state,
  sizeProgress,
  displayTotal,
  revealNonce,
  reducedMotion,
}: {
  total: number;
  state: "leading" | "trailing" | "tied";
  sizeProgress: number;
  displayTotal: number | undefined;
  revealNonce: number;
  reducedMotion: boolean;
}) {
  const [pop, setPop] = useState<
    { magnitude: number; durationMs: number; kind: "scaled" | "lead-change"; key: number } | undefined
  >(undefined);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const firedNonce = useRef(0);

  useEffect(() => {
    if (revealNonce <= 0 || revealNonce === firedNonce.current || reducedMotion) return;
    firedNonce.current = revealNonce;
    if (state === "leading") {
      // WIN — the score SLAMS, synced with the full-screen eruption.
      setPop({ magnitude: 1.42, durationMs: 560, kind: "scaled", key: revealNonce });
    } else if (state === "trailing") {
      // LOSS — a heavier cold downward sag (opposite vector to the slam).
      const node = wrapRef.current;
      if (node && typeof node.animate === "function") {
        node.animate(
          [
            { transform: "translateY(0)", opacity: 1 },
            { transform: "translateY(5px)", opacity: 0.72, offset: 0.5 },
            { transform: "translateY(2px)", opacity: 0.9 },
          ],
          { duration: 620, easing: "ease-out", fill: "none" },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealNonce, state, reducedMotion]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <ScoreCell
        total={total}
        displayTotal={displayTotal}
        state={state}
        sizeProgress={sizeProgress}
        surface="overlay"
        teamPosition="user"
        pop={pop}
      />
    </span>
  );
}

// Score cell (right-rail) is now the shared ScoreCell imported from
// H2HScoreRail. The overlay surface passes surface="overlay" to drive
// the data-h2h-overlay-score* attribute namespace.

// ── Countdown pill ───────────────────────────────────────────────────────

// Live 1-second countdown math. Returns the seconds left (null when no
// window) + urgency flag. Shared by the in-CTA clock below.
function useCountdown(windowClosesAtMs: number | null | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (windowClosesAtMs == null) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [windowClosesAtMs]);

  const secondsLeft = windowClosesAtMs == null
    ? null
    : Math.max(0, Math.floor((windowClosesAtMs - nowMs) / 1_000));
  const isUrgent = secondsLeft != null && secondsLeft < URGENT_THRESHOLD_MS / 1_000;
  return { secondsLeft, isUrgent };
}

// #7 (2026-06-08): the flip-timer now lives INSIDE the CTA bar, right-
// aligned, as a bare clock — the standalone pill above the CTA was
// overlaying the bottom mini-strip (the tap-to-preview/flip area). The
// label stays dead-centered on the bar (see the CTA render); this clock
// is absolutely positioned to the right so it never shifts the label.
function CtaClock({ windowClosesAtMs }: { windowClosesAtMs: number | null | undefined }) {
  const { secondsLeft, isUrgent } = useCountdown(windowClosesAtMs);
  const text = secondsLeft == null
    ? "—:—"
    : `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  return (
    <span
      data-h2h-overlay-countdown="true"
      aria-hidden="true"
      style={{
        position: "absolute",
        right: 16,
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        // On the amber CTA, darken for contrast; redden when urgent.
        color: isUrgent ? "#B91C1C" : "rgba(7,10,18,0.62)",
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
}

// ── H2HResultsOverlay ────────────────────────────────────────────────────

export function H2HResultsOverlay(props: H2HResultsOverlayProps) {
  const {
    sender,
    recipient,
    renderCard,
    state,
    windowClosesAtMs,
    onSendItBack,
    onTryAgain,
    onPlayOwnHand,
    onDismiss,
    visible = true,
    initialTopFlippedCardId = null,
    initialBottomFlippedCardId = null,
    senderRevealOrder,
    recipientRevealOrder,
    primaryCtaOverride,
    globalHeader,
    explanation,
    ctaSlot,
  } = props;

  // Per-strip flip (phase 4 fix 3, 2026-05-27). Each strip has its OWN
  // selection — both slots can be filled simultaneously for 1v1 face-
  // to-face comparison. Null when that strip's hero slot is empty.
  const [topSelectedCardId, setTopSelectedCardId] = useState<string | null>(initialTopFlippedCardId);
  const [bottomSelectedCardId, setBottomSelectedCardId] = useState<string | null>(initialBottomFlippedCardId);
  // #7 (2026-06-08): preview-then-flip for the user hero. Selecting a
  // card shows it FRONT-up; a deliberate second tap (the active mini
  // card OR the hero card) flips it. Switching to a different card
  // always resets to front — never jump card-back→card-back across
  // selections. `false` on mount so a seeded initialBottomFlippedCardId
  // previews front, not back.
  const [bottomHeroFlipped, setBottomHeroFlipped] = useState<boolean>(false);
  const handleTopCardTap = useCallback((cardId: string) => {
    setTopSelectedCardId(prev => (prev === cardId ? null : cardId));
  }, []);
  const handleBottomCardTap = useCallback((cardId: string) => {
    // Re-tap of the already-active card → flip in place. A different
    // card → select it and reset to front. No deselect: the hero keeps
    // showing the last-tapped card (confirmed product decision).
    if (cardId === bottomSelectedCardId) {
      setBottomHeroFlipped(f => !f);
    } else {
      setBottomSelectedCardId(cardId);
      setBottomHeroFlipped(false);
    }
  }, [bottomSelectedCardId]);
  // Tap on the occupied hero card itself → flip in place.
  const handleBottomHeroTap = useCallback(() => {
    setBottomHeroFlipped(f => !f);
  }, []);
  // Reset selection + flip when the overlay becomes invisible so the
  // next show starts with the hero slot empty (bordered) and front-side.
  useEffect(() => {
    if (!visible) {
      setTopSelectedCardId(null);
      setBottomSelectedCardId(null);
      setBottomHeroFlipped(false);
    }
  }, [visible]);

  const topSelectedCard = useMemo(
    () => topSelectedCardId
      ? sender.cards.find(c => c.cardId === topSelectedCardId) ?? null
      : null,
    [topSelectedCardId, sender.cards],
  );
  const bottomSelectedCard = useMemo(
    () => bottomSelectedCardId
      ? recipient.cards.find(c => c.cardId === bottomSelectedCardId) ?? null
      : null,
    [bottomSelectedCardId, recipient.cards],
  );

  // Headline input. Relay-tension Phase 1 collapsed the two-block
  // commentary to one block (headline only), so the trash-talk line
  // is no longer rendered. The chadTrashTalk generator (shared/
  // commentary/chadChallenge) is unchanged — we just stopped calling
  // it here. Re-introducing the trash-talk render is a single
  // useMemo + JSX node away if the relay frame dials back.
  const delta = recipient.totalFp - sender.totalFp;
  // bucket stays computed for the data-h2h-overlay-bucket attribute
  // (consumers downstream of the overlay still read it); it no longer
  // drives headline copy or color — RD1 keys both off the SIGN of delta.
  const bucket = trashTalkBucket(delta);
  const challengerName = sender.displayName || null;
  // RD7.5 Move 2 (2026-06-14): the outcome headline + FP-hero are no
  // longer rendered (the verdict collapsed to the single RD7.2 engine
  // line, which carries the margin). selectHeadline/formatFpHero stay
  // exported + unit-tested; we just stopped CALLING them here.
  // headlineColor (selectOutcomeColor) survives — it tints the single
  // engine line as the cheap win/loss color cue.
  const headlineColor = selectOutcomeColor(delta);

  // Right-rail score treatment tracks the FINAL totals via the shared
  // ScoreCell three-state model (relay-tension Phase 1). Cross-surface
  // handoff: the SAME formula runs on the reveal surface at phase===
  // "done", with displayTotal === final total — so the last reveal
  // frame's ScoreCell and the first overlay frame's ScoreCell render
  // identically (same color, same glow, same scale).
  const overlayReferenceTotal = Math.max(sender.totalFp, recipient.totalFp, 0.0001);
  const senderSizeProgress = sender.totalFp / overlayReferenceTotal;
  const recipientSizeProgress = recipient.totalFp / overlayReferenceTotal;
  const overlayTied =
    Math.abs(sender.totalFp - recipient.totalFp) < 0.05 &&
    sender.totalFp > 0 &&
    recipient.totalFp > 0;
  const senderState: "leading" | "trailing" | "tied" = overlayTied
    ? "tied"
    : sender.totalFp > recipient.totalFp
      ? "leading"
      : "trailing";
  const recipientState: "leading" | "trailing" | "tied" = overlayTied
    ? "tied"
    : recipient.totalFp > sender.totalFp
      ? "leading"
      : "trailing";

  // Win/loss/tie for the RD7.7 celebration + RD7.8 reveal (maps the score
  // three-state to the outcome KIND).
  const outcomeKind: "win" | "loss" | "tie" =
    overlayTied ? "tie" : recipient.totalFp > sender.totalFp ? "win" : "loss";
  const finalMargin = recipient.totalFp - sender.totalFp;

  // RD7.8 SUSPENSE → REVEAL timeline (single source — replaces the RD7.6 "count
  // up to your own total" beat, which removed the suspense by leaving Mike's
  // target static so the crossing was legible early). On entrance the result is
  // NOT readable: for ~RD78_SUSPENSE_MS BOTH score cells "reel" (churn around a
  // shared centre, held in a NEUTRAL state so no leading/trailing colour leaks
  // the winner) and the MARGIN HERO rolls with its SIGN HIDDEN — the brain runs
  // the comparison and genuinely doesn't know yet. At the LOCK: the reel clears
  // (cells snap to finals + real colour), the margin locks to its final signed
  // value (the sign locking IS the reveal), and we fire the EXISTING RD7.7
  // celebration fork (revealNonce → the score slam/sag) + stagger the honest
  // line in. The reel NEVER paints on the mount frame — it starts inside the
  // RAF (after the crossfade), so the RD3-C no-snap holds and JSDOM (no RAF
  // advance) sees the finals. Reduced-motion / non-visible → settle straight to
  // the resolved screen, no suspense.
  const reducedMotion = _rd76PrefersReducedMotion();
  const [explanationRevealed, setExplanationRevealed] = useState(false);
  const [celebration, setCelebration] = useState<{ outcome: "win" | "loss" | "tie"; key: number } | null>(null);
  const [reel, setReel] = useState<{ user: number; opp: number; margin: number } | null>(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const [marginPhase, setMarginPhase] = useState<"idle" | "resolving" | "revealed">("idle");
  const celebrationKeyRef = useRef(0);
  useEffect(() => {
    if (!visible || reducedMotion) {
      setExplanationRevealed(true);
      setCelebration(null);
      setReel(null);
      setMarginPhase("idle");
      return;
    }
    setExplanationRevealed(false);
    setCelebration(null);
    setReel(null);
    setMarginPhase("resolving");
    const center = (recipient.totalFp + sender.totalFp) / 2;
    const baseRange = Math.max(Math.abs(finalMargin), 12) + 6;
    const marginAmp = Math.max(Math.abs(finalMargin), 8) + 4;
    const start = performance.now();
    let lastTick = -1e9;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / RD78_SUSPENSE_MS, 1);
      if (t >= 1) {
        // LOCK / REVEAL — the held breath releases onto the existing fork.
        setReel(null);
        setMarginPhase("revealed");
        setRevealNonce((k) => k + 1);
        celebrationKeyRef.current += 1;
        setCelebration({ outcome: outcomeKind, key: celebrationKeyRef.current });
        return;
      }
      if (now - lastTick >= RD78_REEL_TICK_MS) {
        lastTick = now;
        const r = baseRange * (1 - t * 0.5); // narrowing churn
        const ma = marginAmp * (1 - t * 0.4);
        setReel({
          user: center + (Math.random() - 0.5) * 2 * r,
          opp: center + (Math.random() - 0.5) * 2 * r,
          margin: (Math.random() - 0.5) * 2 * ma, // sign flips every tick
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const tExpl = window.setTimeout(
      () => setExplanationRevealed(true),
      RD78_SUSPENSE_MS + RD76_EXPLANATION_STAGGER_MS,
    );
    const tIdle = window.setTimeout(
      () => setMarginPhase("idle"),
      RD78_SUSPENSE_MS + RD77_CELEBRATION_MS + 200,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tExpl);
      window.clearTimeout(tIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion, outcomeKind, recipient.totalFp, sender.totalFp]);

  // During the suspense reel both cells show the reel value in a NEUTRAL state
  // (no colour leak); at rest they show their finals + real leading/trailing.
  const suspenseActive = reel !== null;
  const userCellState: "leading" | "trailing" | "tied" = suspenseActive ? "tied" : recipientState;
  const oppCellState: "leading" | "trailing" | "tied" = suspenseActive ? "tied" : senderState;

  // RD6.1: docked-score color helpers retired — the corner ScoreCell
  // computes its own color from `state` (via H2HScoreRail's three-
  // state model). The pre-RD6.1 placeholder span needed a pre-computed
  // color so the empty slot's color was correct before C4's glide
  // animation arrived; with the ScoreCell rendering from mount, the
  // helper is dead.

  // Step 3: substantive "WHY" second line, folded into the commentary
  // block in the freed center column. Picks personality vs tactical
  // flavor internally; both interpolate {delta} and {name}. The voice
  // is the pre-voice-pass copy in shared/commentary/chadChallenge.ts —
  // structure here is final; the bank strings are the voice pass's
  // responsibility.
  const resolutionLine = useMemo(
    () => selectChallengeResolution({
      myScore: recipient.totalFp,
      posterScore: sender.totalFp,
      posterName: challengerName,
    }),
    [recipient.totalFp, sender.totalFp, challengerName],
  );

  // Primary CTA per state. Phase 5b commit 3 (2026-05-28): when the
  // caller passes primaryCtaOverride, it replaces the state-derived
  // pick wholesale — `state` still drives headline color/copy. The
  // sender-side wrapper uses this for the uniform "Play another hand"
  // placeholder; recipient-side callers leave the override undefined
  // and keep today's three state-driven CTAs.
  const primaryCta = primaryCtaOverride ?? (() => {
    if (state === "WIN") return { label: "Send It Back", handler: onSendItBack };
    if (state === "LOSS_OPEN") return { label: "Try Again", handler: onTryAgain };
    return { label: "Play your own hand", handler: onPlayOwnHand };
  })();

  // 2026-06-23 boss-result unification: the early boss-result branch is gone.
  // A boss now renders THROUGH this same human results board (the caller passes
  // boss sender/recipient/state/explanation identically); only the CTA region
  // differs, via the optional ctaSlot below. The verify gate confirmed the
  // boss verdict reads correctly from delta: senderResolved.totalFp and the
  // recorded target both derive from the same persisted shared_challenges.
  // target_fp column (api sender-hand.ts:66 / [id].ts:51), so the board's
  // delta-sign verdict and the recorded win can't disagree.

  return (
    <div
      data-h2h-results-overlay="true"
      data-h2h-overlay-state={state}
      data-h2h-overlay-bucket={bucket}
      data-h2h-overlay-visible={visible ? "true" : "false"}
      data-h2h-overlay-selected-top={topSelectedCardId ?? ""}
      data-h2h-overlay-selected-bottom={bottomSelectedCardId ?? ""}
      style={{
        // Slimmed wrapper (2026-06-24 re-host): a bare positioned/opacity
        // carrier. The <H2HBoardShell> below provides the gradient / font /
        // safe-area / overflow chrome. This wrapper keeps zIndex
        // H2H_RESULTS_OVERLAY_Z (9100) so the result paints OVER the still-
        // mounted arc during the reveal→result crossfade — the z-9000
        // equalization is the SEPARATE gated step — and carries the whole-
        // frame opacity fade (the shell has no outer-opacity prop; its
        // innerOpacity fades only the inner column).
        position: "fixed",
        inset: 0,
        zIndex: H2H_RESULTS_OVERLAY_Z,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity ${OVERLAY_CROSSFADE_MS}ms ease`,
      }}
    >
      {/* 2026-06-24 result→shell re-host (safe half): the hand-rolled inner
          column is RETIRED — H2HResultsOverlay now consumes H2HBoardShell, the
          single source for the a–f inner layout (top strip / hero / bottom
          strip / reserved CTA). innerScrollable + belowBoardSticky reproduce
          the prior overflow-y:auto + sticky-CTA scroll fallback. The slimmed
          outer wrapper above stays at z-9100 (above-arc paint order) + carries
          the crossfade opacity (the shell has no outer-opacity prop). */}
      <H2HBoardShell
        surfaceKind="results-overlay"
        innerScrollable
        // boss-mobile-fit §1.4 (RE-CORRECTED, 2026-06-28): the missing half of
        // the result-hero content-size. The shell's default hero floor is
        // HERO_MIN_HEIGHT_CSS (~331px, two card-rows) which floored the band
        // regardless of the grid → §1.4's grid Row1→auto (above) saved ~0 on its
        // own. Lower the floor to one card-row (HERO_ROW_HEIGHT_CSS, ~159) so the
        // now-content-sized grid (verdict row + user hero card ≈ 237) determines
        // the band: 331→~237, −~94 on every result state. Scoped to THIS overlay
        // shell call only — the play-surface duel hero keeps the full 2-row
        // HERO_MIN_HEIGHT_CSS (§1.5).
        heroMinHeight={HERO_ROW_HEIGHT_CSS}
        globalHeader={globalHeader}
        /* TOP STRIP (b) — opponent lineup + name/score band. The shell's
           ZonePanel renders the strip then the ZoneHeader (RD6.1-b
           below-strip order) from topStrip/topLabel/topScore. */
        topStrip={
          <ResultsStrip
            cards={sender.cards}
            renderCard={renderCard}
            selectedCardId={topSelectedCardId}
            onCardTap={handleTopCardTap}
            revealOrder={senderRevealOrder}
          />
        }
        topLabel={sender.displayName}
        topScore={
          // RD6.1-c: Mike's corner reads "Target: X" on the results
          // surface too. Same ScoreCell (surface="overlay"; data attrs
          // untouched) — only its corner WRAPPER is now the shell's
          // ZoneHeader (data-h2h-board-corner-score).
          <TargetCornerScore
            scoreCell={
              <ScoreCell
                total={sender.totalFp}
                displayTotal={reel ? reel.opp : undefined}
                state={oppCellState}
                sizeProgress={senderSizeProgress}
                surface="overlay"
                teamPosition="opponent"
              />
            }
          />
        }
        hero={
        <>
        {/* ── HERO ZONE — 3-col × 2-row grid.
            Step 3 (results-page lock): opponent hero removed, commentary
            inserted in its place spanning [left rail + center] of row 1;
            user hero stays in row 2 center byte-identically; scores stay
            in the right-rail ScoreCells (step 4 docks + glides them into
            the ZoneHeaders). Standalone final-gap float removed — the
            margin is now folded into the commentary copy via
            selectHeadline + selectChallengeResolution.
            Columns: [left rail | center | right rail (scores)] = 100/1fr/80.
            Rows: row 1 = verdict band (small floor, grows for a long
            line); row 2 = the user hero card (full HERO_ROW_HEIGHT). */}
        <div
          data-h2h-overlay-hero="true"
          style={{
            position: "relative",
            flex: "0 0 auto",
            display: "grid",
            gridTemplateColumns: `${LEFT_RAIL_WIDTH_PX}px 1fr ${RIGHT_RAIL_WIDTH_PX}px`,
            // ROW 1 (verdict) sizing history:
            //   RD7.4 (2026-06-14): was a FIXED HERO_ROW_HEIGHT track;
            //   at phone width the verdict could exceed it and, since the
            //   commentary block is justify-center, the overflow spilled
            //   BOTH ways (up over TARGET, down over the hero). Fix:
            //   minmax(floor, auto) so it grows instead of overflowing.
            //   RD7.5 Move 4 (2026-06-14): floor dropped from
            //   HERO_ROW_HEIGHT (~158px) to VERDICT_ROW_MIN_PX (the
            //   verdict is now ONE compact line, Move 2) — reclaiming the
            //   dead space that forced the results screen to scroll on the
            //   phone. minmax keeps the anti-overflow growth: a worst-case
            //   2–3-line engine line grows the row, never spills. ROW 2
            //   (user hero card) stays a fixed HERO_ROW_HEIGHT track;
            //   auto-flow still drops the HeroCell into row 2 col 2
            //   (no-jump hero X/Y preserved).
            // 2026-06-24 Option A lock: slot-c (row 1) floors at the shared
            // one-card-row height (HERO_ROW_HEIGHT_CSS = shell
            // HERO_CARD_ROW_HEIGHT_CSS) — the SAME height play's slot-c and
            // reveal's opponent-card row hold, so the c-row doesn't reflow
            // across states. The verdict grows into the hero zone's existing
            // ~80px slack (measured fit at 375×667 / 360×640); minmax keeps
            // the anti-overflow `auto` growth for a worst-case 2–3-line line.
            // boss-mobile-fit §1.4 (2026-06-27): Row 1 floor was a full
            // HERO_ROW_HEIGHT card-row (~159/175px) holding a ~40px verdict
            // line — over-reservation, not an empty row. Content-size it:
            // minmax(HERO_ROW_HEIGHT_CSS, auto) → auto. Reclaims ~115–145px on
            // the RESULT surface (the binding overflow case). Row 2 (user hero
            // card) stays HERO_ROW_HEIGHT_CSS — hero X/Y untouched. This
            // deliberately drops the 2026-06-24 Option A cross-state floor on
            // the result only (result is action-reached, not an in-place jump).
            gridTemplateRows: `auto ${HERO_ROW_HEIGHT_CSS}`,
            rowGap: HERO_ROW_GAP_PX,
            width: "100%",
            // Piece 2a (2026-05-28, doc lock a5d7e43): hero → bottom-strip
            // gap reduced 18 → 4. Bottom strip moves up by 14px,
            // creating reserved-space room for the CTA.
            // RD6.2-prep-C (2026-06-12): 4 → 0 mirrors HERO_MARGIN_BOTTOM_PX
            // shared cut.
            // RD6.2-prep-E (2026-06-12): 0 → 12 mirrors HERO_MARGIN_BOTTOM_PX
            // (now 12) — gives the bottom hero a real-phone-visible
            // breathing gap to the bottom strip. With the bottom panel's
            // paddingTop staying at 8, total bottom hero gap = 20.
            marginBottom: 12,
          }}
        >
          {/* Row 1: commentary block — spans LEFT RAIL + CENTER (278px at
              390 viewport). RD1 — three stacked elements, centered
              within the freed area:
                1. OUTCOME headline (selectHeadline) — pure outcome+rival,
                   keyed off SIGN of delta; the margin number is NOT in
                   the string (it lives in the hero below).
                2. FP hero (formatFpHero) — signed magnitude rendered
                   large + tabular-nums, in the outcome color.
                3. Why-line (selectChallengeResolution) — RD0-clean
                   small supporting copy, untouched by RD1.
              Color flows from selectOutcomeColor(delta) — win green,
              loss red, tie amber. Step 4 unlocks expanding this to
              full-width once scores leave the right rail. */}
          <div
            data-h2h-overlay-commentary="true"
            style={{
              gridRow: 1,
              // RD6.2-C-rev3 ROOT-CAUSE FIX (2026-06-12): "1 / span 2"
              // → "1 / -1". Pre-fix the verdict commentary block
              // spanned only the left-rail + center columns, so its
              // centered children (headline, fpHero, why-line) sat
              // ~40px LEFT of the board's true horizontal center
              // (offset = RIGHT_RAIL_WIDTH_PX / 2 = 40). Spanning all
              // three columns places the block's center on the
              // board's true center; the row-1 col-3 placeholder
              // below is still rendered to park its grid cell but no
              // longer constrains the verdict's width.
              gridColumn: "1 / -1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "stretch",
              gap: 8,
              padding: "0 8px",
              minWidth: 0,
            }}
          >
            {/* RD7.5 Move 2 (2026-06-14): the verdict is now ONE line —
                the RD7.2 engine explanation, which already LEADS WITH THE
                MARGIN ("Down 10.9 — …" / "Up 14.2 — …"). The pre-RD7.5
                stack was a large RED outcome headline (data-h2h-overlay-
                headline, "YOU LOST TO {full name}") + a big signed FP-hero
                number (data-h2h-overlay-fphero) ABOVE this line. Both are
                REMOVED:
                  • the giant "YOU LOST TO {name}" headline spelled out the
                    opponent who is ALSO shown as a hero card → double-name;
                  • the FP-hero duplicated the margin that now lives inside
                    this line.
                The engine line becomes the star (not a subordinate caption).
                selectHeadline / formatFpHero / selectOutcomeColor stay
                exported + unit-tested; only their RENDER here is retired.
                Win/loss color cue kept cheaply: the line is tinted with
                headlineColor (= selectOutcomeColor(delta): loss red, win
                green, tie amber). Removing two stacked elements REDUCES
                height (feeds the Move-4 fit). Engine line falls back to the
                legacy resolutionLine for non-explanation consumers. */}
            <div
              data-h2h-overlay-resolution="true"
              style={{
                fontSize: 16,
                // RD7.10 FIX 3 (2026-06-15): 600 → 700. WEIGHT ONLY — the line
                // read too thin on phone. Copy, headlineColor tint
                // (selectOutcomeColor red/green/amber), and the RD7.4 minmax
                // grid track are all untouched. The SUBSTANCE half of the img-4
                // feedback (commentary-grade flavor) is RD7.11, a separate
                // engine ticket — not touched here.
                fontWeight: 700,
                color: headlineColor,
                letterSpacing: -0.1,
                lineHeight: 1.35,
                wordBreak: "break-word",
                textAlign: "center",
                // RD7.6 stagger: fade + small rise in AFTER the score beat
                // resolves (outcome first, then "why"). Opacity/transform on
                // this leaf line only — no reflow, no height change, the
                // verdict row keeps its min-height floor either way.
                opacity: explanationRevealed ? 1 : 0,
                transform: explanationRevealed ? "translateY(0)" : "translateY(6px)",
                transition: "opacity 280ms ease, transform 280ms ease",
              }}
            >
              {explanation ?? resolutionLine}
            </div>
          </div>

          {/* RD6.1 (2026-06-11): row 1 right-rail opponent ScoreCell
              deleted — the opponent total now renders in the top
              ZoneHeader's score slot above. An aria-hidden placeholder
              parks the row 1 col 3 grid cell so CSS auto-flow doesn't
              pull the row-2 user hero out of the center column. */}
          <div aria-hidden="true" style={{ gridRow: 1, gridColumn: 3 }} />

          {/* Row-2 left-rail spacer. With the opponent HeroCell removed,
              CSS grid auto-flow would otherwise place the next in-flow
              item (the user HeroCell) into the first available slot —
              row 2 col 1 (left rail) — pulling the locked user hero out
              of the center column. This explicit empty cell parks row
              2 col 1 so auto-flow puts the user hero into row 2 col 2
              (center). */}
          <div aria-hidden="true" style={{ gridRow: 2, gridColumn: 1 }} />

          {/* Row 2: user hero cell (LOCKED — byte-identical X/Y vs prior
              step). RD6.1 deletes the row-2 right-rail user ScoreCell
              for the same reason as the opponent above — the user total
              now lives in the bottom ZoneHeader's score slot. */}
          <HeroCell card={bottomSelectedCard} renderCard={renderCard} flipped={bottomHeroFlipped} onTap={handleBottomHeroTap} showEmptyBorder />
          {/* RD6.1: row-2 right-rail user ScoreCell deleted (see comment
              above); empty cell parks the grid slot so the layout
              stays the same. */}
          <div aria-hidden="true" style={{ gridRow: 2, gridColumn: 3 }} />
        </div>
        </>
        }
        /* BOTTOM STRIP (e) — user lineup + name/score band. Shell renders
           the ZoneHeader then the strip (RD6.1-b above-strip order) from
           bottomLabel/bottomScore + bottomStrip. */
        bottomStrip={
          <ResultsStrip
            cards={recipient.cards}
            renderCard={renderCard}
            selectedCardId={bottomSelectedCardId}
            onCardTap={handleBottomCardTap}
            revealOrder={recipientRevealOrder}
          />
        }
        bottomLabel={recipient.displayName}
        bottomScore={
          <AnimatedUserScore
            total={recipient.totalFp}
            state={userCellState}
            sizeProgress={recipientSizeProgress}
            displayTotal={reel ? reel.user : undefined}
            revealNonce={revealNonce}
            reducedMotion={reducedMotion}
          />
        }

        /* RESERVED BOTTOM (f) — CTA region. The shell's belowBoardSticky
           wrapper provides the flex:0 0 auto + marginTop:auto + sticky:bottom:0
           mechanism that the hand-rolled reserved-bottom used to carry. */
        belowBoard={
          <div
            data-h2h-overlay-reserved="true"
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              // G2 (must-handle): the CTA underlay gradient rides INSIDE
              // belowBoard so it travels with the sticky CTA. The shell's
              // reserved-bottom has no background of its own; without this the
              // bottom strip can bleed through the sticky CTA on tight
              // viewports. Verbatim from the prior reserved-bottom underlay.
              background: "linear-gradient(180deg, #070A12 0%, #070A12 100%)",
            }}
          >
          {/* RD7.10-c (2026-06-15): the relocated "game logs" discoverability
              hint. Permanent footer row — FIRST child of the reserved band, so
              it sits BELOW the YOU mini-slot row and ABOVE the CTA. Full-width
              in normal flow with textAlign:center → centers cleanly (no rail
              asymmetry down here, which is the whole reason for the move).
              Position-neutral copy renders in every state (empty + previewed).
              Kept deliberately MINIMAL — 11px, muted, tight line-height, small
              marginBottom — because this row ADDS flow height to a no-scroll-
              tight overlay (the absolute hero caption it replaced freed none).
              It's an affordance, not the verdict. */}
          <div
            data-h2h-overlay-logs-hint="true"
            style={{
              width: "100%",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.3,
              lineHeight: 1.2,
              color: "rgba(255,255,255,0.40)",
              marginBottom: 8,
              pointerEvents: "none",
            }}
          >
            Tap any card for game logs
          </div>
          {/* 2026-06-23 boss-result unification: the boss path supplies its
              share/replay block here via ctaSlot, REPLACING the state-derived
              primaryCta button (and only it — the reserved band, logs hint,
              and sticky positioning are shared). Human path leaves ctaSlot
              undefined → the exact prior button renders, byte-identical. */}
          {ctaSlot ?? (
            <div
              data-h2h-overlay-ctas="true"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: "100%",
                maxWidth: 360,
                margin: "0 auto",
              }}
            >
              <button
                type="button"
                data-h2h-overlay-primary-cta="true"
                data-cta-label={primaryCta.label}
                onClick={primaryCta.handler}
                style={{
                  position: "relative",
                  // RD6.1-g (2026-06-11): padding 15 → 10. Tightens the
                  // CTA button to ~36–40px tall (was ~46–50px). The
                  // 16px text + 900 weight stays plenty tappable; the
                  // 10px padding keeps thumb-comfortable hit area.
                  padding: "10px",
                  borderRadius: 12,
                  background: "#FFB14A",
                  border: "none",
                  color: "#070A12",
                  fontSize: 16,
                  fontWeight: 900,
                  textAlign: "center",
                  cursor: "pointer",
                }}
              >
                {primaryCta.label}
                {/* #7: flip-timer merged into the bar — bare clock, right-
                    aligned, absolutely positioned so the label stays
                    dead-centered. LOSS_OPEN only. Removing the old pill
                    reclaims the vertical space that was overlaying the
                    bottom mini-strip's tap area. */}
                {state === "LOSS_OPEN" && (
                  <CtaClock windowClosesAtMs={windowClosesAtMs} />
                )}
              </button>
            </div>
          )}
        </div>
        }
        belowBoardSticky
        compositeOverlay={
          <>
            {/* × close — frame overlay. Rides compositeOverlay (the shell's
                slot for content inside its fixed frame, after the inner
                column) rather than a bare wrapper sibling: the shell's
                z-9000 stacking context would otherwise hide a z-1 sibling
                ×. Button verbatim; paints over the board by DOM order. */}
            <button
              type="button"
              data-h2h-overlay-close="true"
              onClick={onDismiss}
              aria-label="Close result"
              style={{
                position: "absolute",
                top: "calc(env(safe-area-inset-top, 0px) + 14px)",
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 16,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.55)",
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1,
                cursor: "pointer",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
            {/* RD7.8 margin hero — the suspense instrument (rolling, sign
                hidden) + the reveal's visual hero. Fixed top layer, OUTSIDE
                the inner column's flow (zero layout impact). */}
            {marginPhase !== "idle" && (
              <MarginHero
                phase={marginPhase}
                value={reel ? reel.margin : finalMargin}
                outcome={outcomeKind}
                revealKey={revealNonce}
              />
            )}
            {/* RD7.7 full-screen resolution celebration — a fixed TOP LAYER,
                OUTSIDE the inner column's flow (never wraps/scales/transforms
                the results content underneath). Self-clears after the
                animation, revealing the clean results screen. */}
            {celebration && (
              <ResolutionCelebration outcome={celebration.outcome} fireKey={celebration.key} />
            )}
          </>
        }
      />
    </div>
  );
}

export default H2HResultsOverlay;
