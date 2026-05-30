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
}

// ── Shell ───────────────────────────────────────────────────────────

export function H2HBoardShell(props: H2HBoardShellProps) {
  const {
    topLabel, bottomLabel, topStrip, bottomStrip, hero, belowBoard, surfaceKind,
    rootDataAttrs, innerOpacity, innerTransitionMs, innerDataAttr, compositeOverlay,
  } = props;
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
          ...(innerOpacity !== undefined ? {
            opacity: innerOpacity,
            transition: `opacity ${innerTransitionMs ?? 250}ms ease-in`,
            pointerEvents: innerOpacity < 1 ? ("none" as const) : ("auto" as const),
          } : {}),
        }}
      >
        {/* Top framed container (opponent zone) — header above strip */}
        <ZonePanel zone="top" style={{ marginBottom: TOP_ZONE_MARGIN_BOTTOM_PX }}>
          <ZoneHeader label={topLabel} position="top" />
          {topStrip}
        </ZonePanel>

        {/* Hero region — minHeight locked. Content centers vertically
            so guidance copy reads at hero-center; battlefield grid
            (natural-height ≈ minHeight) lands top-aligned. */}
        <div
          data-h2h-board-zone="hero"
          style={{
            flex: "0 0 auto",
            minHeight: HERO_MIN_HEIGHT_CSS,
            marginBottom: HERO_MARGIN_BOTTOM_PX,
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
            top of the viewport. */}
        <div
          data-h2h-reserved-bottom="true"
          aria-hidden={belowBoard ? undefined : "true"}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: belowBoard ? "flex" : undefined,
            flexDirection: belowBoard ? "column" : undefined,
            alignItems: belowBoard ? "center" : undefined,
            justifyContent: belowBoard ? "flex-start" : undefined,
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
