/**
 * TopGameStamp — compact ALL-TIME / HISTORY! chip for Top Games tier 1 and 2.
 * Tier 3 (career) and null render nothing. The "next-tier fire" treatment
 * (specular sweep + inner core glow) lives in CardFront alongside the natural
 * fire so it reads as one extravagant flame rather than fire + extras.
 */

import React from "react";
import type { TopGameTier } from "../commentary/types";

interface Props {
  tier: TopGameTier | null;
}

const STYLE_ID = "top-game-overlay-styles-v5";
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

