/**
 * football/src/views/GameView.tsx — shim.
 * Builds a GameAdapter and renders shared/views/GameView.
 * Deferred to Phase 6: ftueRoster.ts (real Messi-anchored FTUE roster).
 */

import { useMemo } from "react";
import { GameView as SharedGameView } from "@shared/views/GameView";
import type { GameAdapter } from "@shared/views/GameAdapter";
import type { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import type { WinTierDisplay, LegendData } from "@shared/components/GameBar";
import type { TierThreshold as GaugeTierThreshold } from "@shared/components/TierGauge";
import { tierFromSalary } from "@shared/views/_gameViewHelpers";
import { sportAdapter } from "../adapters/SportAdapter";
import {
  dealInitialRoster,
  redrawRoster,
  resolveRoster,
  getTodaysStars,
} from "../adapters/gameAdapter";
import {
  calculateWinTier,
  calculatePayoutWithStreak,
  getStreakMultiplier,
  FOOTBALL_WIN_TIERS,
} from "../utils/payoutLogic";
import { SoccerCard, resetAllOverlays } from "../components/SoccerCard";
import {
  FOOTBALL_FTUE_CONFIG,
  dealFTUERoster,
  redrawFTUERoster,
  resolveFTUERoster,
} from "../adapters/ftueRoster";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { FootballSlateChip } from "../components/FootballSlatePanel";

// ── Tier gauge thresholds — football-specific FP cutoffs ──────────────────────
// MUST match footballConfig.ts winTiers.minFp values — recalibrated 2026-05-07
// after the GK multiplier removal + FWD active-play bumps.
// Display names: SUB / STARTER / CAPTAIN / MOTM / LEGEND
// WinTierKey mapping: ROOKIE / STARTER / ALL_STAR / MVP / LEGEND
const GAUGE_THRESHOLDS: GaugeTierThreshold[] = [
  { tier: "ROOKIE",   minFP: 140 },  // SUB
  { tier: "STARTER",  minFP: 160 },  // STARTER
  { tier: "ALL_STAR", minFP: 185 },  // CAPTAIN
  { tier: "MVP",      minFP: 210 },  // MOTM
  { tier: "LEGEND",   minFP: 240 },  // LEGEND
];

// ── GameBar tier rows — must stay in sync with FOOTBALL_WIN_TIERS ─────────────
const WIN_TIERS: WinTierDisplay[] = [
  { label: "SUB",     minFp: 140, color: "#94A3B8", glow: "rgba(148,163,184,0.5)"  },
  { label: "STARTER", minFp: 160, color: "#10B981", glow: "rgba(16,185,129,0.6)"   },
  { label: "CAPTAIN", minFp: 185, color: "#3B82F6", glow: "rgba(59,130,246,0.6)"   },
  { label: "MOTM",    minFp: 210, color: "#F59E0B", glow: "rgba(245,158,11,0.7)"   },
  { label: "LEGEND",  minFp: 240, color: "#EF4444", glow: "rgba(239,68,68,0.9)"    },
];

const LEGEND_DATA: LegendData = {
  payoutRows: [
    { label: "LEGEND",  score: "240+", payout: "50x",   color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)"   },
    { label: "MOTM",    score: "210+", payout: "18x",   color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.3)"   },
    { label: "CAPTAIN", score: "185+", payout: "5x",    color: "#3B82F6", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.28)"  },
    { label: "STARTER", score: "160+", payout: "2x",    color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)"  },
    { label: "SUB",     score: "140+", payout: "0.85x", color: "#94A3B8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.22)" },
    { label: "BUST",    score: "<140", payout: "—",     color: "#6B7280", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.18)" },
  ],
  bonusRows: [
    { label: "3-WIN STREAK",  condition: "3 wins in a row",  reward: "1.3x payout" },
    { label: "5-WIN STREAK",  condition: "5 wins in a row",  reward: "1.7x payout" },
    { label: "10-WIN STREAK", condition: "10 wins in a row", reward: "2.5x payout" },
  ],
  stamps: [],
  scoringRules: [
    // Outfield stat weights
    { stat: "Goal",     pts: "+12–22" },
    { stat: "Assist",   pts: "+7–8"   },
    { stat: "Key Pass", pts: "+3–5"   },
    { stat: "Tackle",   pts: "+2–5"   },
    { stat: "Shot SOT", pts: "+2–4"   },
    { stat: "Dribble",  pts: "+2"     },
    { stat: "Clearance",pts: "+1–4"   },
    { stat: "Pressure", pts: "+0.2–0.6" },
    { stat: "Yellow",   pts: "-5"     },
    { stat: "Red Card", pts: "-15"    },
    // GK-specific
    { stat: "Save",     pts: "+20"    },
    { stat: "GA",       pts: "-6"     },
  ],
  badges: [
    // FWD
    { icon: "🎩", label: "HAT-TRICK",   condition: "3+ goals",                      fp: 30 },
    { icon: "⚡", label: "BRACE",       condition: "2 goals",                       fp: 15 },
    { icon: "🎯", label: "POACHER",     condition: "1 goal + 1 assist",             fp: 15 },
    { icon: "🪄", label: "CREATOR",     condition: "2+ assists",                    fp: 18 },
    { icon: "🔫", label: "SHARP",       condition: "2+ SOT, 0 goals",              fp: 8  },
    // MID
    { icon: "🎼", label: "MAESTRO",     condition: "1 goal + 2 key passes",         fp: 20 },
    { icon: "⚡", label: "DYNAMO",      condition: "2+ assists",                    fp: 18 },
    { icon: "🧠", label: "PLAYMAKER",   condition: "2+ key passes",                 fp: 12 },
    { icon: "💪", label: "BOX-TO-BOX",  condition: "1 tackle + 1 key pass",         fp: 10 },
    { icon: "🔥", label: "PRESS KING",  condition: "20+ pressures",                fp: 10 },
    // DEF
    { icon: "🔒", label: "STOPPER",     condition: "2 tkl + 1 int + 2 clr",        fp: 20 },
    { icon: "🛡️", label: "GUARDIAN",   condition: "2 tackles + 2 interceptions",   fp: 15 },
    { icon: "🏗️", label: "BULLDOZER",  condition: "6+ clearances",                fp: 12 },
    { icon: "🚀", label: "OVERLAP",     condition: "1 goal or 1 assist",            fp: 15 },
    { icon: "🧱", label: "CLEAN SHEET", condition: "0 goals conceded, 60+ min",    fp: 10 },
    // GK
    { icon: "🧱", label: "THE WALL",    condition: "3+ saves",                      fp: 10 },
    { icon: "🧤", label: "KEEPER",      condition: "1–2 saves",                     fp: 5  },
    { icon: "✨", label: "CLEAN SHEET", condition: "0 goals conceded, 60+ min",    fp: 10 },
    // Discipline
    { icon: "🟨", label: "BOOKED",      condition: "1 yellow card",                 fp: 0  },
    { icon: "🟥", label: "SENT OFF",    condition: "1 red card",                    fp: 0  },
  ],
};

export default function GameView() {
  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "football",
    // Football's SportAdapter extends SharedSportAdapter with no overrides today;
    // the cast bypasses a structural mismatch on internal config fields that shared
    // GameView doesn't read (same pattern as baseball).
    sportAdapter: sportAdapter as unknown as SharedSportAdapter,
    localStorageNamespace: "football",
    leaderboardScope: "football",
    competition: "world_cup",
    routeBasePath: "/football/",
    gaugeThresholds: GAUGE_THRESHOLDS,
    tierFromSalary,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap: FOOTBALL_WIN_TIERS,
    getStreakMultiplier,
    gameBarWinTiers: WIN_TIERS,
    gameBarLegend: LEGEND_DATA,
    // gameAdapter functions use the local football PlayerCard type (no "RED" tier);
    // the shared GameAdapter contract uses @shared/types PlayerCard. Structurally
    // identical in practice — football data never produces RED tier cards.
    dealInitialRoster: dealInitialRoster as GameAdapter["dealInitialRoster"],
    redrawRoster: redrawRoster as GameAdapter["redrawRoster"],
    resolveRoster: resolveRoster as GameAdapter["resolveRoster"],
    // TODO(Phase 6): replace stubs with real imports from ftueRoster.ts
    ftueDealRoster: dealFTUERoster as GameAdapter["ftueDealRoster"],
    ftueRedrawRoster: redrawFTUERoster as GameAdapter["ftueRedrawRoster"],
    ftueResolveRoster: resolveFTUERoster as GameAdapter["ftueResolveRoster"],
    getTodaysStars,
    // computeRosterCeiling — football has no peak corpus yet; field is optional.
    CardComponent: SoccerCard as unknown as GameAdapter["CardComponent"],
    rosterGridColumns: 3,
    // Football "5-on-a-die" layout — 4 corners + 1 center, all same card
    // size, fits in basketball's 3-col 2-row card area (no extra height).
    //
    //   [DEF]    .    [FLEX]       row 1 — corners in cols 1 & 3
    //      .   [GK]    .           GK spans rows 1-2, vertically centered
    //   [MID]    .    [FWD]        row 2 — corners in cols 1 & 3
    //
    // The 4 outfield cards live in grid cells (cols 1 and 3 of a 3-col
    // grid; col 2 is empty for the corner cards). The GK card spans both
    // rows in col 2 with `align-self: center`, which positions it at the
    // dead-middle of the row gap region. Total layout height = 2 card
    // heights + 1 gap, identical to basketball's 6-card layout.
    rosterGridLayout: {
      className: "fb-dice5",
      css: `
        .fb-dice5 > .roster-grid {
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: 1fr 1fr;
        }
        /* Top row — DEF (left), FLEX (right). Col 2 left empty for GK. */
        .fb-dice5 > .roster-grid > .card-slot[data-slot="1"] { grid-column: 1; grid-row: 1; }
        .fb-dice5 > .roster-grid > .card-slot[data-slot="4"] { grid-column: 3; grid-row: 1; }
        /* Bottom row — MID (left), FWD (right). Col 2 left empty for GK. */
        .fb-dice5 > .roster-grid > .card-slot[data-slot="2"] { grid-column: 1; grid-row: 2; }
        .fb-dice5 > .roster-grid > .card-slot[data-slot="3"] { grid-column: 3; grid-row: 2; }
        /* GK in middle col, spanning both rows, vertically centered.
           align-self: center floats it into the row gap region — the
           "5 dot" of the die. Width matches corner cards (1/3 of grid). */
        .fb-dice5 > .roster-grid > .card-slot[data-slot="0"] {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
        }
      `,
    },
    // FLEX rule UI affordance: slot 4 (FLEX) gets a label badge + tooltip
    // explaining "Any outfield player (no goalkeepers)" — addresses spec
    // review concern #4. FTUE teaches the rule via holdIntroText too.
    slotLabels: {
      4: { label: "ANY OUTFIELD", tooltip: "Any outfield player — no goalkeepers" },
    },
    resetAllOverlays,
    // TODO(Phase 6): replace with proper FOOTBALL_FTUE_CONFIG from ftueRoster.ts
    ftueTextConfig: FOOTBALL_FTUE_CONFIG,
    // PostHandSheet — football does not surface this overlay.
    audioBedSrc: null,
    // Slate v2 in-game chip — only mounts when the football flag is ON.
    // SlateChipComponent stays undefined when the flag is OFF, and the
    // shared GameView's conditional render skips the chip entirely.
    SlateChipComponent: isSlateV2Enabled("football") ? FootballSlateChip : undefined,
  }), []);

  return <SharedGameView adapter={adapter} />;
}
