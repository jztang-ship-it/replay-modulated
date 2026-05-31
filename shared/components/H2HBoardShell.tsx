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

// ── Geometry constants (moved from H2HRevealScreen) ─────────────────

/** Zone header (name label) height — 24px tall band above/below the strip. */
export const ZONE_HEADER_HEIGHT_PX = 24;

/** Gap between the zone header and the strip area inside a ZonePanel. */
export const ZONE_GAP_PX = 4;

/** Margin rhythm: top zone → hero → bottom zone. Phase 4 amend3
 *  (2026-05-27) + Piece 2a (2026-05-28) values. */
export const TOP_ZONE_MARGIN_BOTTOM_PX = 18;
export const HERO_MARGIN_BOTTOM_PX = 4;
export const BOTTOM_ZONE_MARGIN_BOTTOM_PX = 0;

/** Hero region's locked minHeight — derived from the battlefield grid's
 *  natural size (two hero cards + row gap). Computed from
 *  BATTLEFIELD_CARD_MAX_WIDTH = "min(145px, 32vw)" and aspect ratio
 *  478/329, plus BATTLEFIELD_ROW_GAP_PX = 14. Locked here so the
 *  playing-mode hero (guidance copy) doesn't collapse and the
 *  reveal-mode hero (battlefield grid) renders at the same minHeight.
 *  This is the load-bearing detail for S3→S4 no-shift (EDIT B2). */
export const HERO_MIN_HEIGHT_CSS = `calc(min(145px, 32vw) * ${((478 / 329) * 2).toFixed(6)} + 14px)`;

/** Hero region's reduced minHeight during the hold_select preview window
 *  (docs/holdselect-vertical-budget-design-lock.md §2(3)). One hero-card
 *  footprint (preview-card height) plus 24px breathing room. Reclaims
 *  ~139–172px depending on viewport width while preserving a comfortable
 *  surround around the centered preview card. Animated back to
 *  HERO_MIN_HEIGHT_CSS via CSS transition when state transitions out of
 *  hold_select — sized so the restoration finishes inside one
 *  COLUMN_FLIP_DURATION_MS window (~250ms), absorbed into column_flip's
 *  natural choreography so the recipient strip doesn't visibly lurch. */
export const HERO_MIN_HEIGHT_HOLD_SELECT_CSS = `calc(min(145px, 32vw) * ${(478 / 329).toFixed(6)} + 24px)`;

/** Duration of the hero-region minHeight restore transition. Synced with
 *  COLUMN_FLIP_DURATION_MS (250ms) per the design lock so the expansion
 *  feels like the first beat of the column_flip choreography. */
export const HERO_MIN_HEIGHT_TRANSITION_MS = 250;

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

/** Name label band shown inside a ZonePanel — uppercase, weight 900,
 *  letterSpacing 1. The displayName is the recipient's nickname for
 *  the bottom zone and the challenger's name (via isRealName) for the
 *  top zone. Shell consumers pass the resolved label string. */
export function ZoneHeader({ label, position }: { label: string; position?: "top" | "bottom" }) {
  return (
    <div
      data-h2h-board-zone-label={position}
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
        {label}
      </span>
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
}

// ── Shell ───────────────────────────────────────────────────────────

export function H2HBoardShell(props: H2HBoardShellProps) {
  const {
    topLabel, bottomLabel, topStrip, bottomStrip, hero, belowBoard, surfaceKind,
    rootDataAttrs, innerOpacity, innerTransitionMs, innerDataAttr, compositeOverlay,
    heroMinHeight, topZoneMarginBottom, heroMarginBottom, innerScrollable, belowBoardSticky,
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
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
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
        {/* Top framed container (opponent zone) — header above strip */}
        <ZonePanel zone="top" style={{ marginBottom: resolvedTopZoneMargin }}>
          <ZoneHeader label={topLabel} position="top" />
          {topStrip}
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

        {/* Bottom framed container (recipient zone) — strip above header */}
        <ZonePanel zone="bottom" style={{ marginBottom: BOTTOM_ZONE_MARGIN_BOTTOM_PX }}>
          {bottomStrip}
          <ZoneHeader label={bottomLabel} position="bottom" />
        </ZonePanel>

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
