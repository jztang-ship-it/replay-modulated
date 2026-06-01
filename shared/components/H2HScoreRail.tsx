/**
 * H2HScoreRail — shared right-column score rendering for H2H surfaces.
 *
 * Owns the ScoreCell component plus the rail-width and win/loss-color
 * constants consumed by both H2HRevealScreen and H2HResultsOverlay.
 * Before this module both surfaces hand-rolled their own ScoreCell and
 * duplicated the constants — "the three numbers never move between
 * reveal and results" was true only by coincidence of two 80s and two
 * 100s being typed the same. The relay-tension feature about to land
 * needs that invariant to be structural so any new behavior lands once
 * and lands identically on both surfaces.
 *
 * See docs/h2h-score-rail-unify-refactor-lock.md.
 *
 * The `surface` prop drives the data-attribute namespace so the existing
 * harness queries in scripts/verify-h2h-play-layout.mjs and the existing
 * test selectors keep working verbatim — no harness or test rewrites.
 */

import React from "react";

// ─── Rail widths ──────────────────────────────────────────────────────────
//
// Both H2H surfaces (arc + results overlay) lay out as a 3-column grid:
//   [left rail] [hero column] [right rail / score column]
// The right rail is wider than the score text itself (~50px for "182.4"
// at 22px font) so the score reads as "centered in a defined right-rail
// column" rather than "tag attached to the card." The left rail is
// wider than the right to give the overlay's headline + trash-talk
// enough horizontal room to read without ellipsis at 390px viewport;
// the arc inherits the same left-rail width (empty there today) so the
// two surfaces share IDENTICAL rail geometry.

export const RIGHT_RAIL_WIDTH_PX = 80;
export const LEFT_RAIL_WIDTH_PX = 100;

// ─── Win/loss color treatment ─────────────────────────────────────────────
//
// Used by the score number (leading vs trailing total) and by the delta
// readout (positive / negative / tie). Centralized here so the palette
// can move in one place; both surfaces import these.

export const WINNING_COLOR = "#22C55E";   // green — leading total + positive delta
export const TRAILING_COLOR = "#9CA3AF";  // grey — losing total + negative delta
export const DELTA_NEUTRAL = "#E5E7EB";   // off-white — tie state

// ─── ScoreCell ────────────────────────────────────────────────────────────
//
// One team's total FP, rendered in a right-rail grid cell. The cell
// flex-centers a single styled glyph div; `displayTotal` lets the reveal
// surface drive an animated running total during the arc rollup, while
// the overlay surface omits the prop and renders the final `total`
// directly.
//
// Structure (intentional 2-div tree — outer flex cell / inner glyph):
//
//   outer div (flex centered + data-attrs)         ← layout anchor;
//   └─ inner div (font, color, lineHeight,            future Z2 leader
//                 textAlign, tabular-nums)            brightness/glow
//      └─ {shown.toFixed(1)}                          attaches here
//                                                  ← future Z1 size
//                                                    growth attaches
//                                                    here (transform/
//                                                    fontSize on the
//                                                    inner glyph host)
//
// Z1 and Z2 are the relay-tension feature's two independent channels
// (size growth + leader brightness/glow). They are NOT implemented in
// this module — this comment documents the intended attachment points
// so the relay pass doesn't re-introduce a wrapper the refactor just
// deleted. See the refactor lock for the full forward-intent contract.

interface ScoreCellProps {
  /** Final total FP, always provided. Drives the data-attribute value
   *  on the overlay surface (where there is no animated path) and the
   *  fallback render when `displayTotal` is undefined. */
  total: number;
  /** Currently-animated value during the reveal arc's per-set rollup
   *  (running total ticking as each matchup's FP rolls). Undefined on
   *  the overlay surface — there is no rollup at results, the final
   *  total is shown directly. Undefined on the reveal surface only
   *  for the phase-2 static end-state path, which renders `total`.
   *  Drives BOTH the visible glyph and the reveal-surface data-attr. */
  displayTotal?: number;
  /** Leading vs trailing color treatment. Tracks the CURRENT running
   *  totals on the reveal surface (the user sees colors flip as the
   *  totals overtake each other mid-arc), and the final totals on
   *  the overlay surface. */
  isLeading: boolean;
  /** Drives the data-attribute namespace so the existing per-surface
   *  harness queries keep working. "reveal" emits the data-h2h-team-
   *  score* pair; "overlay" emits the data-h2h-overlay-score* pair.
   *  The choice is structural, not visual — the rendered glyph is
   *  identical across surfaces. */
  surface: "reveal" | "overlay";
}

export function ScoreCell({ total, displayTotal, isLeading, surface }: ScoreCellProps) {
  const shown = displayTotal !== undefined ? displayTotal : total;
  const shownStr = shown.toFixed(1);
  const surfaceAttrs =
    surface === "reveal"
      ? {
          "data-h2h-team-score": "true",
          "data-h2h-team-score-display": shownStr,
        }
      : {
          "data-h2h-overlay-score": "true",
          "data-h2h-overlay-score-value": shownStr,
        };
  return (
    <div
      {...surfaceAttrs}
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
          lineHeight: 1.05,
        }}
      >
        {shownStr}
      </div>
    </div>
  );
}
