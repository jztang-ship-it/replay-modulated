// shared/components/H2HScoreGlide.tsx
//
// Step-4 score glide — sub-commit C3 (the transition-layer scaffolding).
//
// MOUNTS the layer, MEASURES both endpoints, RENDERS static glyph
// clones at the START position. NO animation, NO translate, NO
// reconciliation here — those land in C4.
//
// Stacking
//   position: fixed; inset: 0; z-index: 9050 — sits BETWEEN the
//   reveal screen (z 9000) and the results overlay (z 9100), and
//   crucially OUTSIDE both their opacity subtrees, so clone glyphs
//   stay opacity 1 throughout the overlay's 350 ms crossfade-in
//   (which would otherwise multiply through the clones too).
//   pointer-events: none everywhere — the layer never intercepts
//   taps for the surfaces above or below.
//
// Endpoints
//   start: reveal-side ScoreCell outer box
//          [data-h2h-team-score-position="opponent" | "user"]
//          (the C3 team-position discriminator added in this commit)
//   end:   overlay docked-score slot in the ZoneHeader
//          [data-h2h-overlay-docked-score-team="opponent" | "user"]
//          (the C1 styling-locked, 68-px-wide, absolute target)
//
// Timing
//   When `active` flips true (reveal.phase === "done"), wait ONE RAF
//   so the overlay has mounted and its layout has resolved, THEN
//   read all four rects via getBoundingClientRect. The end rects
//   are stored only as metadata data-attrs on the clone (for C4 to
//   read without re-measuring); the layer itself only paints at the
//   start rect.
//
// Clone visual treatment
//   Each clone mirrors H2HScoreRail.ScoreCell's outer + inner pair
//   so the painted output is pixel-on-top of the real reveal score:
//     outer: position absolute at start rect's left/top with the
//            same width/height, flex-centered, filter:drop-shadow
//            for the leader-state glow.
//     inner: fontSize 22 / fontWeight 950 / lineHeight 1.05 /
//            tabular-nums / letterSpacing -0.5, three-state color,
//            transform: scale(restScale), textShadow on leader.
//   The rest scale follows the SAME formula ScoreCell uses
//   (1 + sizeProgress × SIZE_PROGRESS_MAX + LEADER_BONUS/TIE_BONUS,
//   clamped at MAX_SCALE) — all constants imported from H2HScoreRail.
//
// Safety
//   If any of the four endpoint queries returns null at the RAF tick
//   (e.g. overlay layout not yet committed, or a future restructure
//   renames a data-attr), the layer logs one warning and renders
//   nothing. The reveal/results handoff is never blocked or crashed.

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
}

interface EndpointRects {
  start: { left: number; top: number; width: number; height: number };
  end:   { left: number; top: number; width: number; height: number };
}

const FONT_SIZE_PX = 22;
const FONT_WEIGHT = 950;
const LINE_HEIGHT = 1.05;
const LETTER_SPACING_PX = -0.5;

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

export function H2HScoreGlide({ active, sender, recipient }: H2HScoreGlideProps) {
  const [rects, setRects] = useState<ClonePack | null>(null);

  useEffect(() => {
    if (!active) {
      setRects(null);
      warnedThisCycle = false;
      return;
    }
    // One RAF — the overlay's mount + first layout commit have to
    // land before we measure the docked-slot end rects.
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
      setRects({
        opponent: { start: oppStart, end: oppEnd },
        user: { start: userStart, end: userEnd },
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [active]);

  if (!active || !rects) return null;

  const renderClone = (
    team: H2HScoreGlideTeam,
    pair: EndpointRects,
    teamPosition: GlideTeamPosition,
  ) => {
    const { start, end } = pair;
    const scale = restScale(team.state, team.sizeProgress);
    return (
      <div
        data-h2h-score-glide-clone={teamPosition}
        data-h2h-score-glide-state={team.state}
        data-h2h-score-glide-rest-scale={scale.toFixed(3)}
        // End-rect metadata so C4 reads the docked target coords
        // without re-measuring at the moment motion starts.
        data-h2h-score-glide-end-left={end.left.toFixed(2)}
        data-h2h-score-glide-end-top={end.top.toFixed(2)}
        data-h2h-score-glide-end-width={end.width.toFixed(2)}
        data-h2h-score-glide-end-height={end.height.toFixed(2)}
        style={{
          position: "absolute",
          left: start.left,
          top: start.top,
          width: start.width,
          height: start.height,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          filter: outerFilterFor(team.state),
          pointerEvents: "none",
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
            transform: `scale(${scale.toFixed(3)})`,
            transformOrigin: "center center",
            textShadow: innerTextShadowFor(team.state),
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
