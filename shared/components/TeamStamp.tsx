/**
 * TeamStamp — team-level shareable-moment marker on the win-tier panel.
 *
 * Two kinds:
 *   - bad_beat  → "BAD BEAT"
 *   - miss      → "{missTier} MISS"  (e.g. "ALL STAR MISS"); falls back
 *                 to bare "MISS" when missTier is absent/empty so a
 *                 partial wiring still renders sensibly.
 *
 * Visual family matches the player-card stamps in TopGameOverlay (slanted
 * chip, bordered, gradient fill) but omits the persistent halo pulse — the
 * thud landing is the attention grab; the design forbids additional
 * flourishes here. Slant is delivered via the keyframe end-state
 * (rotate(-5deg) in tsTeamStampThud), not a static transform on the chip.
 *
 * Caller is responsible for positioning the wrapper (typically absolute,
 * centered over the settled tier indicator). Caller also owns the entrance
 * delay relative to the surrounding tier-settle animation.
 */

import React from "react";

export type TeamStampKind = "bad_beat" | "miss";

interface Props {
  kind: TeamStampKind | null | undefined | string;
  /** Tier prefix for the miss kind, e.g. "ALL_STAR" or "ALL STAR".
   *  Display-formatted on render (underscore → space). Ignored for
   *  bad_beat. When absent for a miss, renders bare "MISS". */
  missTier?: string;
  /** Delay before the thud entrance begins, in ms. Default 0. */
  delayMs?: number;
}

const STYLE_ID = "team-stamp-styles-v2";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    .ts-stamp {
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-weight: 900; font-size: 13px; letter-spacing: 1.4px;
      padding: 5px 11px; border-radius: 3px;
      text-transform: uppercase;
      border: 1.75px solid currentColor;
      box-shadow: 0 3px 7px rgba(0,0,0,0.6);
      line-height: 1;
      white-space: nowrap;
      font-family: 'Rajdhani','Oswald','Arial Narrow',sans-serif;
    }
    .ts-stamp-bad-beat {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%);
      color: #fff5f5;
      text-shadow: 0 1px 2px rgba(0,0,0,0.55);
    }
    .ts-stamp-miss {
      background: linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%);
      color: #3a2000;
    }

    /* THUD entrance — translate(-50%,-50%) baked in so the wrapper stays
       centered on its (left, top) anchor. Slightly heavier than the
       player-card tgThud: lands at rotate(-5deg) and at the panel scale. */
    @keyframes tsTeamStampThud {
      0%   { transform: translate(-50%, -50%) rotate(-10deg) scale(0.3); opacity: 0; }
      55%  { transform: translate(-50%, -50%) rotate(-2deg)  scale(1.4); opacity: 1; }
      75%  { transform: translate(-50%, -50%) rotate(-6deg)  scale(0.92); opacity: 1; }
      90%  { transform: translate(-50%, -50%) rotate(-4deg)  scale(1.04); opacity: 1; }
      100% { transform: translate(-50%, -50%) rotate(-5deg)  scale(1);    opacity: 1; }
    }
    .ts-stamp-wrap-thud {
      animation: tsTeamStampThud 480ms cubic-bezier(0.22, 1.4, 0.36, 1) both;
    }
  `;
  document.head.appendChild(st);
}

const CLASS: Record<TeamStampKind, string> = {
  bad_beat: "ts-stamp-bad-beat",
  miss: "ts-stamp-miss",
};

function formatTierPrefix(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ").trim().toUpperCase();
}

function labelFor(kind: TeamStampKind, missTier?: string): string {
  if (kind === "bad_beat") return "BAD BEAT";
  // kind === "miss"
  const prefix = formatTierPrefix(missTier);
  return prefix ? `${prefix} MISS` : "MISS";
}

export function TeamStamp({ kind, missTier, delayMs = 0 }: Props) {
  if (kind !== "bad_beat" && kind !== "miss") return null;
  return (
    <span
      className="ts-stamp-wrap-thud"
      style={{
        display: "inline-block",
        animationDelay: delayMs > 0 ? `${delayMs}ms` : undefined,
      }}
    >
      <span className={`ts-stamp ${CLASS[kind]}`}>{labelFor(kind, missTier)}</span>
    </span>
  );
}
