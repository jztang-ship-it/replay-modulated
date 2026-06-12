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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { H2HCard, H2HHand, CardRenderer } from "./H2HRevealScreen";
import { HAND_STRIP_HEIGHT_PX, HAND_STRIP_CARD_CONTENT_WIDTH_PX } from "./H2HRevealScreen";
import { CORNER_SCORE_MIN_WIDTH_PX, TargetCornerScore } from "./H2HBoardShell";
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
}

/** Cross-fade duration. */
export const OVERLAY_CROSSFADE_MS = 350;

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
const HERO_CARD_MAX_WIDTH = "min(125px, 28vw)"; // matches arc's BATTLEFIELD_CARD_MAX_WIDTH

// Step 3: explicit per-row hero height for the hero grid. Pinning each
// row to this prevents row-1 from collapsing when the opponent HeroCell
// is removed (replaced by the commentary block) — without it, row 1
// would auto-size to commentary's intrinsic height (~60-90px), pulling
// the user hero up and breaking the no-jump invariant locked in step 1.
// Value: HERO_CARD_MAX_WIDTH × 478/329 (the hero card's aspect-ratio-
// derived height). Step-1 no-jump assertion stays green because the
// user hero in row 2 retains the exact X/Y it had before.
const HERO_ROW_HEIGHT_CSS = `calc(${HERO_CARD_MAX_WIDTH} * ${(478 / 329).toFixed(6)})`;

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

function ZonePanel({ children, dataAttr, style }: { children: React.ReactNode; dataAttr?: string; style?: React.CSSProperties }) {
  return (
    <div
      data-h2h-overlay-zone={dataAttr}
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: ZONE_GAP_PX,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        padding: "8px 12px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ZoneHeader({
  hand,
  position,
  score,
}: {
  hand: H2HHand;
  position?: "top" | "bottom";
  /** RD6.1 (2026-06-11): re-parented ScoreCell rendered absolute-right.
   *  The score for both teams now LIVES in the box headers — pre-RD6.1
   *  the right-rail ScoreCells were the live home and this band held
   *  a placeholder span that the step-4 glide animated values into.
   *  RD6.1 deletes the glide; the ScoreCell is the same component the
   *  reveal renders in the same DOM position, so the reveal→results
   *  no-snap upgrades to component+geometric identity. */
  score?: React.ReactNode;
}) {
  // Outer + name recipe matches H2HBoardShell.ZoneHeader on the reveal
  // side verbatim — padding "0 6px", height ZONE_HEADER_HEIGHT_PX, flex
  // with justifyContent:center, font 18/900, color rgba(0.95),
  // letterSpacing 1, uppercase. That parity is what the no-jump-name
  // cross-surface assertion locks; same parity now extends to the
  // score's position (absolute-right via the shared CORNER_SCORE_MIN_
  // WIDTH_PX template).
  return (
    <div
      data-h2h-overlay-zone-label={position}
      style={{
        position: "relative",                  // anchor for the absolute score
        // RD6.2-prep-A2 (2026-06-12): header capped to the strip's
        // intrinsic card-content span and centered with auto margins
        // — mirrors H2HBoardShell.ZoneHeader so the reveal→results
        // no-snap geometric parity holds. Pre-A2 the band bulged
        // past the card edges on viewports above ~390 because the
        // ZonePanel content box is wider than the centered card
        // span. Padding zeroed so outer-left = first-card-left.
        padding: 0,
        width: "100%",
        maxWidth: HAND_STRIP_CARD_CONTENT_WIDTH_PX,
        marginLeft: "auto",
        marginRight: "auto",
        height: ZONE_HEADER_HEIGHT_PX,         // unchanged — strip Y depends on this
        display: "flex",
        alignItems: "center",
        // RD6.2-prep-A (2026-06-12): name LEFT-aligned to match the
        // reveal-side H2HBoardShell.ZoneHeader. Both surfaces anchor
        // name to the left and score to the right edge so the
        // reveal→results no-snap geometric parity holds and long
        // names don't fight a centered total for the middle.
        justifyContent: "flex-start",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          // RD6.2-prep-A: unidirectional reserve (right side only) so
          // a left-aligned name uses the full available width before
          // truncating, mirroring H2HBoardShell.ZoneHeader. A2: 100%
          // is now the strip card-content span (capped by outer
          // maxWidth), so the reserve math is the same but the
          // result aligns to the last-card-right edge.
          maxWidth: score
            ? `calc(100% - (${CORNER_SCORE_MIN_WIDTH_PX}px + 8px))`
            : undefined,
          overflow: score ? "hidden" : undefined,
          textOverflow: score ? "ellipsis" : undefined,
          whiteSpace: score ? "nowrap" : undefined,
          // Reveal-matching recipe (verbatim from H2HBoardShell):
          fontSize: 18,
          fontWeight: 900,
          color: "rgba(255,255,255,0.95)",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {hand.displayName}
      </span>
      {score && (
        <div
          data-h2h-overlay-corner-score={position}
          data-h2h-overlay-corner-score-team={position === "top" ? "opponent" : "user"}
          style={{
            position: "absolute",
            // RD6.2-prep-A2 (2026-06-12): flush to outer-right, which
            // after A2's inset equals the last card's right edge.
            right: 0,
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            minWidth: CORNER_SCORE_MIN_WIDTH_PX,
            pointerEvents: "none",
          }}
        >
          {score}
        </div>
      )}
    </div>
  );
}

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
        {/* #7 flip-discoverability caption. Floats just ABOVE the hero box
            (bottom: 100%), out of normal flow → zero effect on the locked
            geometry. pointerEvents:none so taps fall through to the card.
            Empty → invite the first tap; front → invite the flip; back →
            hidden (the card's own "TAP TO FLIP BACK" hint takes over). */}
        {(!card || !flipped) && (
          <div
            data-h2h-overlay-hero-hint={card ? "front" : "empty"}
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.3,
              lineHeight: 1.2,
              color: "rgba(255,255,255,0.45)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {card ? "Tap again — game logs are on the back" : "Tap a card to see the game logs"}
          </div>
        )}
        {card && renderCard(card, { flipped })}
      </div>
    </div>
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
  const headline = selectHeadline({ delta, challengerName });
  const fpHero = formatFpHero(delta);
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

  return (
    <div
      data-h2h-results-overlay="true"
      data-h2h-overlay-state={state}
      data-h2h-overlay-bucket={bucket}
      data-h2h-overlay-visible={visible ? "true" : "false"}
      data-h2h-overlay-selected-top={topSelectedCardId ?? ""}
      data-h2h-overlay-selected-bottom={bottomSelectedCardId ?? ""}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9100,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        // Phase 4 amend3 (2026-05-27): floor reduced 36 → 20 to
        // match the arc. Top strip sits close to the viewport top;
        // the empty space below the bottom strip absorbs viewport
        // slack instead of being top-and-bottom margin.
        // RD6.2-prep-C (2026-06-12): added safe-area pad trimmed 20 → 8
        // to match H2HBoardShell's parallel cut.
        // RD6.2-prep-E (2026-06-12): trimmed 8 → 4 — mirrors the shell
        // for no-snap parity. The +4 visual margin remains above env(),
        // which handles the notch/home-indicator clearance natively.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 4px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
        boxSizing: "border-box",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity ${OVERLAY_CROSSFADE_MS}ms ease`,
      }}
    >
      {/* × close button — same pattern as the prior sheet. */}
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

      {/* Inner column — Phase 4 fix 3 amend2 (2026-05-27): mirrors the
          arc's flex-column layout EXACTLY so the top strip, both hero
          slots, and the bottom strip render at identical Y positions
          on both surfaces. Only the contents of the zones change:
            - hero slots: arc shows active matchup; overlay shows
              tap-to-flip card backs (per-strip, both can be filled
              simultaneously).
            - reserved bottom space: empty on arc; holds countdown
              pill + primary CTA on overlay.
            - left rail of the battlefield grid: empty on arc; holds
              headline + trash-talk on overlay.
            - right rail: FP totals on both; absolute matchup delta
              floats between scores on arc only. */}
      <div
        data-h2h-overlay-inner="true"
        style={{
          width: "100%",
          maxWidth: "min(480px, 100%)",
          height: "100%",
          margin: "0 auto",
          paddingLeft: 16,
          paddingRight: 16,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          // Bug 2 fix (Layout A/B restructure carry-forward §6): the
          // overlay's composition (two strips + hero grid + reserved
          // CTA) genuinely overflows the available height on tight
          // viewports (390×700+ with URL bar, 390×664 mid-scroll,
          // 360×590, 320×520, in-app webviews). The play shell solved
          // this via H2HBoardShell's innerScrollable / belowBoardSticky
          // props (overflow-y:auto on the inner column + sticky-bottom
          // on the reserved-CTA wrapper). H2HResultsOverlay is hand-
          // rolled (not an H2HBoardShell consumer), so it gets its own
          // copy of the same rule. Adaptation is automatic — natural
          // CSS behavior shows no scroll when content fits (control
          // viewports above the comfortable floor stay unchanged);
          // below the floor, overflow-y:auto engages and the reserved-
          // bottom's sticky:bottom:0 keeps the CTA pinned. iOS momentum
          // via -webkit-overflow-scrolling.
          overflowY: "auto" as const,
          WebkitOverflowScrolling: "touch" as const,
          // Phase 4 amend3 (2026-05-27): the top-strip → hero-pair →
          // bottom-strip block is a single TIGHT composition.
          // Piece 2a (2026-05-28, doc lock a5d7e43): gap removed from
          // the outer column; each child carries explicit marginBottom
          // so per-pair gaps can be tuned independently. Top-strip →
          // hero gap stays 18px (hero Y locked by phase 4). Hero →
          // bottom-strip gap reduced 18 → 4 (Strategy α G1: bottom
          // strip moves up by 14px). Bottom-strip → reserved gap
          // reduced 18 → 0 (reserved gets 18px more height). Combined
          // with reserved paddingTop 16 → 8, the CTA gets 40px more
          // unclipped headroom on safe-area-inset viewports — the
          // pre-existing clipping bug is resolved.
          justifyContent: "flex-start",
          alignItems: "stretch",
          gap: 0,
        }}
      >
        {/* ── TOP STRIP — opponent's lineup ────────────────────────────
            RD6.1-b: ZoneHeader moves BELOW the strip so the
            name+Mike-total band sits at the box's INNER edge
            (bottom-right). Mirrors the reveal-side reorder in
            H2HBoardShell — corner-score wrapper stays component+
            position identical across reveal-done and overlay-mount
            frames. */}
        {/* RD6.2-prep-C/D: see commit history.
            RD6.2-prep-E (2026-06-12): 0 → 12 mirrors the shared
            TOP_ZONE_MARGIN_BOTTOM_PX (now 12) in H2HBoardShell. The
            paddingTop: 4 override mirrors the shell's strip-side
            panel-pad trim. Net: top hero gap = panel pad-bot (8) +
            margin (12) = 20px on BOTH surfaces. */}
        <ZonePanel dataAttr="opponent" style={{ marginBottom: 12, paddingTop: 4 }}>
          <ResultsStrip
            cards={sender.cards}
            renderCard={renderCard}
            selectedCardId={topSelectedCardId}
            onCardTap={handleTopCardTap}
            revealOrder={senderRevealOrder}
          />
          <ZoneHeader
            hand={sender}
            position="top"
            score={
              // RD6.1-c: Mike's corner reads "Target: X" on the
              // results surface too. Same ScoreCell as the reveal
              // (data attrs untouched); only the surrounding label
              // changes.
              <TargetCornerScore
                scoreCell={
                  <ScoreCell
                    total={sender.totalFp}
                    state={senderState}
                    sizeProgress={senderSizeProgress}
                    surface="overlay"
                    teamPosition="opponent"
                  />
                }
              />
            }
          />
        </ZonePanel>

        {/* ── HERO ZONE — 3-col × 2-row grid.
            Step 3 (results-page lock): opponent hero removed, commentary
            inserted in its place spanning [left rail + center] of row 1;
            user hero stays in row 2 center byte-identically; scores stay
            in the right-rail ScoreCells (step 4 docks + glides them into
            the ZoneHeaders). Standalone final-gap float removed — the
            margin is now folded into the commentary copy via
            selectHeadline + selectChallengeResolution.
            Columns: [left rail | center | right rail (scores)] = 100/1fr/80.
            Rows: explicit HERO_ROW_HEIGHT_CSS each, so dropping the
            opponent hero does NOT collapse row 1 and pull the user hero
            up. */}
        <div
          data-h2h-overlay-hero="true"
          style={{
            position: "relative",
            flex: "0 0 auto",
            display: "grid",
            gridTemplateColumns: `${LEFT_RAIL_WIDTH_PX}px 1fr ${RIGHT_RAIL_WIDTH_PX}px`,
            gridTemplateRows: `${HERO_ROW_HEIGHT_CSS} ${HERO_ROW_HEIGHT_CSS}`,
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
            <div
              data-h2h-overlay-headline="true"
              style={{
                fontSize: 26,
                fontWeight: 950,
                color: headlineColor,
                letterSpacing: -0.4,
                lineHeight: 1.1,
                textTransform: "uppercase",
                wordBreak: "break-word",
                textAlign: "center",
              }}
            >
              {headline}
            </div>
            <div
              data-h2h-overlay-fphero="true"
              style={{
                fontSize: 32,
                fontWeight: 950,
                color: headlineColor,
                letterSpacing: -0.5,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
              }}
            >
              {fpHero}
            </div>
            <div
              data-h2h-overlay-resolution="true"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "rgba(255,255,255,0.78)",
                letterSpacing: -0.1,
                lineHeight: 1.3,
                wordBreak: "break-word",
                textAlign: "center",
              }}
            >
              {resolutionLine}
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

        {/* ── BOTTOM STRIP — user's lineup ─────────────────────────────
            Phase 4 amend3 (2026-05-27): bottom strip sits IMMEDIATELY
            below the bottom hero. Piece 2a (2026-05-28, doc lock
            a5d7e43): explicit marginBottom: 0 — no gap to the reserved
            space below. The strip flushes directly against reserved,
            which then provides paddingTop: 8 (was 16) for the CTA.
            RD6.1-b: ZoneHeader moves ABOVE the strip so the
            name+YOU-total band sits at the box's INNER (top) edge —
            top-right of the bottom box, mirroring the reveal-side
            reorder in H2HBoardShell. */}
        {/* RD6.2-prep-E (2026-06-12): paddingBottom: 4 override
            mirrors H2HBoardShell's bottom panel strip-side trim. The
            hero-side (paddingTop) stays default 8, partnering with
            HERO_MARGIN_BOTTOM_PX (now 12) for the 20px bottom hero
            gap. */}
        <ZonePanel dataAttr="user" style={{ marginBottom: RESERVED_BOTTOM_CLEARANCE_PX, paddingBottom: 4 }}>
          <ZoneHeader
            hand={recipient}
            position="bottom"
            score={
              <ScoreCell
                total={recipient.totalFp}
                state={recipientState}
                sizeProgress={recipientSizeProgress}
                surface="overlay"
                teamPosition="user"
              />
            }
          />
          <ResultsStrip
            cards={recipient.cards}
            renderCard={renderCard}
            selectedCardId={bottomSelectedCardId}
            onCardTap={handleBottomCardTap}
            revealOrder={recipientRevealOrder}
          />
        </ZonePanel>

        {/* ── RESERVED BOTTOM SPACE (holds CTA + countdown) ────────────
            Phase 4 amend3 (2026-05-27): flex-grow region BELOW the
            bottom strip. On the arc this is empty; on the overlay it
            holds the LOSS_OPEN countdown (if applicable) and the
            primary CTA. The reserved space matches the arc's exact
            geometry — same flex-grow, same position — so the bottom
            strip Y is identical on both surfaces. CTA is anchored
            toward the bottom of the reserved space (flex-end) for a
            comfortable thumb position, but the outer container's
            safe-area paddingBottom keeps it off the viewport edge. */}
        <div
          data-h2h-overlay-reserved="true"
          style={{
            // Bug 2 fix (carry-forward of H2HBoardShell's
            // belowBoardSticky pattern). The play harness already
            // proved this exact mechanism in the play shell:
            //   - flex:1 1 auto + minHeight:0 SHRINKS to 0 under
            //     overflow (children render outside the box), so the
            //     CTA wrapper renders BELOW the visible scroll-port.
            //     That was the prior cause of the CTA clip.
            //   - flex:0 0 auto sizes to content (~64px CTA + 8px
            //     padding), so sticky's bounding box matches the CTA's
            //     actual visual region.
            //   - margin-top:auto pushes reserved-bottom to the bottom
            //     of the flex column when there's leftover space
            //     (= "no scroll / fits" case), so the CTA still
            //     visually sits at the viewport bottom even on roomy
            //     viewports — preserving the prior flex-end behavior.
            //   - When content overflows, sticky:bottom:0 pins
            //     reserved-bottom to the visible scroll-port bottom
            //     (the CTA stays pinned through any scroll position).
            flex: "0 0 auto",
            marginTop: "auto",
            position: "sticky" as const,
            bottom: 0,
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "flex-start",
            // RD6.1-g (2026-06-11): paddingTop 8 → 0. With
            // RESERVED_BOTTOM_CLEARANCE_PX providing the visual gap
            // above the CTA, the reserved-bottom area itself no longer
            // needs its own top padding.
            paddingTop: 0,
            // Match the overlay outer's background so the sticky CTA
            // strip has an opaque underlay when content scrolls behind
            // it (otherwise the bottom strip would bleed through the
            // CTA wrapper on tight viewports).
            background: "linear-gradient(180deg, #070A12 0%, #070A12 100%)",
          }}
        >
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
        </div>
      </div>
    </div>
  );
}

export default H2HResultsOverlay;
