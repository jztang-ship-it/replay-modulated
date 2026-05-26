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
  chadTrashTalk,
  trashTalkBucket,
  type TrashTalkBucket,
} from "../commentary/chadChallenge";

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
}

/** Cross-fade duration. */
export const OVERLAY_CROSSFADE_MS = 350;

// ── Layout constants ────────────────────────────────────────────────────
//
// Phase 4 fix 3 amend2 (2026-05-27): geometry is LOCKED with the arc.
// The arc's `H2HRevealScreen` exports the same grid widths + row gaps;
// rather than import them (and create a coupling for the standalone
// overlay use case), we redeclare with the same values + a guard
// comment. Any change to one MUST be mirrored to the other or the
// arc → overlay transition breaks the "no movement" invariant.
//   - LEFT_RAIL = 100  (overlay headline + trash-talk; empty on arc)
//   - RIGHT_RAIL = 80  (FP totals + arc's matchup-delta float)
//   - BATTLEFIELD_ROW_GAP = 14  (sliver between hero cards)

const LEFT_RAIL_WIDTH_PX = 100;
const RIGHT_RAIL_WIDTH_PX = 80;
const HERO_ROW_GAP_PX = 14;
const HERO_CARD_MAX_WIDTH = "min(145px, 32vw)"; // matches arc's BATTLEFIELD_CARD_MAX_WIDTH

// Hand-strip cell sizing — matches H2HRevealScreen's HandStrip exactly so
// strips look identical between arc and overlay.
const STRIP_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_DISPLAY_WIDTH_PX = (STRIP_HEIGHT_PX * 329) / 478;
const STRIP_CARD_SCALE = STRIP_CARD_DISPLAY_WIDTH_PX / STRIP_CARD_NATURAL_WIDTH_PX;

const ZONE_HEADER_HEIGHT_PX = 24;
const ZONE_GAP_PX = 4;
const URGENT_THRESHOLD_MS = 5 * 60 * 1000;

// Win/loss color treatment — matches the arc's right-rail palette.
const WINNING_COLOR = "#22C55E";
const TRAILING_COLOR = "#9CA3AF";
const DELTA_NEUTRAL = "#E5E7EB";

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

function ZonePanel({ children, dataAttr }: { children: React.ReactNode; dataAttr?: string }) {
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
      }}
    >
      {children}
    </div>
  );
}

function ZoneHeader({ hand }: { hand: H2HHand }) {
  return (
    <div
      style={{
        padding: "0 6px",
        height: ZONE_HEADER_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: "rgba(255,255,255,0.95)",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {hand.displayName}
      </span>
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
}

function ResultsStrip({ cards, renderCard, selectedCardId, onCardTap }: ResultsStripProps) {
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
              flexShrink: 0,
              minWidth: 0,
              position: "relative",
              overflow: "hidden",
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

// ── Score cell (right-rail) ──────────────────────────────────────────────

function ScoreCell({ total, isLeading }: { total: number; isLeading: boolean }) {
  return (
    <div
      data-h2h-overlay-score="true"
      data-h2h-overlay-score-value={total.toFixed(1)}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 950,
          color: isLeading ? WINNING_COLOR : TRAILING_COLOR,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
          textAlign: "center",
        }}
      >
        {total.toFixed(1)}
      </div>
    </div>
  );
}

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

  // Headline + trash-talk inputs.
  const delta = recipient.totalFp - sender.totalFp;
  const bucket = trashTalkBucket(delta);
  const challengerName = sender.displayName || null;
  const headline = selectHeadline({ state, bucket, delta, challengerName });
  const trashTalkLine = useMemo(
    () => chadTrashTalk(bucket, challengerName, delta),
    [bucket, challengerName, delta],
  );
  const headlineColor =
    state === "WIN" ? WINNING_COLOR
    : bucket === "photo_finish" ? "#FFB14A"
    : state === "LOSS_OPEN" ? "#EF4444"
    : "#EAF0FF";

  // Right-rail leading colors track the FINAL totals.
  const recipientLeading = recipient.totalFp > sender.totalFp;
  const senderLeading = sender.totalFp > recipient.totalFp;

  // Primary CTA per state.
  const primaryCta = (() => {
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
          // Phase 4 amend3 (2026-05-27): mirrors the arc EXACTLY.
          // gap=18 between top strip ↔ battlefield ↔ bottom strip
          // creates the tight composition; the flex-grow reserved
          // space sits AFTER the bottom strip and holds the CTA.
          justifyContent: "flex-start",
          alignItems: "stretch",
          gap: 18,
        }}
      >
        {/* ── TOP STRIP — opponent's lineup ──────────────────────────── */}
        <ZonePanel dataAttr="opponent">
          <ZoneHeader hand={sender} />
          <ResultsStrip
            cards={sender.cards}
            renderCard={renderCard}
            selectedCardId={topSelectedCardId}
            onCardTap={handleTopCardTap}
          />
        </ZonePanel>

        {/* ── HERO ZONE — 3-col × 2-row grid mirrors the arc battlefield.
            Columns: [left rail (headline+trash-talk) | hero | right rail (scores)].
            Rows: [top hero | bottom hero]. Left rail spans both rows.
            No row 2 separation — same `BATTLEFIELD_ROW_GAP_PX` sliver as
            the arc; just the two hero rows back-to-back. The arc's
            absolute-positioned matchup-delta float is omitted on the
            overlay (no per-matchup delta after the arc resolves). */}
        <div
          data-h2h-overlay-hero="true"
          style={{
            position: "relative",
            flex: "0 0 auto",
            display: "grid",
            gridTemplateColumns: `${LEFT_RAIL_WIDTH_PX}px 1fr ${RIGHT_RAIL_WIDTH_PX}px`,
            gridTemplateRows: "auto auto",
            rowGap: HERO_ROW_GAP_PX,
            width: "100%",
          }}
        >
          {/* Left rail spans both rows — holds headline + trash-talk. */}
          <div
            data-h2h-overlay-rail="left"
            style={{
              gridRow: "1 / span 2",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 8,
              padding: "0 4px 0 0",
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
              }}
            >
              {headline}
            </div>
            <div
              data-h2h-overlay-trash-talk="true"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#FFB14A",
                lineHeight: 1.35,
                wordBreak: "break-word",
              }}
            >
              {trashTalkLine}
            </div>
          </div>

          {/* Row 1: top hero cell + opp score (anchored to top hero Y). */}
          <HeroCell card={topSelectedCard} renderCard={renderCard} />
          <ScoreCell total={sender.totalFp} isLeading={senderLeading} />

          {/* Row 2: bottom hero cell + user score (anchored to bottom hero Y). */}
          <HeroCell card={bottomSelectedCard} renderCard={renderCard} />
          <ScoreCell total={recipient.totalFp} isLeading={recipientLeading} />
        </div>

        {/* ── BOTTOM STRIP — user's lineup ─────────────────────────────
            Phase 4 amend3 (2026-05-27): bottom strip sits IMMEDIATELY
            below the bottom hero with the outer column's small fixed
            gap (18px). No flex-grow spacer between them — the bottom
            strip hugs the hero pair to form a tight composition. */}
        <ZonePanel dataAttr="user">
          <ResultsStrip
            cards={recipient.cards}
            renderCard={renderCard}
            selectedCardId={bottomSelectedCardId}
            onCardTap={handleBottomCardTap}
          />
          <ZoneHeader hand={recipient} />
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
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "stretch",
            paddingTop: 16,
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

// Suppress an unused import lint — DELTA_NEUTRAL is reserved for the
// post-phase-7 commentary expansion (will be used to color the trash-
// talk line when state is exactly TIE). Phase 4 doesn't render a TIE
// state but the constant is part of the locked color palette.
void DELTA_NEUTRAL;

export default H2HResultsOverlay;
