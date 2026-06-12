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

import React, { useEffect, useRef } from "react";

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
export const WINNING_GLOW = "rgba(34, 197, 94, 0.55)";  // matches WINNING_COLOR @ 0.55 alpha
export const TIE_GLOW = "rgba(229, 231, 235, 0.45)";    // matches DELTA_NEUTRAL @ 0.45 alpha

// ─── Z1 size model ────────────────────────────────────────────────────────
//
// RD6.2-prep-A (2026-06-12): the resting-size-scales-with-score behavior
// is RETIRED. Both totals render at a CONSTANT fixed scale (1.0) so the
// corner FP sits as a peer of the name label rather than a hero number
// that squeezes the name band. The constants below stay exported (callers
// still compute `sizeProgress` for the data attribute and downstream
// telemetry), but only the Phase 2 per-set scale POP and the leader-glow
// color/drop-shadow consume them now. The pop animation still composes
// off the resting scale via restScaleRef, which is now pinned to 1.0.
//
// What stays alive: leader-GLOW (green fill + drop-shadow when state ===
// "leading"), tie-pulse animation, per-set scale POP (WAAPI transient
// keyed by pop.key). What dies: the monotonic climb and the LEADER /
// TIE size bonuses — those were redundant with the glow color +
// drop-shadow as a leader signal.

export const SIZE_PROGRESS_MAX = 0.12;
export const LEADER_BONUS = 0.08;
export const TIE_BONUS = 0.04;
export const MAX_SCALE = 1.30;

// RD6.2-prep-A: the constant resting scale all ScoreCells render at.
// Decoupled from the legacy growth constants so a future tuning change
// to the resting size lives in one place. The pop animation peaks at
// CONSTANT_REST_SCALE × pop.magnitude, so the pop still composes
// cleanly off a single source of truth.
export const CONSTANT_REST_SCALE = 1.0;

// Transition speed for state-driven visual changes (glow + scale). Slow
// enough that a lead change feels intentional, fast enough that the
// climb is responsive. Phase 2 will add a sharper set-boundary pop on
// top of this baseline.
const LEADER_TREATMENT_TRANSITION_MS = 200;

// ─── Keyframe injection ───────────────────────────────────────────────────
//
// Phase 1: h2h-score-tie-pulse — dead-heat pulsing tie-color glow on both
// cells. Phase 2 keyframes are NOT here — the Phase 2 pop is driven by
// Web Animations API (element.animate) so the keyframe doesn't need to
// live in a stylesheet rule (and parametrizing peak-scale-vs-rest-scale
// per cell is naturally expressed as JS keyframe arrays). Adding only
// the document-level rule that the harness pre-fix-fail assertion looks
// for: h2h-score-pop. The actual animation is run via WAAPI; the rule
// is documentary + assertable.

const SCORE_RAIL_KEYFRAMES_CSS = `
@keyframes h2h-score-tie-pulse {
  0%   { opacity: 0.7; }
  50%  { opacity: 1.0; }
  100% { opacity: 0.7; }
}
/* Relay-tension Phase 2 — set-boundary pop. Documents the per-set
   transient scale punch fired by the WAAPI call in ScoreCell. Each
   cell's runtime animation interpolates between its OWN resting
   scale (Phase 1 Z1 inline transform) and resting × magnitude, so
   this stylesheet rule uses neutral 1.0/1.15/1.0 values — the WAAPI
   call overrides them at runtime. The rule is here so its existence
   is a presence-test for "Phase 2 ships with pop capability." */
@keyframes h2h-score-pop {
  0%   { transform: scale(1.0); }
  35%  { transform: scale(1.15); }
  100% { transform: scale(1.0); }
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
  /** Three-state lead treatment. RD6.2-prep-A (2026-06-12): the size
   *  contribution of leading/tied is RETIRED — glow + color carry the
   *  full leader signal now, the glyph size is constant.
   *   - "leading":   green color + drop-shadow glow.
   *   - "trailing":  grey color + no glow.
   *   - "tied":      off-white color + pulsing tie glow on BOTH sides
   *                  (caller passes "tied" to both cells).
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
  /** Relay-tension Phase 2 — transient pop on the inner glyph fired
   *  at a set boundary. `key` changes each time a new pop should
   *  retrigger; the useEffect below watches it and calls
   *  `glyph.animate(...)` programmatically. `magnitude` is the
   *  multiplier applied on top of Phase 1's resting Z scale (so the
   *  peak is `restScale × magnitude`), `durationMs` is the keyframe
   *  duration. `kind` differentiates the lead-change-pop (which fires
   *  ONLY on a flipped set's new leader) from a per-set scaled pop —
   *  drives the `data-h2h-score-pop-kind` data attribute on the
   *  outer cell so the harness can distinguish them. The animation
   *  runs via Web Animations API without `fill: "forwards"`, so the
   *  transform reverts to the inline scale(restScale) when the
   *  animation completes. This is the cross-surface handoff
   *  invariant: by `phase === "done"` the pop is over and the inner
   *  glyph sits at its resting Phase 1 transform — the same value
   *  the overlay surface renders. */
  pop?: {
    magnitude: number;
    durationMs: number;
    kind: "scaled" | "lead-change";
    key: number;
  };
  /** Team-position discriminator emitted as a data attribute.
   *  Reveal-surface cells emit `data-h2h-team-score-position`;
   *  overlay-surface cells emit `data-h2h-overlay-score-position`.
   *  Optional for forward compat — existing callers that don't pass
   *  it omit the attribute and behave exactly as before.
   *
   *  Pre-RD6.1 this was the step-4 glide's "find the source/target"
   *  hook. RD6.1 deletes the glide entirely (totals now START in box
   *  corners on both surfaces, so the rail→box motion is obsolete),
   *  but the attribute stays — tests + RelayDebugOverlay still query
   *  it, and it remains the cleanest way to discriminate which side
   *  of the box a ScoreCell belongs to. */
  teamPosition?: "opponent" | "user";
}

export function ScoreCell({
  total,
  displayTotal,
  state,
  sizeProgress,
  surface,
  pop,
  teamPosition,
}: ScoreCellProps) {
  useEffect(ensureScoreRailKeyframesInjected, []);

  // Ref to the inner glyph so the Phase 2 pop can fire via WAAPI on the
  // EXACT scale-bearing element. Composing programmatically (instead of
  // a CSS-class toggle) lets each pop bake its own peak value (rest ×
  // magnitude) without needing per-cell CSS custom properties, AND
  // lets the animation auto-revert to the inline `transform: scale(rest)`
  // on completion (no `fill: forwards`), which is the cross-surface
  // handoff invariant: by `phase === "done"` no pop transient is left
  // on the element.
  const innerRef = useRef<HTMLDivElement>(null);
  const restScaleRef = useRef<number>(1);

  const shown = displayTotal !== undefined ? displayTotal : total;
  const shownStr = shown.toFixed(1);
  const surfaceAttrs =
    surface === "reveal"
      ? {
          "data-h2h-team-score": "true",
          "data-h2h-team-score-display": shownStr,
          // C3: per-team discriminator the glide layer queries on the
          // reveal surface to locate the start endpoint deterministically.
          ...(teamPosition ? { "data-h2h-team-score-position": teamPosition } : {}),
        }
      : {
          "data-h2h-overlay-score": "true",
          "data-h2h-overlay-score-value": shownStr,
          ...(teamPosition ? { "data-h2h-overlay-score-position": teamPosition } : {}),
        };

  // RD6.2-prep-A (2026-06-12): the resting Z1 scale is a CONSTANT —
  // both totals render at the same size regardless of running score or
  // leader/tie state. sizeProgress / state still flow through to data
  // attrs and to the leader-glow color/drop-shadow + tie-pulse paths
  // below; only the resting-scale CONTRIBUTION is gone. The pop
  // animation continues to compose off restScaleRef (peak = rest ×
  // magnitude), so the per-set scale POP survives unchanged.
  const scale = CONSTANT_REST_SCALE;
  restScaleRef.current = scale;

  // Phase 2 pop — WAAPI animation on the inner glyph, retriggered when
  // pop.key changes. Peaks at restScale × magnitude so the pop COMPOSES
  // with the Phase 1 resting Z transform (e.g., on the leader at end
  // of game restScale ≈ 1.20, peak ≈ 1.38 at magnitude 1.15). No
  // `fill: "forwards"` so the inline `transform: scale(restScale)`
  // takes over again when the animation ends — that's how the cross-
  // surface handoff invariant survives Phase 2's transient transforms.
  useEffect(() => {
    if (!pop) return;
    const node = innerRef.current;
    if (!node || typeof node.animate !== "function") return;
    const rest = restScaleRef.current;
    const peak = rest * pop.magnitude;
    const animation = node.animate(
      [
        { transform: `scale(${rest.toFixed(3)})` },
        { transform: `scale(${peak.toFixed(3)})`, offset: 0.35 },
        { transform: `scale(${rest.toFixed(3)})` },
      ],
      { duration: pop.durationMs, easing: "ease-out", fill: "none" },
    );
    return () => {
      // Cancel any in-flight pop if pop.key flips again before the
      // animation completes (e.g., a second flip on a back-to-back
      // boundary) — keeps the inline transform authoritative.
      animation.cancel();
    };
  }, [pop?.key, pop?.magnitude, pop?.durationMs]);

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
      data-h2h-score-pop-kind={pop?.kind ?? "none"}
      // Phase 2.5 dev-overlay-readability data-attrs. The RelayDebugOverlay
      // observes these via DOM queries so it doesn't need to be threaded
      // props through the relay path. Read-only; zero behavior impact.
      // - rest-scale: the Phase 1 resting Z scale (pre-pop).
      // - pop-magnitude / pop-duration-ms: the in-flight pop's parameters
      //   (or "none" when no pop has fired for this set yet).
      data-h2h-score-rest-scale={scale.toFixed(3)}
      data-h2h-score-pop-magnitude={pop ? pop.magnitude.toFixed(3) : "none"}
      data-h2h-score-pop-duration-ms={pop ? String(pop.durationMs) : "none"}
      data-h2h-score-size-progress={sizeProgress.toFixed(3)}
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
        ref={innerRef}
        style={{
          // RD6.2-prep-A: was 22, dropped to 20 so the corner FP reads
          // as a peer of the 18px name label on the same row instead
          // of a hero number. Paired with CONSTANT_REST_SCALE = 1.0,
          // the rendered glyph is fixed-size across both surfaces and
          // both teams. Leader-glow color + drop-shadow still
          // differentiate the leader; per-set pop still fires.
          fontSize: 20,
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
