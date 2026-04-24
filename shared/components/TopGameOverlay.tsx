// shared/components/TopGameOverlay.tsx
/**
 * TopGameOverlay — renders the gold/platinum shimmer sweep and persistent
 * stamp for Top Games tier 1 (all_time) and tier 2 (season). Tier 3 (career)
 * and null render nothing.
 *
 * Sport-agnostic. Injected into CardFront; positioned absolute inside the
 * card's notched clip. Shimmer fires once on reveal via CSS keyframe
 * (key prop rekeys the animation if tier changes).
 */

import React from "react";
import type { TopGameTier } from "../commentary/types";

interface TopGameOverlayProps {
  tier: TopGameTier | null;
  /** Set true during the reveal animation window. Triggers shimmer. */
  revealActive?: boolean;
}

const STYLE_ID = "top-game-overlay-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes tgShimmer {
      0%   { transform: translateX(-120%); opacity: 0; }
      20%  { opacity: 0.95; }
      80%  { opacity: 0.95; }
      100% { transform: translateX(120%); opacity: 0; }
    }
    .tg-overlay {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
      border-radius: inherit;
    }
    .tg-shimmer {
      position: absolute; inset: 0;
      background: linear-gradient(
        110deg,
        transparent 0%,
        rgba(255,255,255,0) 35%,
        var(--tg-sheen) 50%,
        rgba(255,255,255,0) 65%,
        transparent 100%
      );
      animation: tgShimmer 1.2s ease-out 1 both;
      mix-blend-mode: screen;
    }
    .tg-stamp {
      position: absolute; top: 8%; right: 6%;
      font-weight: 900; font-size: 11px; letter-spacing: 2px;
      padding: 4px 8px; border-radius: 3px;
      transform: rotate(-6deg);
      text-transform: uppercase;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      border: 1.5px solid currentColor;
    }
    .tg-stamp-allTime {
      background: linear-gradient(135deg, #e7ecff 0%, #b2c3ff 50%, #d8c9ff 100%);
      color: #2a1d6b;
    }
    .tg-stamp-season {
      background: linear-gradient(135deg, #ffe27a 0%, #f5b301 50%, #c07a00 100%);
      color: #3a2000;
    }
  `;
  document.head.appendChild(st);
}

export function TopGameOverlay({ tier, revealActive }: TopGameOverlayProps) {
  if (tier !== "all_time" && tier !== "season") return null;

  const sheen = tier === "all_time"
    ? "rgba(210, 225, 255, 0.95)" // cool platinum
    : "rgba(255, 220, 120, 0.95)"; // warm gold

  const stampText = tier === "all_time" ? "ALL-TIME" : "HISTORY!";
  const stampClass = tier === "all_time" ? "tg-stamp-allTime" : "tg-stamp-season";

  return (
    <div className="tg-overlay" style={{ ["--tg-sheen" as any]: sheen }}>
      {revealActive && <div key={tier} className="tg-shimmer" />}
      <div className={`tg-stamp ${stampClass}`}>{stampText}</div>
    </div>
  );
}
