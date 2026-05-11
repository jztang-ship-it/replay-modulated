/**
 * TopGameStamp — compact RECORD / CAREER / SEASON chip for Top Games tiers.
 * All three tiers render. The shared "next-tier fire" treatment (specular sweep
 * + inner core glow) lives in CardFront so the card reads as one extravagant
 * flame rather than fire + extras.
 */

import React from "react";
import type { TopGameTier } from "../commentary/types";

interface Props {
  tier: TopGameTier | null;
}

const STYLE_ID = "top-game-overlay-styles-v6";
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
    /* T0 RECORD — platinum/iridescent */
    .tg-stamp-record {
      background: linear-gradient(135deg, #e7ecff 0%, #b2c3ff 50%, #d8c9ff 100%);
      color: #2a1d6b;
    }
    /* T1 CAREER — gold */
    .tg-stamp-career {
      background: linear-gradient(135deg, #ffe27a 0%, #f5b301 50%, #c07a00 100%);
      color: #3a2000;
    }
    /* T2 SEASON — chrome/silver */
    .tg-stamp-season {
      background: linear-gradient(135deg, #e8edf2 0%, #aab7c4 50%, #5d6e7c 100%);
      color: #1a2330;
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
       Scoped under .tg-stamp-wrap-thud so back-of-card stamps don't pulse. */
    @keyframes tgPulseRecord {
      0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 5px rgba(180,200,255,0.35); }
      50%      { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 13px rgba(180,200,255,0.85); }
    }
    @keyframes tgPulseCareer {
      0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 5px rgba(255,200,80,0.35); }
      50%      { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 13px rgba(255,200,80,0.85); }
    }
    @keyframes tgPulseSeason {
      0%, 100% { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 5px rgba(170,183,196,0.35); }
      50%      { box-shadow: 0 2px 5px rgba(0,0,0,0.55), 0 0 13px rgba(170,183,196,0.85); }
    }
    .tg-stamp-wrap-thud .tg-stamp-record { animation: tgPulseRecord 2.4s ease-in-out 420ms infinite; }
    .tg-stamp-wrap-thud .tg-stamp-career { animation: tgPulseCareer 2.4s ease-in-out 420ms infinite; }
    .tg-stamp-wrap-thud .tg-stamp-season { animation: tgPulseSeason 2.4s ease-in-out 420ms infinite; }
  `;
  document.head.appendChild(st);
}

const STAMP_TEXT: Record<TopGameTier, string> = {
  record: "NEW RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

const STAMP_CLASS: Record<TopGameTier, string> = {
  record: "tg-stamp-record",
  career: "tg-stamp-career",
  season: "tg-stamp-season",
};

/**
 * Chip-only — caller wraps it in a positioned div and applies entrance/transform
 * classes (e.g. `.tg-stamp-wrap-thud` for front, none for back static).
 */
export function TopGameStamp({ tier }: Props) {
  if (!tier) return null;
  return <span className={`tg-stamp ${STAMP_CLASS[tier]}`}>{STAMP_TEXT[tier]}</span>;
}
