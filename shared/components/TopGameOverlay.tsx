/**
 * TopGameStamp — compact ALL-TIME / HISTORY! chip for Top Games tier 1 and 2.
 * Tier 3 (career) and null render nothing.
 *
 * TopGameSparkle — twinkling 4-point stars sprinkled over the fire layer for
 * T1/T2 cards. Tier-colored (platinum for all_time, gold for season). Lives
 * just above the fire (z 40) so the sparkles read as embers in the flames.
 *
 * The full-card shimmer overlay was retired in favor of two non-conflicting
 * signals: (1) the stamp's slow tier-colored halo pulse for the "this card is
 * permanently special" cue, and (2) sparkle particles on the fire to amplify
 * the reveal moment. Fire intensity is also boosted in CardFront when topGame
 * is set so the flames themselves clearly distinguish a top game.
 */

import React from "react";
import type { TopGameTier } from "../commentary/types";

interface Props {
  tier: TopGameTier | null;
}

const STYLE_ID = "top-game-overlay-styles-v4";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .tg-stamp {
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-weight: 900; font-size: 10px; letter-spacing: 1.2px;
      padding: 3px 7px; border-radius: 2.5px;
      text-transform: uppercase;
      border: 1.5px solid currentColor;
      box-shadow: 0 2px 5px rgba(0,0,0,0.55);
      line-height: 1;
      white-space: nowrap;
    }
    .tg-stamp-allTime {
      background: linear-gradient(135deg, #e7ecff 0%, #b2c3ff 50%, #d8c9ff 100%);
      color: #2a1d6b;
    }
    .tg-stamp-season {
      background: linear-gradient(135deg, #ffe27a 0%, #f5b301 50%, #c07a00 100%);
      color: #3a2000;
    }

    /* THUD entrance — scale 0.3 → 1.35 overshoot → 0.95 → 1.0 settle, 420ms.
       translate(-50%,-50%) baked into every keyframe so the wrapper stays
       horizontally + vertically centered on its (left, top) anchor. */
    @keyframes tgThud {
      0%   { transform: translate(-50%, -50%) rotate(-8deg) scale(0.3); opacity: 0; }
      50%  { transform: translate(-50%, -50%) rotate(-2deg) scale(1.35); opacity: 1; }
      75%  { transform: translate(-50%, -50%) rotate(-5deg) scale(0.95); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(-4deg) scale(1);    opacity: 1; }
    }
    .tg-stamp-wrap-thud {
      animation: tgThud 420ms cubic-bezier(0.22, 1.4, 0.36, 1) forwards;
    }

    /* Persistent halo pulse — tier-colored glow on box-shadow, 2.4s/cycle.
       Scoped under .tg-stamp-wrap-thud so back-of-card stamps don't pulse.
       Animation delay matches thud duration (420ms) so the pulse fades in
       AFTER the entrance lands, not on top of it. */
    @keyframes tgPulseAllTime {
      0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 5px rgba(180,200,255,0.35); }
      50%      { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 13px rgba(180,200,255,0.85); }
    }
    @keyframes tgPulseSeason {
      0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 5px rgba(255,200,80,0.35); }
      50%      { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 13px rgba(255,200,80,0.85); }
    }
    .tg-stamp-wrap-thud .tg-stamp-allTime {
      animation: tgPulseAllTime 2.4s ease-in-out 420ms infinite;
    }
    .tg-stamp-wrap-thud .tg-stamp-season {
      animation: tgPulseSeason 2.4s ease-in-out 420ms infinite;
    }

    /* SPARKLE — twinkling 4-point stars layered over the fire. Each sparkle is
       an SVG with a star path; CSS animates opacity + scale + rotation in a
       staggered cycle. Position-randomized via the position list in TS. */
    @keyframes tgSparkleTwinkle {
      0%, 100% { opacity: 0;   transform: scale(0.2) rotate(0deg); }
      40%      { opacity: 1;   transform: scale(1.15) rotate(35deg); }
      55%      { opacity: 0.9; transform: scale(0.95) rotate(50deg); }
    }
    .tg-sparkle-host {
      position: absolute; inset: 0; bottom: 28%;
      pointer-events: none; z-index: 40;
      overflow: visible;
    }
    .tg-sparkle {
      position: absolute;
      animation: tgSparkleTwinkle 1.8s ease-in-out infinite;
      transform-origin: center;
      filter: drop-shadow(0 0 2px var(--sp-color));
    }
  `;
  document.head.appendChild(st);
}

/**
 * Chip-only — caller wraps it in a positioned div and applies entrance/transform
 * classes (e.g. `.tg-stamp-wrap-thud` for front, none for back static).
 */
export function TopGameStamp({ tier }: Props) {
  if (tier !== "all_time" && tier !== "season") return null;
  const stampText = tier === "all_time" ? "ALL-TIME" : "HISTORY!";
  const stampClass = tier === "all_time" ? "tg-stamp-allTime" : "tg-stamp-season";
  return <span className={`tg-stamp ${stampClass}`}>{stampText}</span>;
}

/** Twinkling sparkles over the fire layer. T1 = platinum, T2 = gold. */
const SPARKLE_POSITIONS: Array<{ left: string; top: string; delay: string; size: number }> = [
  { left: "12%", top: "12%", delay: "0s",    size: 10 },
  { left: "82%", top: "20%", delay: "0.35s", size: 12 },
  { left: "30%", top: "8%",  delay: "0.7s",  size: 8  },
  { left: "65%", top: "42%", delay: "0.95s", size: 11 },
  { left: "18%", top: "55%", delay: "0.2s",  size: 12 },
  { left: "78%", top: "62%", delay: "0.8s",  size: 9  },
  { left: "45%", top: "30%", delay: "0.5s",  size: 10 },
  { left: "55%", top: "10%", delay: "1.15s", size: 11 },
  { left: "8%",  top: "38%", delay: "0.6s",  size: 8  },
  { left: "92%", top: "48%", delay: "1.05s", size: 10 },
];

export function TopGameSparkle({ tier }: Props) {
  if (tier !== "all_time" && tier !== "season") return null;
  const color = tier === "all_time"
    ? "rgba(225, 235, 255, 1)"  // cool platinum-white
    : "rgba(255, 240, 170, 1)"; // warm gold-white
  return (
    <div className="tg-sparkle-host">
      {SPARKLE_POSITIONS.map((s, i) => (
        <svg
          key={i}
          className="tg-sparkle"
          width={s.size}
          height={s.size}
          viewBox="0 0 12 12"
          style={{
            left: s.left,
            top: s.top,
            animationDelay: s.delay,
            ["--sp-color" as any]: color,
          }}
        >
          <path d="M6,0 L7,5 L12,6 L7,7 L6,12 L5,7 L0,6 L5,5 Z" fill={color} />
        </svg>
      ))}
    </div>
  );
}
