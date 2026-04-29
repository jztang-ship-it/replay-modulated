/**
 * baseball/src/views/GameView.tsx
 *
 * Phase 2 sub-PR 06 — wrapper. Builds a GameAdapter literal and renders
 * the canonical <GameView> from shared. All state, JSX, overlays,
 * reveal orchestration, and FTUE flow live in shared/views/GameView.tsx.
 *
 * Anything baseball-specific flows through this adapter:
 *   - sportAdapter (rosterSize, salaryCap, BAT/P slots)
 *   - dealInitialRoster / redrawRoster / resolveRoster
 *   - dealFTUERoster / redrawFTUERoster / resolveFTUERoster
 *     (Ohtani-anchor scripted hand)
 *   - calculateWinTier / calculatePayoutWithStreak / BASEBALL_WIN_TIERS
 *   - getStreakMultiplier
 *   - BaseballCard (card render slot — SVG bat + ⚾ pitcher glyph)
 *   - getTodaysStars (daily bonus pool)
 *   - baseball-specific GameBar tier rows + legend (in this file)
 *   - BASEBALL_FTUE_CONFIG (Ohtani-anchor coach copy)
 *
 * Baseball does NOT use:
 *   - PostHandSheet (adapter slot left undefined; shared GameView conditional skips)
 *   - audioBedSrc (no procedural crowd noise — null)
 *   - computeRosterCeiling (no peak corpus today)
 */

import { useMemo } from "react";
import { GameView as SharedGameView } from "@shared/views/GameView";
import type { GameAdapter } from "@shared/views/GameAdapter";
import type { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import type { WinTierDisplay, LegendData } from "@shared/components/GameBar";
import type { FTUETextConfig } from "@shared/components/CoachLayer";
import { tierFromSalary } from "@shared/views/_gameViewHelpers";
import { sportAdapter } from "../adapters/SportAdapter";
import {
  dealInitialRoster,
  redrawRoster,
  resolveRoster,
  getTodaysStars,
} from "../adapters/gameAdapter";
import {
  dealFTUERoster,
  redrawFTUERoster,
  resolveFTUERoster,
} from "../adapters/ftueRoster";
import { BaseballCard, resetAllOverlays } from "../components/BaseballCard";
import {
  calculateWinTier,
  calculatePayoutWithStreak,
  getStreakMultiplier,
  BASEBALL_WIN_TIERS,
} from "../utils/payoutLogic";

// Tier gauge thresholds — baseball-specific FP cutoffs.
const GAUGE_THRESHOLDS = [
  { tier: "ROOKIE",   minFP: 170 },
  { tier: "STARTER",  minFP: 200 },
  { tier: "ALL_STAR", minFP: 230 },
  { tier: "MVP",      minFP: 260 },
  { tier: "LEGEND",   minFP: 310 },
];

// GameBar tier rows — must stay in sync with BASEBALL_WIN_TIERS in payoutLogic.ts.
const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 170, color: "#22C55E", glow: "rgba(34,197,94,0.6)"   },
  { label: "STARTER",  minFp: 200, color: "#00FFD8", glow: "rgba(0,255,216,0.6)"   },
  { label: "ALL-STAR", minFp: 230, color: "#C084FC", glow: "rgba(192,132,252,0.7)" },
  { label: "MVP",      minFp: 260, color: "#FB923C", glow: "rgba(251,146,60,0.7)"  },
  { label: "LEGEND",   minFp: 310, color: "#EF4444", glow: "rgba(239,68,68,0.9)"   },
];

const LEGEND_DATA: LegendData = {
  payoutRows: [
    { label: "LEGEND",   score: "310+ FP", payout: "50x",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.3)"    },
    { label: "MVP",      score: "260+ FP", payout: "15x",  color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.28)"  },
    { label: "ALL-STAR", score: "230+ FP", payout: "7x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)",  border: "rgba(192,132,252,0.28)" },
    { label: "STARTER",  score: "200+ FP", payout: "2.5x", color: "#00FFD8", bg: "rgba(0,255,216,0.08)",    border: "rgba(0,255,216,0.25)"   },
    { label: "ROOKIE",   score: "170+ FP", payout: "0.5x", color: "#22C55E", bg: "rgba(34,197,94,0.08)",    border: "rgba(34,197,94,0.22)"   },
    { label: "BUST",     score: "< 170 FP",payout: "—",    color: "#6B7280", bg: "rgba(107,114,128,0.06)",  border: "rgba(107,114,128,0.18)" },
  ],
  bonusRows: [
    { label: "3-WIN STREAK", condition: "3 wins in a row", reward: "1.3x payout"  },
    { label: "5-WIN STREAK", condition: "5 wins in a row", reward: "1.7x payout"  },
    { label: "10-WIN STREAK", condition: "10 wins in a row", reward: "2.5x payout" },
  ],
  stamps: [],
  scoringRules: [
    // Hitter stat weights (match baseballConfig.ts projectionWeights)
    { stat: "Hit",       pts: "+12" },
    { stat: "Double",    pts: "+5"  },
    { stat: "Triple",    pts: "+10" },
    { stat: "Home Run",  pts: "+20" },
    { stat: "Run",       pts: "+9"  },
    { stat: "RBI",       pts: "+9"  },
    { stat: "Walk",      pts: "+6"  },
    { stat: "Stolen Base", pts: "+12" },
    // Pitcher stat weights
    { stat: "IP",        pts: "+3"  },
    { stat: "K",         pts: "+4"  },
    { stat: "Earned Run", pts: "-3" },
    { stat: "Win",       pts: "+6"  },
    { stat: "Quality Start", pts: "+8" },
  ],
  badges: [
    // Hitter badges
    { icon: "🚀", label: "GOING YARD",      condition: "2+ HR (+10 FP)"          },
    { icon: "⚾", label: "MULTI HIT",       condition: "3+ hits (+5 FP)"         },
    { icon: "🧩", label: "RBI MACHINE",     condition: "4+ RBI (+8 FP)"          },
    { icon: "💨", label: "SPEEDSTER",       condition: "2+ SB (+6 FP)"           },
    { icon: "🌞", label: "PERFECT DAY",     condition: "3H + 1HR + 3RBI (+15 FP)"},
    // Pitcher badges
    { icon: "👑", label: "ACE",             condition: "10+ K (+10 FP)"          },
    { icon: "🛑", label: "SHUTDOWN",        condition: "7+ IP, 0 ER (+8 FP)"     },
    { icon: "🔥", label: "STRIKEOUT KING",  condition: "7-9 K (+5 FP)"           },
    { icon: "🌪️",label: "MELTDOWN",         condition: "5+ ER (-5 FP)"           },
  ],
};

// ── FTUE text config (baseball — Ohtani anchor) ───────────────────────────
const BASEBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-ohtani",
  rosterCount: 5,
  salaryCap: 180,
  sportLabel: "baseball",
  cardPositions: {
    "ftue-ohtani": "below",
    "ftue-freeman": "below",
    "ftue-jturner": "below",
    "ftue-scherzer": "above",
    "ftue-twilliams": "above",
  },
  cardTexts: {
    "ftue-freeman": "Freeman went deep — 1H, 1HR, 1R, 1RBI for 58 FP. Going Yard badge ⚾. Star bats deliver.",
    "ftue-jturner": "J. Turner went cold — 1H, no extras for 12 FP on a $20 card. Even veteran hitters have quiet nights. 🧊",
    "ftue-scherzer": "Scherzer was vintage — 6IP, 5K, 1ER, win, Quality Start ✅. 55 FP from a $38 arm. Stars can come cheap when timing's right.",
    "ftue-twilliams": "T. Williams gave you 5 IP, 4 K, 2 ER — 25 FP. Decent partial start from a $22 arm.",
  },
  anchorRevealText: "Ohtani was electric tonight. 🔥 2 hits, 1 HR, 2 RBI, scored a run. 79 FP — Going Yard badge ⚾ stacks on top. That's why you held him.",
  idleText: "Real stats. Real history. Your fantasy result instantly. Hit DEAL to get started." as any,
  holdIntroText: "5 players — 3 batters and 2 pitchers, $180 cap. Fantasy Points come from real stats — hits, home runs, strikeouts. Who do we keep?",
  holdAnchorText: "Ohtani is your $54 RED anchor — top batter in baseball. Tap his card to hold, then hit DRAW and tap each replacement to see your hand." as any,
  nearMissText: "So close — only 1 FP from the All-Star win. One more hit from J. Turner and we'd be celebrating a 7x score. ⚾",
  anchorFlipHintText: "Ohtani carried this hand — 79 FP is monster. Flip his card to see the full stat line. 🔥",
  anchorStatText: "2 H, 1 HR, 1 R, 2 RBI vs San Francisco. 71 base FP + 8 Going Yard badge ⚾ = 79. Badges are real. ✅",
  finalText: "Every game log comes from true historical games. Replay lets you relive baseball history at your fingertips. Hit Replay to start playing for real. ⚾",
};

export default function GameView() {
  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "baseball",
    // Baseball's SportAdapter is structurally a superset (P/BAT slot logic,
    // role-aware log filter) but doesn't extend the shared base class, so
    // some methods (displayName, positions, economyConfig, isValidPosition,
    // getHeadshotUrl, getPositionLimits, isValidRoster) are absent. Shared
    // GameView only reads sportKey + salaryCap + rosterSize on this object,
    // so the cast is safe in practice. Tightening (Task 7 cleanup candidate)
    // would mean baseball's SportAdapter extending shared.SportAdapter.
    sportAdapter: sportAdapter as unknown as SharedSportAdapter,
    localStorageNamespace: "",
    leaderboardScope: sportAdapter.sportKey as "baseball",
    routeBasePath: "/baseball/",
    gaugeThresholds: GAUGE_THRESHOLDS,
    tierFromSalary,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap: BASEBALL_WIN_TIERS,
    getStreakMultiplier,
    gameBarWinTiers: WIN_TIERS,
    gameBarLegend: LEGEND_DATA,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    // ftueRoster fns return GeneratedCard (engine output, photoCode: string|number)
    // — adapter contract is PlayerCard (photoCode: string). Cast is structural;
    // shared GameView treats the result as PlayerCard. Task 7 cleanup
    // candidate: align baseball's GeneratedCard.photoCode to string.
    ftueDealRoster: dealFTUERoster as GameAdapter["ftueDealRoster"],
    ftueRedrawRoster: redrawFTUERoster as GameAdapter["ftueRedrawRoster"],
    ftueResolveRoster: resolveFTUERoster as GameAdapter["ftueResolveRoster"],
    getTodaysStars,
    // computeRosterCeiling — baseball has no peak corpus; field is optional.
    // BaseballCard's prop type is a structural superset of RosterGridCardProps
    // (extra optional fields like topGameTier, glow*) so the cast lets us pass
    // it where the adapter expects exactly the shared shape.
    CardComponent: BaseballCard as GameAdapter["CardComponent"],
    rosterGridColumns: 6,
    // Baseball's "dice 5" layout: row 1 = 3 cards (slots 0-2), row 2 = 2
    // cards centered (slots 3-4). Pre-cutover this lived in
    // baseball/src/components/RosterGrid.tsx as a per-sport wrapper.
    rosterGridLayout: {
      className: "bb-dice5",
      css: `
        .bb-dice5 > .roster-grid {
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: 1fr 1fr;
          row-gap: 8px;
        }
        /* Row 1 — three cards equally spaced */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="0"] { grid-column: 1 / span 2; grid-row: 1; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="1"] { grid-column: 3 / span 2; grid-row: 1; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="2"] { grid-column: 5 / span 2; grid-row: 1; }
        /* Row 2 — two cards centered */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="3"] { grid-column: 2 / span 2; grid-row: 2; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="4"] { grid-column: 4 / span 2; grid-row: 2; }
      `,
    },
    resetAllOverlays,
    ftueRoster: [],
    ftueDrawnRoster: [],
    ftueTextConfig: BASEBALL_FTUE_CONFIG,
    // PostHandSheet — baseball does not surface this overlay (legacy disabled).
    audioBedSrc: null,
  }), []);

  return <SharedGameView adapter={adapter} />;
}
