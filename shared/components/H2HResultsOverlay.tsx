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
  TRAILING_COLOR,
  DELTA_NEUTRAL,
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
const HERO_CARD_MAX_WIDTH = "min(145px, 32vw)"; // matches arc's BATTLEFIELD_CARD_MAX_WIDTH

// Step 3: explicit per-row hero height for the hero grid. Pinning each
// row to this prevents row-1 from collapsing when the opponent HeroCell
// is removed (replaced by the commentary block) — without it, row 1
// would auto-size to commentary's intrinsic height (~60-90px), pulling
// the user hero up and breaking the no-jump invariant locked in step 1.
// Value: HERO_CARD_MAX_WIDTH × 478/329 (the hero card's aspect-ratio-
// derived height). Step-1 no-jump assertion stays green because the
// user hero in row 2 retains the exact X/Y it had before.
const HERO_ROW_HEIGHT_CSS = `calc(${HERO_CARD_MAX_WIDTH} * ${(478 / 329).toFixed(6)})`;

// Step 3: docked-score target minimum width inside each ZoneHeader.
// Reserves right-aligned space for the score that will glide in at
// step 4. Widest realistic total "999.9" at fontSize 18, fontWeight 900,
// tabular-nums, letterSpacing -0.3 measures ~52px; 60 pads for metric
// variance across iOS/Android renderers.
const DOCKED_SCORE_TARGET_MIN_WIDTH_PX = 60;

// Hand-strip cell sizing — matches H2HRevealScreen's HandStrip exactly so
// strips look identical between arc and overlay.
const STRIP_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_DISPLAY_WIDTH_PX = (STRIP_HEIGHT_PX * 329) / 478;
const STRIP_CARD_SCALE = STRIP_CARD_DISPLAY_WIDTH_PX / STRIP_CARD_NATURAL_WIDTH_PX;

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
// Sized for the worst-case reserved-bottom block (paddingTop 8 +
// countdown pill ~28px + gap 10 + CTA button ~46px ≈ 92px) plus a
// small breathing margin (~8px).
const RESERVED_BOTTOM_CLEARANCE_PX = 100;
const ZONE_GAP_PX = 4;
const URGENT_THRESHOLD_MS = 5 * 60 * 1000;

// Win/loss colors (WINNING_COLOR, TRAILING_COLOR, DELTA_NEUTRAL) are
// imported from H2HScoreRail and shared with H2HRevealScreen.

// ── Headline copy ────────────────────────────────────────────────────────
//
// Phase 4 placeholder. Polish pass (phase 8) re-tones.

function selectHeadline(args: {
  state: ResultsOverlayState;
  bucket: ResultsMarginBucket;
  delta: number;
  challengerName: string | null;
}): string {
  const { state, bucket, delta, challengerName } = args;
  const d = Math.abs(delta).toFixed(1);
  const name = challengerName ?? "them";

  if (bucket === "photo_finish") return `Photo finish — ${d} FP.`;
  if (state === "WIN") {
    if (bucket === "win_big") return `Cooked. +${d} over ${name}.`;
    return `Got 'em by ${d}.`;
  }
  if (state === "LOSS_OPEN") {
    if (bucket === "loss_big") return `Off by ${d}. One more swing.`;
    return `Off by ${d}. Window's open.`;
  }
  // LOSS_CLOSED
  if (bucket === "loss_big") return `Off by ${d}. Window closed.`;
  return `${d} short. Window closed.`;
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
  dockedScoreColor,
}: {
  hand: H2HHand;
  position?: "top" | "bottom";
  /** Three-state color for the docked-score target placeholder.
   *  Mirrors the existing right-rail ScoreCell logic (winner green / loser
   *  neutral / tie). Step 4 lands the glide that fills the placeholder;
   *  the color rendered here is what the glide will land into. */
  dockedScoreColor: string;
}) {
  // Outer + name recipe MUST match H2HBoardShell.ZoneHeader on the
  // reveal side verbatim — padding "0 6px", height ZONE_HEADER_HEIGHT_PX,
  // flex with justifyContent:center, font 18/900, color rgba(0.95),
  // letterSpacing 1, uppercase. That parity is what the no-jump-name
  // cross-surface assertion locks. Step 3's earlier name-left layout
  // shifted the X-centroid ~34px and produced a visible name-jump on
  // the reveal→results crossfade; this layout restores parity.
  //
  // The docked-score target is position:absolute so it does NOT consume
  // flex space. The name span stays naturally centered by the flex
  // parent regardless of the score's width.
  return (
    <div
      data-h2h-overlay-zone-label={position}
      style={{
        position: "relative",                  // anchor for the absolute score
        padding: "0 6px",
        height: ZONE_HEADER_HEIGHT_PX,         // unchanged — strip Y depends on this
        display: "flex",
        alignItems: "center",
        justifyContent: "center",              // matches reveal — name centered
        flexShrink: 0,
      }}
    >
      <span
        style={{
          // Long-name guard: cap the name's max-width so it
          // ellipsis-truncates BEFORE reaching the absolute score slot
          // on the right. The score reserves DOCKED_SCORE_TARGET_MIN_WIDTH_PX
          // on its side; we reserve the same on the left phantom side
          // (× 2 in the calc) so the AVAILABLE-FOR-NAME band stays
          // centered on the header. Short names (the realistic case,
          // including the fixture's MIKE/YOU) render fully inside this
          // band, fully centered. Long names truncate with ellipsis,
          // their box still centered within the available band — name
          // and score never overlap.
          maxWidth: `calc(100% - 2 * (${DOCKED_SCORE_TARGET_MIN_WIDTH_PX}px + 8px))`,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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
      {/* Docked-score target. Absolutely positioned so it paints over
          the row's right edge without consuming flex space — the name
          stays centered independent of it. EMPTY in this step (content
          omitted); step 4 fills via the glide that animates from the
          right-rail ScoreCell into this slot. data-attrs carry the
          value so step 4's motion handler can read it without
          re-deriving. pointer-events:none so an absent glyph never
          intercepts taps meant for content below. */}
      <span
        data-h2h-overlay-docked-score={position}
        data-h2h-overlay-docked-score-value={hand.totalFp.toFixed(1)}
        style={{
          position: "absolute",
          right: 6,                            // aligns with header padding
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          minWidth: DOCKED_SCORE_TARGET_MIN_WIDTH_PX,
          color: dockedScoreColor,
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: -0.3,
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
        }}
      />
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
        height: STRIP_HEIGHT_PX,
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
              // crossfade is byte-identical on X. HandStrip uses
              // flexShrink:1 + overflow:visible: at viewports where the
              // 6 natural-width cells + 5 gaps overflow the strip's
              // available width (≤ ~422px wide, including iPhone 14
              // 390×844), shrink fits the cells; overflow:visible lets
              // the absolutely-positioned scaled card render inside the
              // shrunk cell without right-edge clipping. flexShrink:1
              // alone with overflow:hidden would clip the inner card's
              // right ~3px on every cell.
              flexShrink: 1,
              minWidth: 0,
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
                transform: `scale(${STRIP_CARD_SCALE})`,
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
}: {
  card: H2HCard | null;
  renderCard: CardRenderer;
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
        style={{
          width: "100%",
          maxWidth: HERO_CARD_MAX_WIDTH,
          // Locked: empty AND occupied cells reserve the same Y span
          // (matches the arc's hero card size). The empty cell is
          // visually invisible — the card content area is just an
          // empty wrapper waiting for a tap-to-flip card to drop in.
          aspectRatio: "329 / 478",
        }}
      >
        {card && renderCard(card, { flipped: true })}
      </div>
    </div>
  );
}

// Score cell (right-rail) is now the shared ScoreCell imported from
// H2HScoreRail. The overlay surface passes surface="overlay" to drive
// the data-h2h-overlay-score* attribute namespace.

// ── Countdown pill ───────────────────────────────────────────────────────

function CountdownPill({ windowClosesAtMs }: { windowClosesAtMs: number | null | undefined }) {
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
  const mm = secondsLeft == null ? null : Math.floor(secondsLeft / 60);
  const ss = secondsLeft == null ? null : secondsLeft % 60;
  const label = secondsLeft == null
    ? "—:—"
    : `${mm}:${ss!.toString().padStart(2, "0")}`;
  return (
    <div
      data-h2h-overlay-countdown="true"
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: isUrgent ? "rgba(239,68,68,0.12)" : "rgba(255,177,74,0.10)",
        border: `1px solid ${isUrgent ? "rgba(239,68,68,0.45)" : "rgba(255,177,74,0.35)"}`,
        color: isUrgent ? "#FCA5A5" : "#FFB14A",
        fontSize: isUrgent ? 16 : 14,
        fontWeight: isUrgent ? 900 : 800,
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {secondsLeft === 0
        ? "Window closing — last shot."
        : secondsLeft == null
          ? "—:— to flip this."
          : `${label} to flip this.`}
    </div>
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
  const handleTopCardTap = useCallback((cardId: string) => {
    setTopSelectedCardId(prev => (prev === cardId ? null : cardId));
  }, []);
  const handleBottomCardTap = useCallback((cardId: string) => {
    setBottomSelectedCardId(prev => (prev === cardId ? null : cardId));
  }, []);
  // Reset both selections when the overlay becomes invisible so the
  // next show starts with both hero slots empty.
  useEffect(() => {
    if (!visible) {
      setTopSelectedCardId(null);
      setBottomSelectedCardId(null);
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
  const bucket = trashTalkBucket(delta);
  const challengerName = sender.displayName || null;
  const headline = selectHeadline({ state, bucket, delta, challengerName });
  const headlineColor =
    state === "WIN" ? WINNING_COLOR
    : bucket === "photo_finish" ? "#FFB14A"
    : state === "LOSS_OPEN" ? "#EF4444"
    : "#EAF0FF";

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

  // Step 3: docked-score target color per side. Same three-state model
  // the right-rail ScoreCell uses (winner green / loser neutral / tie
  // off-white). The targets render empty in step 3 — only the color
  // ships, ready for the step-4 glide to land a value into.
  const opponentDockedColor =
    senderState === "leading" ? WINNING_COLOR
    : senderState === "tied" ? DELTA_NEUTRAL
    : TRAILING_COLOR;
  const userDockedColor =
    recipientState === "leading" ? WINNING_COLOR
    : recipientState === "tied" ? DELTA_NEUTRAL
    : TRAILING_COLOR;

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
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
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
        {/* ── TOP STRIP — opponent's lineup ──────────────────────────── */}
        <ZonePanel dataAttr="opponent" style={{ marginBottom: 18 }}>
          <ZoneHeader hand={sender} position="top" dockedScoreColor={opponentDockedColor} />
          <ResultsStrip
            cards={sender.cards}
            renderCard={renderCard}
            selectedCardId={topSelectedCardId}
            onCardTap={handleTopCardTap}
            revealOrder={senderRevealOrder}
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
            marginBottom: 4,
          }}
        >
          {/* Row 1: commentary block — spans LEFT RAIL + CENTER (278px at
              390 viewport). Two stacked lines, centered horizontally
              within the freed area: state-tinted headline with the
              margin number folded in (selectHeadline already interpolates
              `${absDelta}`), and the substantive "WHY" second line from
              selectChallengeResolution. Step 4 unlocks expanding this
              to full-width once scores leave the right rail. The headline
              and resolution colors keep the existing state-tint system
              — no new palette. */}
          <div
            data-h2h-overlay-commentary="true"
            style={{
              gridRow: 1,
              gridColumn: "1 / span 2",
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
                fontSize: 18,
                fontWeight: 950,
                color: headlineColor,
                letterSpacing: -0.4,
                lineHeight: 1.15,
                wordBreak: "break-word",
                textAlign: "center",
              }}
            >
              {headline}
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

          {/* Row 1 right rail: sender (opponent) score — stays in rail for
              step 3. Step 4 docks this into the opponent ZoneHeader via
              the glide. */}
          <ScoreCell total={sender.totalFp} state={senderState} sizeProgress={senderSizeProgress} surface="overlay" />

          {/* Row-2 left-rail spacer. With the opponent HeroCell removed,
              CSS grid auto-flow would otherwise place the next in-flow
              item (the user HeroCell) into the first available slot —
              row 2 col 1 (left rail) — pulling the locked user hero out
              of the center column. This explicit empty cell parks row
              2 col 1 so auto-flow puts the user hero into row 2 col 2
              (center) as required by the no-jump invariant. The user
              HeroCell stays untouched per the step-3 lock. */}
          <div aria-hidden="true" style={{ gridRow: 2, gridColumn: 1 }} />

          {/* Row 2: user hero cell (LOCKED — byte-identical X/Y vs prior
              step) + user score (stays in rail through step 3). */}
          <HeroCell card={bottomSelectedCard} renderCard={renderCard} />
          <ScoreCell total={recipient.totalFp} state={recipientState} sizeProgress={recipientSizeProgress} surface="overlay" />
        </div>

        {/* ── BOTTOM STRIP — user's lineup ─────────────────────────────
            Phase 4 amend3 (2026-05-27): bottom strip sits IMMEDIATELY
            below the bottom hero. Piece 2a (2026-05-28, doc lock
            a5d7e43): explicit marginBottom: 0 — no gap to the reserved
            space below. The strip flushes directly against reserved,
            which then provides paddingTop: 8 (was 16) for the CTA. */}
        <ZonePanel dataAttr="user" style={{ marginBottom: RESERVED_BOTTOM_CLEARANCE_PX }}>
          <ResultsStrip
            cards={recipient.cards}
            renderCard={renderCard}
            selectedCardId={bottomSelectedCardId}
            onCardTap={handleBottomCardTap}
            revealOrder={recipientRevealOrder}
          />
          <ZoneHeader hand={recipient} position="bottom" dockedScoreColor={userDockedColor} />
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
            paddingTop: 8,
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
            {state === "LOSS_OPEN" && (
              <CountdownPill windowClosesAtMs={windowClosesAtMs} />
            )}
            <button
              type="button"
              data-h2h-overlay-primary-cta="true"
              data-cta-label={primaryCta.label}
              onClick={primaryCta.handler}
              style={{
                padding: "15px",
                borderRadius: 12,
                background: "#FFB14A",
                border: "none",
                color: "#070A12",
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {primaryCta.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default H2HResultsOverlay;
