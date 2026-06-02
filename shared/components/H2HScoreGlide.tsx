// shared/components/H2HScoreGlide.tsx
//
// Step-4 score glide — through sub-commit C4 (THE MOTION).
//
// C3 mounted the layer, measured both endpoints, and rendered static
// glyph clones at the start position. C4 wires the actual handoff:
// suppress the source scores, translate + treatment-morph the clones
// from start to end over ~280 ms, then populate the docked targets at
// the moment each clone lands — under the one-visible-copy contract.
//
// Stacking
//   position: fixed; inset: 0; z-index: 9050. Mounted as a sibling of
//   H2HResultsOverlay inside the recipient-reveal wrapper so the
//   clones sit BETWEEN the reveal contents and the overlay's z 9100,
//   but OUTSIDE the overlay's opacity subtree (clones stay opacity 1
//   through the 350 ms overlay crossfade). pointer-events: none.
//
// Endpoints
//   start: reveal-side ScoreCell outer box
//          [data-h2h-team-score-position="opponent" | "user"]
//   end:   overlay docked-score slot in the ZoneHeader
//          [data-h2h-overlay-docked-score-team="opponent" | "user"]
//          (the C1 styling-locked, 68-px-wide, absolute target)
//
// Timing — the C4 handoff sequence
//
//   t=0    1st RAF after `active` flips true. Measure all four rects.
//          In the same RAF (auto-batched by React 18):
//            (a) call onGlideStart() so the parent flips
//                C2.glideHandoff → { opponent: true, user: true }.
//                The source ScoreCell inner glyphs go visibility:hidden
//                (the outer cell boxes hold — proven in C2). At this
//                exact paint, the clones mount at the source position
//                with identical treatment, so the user sees one glyph
//                per team — the lift-off is invisible.
//            (b) setRects(…). Clones become known to React and render
//                at translate(0,0) on the next commit.
//   t=0+1f 2nd RAF. setMotion({ opponent: true, user: true }) → next
//          render applies translate(dx, dy) + the 280 ms CSS
//          transition; the browser interpolates from the previous
//          paint's translate(0,0).
//   t≈280  CSS `transitionend` fires per team (independently — they
//          start together but each settles on its own event). The
//          handler:
//            (a) calls onGlideSettle(team) → parent flips
//                C1.dockedScoreSettled[team] = true → the docked slot
//                paints the populated glyph.
//            (b) sets internal settled[team] = true → the clone
//                unmounts in the SAME React commit.
//          React 18 auto-batches both setStates into one render so
//          the docked-glyph paint and the clone unmount happen in
//          the same frame — no flash, no gap.
//
//   The translate is computed center-to-center
//   (dst.center − src.center) so the clone's flex-centered inner
//   glyph lands on (≈) the docked-populated glyph's center, not at
//   the docked slot's top-left. The clone outer's bounding box is
//   wider than the 68-px docked slot, but the inner glyph aligns
//   with the docked glyph at sub-pixel precision — proven in the
//   C4 verification.
//
// Treatment morph
//   The clone CSS-transitions from source-rest treatment to
//   docked-rest treatment over the same 280 ms so the visual
//   character morphs in lock-step with the position:
//     - outer filter: drop-shadow → none      (leader glow fades)
//     - inner color:  state-tinted → docked-tinted (typically same)
//     - inner scale:  restScale → 1.0         (size growth unwinds)
//     - inner text-shadow: glow → none
//   transform / filter / color / text-shadow are all CSS-transitionable.
//   By t=280, the clone visually MATCHES the C1 docked slot's glyph,
//   so the settle-flip + clone unmount is a no-flash swap.
//
// Per-team independence
//   The two clones start together at t=0 but each fires its own
//   transitionend independently. The settle-flip + clone unmount run
//   per team. (For typical fixtures both finish in the same ~16 ms
//   window because their durations are equal.)
//
// fill mode (per the C4 spec)
//   This uses CSS transitions, not WAAPI animations. CSS transitions
//   naturally hold the to-value when they end (no snap-back) without
//   the "fill: forwards" / "fill: none" pitfall. The end-state is
//   driven by the transitionend handler + React state, not by any
//   fill mode.
//
// Reduced motion
//   NOT handled here — C5 lands the prefers-reduced-motion gate.
//   Until then, reduced-motion users get the full glide. C5 will
//   short-circuit motion and call onGlideStart + onGlideSettle
//   synchronously so the populate happens without the 280 ms beat.
//
// Safety
//   If any of the four endpoint queries returns null at the RAF tick
//   (overlay layout not yet committed, or a future restructure
//   renames a data-attr), the layer logs one warning and renders
//   nothing — the handoff falls back to the "overlay crossfade hides
//   the lift-off" pre-C4 behavior. The reveal/results handoff is
//   never blocked or crashed.

import React, { useEffect, useState } from "react";
import {
  WINNING_COLOR,
  TRAILING_COLOR,
  DELTA_NEUTRAL,
  WINNING_GLOW,
  TIE_GLOW,
  SIZE_PROGRESS_MAX,
  LEADER_BONUS,
  TIE_BONUS,
  MAX_SCALE,
} from "./H2HScoreRail";
import { usePrefersReducedMotion } from "./H2HRevealScreen";

export type GlideTeamPosition = "opponent" | "user";
export type GlideTeamState = "leading" | "trailing" | "tied";

export interface H2HScoreGlideTeam {
  total: number;
  state: GlideTeamState;
  /** 0..1 — the same normalized progress the reveal ScoreCell uses
   *  for its size model (running total / max final total). Pass the
   *  final-state value when active flips true. */
  sizeProgress: number;
}

export interface H2HScoreGlideProps {
  /** True when reveal.phase === "done". Drives the measurement +
   *  clone mount; false renders nothing and clears any measured rects. */
  active: boolean;
  sender: H2HScoreGlideTeam;
  recipient: H2HScoreGlideTeam;
  /** Step-4 C4 — fired at t=0 once measurements are captured. The
   *  parent's handler flips C2.glideHandoff → { opponent: true,
   *  user: true } so the source ScoreCell inner glyphs go
   *  visibility:hidden in the same React commit as the clones mount.
   *  The lift-off becomes invisible (clones paint at the source's
   *  position with identical treatment in the same frame the source
   *  glyph hides). */
  onGlideStart?: () => void;
  /** Step-4 C4 — fired per team when that team's clone finishes its
   *  translate transition. The parent's handler flips
   *  C1.dockedScoreSettled[team] → true so the docked slot paints
   *  the populated glyph. Same handler also triggers the internal
   *  clone unmount; React 18 auto-batches the parent's setState and
   *  this component's internal setState into one render so the
   *  populated glyph paint and the clone unmount land in the same
   *  frame — no flash, no gap. */
  onGlideSettle?: (team: GlideTeamPosition) => void;
}

interface EndpointRects {
  start: { left: number; top: number; width: number; height: number };
  end:   { left: number; top: number; width: number; height: number };
}

const FONT_SIZE_PX = 22;
const FONT_WEIGHT = 950;
const LINE_HEIGHT = 1.05;
const LETTER_SPACING_PX = -0.5;

/** Glide duration. Tuned to finish BEFORE the overlay's 350 ms
 *  crossfade-in so the score lands first and the surface fills in
 *  around it. ("Score lands first" — the C4 spec's framing.) */
const GLIDE_DURATION_MS = 280;
/** No rebound / no overshoot per the C4 spec. Standard ease-out
 *  curve with a gentle decel tail; matches the user's stated easing. */
const GLIDE_EASING = "cubic-bezier(0.2, 0.7, 0.1, 1)";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function restScale(state: GlideTeamState, sizeProgress: number): number {
  const stateBonus =
    state === "leading" ? LEADER_BONUS : state === "tied" ? TIE_BONUS : 0;
  const raw = 1 + clamp01(sizeProgress) * SIZE_PROGRESS_MAX + stateBonus;
  return Math.min(MAX_SCALE, raw);
}

function colorFor(state: GlideTeamState): string {
  return state === "leading"
    ? WINNING_COLOR
    : state === "tied"
      ? DELTA_NEUTRAL
      : TRAILING_COLOR;
}

function outerFilterFor(state: GlideTeamState): string {
  return state === "leading"
    ? `drop-shadow(0 0 8px ${WINNING_GLOW})`
    : state === "tied"
      ? `drop-shadow(0 0 6px ${TIE_GLOW})`
      : "none";
}

function innerTextShadowFor(state: GlideTeamState): string {
  return state === "leading" ? `0 0 6px ${WINNING_GLOW}` : "none";
}

function asPlainRect(r: DOMRect | undefined | null) {
  if (!r) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

let warnedThisCycle = false;

interface ClonePack {
  opponent: EndpointRects;
  user: EndpointRects;
}

interface TeamFlags {
  opponent: boolean;
  user: boolean;
}

const BOTH_FALSE: TeamFlags = { opponent: false, user: false };
const BOTH_TRUE: TeamFlags = { opponent: true, user: true };

export function H2HScoreGlide({
  active,
  sender,
  recipient,
  onGlideStart,
  onGlideSettle,
}: H2HScoreGlideProps) {
  // C5 — prefers-reduced-motion gate. When true at the moment `active`
  // flips true, the layer short-circuits the WAAPI translate entirely:
  // clones never mount, the parent's onGlideStart + onGlideSettle fire
  // synchronously inside the same RAF (and therefore the same React
  // batch), so the docked score simply APPEARS in place with no
  // motion and no beat. The end-state matches the motion path
  // (source hidden, rail suppressed, docked populated) — just
  // reached instantly. The 350 ms overlay crossfade is independent
  // and already governed by the project's existing reduced-motion
  // handling; C5 only kills the translate.
  const reducedMotion = usePrefersReducedMotion();
  const [rects, setRects] = useState<ClonePack | null>(null);
  // motion: per-team flag that controls whether the clone is at
  // translate(0,0) (false) or translate(dx,dy) + transition (true).
  // Flips true together for both teams in the second RAF; the CSS
  // transition then animates from the previously-painted translate(0,0).
  const [motion, setMotion] = useState<TeamFlags>(BOTH_FALSE);
  // settled: per-team internal flag. Mirrors the parent's
  // dockedScoreSettled and is flipped in the same handler the parent
  // uses, so React's auto-batching co-commits the docked-glyph paint
  // and this component's clone unmount in the same render.
  const [settled, setSettled] = useState<TeamFlags>(BOTH_FALSE);

  // First RAF — measure both endpoints and call onGlideStart. React 18
  // auto-batches the two setStates (the parent's setGlideHandoff and
  // this component's setRects) into one render: source goes
  // visibility:hidden + clones mount at translate(0,0) in the same
  // frame. No double-render, no gap.
  useEffect(() => {
    if (!active) {
      setRects(null);
      setMotion(BOTH_FALSE);
      setSettled(BOTH_FALSE);
      warnedThisCycle = false;
      return;
    }
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const startOpp = document.querySelector(
        '[data-h2h-team-score-position="opponent"]',
      );
      const startUser = document.querySelector(
        '[data-h2h-team-score-position="user"]',
      );
      const endOpp = document.querySelector(
        '[data-h2h-overlay-docked-score-team="opponent"]',
      );
      const endUser = document.querySelector(
        '[data-h2h-overlay-docked-score-team="user"]',
      );
      if (!startOpp || !startUser || !endOpp || !endUser) {
        if (!warnedThisCycle) {
          warnedThisCycle = true;
          // eslint-disable-next-line no-console
          console.warn("[h2h-glide] C3 endpoint resolve failed", {
            startOpponent: !!startOpp,
            startUser: !!startUser,
            endOpponent: !!endOpp,
            endUser: !!endUser,
          });
        }
        setRects(null);
        return;
      }
      const oppStart = asPlainRect(startOpp.getBoundingClientRect());
      const userStart = asPlainRect(startUser.getBoundingClientRect());
      const oppEnd = asPlainRect(endOpp.getBoundingClientRect());
      const userEnd = asPlainRect(endUser.getBoundingClientRect());
      if (!oppStart || !userStart || !oppEnd || !userEnd) {
        setRects(null);
        return;
      }
      if (reducedMotion) {
        // C5 reduced-motion short-circuit. SKIP the WAAPI translate
        // and the clone mount entirely. Flip both parent flags
        // synchronously so they batch into a single React commit:
        //   onGlideStart       → glideHandoff = { true, true }
        //                        (reveal source + overlay rail both
        //                         suppressed, same as the motion path
        //                         at t=0)
        //   onGlideSettle(opp) → dockedScoreSettled.opponent = true
        //                        (docked slot populates with the glyph)
        //   onGlideSettle(usr) → dockedScoreSettled.user     = true
        // No setRects → clones never mount → no transitionend → no
        // duplicate settle path. End-state byte-identical to the
        // motion path's post-settle: source hidden, rail hidden,
        // cloneCount 0, docked populated. The one-visible-copy
        // contract holds — middle phase collapsed to zero duration.
        if (onGlideStart) onGlideStart();
        if (onGlideSettle) {
          onGlideSettle("opponent");
          onGlideSettle("user");
        }
        return;
      }
      // C4 motion path: t=0 kick off motion AND mount clones in the
      // same React batch. The parent's handler flips C2.glideHandoff
      // true in the same commit, so the lift-off paints without a
      // double or a gap.
      if (onGlideStart) onGlideStart();
      setRects({
        opponent: { start: oppStart, end: oppEnd },
        user: { start: userStart, end: userEnd },
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [active, onGlideStart, onGlideSettle, reducedMotion]);

  // Second RAF — once the rects are set (and the first commit has
  // painted the clones at translate(0,0)), flip motion true. The next
  // commit's CSS transition then animates from the prior paint's
  // translate(0,0) to the new translate(dx,dy). Two paints are
  // required to drive a CSS transition; without this second RAF the
  // browser would never see the start-state paint.
  useEffect(() => {
    if (!rects) return;
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      setMotion(BOTH_TRUE);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [rects]);

  if (!active || !rects) return null;

  // Compute center-to-center translation. Using outer-LEFT/TOP delta
  // would land the clone outer's top-left at the docked outer's
  // top-left, but the clone outer (80 wide × 181 tall — the source
  // ScoreCell's box) is much larger than the docked slot (68 × 24),
  // so the flex-centered inner glyph would land 78 px below the
  // docked slot's vertical center. Center-to-center keeps the
  // INNER GLYPH co-located with where the docked glyph will paint
  // (sub-pixel; verified in C4's _c4-motion alignment snapshot).
  const computeDelta = (pair: EndpointRects) => {
    const srcCenterX = pair.start.left + pair.start.width / 2;
    const srcCenterY = pair.start.top + pair.start.height / 2;
    const dstCenterX = pair.end.left + pair.end.width / 2;
    const dstCenterY = pair.end.top + pair.end.height / 2;
    return { dx: dstCenterX - srcCenterX, dy: dstCenterY - srcCenterY };
  };

  const handleTransitionEnd = (team: GlideTeamPosition) =>
    (e: React.TransitionEvent<HTMLDivElement>) => {
      // Only react to the OUTER's transform transition. The inner
      // glyph's scale transition also fires here (bubbles up); we
      // ignore those so the settle flips exactly once per team.
      if (e.propertyName !== "transform") return;
      if ((e.target as HTMLElement).getAttribute("data-h2h-score-glide-clone")
        !== team) return;
      if (settled[team]) return;
      if (onGlideSettle) onGlideSettle(team);
      setSettled((prev) => ({ ...prev, [team]: true }));
    };

  const renderClone = (
    team: H2HScoreGlideTeam,
    pair: EndpointRects,
    teamPosition: GlideTeamPosition,
  ) => {
    if (settled[teamPosition]) return null;
    const { start, end } = pair;
    const restS = restScale(team.state, team.sizeProgress);
    const inMotion = motion[teamPosition];
    const { dx, dy } = computeDelta(pair);
    // Outer: translates from (0,0) to (dx,dy). Filter morphs from
    // source's leader glow to docked's no-glow over the same window.
    const outerTransform = inMotion ? `translate(${dx}px, ${dy}px)` : "translate(0px, 0px)";
    const outerFilter = inMotion ? "none" : outerFilterFor(team.state);
    const outerTransition = inMotion
      ? `transform ${GLIDE_DURATION_MS}ms ${GLIDE_EASING}, filter ${GLIDE_DURATION_MS}ms ${GLIDE_EASING}`
      : "none";
    // Inner: scale unwinds from restScale to 1.0. Color stays the
    // same (winner / loser / tie state doesn't change at landing,
    // and the docked slot uses the same three-state palette).
    // text-shadow fades from leader-glow to none.
    const innerTransform = inMotion ? "scale(1)" : `scale(${restS.toFixed(3)})`;
    const innerShadow = inMotion ? "none" : innerTextShadowFor(team.state);
    const innerTransition = inMotion
      ? `transform ${GLIDE_DURATION_MS}ms ${GLIDE_EASING}, text-shadow ${GLIDE_DURATION_MS}ms ${GLIDE_EASING}`
      : "none";
    return (
      <div
        data-h2h-score-glide-clone={teamPosition}
        data-h2h-score-glide-state={team.state}
        data-h2h-score-glide-motion={inMotion ? "true" : "false"}
        data-h2h-score-glide-rest-scale={restS.toFixed(3)}
        data-h2h-score-glide-end-left={end.left.toFixed(2)}
        data-h2h-score-glide-end-top={end.top.toFixed(2)}
        data-h2h-score-glide-end-width={end.width.toFixed(2)}
        data-h2h-score-glide-end-height={end.height.toFixed(2)}
        data-h2h-score-glide-dx={dx.toFixed(2)}
        data-h2h-score-glide-dy={dy.toFixed(2)}
        onTransitionEnd={handleTransitionEnd(teamPosition)}
        style={{
          position: "absolute",
          left: start.left,
          top: start.top,
          width: start.width,
          height: start.height,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: outerTransform,
          filter: outerFilter,
          transition: outerTransition,
          pointerEvents: "none",
          // willChange hints the browser to promote this element to
          // its own compositor layer so the transition runs on the
          // GPU. Scoped to "transform, filter" so the hint is precise.
          willChange: "transform, filter",
        }}
      >
        <div
          style={{
            fontSize: FONT_SIZE_PX,
            fontWeight: FONT_WEIGHT,
            color: colorFor(team.state),
            fontVariantNumeric: "tabular-nums",
            letterSpacing: `${LETTER_SPACING_PX}px`,
            textAlign: "center",
            lineHeight: LINE_HEIGHT,
            transform: innerTransform,
            transformOrigin: "center center",
            textShadow: innerShadow,
            transition: innerTransition,
          }}
        >
          {team.total.toFixed(1)}
        </div>
      </div>
    );
  };

  return (
    <div
      data-h2h-score-glide-layer="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9050,
      }}
    >
      {renderClone(sender, rects.opponent, "opponent")}
      {renderClone(recipient, rects.user, "user")}
    </div>
  );
}
