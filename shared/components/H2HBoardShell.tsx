// shared/components/H2HBoardShell.tsx
//
// Shared framed-board shell for the H2H surfaces. Owns the visual
// chrome — outer fixed gradient canvas, inner column, framed top
// container (opponent zone with name label), hero region with locked
// minHeight, framed bottom container (recipient zone with name label),
// reserved bottom spacer. The consumers (H2HRecipientPlay for states
// 1–3, H2HRevealScreen for state 4) pass content slots for the strips
// and hero; the shell renders nothing dynamic of its own.
//
// Locked by doc e6fe662 EDIT B1–B5 (rework section "states 1–3 render
// on the SAME framed board as state 4"). The shell is the literal
// implementation of "the framed board" — same containers, same
// name labels, same slot positions across states 1–4.
//
// Emits stable markers:
//   data-h2h-board-zone="top" / "bottom" / "hero"
// These are the anchors the real-browser visual harness queries to
// assert "no layout shift across S3→S4" — the load-bearing contract
// from EDIT B2.
//
// All chrome was moved here MECHANICALLY from H2HRevealScreen (lines
// 270–301 ZonePanel, 794–819 ZoneHeader, 1336–1397 outer + inner
// column, 1557–1561 reserved-bottom spacer, plus the geometry
// constants below). Zero semantic refactor — only the location moves.
// The Fix B / CLAUDE.md rule "reuse working scaffolds before
// deriving new ones" applies here at component-shell scale.

import type React from "react";
import { HAND_STRIP_CARD_CONTENT_WIDTH_PX } from "./H2HRevealScreen";

// ── Geometry constants (moved from H2HRevealScreen) ─────────────────

/** Zone header (name label) height — band above/below the strip.
 *  boss-mobile-fit §1.2 (2026-06-27): 24 → 18 (−12 across top+bottom zones).
 *  Drives the rendered ZoneHeader on every H2H surface (play/reveal/overlay
 *  all consume this shell's ZoneHeader). */
export const ZONE_HEADER_HEIGHT_PX = 18;

/** Gap between the zone header and the strip area inside a ZonePanel. */
export const ZONE_GAP_PX = 4;

/** Margin rhythm: top zone → hero → bottom zone. Phase 4 amend3
 *  (2026-05-27) + Piece 2a (2026-05-28) values.
 *  RD6.2-prep-C (2026-06-12): TOP_ZONE_MARGIN_BOTTOM_PX 18 → 10 and
 *  HERO_MARGIN_BOTTOM_PX 4 → 0 as part of the real-phone fit pass.
 *  RD6.2-prep-D (2026-06-12): TOP_ZONE_MARGIN_BOTTOM_PX 10 → 0 —
 *  symmetric 8/8 from the ZonePanel paddings only.
 *  RD6.2-prep-E (2026-06-12): both margins 0 → 12 to OPEN the hero
 *  gaps to a non-touching 20/20 (= panel pad 8 + margin 12). The
 *  symmetric 8/8 from D read as "touching" on real hardware. To
 *  pay for +24px stack growth without scrolling results at the
 *  binding 430-viewport (Pro Max), the strip-side panel paddings
 *  (top panel pad-top, bottom panel pad-bot — NOT the hero-side)
 *  drop 8 → 4 via per-call style overrides, and the outer safe-area
 *  pad drops 8 → 4. Net +12px on the results stack; eats 8 of the
 *  12 auto-margin slack at 430, leaving 4 → gap above CTA = RESERVED
 *  (20) + 4 = 24, matching the user's example CTA-clearance floor.
 *  The bottom-zone marginBottom stays 0 — the overlay-only
 *  RESERVED_BOTTOM_CLEARANCE_PX (now 20) still carries the
 *  bottom-strip→CTA breathing room. */
export const TOP_ZONE_MARGIN_BOTTOM_PX = 12;
export const HERO_MARGIN_BOTTOM_PX = 12;
export const BOTTOM_ZONE_MARGIN_BOTTOM_PX = 0;

/** Hero region's locked minHeight — derived from the battlefield grid's
 *  natural size (two hero cards + row gap). Computed from
 *  BATTLEFIELD_CARD_MAX_WIDTH and aspect ratio 478/329, plus
 *  BATTLEFIELD_ROW_GAP_PX = 14. Locked here so the playing-mode hero
 *  (guidance copy) doesn't collapse and the reveal-mode hero
 *  (battlefield grid) renders at the same minHeight.
 *  This is the load-bearing detail for S3→S4 no-shift (EDIT B2).
 *
 *  RD6.2-prep-C (2026-06-12): card max-width shrunk from
 *  min(145px, 32vw) to min(125px, 28vw). Real-phone validation
 *  (RD6.1-g claimed mainstream phones fit but John's actual iPhone
 *  still scrolled). Step-1 contract-free trims (~46px) closed half
 *  the gap; the hero geometry shrink closes the rest by ~46–58px
 *  depending on viewport. MUST land on BOTH reveal and results
 *  surfaces identically — H2HRevealScreen.BATTLEFIELD_CARD_MAX_WIDTH
 *  and H2HResultsOverlay.HERO_CARD_MAX_WIDTH change in lockstep.
 *  Asymmetry here = visible snap at the reveal→results crossfade. */
/** Locked-layout vocabulary (2026-06-24): the height of ONE hero card-row —
 *  min(125px,28vw) card width × the 478/329 card aspect ratio. This is the
 *  single source of truth for slot-c's locked height across all challenge
 *  states (play instructional text, reveal opponent hero card, result verdict):
 *  the row is card-capable AND text-holding at this height. Result's
 *  HERO_ROW_HEIGHT_CSS and the reveal battlefield card-row already resolve to
 *  this exact value; they reference this constant so the three states can't
 *  drift. HERO_MIN_HEIGHT_CSS below = two of these rows + 14px gap budget. */
// boss-mobile-fit §1.7 (2026-06-27): card-width cap 125 → 110, in lockstep with
// H2HRevealScreen.BATTLEFIELD_CARD_MAX_WIDTH, H2HResultsOverlay.HERO_CARD_MAX_WIDTH,
// and H2HRecipientPlay.previewCardWidthCss (asymmetry = reveal→results snap).
// At 390 unchanged (28vw≈109<110); at 430 ~8% smaller. Row height drops with it.
export const HERO_CARD_ROW_HEIGHT_CSS = `calc(min(110px, 28vw) * ${(478 / 329).toFixed(6)})`;

export const HERO_MIN_HEIGHT_CSS = `calc(min(110px, 28vw) * ${((478 / 329) * 2).toFixed(6)} + 14px)`;

/** Hero region's reduced minHeight during the hold_select preview window
 *  (docs/holdselect-vertical-budget-design-lock.md §2(3)). One hero-card
 *  footprint (preview-card height) plus 24px breathing room. Reclaims
 *  ~139–172px depending on viewport width while preserving a comfortable
 *  surround around the centered preview card. Animated back to
 *  HERO_MIN_HEIGHT_CSS via CSS transition when state transitions out of
 *  hold_select — sized so the restoration finishes inside one
 *  COLUMN_FLIP_DURATION_MS window (~250ms), absorbed into column_flip's
 *  natural choreography so the recipient strip doesn't visibly lurch. */
// (Dead constant — zero importers, confirmed in boss-mobile-fit recon. Kept in
//  lockstep with the 110 cap above only so the card-width family stays coherent.)
export const HERO_MIN_HEIGHT_HOLD_SELECT_CSS = `calc(min(110px, 28vw) * ${(478 / 329).toFixed(6)} + 24px)`;

/** Duration of the hero-region minHeight restore transition. Synced with
 *  COLUMN_FLIP_DURATION_MS (250ms) per the design lock so the expansion
 *  feels like the first beat of the column_flip choreography. */
export const HERO_MIN_HEIGHT_TRANSITION_MS = 250;

/** Round-position signage — single source of truth for its placement so the
 *  three surfaces (play / reveal / results) can't drift. The signage sits this
 *  many px below the bottom (recipient) mini-slot row, riding it. */
export const H2H_SIGNAGE_OFFSET_BELOW_ROW = 8;

/** The signage element itself — ONE markup definition shared by every surface.
 *  Rendered into the shell's `roundSignage` slot (play / reveal) or inline at
 *  the same offset (results). `label` is e.g. "2/3" / "3/3". */
export function RoundSignage({ label }: { label: string }) {
  return (
    <div
      data-h2h-round-signage="true"
      style={{
        marginTop: H2H_SIGNAGE_OFFSET_BELOW_ROW,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 1.5,
        color: "rgba(234,240,255,0.55)",
        textTransform: "uppercase",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

// ── Sub-components (moved verbatim from H2HRevealScreen) ────────────

/** Zone panel — glass-chrome wrapper for hand-strip zones. Mirrors
 *  single-player's header-panel chrome (shared/views/GameView.tsx:2228-2235):
 *    borderRadius: 16, border: 1px solid rgba(255,255,255,0.10),
 *    background: rgba(255,255,255,0.05), boxShadow: 0 8px 24px rgba(0,0,0,0.28),
 *    backdropFilter: blur(10px). */
export function ZonePanel({
  children,
  style,
  zone,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  zone?: "top" | "bottom";
}) {
  return (
    <div
      data-h2h-board-zone={zone}
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: ZONE_GAP_PX,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
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

/** RD6.1: minimum width reserved on the right side of the header band
 *  for the corner ScoreCell. Mirrors the value the overlay used for
 *  the docked-score target so reveal-side and overlay-side bands
 *  reserve identical space. Used by the name-span's max-width guard
 *  so long names ellipsis-truncate BEFORE colliding with the score.
 *
 *  RD6.1-c (2026-06-11): bumped 68 → 110 to host the new "Target:"
 *  label that wraps Mike's corner score (see TargetCornerScore). The
 *  label is ~50px at fontSize 11 weight 700 uppercase + 4px gap, plus
 *  the ScoreCell's ~60px glyph at MAX_SCALE; 110 reserves comfortable
 *  room without crowding the name band. The overlay's pre-RD6.1-c
 *  local DOCKED_SCORE_TARGET_MIN_WIDTH_PX is retired in favor of this
 *  single source of truth — both surfaces' name-span maxWidth calcs
 *  reference the same constant so the bands stay symmetric. */
export const CORNER_SCORE_MIN_WIDTH_PX = 110;

/** RD6.1-c (2026-06-11): wraps Mike's corner ScoreCell with a static
 *  "Target:" label so the value's framing is consistent across every
 *  H2H screen (loading / pick / draw / reveal / results — image set 1
 *  through 6). Pre-RD6.1-c the target was shown three inconsistent
 *  ways: a body-text "Draw to beat X." line in the pick/draw intro,
 *  a "<X> to beat." line in the redraw intro, and a bare corner
 *  number on reveal/results. RD6.1-c collapses all three into ONE
 *  format: "Target: X" right-aligned on Mike's name line.
 *
 *  Contract for the reveal→results no-snap: the label is STATIC chrome
 *  rendered as a SIBLING of the ScoreCell; the ScoreCell DOM node + its
 *  data-h2h-team-score-position attrs are untouched. The no-snap gates
 *  query for those attrs on the inner ScoreCell, so the prefix wrap
 *  does not disturb them.
 *
 *  Only consumed on the TOP zone (Mike / opponent). The bottom zone
 *  (YOU / recipient) hosts a bare ScoreCell — YOU's climbing total
 *  reads as live progress, not a static target.
 */
export function TargetCornerScore({ scoreCell }: { scoreCell: React.ReactNode }) {
  return (
    <>
      <span
        data-h2h-target-label="true"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginRight: 4,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        Target:
      </span>
      {scoreCell}
    </>
  );
}

/** Name label band shown inside a ZonePanel — uppercase, weight 900,
 *  letterSpacing 1. The displayName is the recipient's nickname for
 *  the bottom zone and the challenger's name (via isRealName) for the
 *  top zone. Shell consumers pass the resolved label string.
 *
 *  RD6.1 (2026-06-11): the header band now hosts an OPTIONAL corner
 *  score on the right side. The score is rendered ABSOLUTELY so it
 *  does NOT consume flex space — the name stays centered by the flex
 *  parent regardless of the score's width. Long names truncate via
 *  the maxWidth guard before they could collide with the score
 *  envelope. Pattern mirrors the overlay's pre-RD6.1 OverlayHeaderRow
 *  (H2HResultsOverlay.tsx pre-edit :357-448) so reveal-done and
 *  overlay-mount frames render structurally identical headers — the
 *  RD3-C reveal→results no-snap upgrades from value-equal to
 *  component+geometric identity. */
export function ZoneHeader({
  label,
  position,
  score,
}: {
  label: string;
  position?: "top" | "bottom";
  /** Optional ScoreCell (or other React node) anchored to the right
   *  edge of the header band. Absolute-positioned so the name's
   *  centering is unaffected by the score's intrinsic width. */
  score?: React.ReactNode;
}) {
  return (
    <div
      data-h2h-board-zone-label={position}
      style={{
        position: "relative",
        // RD6.2-prep-A2 (2026-06-12): header padding zeroed and the
        // band capped at the strip's intrinsic card-content span,
        // centered with auto margins. Pre-A2 the header band spanned
        // the full ZonePanel content box and bulged ~37px past the
        // card edges on each side at the 480px-capped inner column.
        // Now the header's outer edges align EXACTLY to the first
        // card's left edge and the last card's right edge regardless
        // of viewport width — at narrow viewports the cards
        // flex-shrink to fit and the header clamps to 100% via the
        // implicit min(maxWidth, available); at wide viewports the
        // cards center with flex padding and the header centers to
        // the same span.
        padding: 0,
        width: "100%",
        maxWidth: HAND_STRIP_CARD_CONTENT_WIDTH_PX,
        marginLeft: "auto",
        marginRight: "auto",
        height: ZONE_HEADER_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        // RD6.2-prep-A (2026-06-12): name LEFT-aligned, corner score
        // RIGHT-aligned (absolute). Anchoring opposite edges means the
        // name and the total can never crowd each other regardless of
        // name length — long names grow toward the middle and
        // ellipsis-truncate before the right-side score envelope.
        // Designing for the long-name case, not just "MIKE".
        justifyContent: "flex-start",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          // RD6.2-prep-A: unidirectional reserve — only the right edge
          // hosts the score, so the name extends from the left and
          // truncates before colliding. Was symmetric (2x reserve) so
          // a centered name had matching margins on both sides.
          // A2: 100% now equals the strip card-content span (capped
          // by the outer maxWidth) instead of the ZonePanel content
          // box, so the reserve math is unchanged but the result is
          // aligned to the LAST-card-right edge.
          maxWidth: score
            ? `calc(100% - (${CORNER_SCORE_MIN_WIDTH_PX}px + 8px))`
            : undefined,
          overflow: score ? "hidden" : undefined,
          textOverflow: score ? "ellipsis" : undefined,
          whiteSpace: score ? "nowrap" : undefined,
          fontSize: 18,
          fontWeight: 900,
          color: "rgba(255,255,255,0.95)",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {score && (
        <div
          data-h2h-board-corner-score={position}
          style={{
            position: "absolute",
            // RD6.2-prep-A2 (2026-06-12): was 6 — flush against the
            // outer-right edge now, which after the A2 inset equals
            // the last card's right edge. The 6px breathing room was
            // an artifact of the pre-A2 padding:"0 6px" container
            // box.
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

// ── Shell props ─────────────────────────────────────────────────────

export interface H2HBoardShellProps {
  /** Opponent name shown in the top zone header. Source: for the
   *  reveal, sender.displayName; for the playing surface,
   *  isRealName(challengerName) ? challengerName : "your friend". */
  topLabel: string;
  /** Recipient name shown in the bottom zone header. Source:
   *  recipient.displayName for the reveal; getNickname() || "You" for
   *  the playing surface. */
  bottomLabel: string;
  /** Strip content inside the top framed container. The shell does NOT
   *  decide what fills this — playing surface puts its TopStripCells,
   *  reveal surface puts its HandStrip with revealOrder. */
  topStrip: React.ReactNode;
  /** Strip content inside the bottom framed container. Same shape as
   *  topStrip. */
  bottomStrip: React.ReactNode;
  /** Content inside the hero region. The region's minHeight is locked
   *  by the shell (HERO_MIN_HEIGHT_CSS), so guidance copy (playing) and
   *  the battlefield grid (reveal) render at the same Y bounds. */
  hero: React.ReactNode;
  /** Optional: render after the reserved-bottom spacer, inside the
   *  inner column. Used by the playing surface to host its CTA. The
   *  reveal surface leaves this empty. The reserved-bottom spacer
   *  still absorbs viewport slack above it. */
  belowBoard?: React.ReactNode;
  /** Optional: stable data attribute identifying the consumer. Used by
   *  the harness to differentiate playing-mode shell from reveal-mode
   *  shell when both are mounted simultaneously (Fix C2). */
  surfaceKind?: "playing" | "reveal" | "results-overlay";
  /** Optional: additional data-* attributes to apply to the shell's
   *  outer root div. Used by H2HRecipientPlay to keep its existing
   *  data-h2h-recipient-play and data-playing-state markers on the
   *  same element they were on pre-extraction, so Fix C2 assertions
   *  and external tests continue to find them. */
  rootDataAttrs?: Record<string, string>;
  /** Optional: opacity transition for the INNER subtree (top+hero+bottom
   *  +belowBoard). Used by H2HRecipientPlay to fade the playing-mode
   *  content out when the arc composites in (Fix C2 lockstep crossfade).
   *  When undefined, the inner subtree renders at full opacity. */
  innerOpacity?: number;
  innerTransitionMs?: number;
  /** Optional: id for the inner subtree element (for testability /
   *  legacy data attribute continuity). */
  innerDataAttr?: string;
  /** Optional: extra content mounted INSIDE the shell's outer fixed
   *  div, AFTER the inner column. Used by H2HRecipientPlay to mount
   *  <H2HRecipientReveal/> at viewport stacking while keeping it a
   *  descendant of the playing-mode shell (Fix C2 single-canvas
   *  continuity — the reveal must be inside the playing root for
   *  `playingRoot.contains(revealRoot)` to hold). */
  compositeOverlay?: React.ReactNode;
  /** hold_select vertical-budget fix (docs/holdselect-vertical-budget-
   *  design-lock.md §2/§3). Optional override for the hero region's
   *  minHeight — H2HRecipientPlay passes HERO_MIN_HEIGHT_HOLD_SELECT_CSS
   *  while in hold_select, default HERO_MIN_HEIGHT_CSS in all other
   *  states. CSS transition animates the restore on state exit so the
   *  expansion folds into column_flip's natural choreography. */
  heroMinHeight?: string;
  /** Optional override for the top zone's marginBottom. H2HRecipientPlay
   *  passes a fluid clamp() during hold_select; default
   *  TOP_ZONE_MARGIN_BOTTOM_PX in all other states. */
  topZoneMarginBottom?: number | string;
  /** Optional override for the hero region's marginBottom. */
  heroMarginBottom?: number | string;
  /** When true (hold_select scroll fallback), the inner column gets
   *  overflow-y:auto so content above the comfortable floor scrolls
   *  rather than overflowing the viewport. No effect on viewports above
   *  the floor — natural CSS behavior shows no scroll when content
   *  fits. Adaptation is automatic; no hard pixel threshold. */
  innerScrollable?: boolean;
  /** When true (hold_select scroll fallback partner), the belowBoard
   *  wrapper becomes position:sticky;bottom:0 so the Draw CTA stays
   *  pinned to the visible bottom while the user scrolls the rest of
   *  the content. No visual effect when content fits (sticky degrades to
   *  relative). */
  belowBoardSticky?: boolean;
  /** RD6.1 (2026-06-11): optional ScoreCell (or other node) anchored
   *  to the right edge of the top zone's name band. The reveal,
   *  armed/redraw, and results surfaces all pass the sender
   *  (opponent) ScoreCell here so the team total renders in the box
   *  corner instead of the right rail. Renders absolute-positioned so
   *  the name stays centered. Omit to leave the band score-less (no
   *  current consumer wants that, but the API stays optional for
   *  forward compatibility). */
  topScore?: React.ReactNode;
  /** RD6.1: same as topScore, but for the bottom zone (recipient /
   *  user). */
  bottomScore?: React.ReactNode;
  /** RD7.1 (2026-06-13): optional in-flow global challenge header,
   *  rendered as the FIRST child of the inner column (above the top
   *  zone) so it pushes the board DOWN via normal flow. Only the
   *  recipient challenge flow passes it (H2HRecipientPlay for the play
   *  states, H2HRecipientReveal→H2HRevealScreen for the reveal). Omitted
   *  by the sender reveal / mock surfaces so it never leaks there. Must
   *  be a plain flow node (no transform) — see GlobalChallengeHeader and
   *  docs/rd7.1-header-spec.md DON'T-BREAK #1. */
  globalHeader?: React.ReactNode;
  /** Round-position signage (e.g. <RoundSignage label="2/3" />), rendered a
   *  constant H2H_SIGNAGE_OFFSET_BELOW_ROW below the bottom (recipient) strip so
   *  it RIDES that row. Optional — omitted by surfaces that don't show it. */
  roundSignage?: React.ReactNode;
}

// ── Shell ───────────────────────────────────────────────────────────

export function H2HBoardShell(props: H2HBoardShellProps) {
  const {
    topLabel, bottomLabel, topStrip, bottomStrip, hero, belowBoard, surfaceKind,
    rootDataAttrs, innerOpacity, innerTransitionMs, innerDataAttr, compositeOverlay,
    heroMinHeight, topZoneMarginBottom, heroMarginBottom, innerScrollable, belowBoardSticky,
    topScore, bottomScore, globalHeader, roundSignage,
  } = props;
  const resolvedHeroMinHeight = heroMinHeight ?? HERO_MIN_HEIGHT_CSS;
  const resolvedTopZoneMargin = topZoneMarginBottom ?? TOP_ZONE_MARGIN_BOTTOM_PX;
  const resolvedHeroMargin = heroMarginBottom ?? HERO_MARGIN_BOTTOM_PX;
  return (
    <div
      data-h2h-board-shell="true"
      data-h2h-board-surface={surfaceKind}
      {...(rootDataAttrs ?? {})}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        // Single-player GameView gradient (shared/views/GameView.tsx:2181):
        // 0% / 38% / 100% color stops. Same gradient as the playing
        // surface so a single coherent canvas reads identical across all
        // states.
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        // RD6.2-prep-C (2026-06-12): added breathing room above/below
        // safe-area trimmed 20 → 8 to recover vertical fit on real
        // phones. env(safe-area-inset-*) still covers the notch +
        // home-indicator clearance.
        // RD6.2-prep-E (2026-06-12): trimmed 8 → 4 to free vertical
        // budget for the hero-gap expansion (+12 top + +12 bottom).
        // env() does the heavy lifting on safe-area clearance; +4
        // keeps the strip / CTA off the absolute edge.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 4px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
        boxSizing: "border-box",
      }}
    >
      {/* Inner column — caps content at 480px on wide viewports, mirrors
          single-player's GameView (shared/views/GameView.tsx:2212):
          maxWidth: min(480px,100%); margin: 0 auto.
          When innerOpacity is set, the inner subtree fades in lockstep
          with H2HRecipientReveal's wrapper crossfade (Fix C2). */}
      <div
        data-h2h-board-inner="true"
        data-h2h-inner-scrollable={innerScrollable ? "true" : undefined}
        {...(innerDataAttr ? { [innerDataAttr]: "true" } : {})}
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
          justifyContent: "flex-start",
          alignItems: "stretch",
          gap: 0,
          // Scroll fallback (lock §3). When the viewport falls below the
          // comfortable floor, content overflows the available height and
          // overflow-y:auto engages. Above the floor, no scroll appears.
          // Adaptation is automatic — natural CSS behavior, no JS
          // threshold check. -webkit-overflow-scrolling for momentum on
          // iOS.
          ...(innerScrollable
            ? {
                overflowY: "auto" as const,
                WebkitOverflowScrolling: "touch" as const,
              }
            : {}),
          ...(innerOpacity !== undefined ? {
            opacity: innerOpacity,
            transition: `opacity ${innerTransitionMs ?? 250}ms ease-in`,
            pointerEvents: innerOpacity < 1 ? ("none" as const) : ("auto" as const),
          } : {}),
        }}
      >
        {/* RD7.1 (2026-06-13): in-flow global challenge header. First
            child of the inner column → pushes the board DOWN via normal
            flow (no transform — DON'T-BREAK #1). Only rendered when a
            consumer passes it (recipient challenge flow); omitted by
            sender/mock surfaces. */}
        {globalHeader}
        {/* Top framed container (opponent zone). RD6.1-b (2026-06-11):
            ZoneHeader moves BELOW the strip so the name+corner-score
            band sits at the box's INNER edge (closer to the hero).
            Mike's corner-total now lands at the bottom-right of the
            top box, visually adjacent to the center delta and YOU's
            corner-total — the cluster 6.2's dual-blink targets. Zero
            vertical growth (reorder, not a second band). */}
        {/* RD6.2-prep-E (2026-06-12): per-instance paddingTop override
            8 → 4. The strip-side (top edge here) of the top panel
            isn't a hero-gap contributor — trimming it shaves panel
            internal vertical without affecting the symmetric hero
            framing. The hero-side (paddingBottom of this panel)
            stays at the ZonePanel default 8, where it teams up with
            the new TOP_ZONE_MARGIN_BOTTOM_PX (12) to give 20px top
            hero gap. */}
        <ZonePanel zone="top" style={{ marginBottom: resolvedTopZoneMargin, paddingTop: 4 }}>
          {topStrip}
          <ZoneHeader label={topLabel} position="top" score={topScore} />
        </ZonePanel>

        {/* Hero region — minHeight defaults to HERO_MIN_HEIGHT_CSS but
            H2HRecipientPlay overrides to HERO_MIN_HEIGHT_HOLD_SELECT_CSS
            during hold_select (lock §2(3)). Transition animates the
            restore on state exit so the expansion absorbs into
            column_flip's natural choreography (no instant jump). Content
            centers vertically so guidance copy reads at hero-center;
            battlefield grid (natural-height ≈ minHeight) lands
            top-aligned. */}
        <div
          data-h2h-board-zone="hero"
          style={{
            flex: "0 0 auto",
            minHeight: resolvedHeroMinHeight,
            marginBottom: resolvedHeroMargin,
            transition: `min-height ${HERO_MIN_HEIGHT_TRANSITION_MS}ms ease`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "stretch",
          }}
        >
          {hero}
        </div>

        {/* Bottom framed container (recipient zone). RD6.1-b: ZoneHeader
            moves ABOVE the strip so the band sits at the box's INNER
            (top) edge — YOU's corner-total lands at the top-right of
            the bottom box, completing the Mike/delta/YOU vertical
            cluster near the hero region. */}
        {/* RD6.2-prep-E (2026-06-12): per-instance paddingBottom
            override 8 → 4. Mirror of the top panel's strip-side
            trim — the strip-side (bottom edge here) of the bottom
            panel isn't a hero-gap contributor. The hero-side
            (paddingTop of this panel) stays at the ZonePanel default
            8, partnering with HERO_MARGIN_BOTTOM_PX (12) for the 20px
            bottom hero gap. */}
        <ZonePanel zone="bottom" style={{ marginBottom: BOTTOM_ZONE_MARGIN_BOTTOM_PX, paddingBottom: 4 }}>
          <ZoneHeader label={bottomLabel} position="bottom" score={bottomScore} />
          {bottomStrip}
        </ZonePanel>

        {/* Round-position signage — rides the recipient (bottom) row at a
            constant H2H_SIGNAGE_OFFSET_BELOW_ROW. In-flow (after the bottom
            ZonePanel) so it travels with the row's vertical position. */}
        {roundSignage}

        {/* Reserved bottom space — flex-grow region BELOW the bottom
            strip. Empty on the reveal; holds the playing-mode CTA via
            belowBoard. Absorbs viewport slack so the top-strip → hero
            → bottom-strip block sits as a tight composition near the
            top of the viewport.
            Scroll-fallback partner (lock §3): when belowBoardSticky is
            set, the wrapper around belowBoard becomes position:sticky
            bottom:0 so the CTA stays pinned to the visible bottom while
            content scrolls. Sticky degrades to relative when content
            fits, so no visual effect above the floor. */}
        <div
          data-h2h-reserved-bottom="true"
          aria-hidden={belowBoard ? undefined : "true"}
          style={{
            // Default reserved-bottom: flex:1 grows to fill remaining
            // space (pushes CTA to viewport bottom when content fits).
            // Scroll-fallback variant (lock §3): switch to content-sized
            // + margin-top:auto + position:sticky:bottom:0. Why:
            //   - flex:1 1 auto + minHeight:0 SHRINKS to 0 under overflow
            //     (children render outside the box). When the CTA wrapper
            //     was inside a sticky+flex:1 element, the sticky element
            //     was 0px tall and the CTA rendered BELOW it,
            //     off-screen.
            //   - flex:0 0 auto sizes to content (~77px), so sticky's
            //     bounding box matches the CTA's actual visual region.
            //   - margin-top:auto pushes reserved-bottom to the bottom
            //     of the flex column when there's leftover space (=
            //     "no scroll" case), so the CTA visually sits at the
            //     viewport bottom even when content doesn't overflow.
            //   - When content overflows, sticky:bottom:0 pins reserved-
            //     bottom to the visible scroll-port bottom (the CTA
            //     stays pinned through any scroll position).
            ...(belowBoardSticky && belowBoard
              ? {
                  flex: "0 0 auto",
                  marginTop: "auto",
                  position: "sticky" as const,
                  bottom: 0,
                  zIndex: 1,
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "center" as const,
                  justifyContent: "flex-start" as const,
                }
              : {
                  flex: "1 1 auto",
                  minHeight: 0,
                  display: belowBoard ? "flex" : undefined,
                  flexDirection: belowBoard ? "column" : undefined,
                  alignItems: belowBoard ? "center" : undefined,
                  justifyContent: belowBoard ? "flex-start" : undefined,
                }),
          }}
        >
          {belowBoard}
        </div>
      </div>
      {compositeOverlay}
    </div>
  );
}

export default H2HBoardShell;
