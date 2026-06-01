/**
 * H2HScoreRail — shared right-column score rendering for H2H surfaces.
 *
 * Owns the ScoreCell component plus the rail-width and win/loss-color
 * constants consumed by both H2HRevealScreen and H2HResultsOverlay.
 *
 * Before this module both surfaces hand-rolled their own ScoreCell and
 * duplicated the constants — "the three numbers never move between
 * reveal and results" was true only by coincidence of two 80s and two
 * 100s being typed the same. The relay-tension feature about to land
 * needs that invariant to be structural so any new behavior lands once
 * and lands identically on both surfaces.
 *
 * Relay-tension Phase 1: this module owns Z1 (size growth on the inner
 * glyph) and Z2 (leader brightness/glow on the outer cell), plus the
 * deliberate dead-heat / tie treatment. The two channels are
 * INDEPENDENT — size answers "how big this game is getting"; glow
 * answers "who's winning." In a tight race where both numbers are
 * close in size, glow is what tells the user the leader. See
 * docs/h2h-relay-tension-design-lock.md for the full frame.
 *
 * The `surface` prop drives the data-attribute namespace so the existing
 * harness queries in scripts/verify-h2h-play-layout.mjs and the existing
 * test selectors keep working verbatim — no harness or test rewrites.
 */

import React, { useEffect } from "react";

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

// Glow alphas derived from the base colors. Kept separate from the
// solid colors so the glow can be tuned without re-tinting the number.
const WINNING_GLOW = "rgba(34, 197, 94, 0.55)";  // matches WINNING_COLOR @ 0.55 alpha
const TIE_GLOW = "rgba(229, 231, 235, 0.45)";    // matches DELTA_NEUTRAL @ 0.45 alpha

// ─── Z1 size model ────────────────────────────────────────────────────────
//
// Both totals GROW as scores climb, never shrink below baseline. The
// leader grows bigger via an additional bonus. The tie state gives both
// sides a smaller bonus (so they pop together when neck-and-neck).
//
// scale = 1
//       + sizeProgress * SIZE_PROGRESS_MAX        // monotonic climb
//       + (state === "leading" ? LEADER_BONUS : 0)
//       + (state === "tied"    ? TIE_BONUS    : 0)
//
// Hard clamp at MAX_SCALE so a blowout doesn't make the number
// unreadable or clip the right-rail column.

const SIZE_PROGRESS_MAX = 0.12;
const LEADER_BONUS = 0.08;
const TIE_BONUS = 0.04;
const MAX_SCALE = 1.30;

// Transition speed for state-driven visual changes (glow + scale). Slow
// enough that a lead change feels intentional, fast enough that the
// climb is responsive. Phase 2 will add a sharper set-boundary pop on
// top of this baseline.
const LEADER_TREATMENT_TRANSITION_MS = 200;

// ─── Tie-glow keyframe injection ──────────────────────────────────────────
//
// At dead-heat, both cells get a subtle pulsing glow in tie color
// (charged neutral). Keyframe is module-level + idempotent inject — the
// same pattern H2HRevealScreen uses for its battlefield-card keyframes.

const SCORE_RAIL_KEYFRAMES_CSS = `
@keyframes h2h-score-tie-pulse {
  0%   { opacity: 0.7; }
  50%  { opacity: 1.0; }
  100% { opacity: 0.7; }
}
`;

let keyframesInjected = false;
function ensureScoreRailKeyframesInjected() {
  if (keyframesInjected) return;
  if (typeof document === "undefined") return;
  const tag = document.createElement("style");
  tag.setAttribute("data-h2h-score-rail-keyframes", "true");
  tag.textContent = SCORE_RAIL_KEYFRAMES_CSS;
  document.head.appendChild(tag);
  keyframesInjected = true;
}

// ─── ScoreCell ────────────────────────────────────────────────────────────
//
// One team's total FP, rendered in a right-rail grid cell. The cell
// flex-centers a single styled glyph div; `displayTotal` lets the reveal
// surface drive an animated running total during the arc rollup, while
// the overlay surface omits the prop and renders the final `total`.
//
// Structure — two-div tree, with the relay-tension Z channels attached
// at their reserved levels:
//
//   outer div (flex centered + data-attrs + Z2 glow)   ← layout anchor;
//   └─ inner div (font, color, lineHeight, textAlign,     leader glow
//                 tabular-nums, Z1 scale transform,        attaches here
//                 textShadow)                              via `filter`
//      └─ {shown.toFixed(1)}                            ← Z1 size growth
//                                                         attaches here
//                                                         via `transform:
//                                                         scale(N)`
//
// Cross-surface handoff: at `phase === "done"` on the reveal, both
// totals are at their final values, so `sizeProgress = total /
// referenceTotal` matches what the overlay computes at mount. The Z2
// glow is keyed off `state`, computed identically on both surfaces.
// Net: the LAST reveal frame and the FIRST results frame render an
// identical ScoreCell — no snap at the crossfade.

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
  /** Three-state lead treatment.
   *   - "leading":   green color + drop-shadow glow + LEADER_BONUS size.
   *   - "trailing":  grey color + no glow + no bonus.
   *   - "tied":      off-white color + pulsing tie glow + TIE_BONUS size
   *                  on BOTH sides (caller passes "tied" to both cells).
   *  Tracks the CURRENT running totals on the reveal surface (the user
   *  sees the treatment swap as the totals overtake each other mid-arc)
   *  and the final totals on the overlay surface. Replaces the prior
   *  `isLeading: boolean` to make the tie state a first-class signal
   *  rather than a fall-through "both x > y are false" case. */
  state: "leading" | "trailing" | "tied";
  /** 0..1, monotonic in the side's running total. Drives Z1 size
   *  growth on the inner glyph. Caller computes as `runningTotal /
   *  referenceTotal` where `referenceTotal = max(senderFinal,
   *  recipientFinal)` so both sides share a common reference and the
   *  leader naturally hits sizeProgress=1 at end-of-game. */
  sizeProgress: number;
  /** Drives the data-attribute namespace so the existing per-surface
   *  harness queries keep working. "reveal" emits the data-h2h-team-
   *  score* pair; "overlay" emits the data-h2h-overlay-score* pair.
   *  The choice is structural, not visual — the rendered glyph is
   *  identical across surfaces. */
  surface: "reveal" | "overlay";
}

export function ScoreCell({
  total,
  displayTotal,
  state,
  sizeProgress,
  surface,
}: ScoreCellProps) {
  useEffect(ensureScoreRailKeyframesInjected, []);

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

  // Z1: size scale from sizeProgress + state bonus. Clamped at MAX_SCALE.
  // Monotonic during the climb because sizeProgress is monotonic.
  const stateBonus =
    state === "leading" ? LEADER_BONUS : state === "tied" ? TIE_BONUS : 0;
  const rawScale =
    1 + Math.max(0, Math.min(1, sizeProgress)) * SIZE_PROGRESS_MAX + stateBonus;
  const scale = Math.min(MAX_SCALE, rawScale);

  // Color + Z2 glow per state. Trailer is the absence-of-treatment case.
  const numberColor =
    state === "leading"
      ? WINNING_COLOR
      : state === "tied"
        ? DELTA_NEUTRAL
        : TRAILING_COLOR;
  const outerFilter =
    state === "leading"
      ? `drop-shadow(0 0 8px ${WINNING_GLOW})`
      : state === "tied"
        ? `drop-shadow(0 0 6px ${TIE_GLOW})`
        : "none";
  const innerTextShadow =
    state === "leading" ? `0 0 6px ${WINNING_GLOW}` : "none";
  // Tie cells pulse so the dead-heat reads as charged, not muted. Other
  // states are static (the climb is the motion).
  const outerAnimation =
    state === "tied"
      ? `h2h-score-tie-pulse 1100ms ease-in-out infinite`
      : "none";

  return (
    <div
      {...surfaceAttrs}
      data-h2h-score-state={state}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        filter: outerFilter,
        transition: `filter ${LEADER_TREATMENT_TRANSITION_MS}ms ease`,
        animation: outerAnimation,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 950,
          color: numberColor,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
          textAlign: "center",
          lineHeight: 1.05,
          transform: `scale(${scale.toFixed(3)})`,
          transformOrigin: "center center",
          textShadow: innerTextShadow,
          transition: `transform ${LEADER_TREATMENT_TRANSITION_MS}ms ease, color ${LEADER_TREATMENT_TRANSITION_MS}ms ease, text-shadow ${LEADER_TREATMENT_TRANSITION_MS}ms ease`,
        }}
      >
        {shownStr}
      </div>
    </div>
  );
}
