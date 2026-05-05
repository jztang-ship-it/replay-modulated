/**
 * basketball/src/views/GameView.tsx
 *
 * Phase 2 sub-PR 05 — wrapper. Builds a GameAdapter literal and renders
 * the canonical <GameView> from shared. All state, JSX, overlays,
 * reveal orchestration, and FTUE flow live in shared/views/GameView.tsx.
 *
 * Anything basketball-specific flows through this adapter:
 *   - sportAdapter (rosterSize, salaryCap)
 *   - dealInitialRoster / redrawRoster / resolveRoster
 *   - dealFTUERoster / redrawFTUERoster / resolveFTUERoster
 *   - calculateWinTier / calculatePayoutWithStreak / BASKETBALL_WIN_TIERS
 *   - getStreakMultiplier
 *   - AthleteCard (card render slot)
 *   - getTodaysStars + computeRosterCeiling
 *   - basketball-specific GameBar tier rows + legend (in this file)
 *
 * Basketball does NOT use PostHandSheet — adapter slot left undefined,
 * shared GameView's conditional render skips it.
 */

import { useMemo } from "react";
import { GameView as SharedGameView } from "@shared/views/GameView";
import type { GameAdapter } from "@shared/views/GameAdapter";
import type { WinTierDisplay, LegendData } from "@shared/components/GameBar";
import type { TierThreshold as GaugeTierThreshold } from "@shared/components/TierGauge";
import { BASKETBALL_FTUE_CONFIG } from "@shared/components/CoachLayer";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { BasketballSlateChip } from "../components/BasketballSlatePanel";
import { sportAdapter } from "../adapters/SportAdapter";
import {
  dealInitialRoster,
  redrawRoster,
  resolveRoster,
  computeRosterCeiling,
  getTodaysStars,
} from "../adapters/gameAdapter";
import {
  dealFTUERoster,
  redrawFTUERoster,
  resolveFTUERoster,
} from "../adapters/ftueRoster";
import { AthleteCard, resetAllOverlays } from "../components/AthleteCard";
import {
  calculateWinTier,
  calculatePayoutWithStreak,
  getStreakMultiplier,
  BASKETBALL_WIN_TIERS,
} from "../utils/payoutLogic";

// Tier gauge thresholds — basketball-specific FP cutoffs.
const GAUGE_THRESHOLDS: GaugeTierThreshold[] = [
  { tier: "ROOKIE", minFP: 190 },
  { tier: "STARTER", minFP: 205 },
  { tier: "ALL_STAR", minFP: 225 },
  { tier: "MVP", minFP: 235 },
  { tier: "LEGEND", minFP: 255 },
];

// GameBar tier rows — must stay in sync with BASKETBALL_WIN_TIERS in payoutLogic.ts.
const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 190, color: "#22C55E", glow: "rgba(34,197,94,0.6)"    },
  { label: "STARTER",  minFp: 205, color: "#3B82F6", glow: "rgba(59,130,246,0.6)"   },
  { label: "ALL-STAR", minFp: 225, color: "#C084FC", glow: "rgba(192,132,252,0.7)"  },
  { label: "MVP",      minFp: 235, color: "#FB923C", glow: "rgba(251,146,60,0.7)"   },
  { label: "LEGEND",   minFp: 255, color: "#EF4444", glow: "rgba(239,68,68,0.9)"    },
];

const LEGEND_DATA: LegendData = {
  payoutRows: [
    { label: "LEGEND",   score: "255+", payout: "50x",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.35)"    },
    { label: "MVP",      score: "235+", payout: "8x",   color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.3)"    },
    { label: "ALL-STAR", score: "225+", payout: "3x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)",  border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: "205+", payout: "1.5x", color: "#3B82F6", bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.25)"   },
    { label: "ROOKIE",   score: "190+", payout: "0.5x", color: "#22C55E", bg: "rgba(34,197,94,0.10)",    border: "rgba(34,197,94,0.25)"    },
    { label: "BUST",     score: "<190", payout: "—",    color: "#6B7280", bg: "rgba(107,114,128,0.08)",  border: "rgba(107,114,128,0.2)"   },
  ],
  bonusRows: [
    { label: "3-WIN STREAK", condition: "3 wins in a row", reward: "1.3x payout"  },
    { label: "5-WIN STREAK", condition: "5 wins in a row", reward: "1.7x payout"  },
    { label: "10-WIN STREAK", condition: "10 wins in a row", reward: "2.5x payout" },
  ],
  scoringRules: [
    { stat: "Point",    pts: "+1.0" },
    { stat: "Rebound",  pts: "+1.2" },
    { stat: "Assist",   pts: "+1.5" },
    { stat: "Steal",    pts: "+2.0" },
    { stat: "Block",    pts: "+2.0" },
    { stat: "Turnover", pts: "-1.0" },
  ],
  stamps: [],
  badges: [
    { icon: "⚡",  label: "GOD MODE",         condition: "50+ points",           fp: 10  },
    { icon: "🔥",  label: "FIRE",             condition: "40-49 points",         fp: 5   },
    { icon: "🏀",  label: "BUCKET",           condition: "30-39 points",         fp: 2   },
    { icon: "🦍",  label: "BEAST",            condition: "15+ rebounds",         fp: 5   },
    { icon: "🧲",  label: "GLASS",            condition: "10-14 rebounds",       fp: 3   },
    { icon: "🪄",  label: "WIZARD",           condition: "15+ assists",          fp: 5   },
    { icon: "🧠",  label: "DIME",             condition: "10-14 assists",        fp: 3   },
    { icon: "🧤",  label: "THIEF",            condition: "5+ steals",            fp: 4   },
    { icon: "👀",  label: "PICKPOCKET",       condition: "3-4 steals",           fp: 2   },
    { icon: "🚫",  label: "SWAT",             condition: "5+ blocks",            fp: 4   },
    { icon: "🛡️", label: "REJECTION",        condition: "3-4 blocks",           fp: 2   },
    { icon: "🎼",  label: "MAESTRO",          condition: "10+ ast, 0 turnovers", fp: 8   },
    { icon: "🎯",  label: "PURE",             condition: "5+ ast, 0 turnovers",  fp: 3   },
    { icon: "💦",  label: "SLOPPY",           condition: "4-5 turnovers",        fp: -3  },
    { icon: "🤦",  label: "TURNOVER MACHINE", condition: "6+ turnovers",         fp: -6  },
    { icon: "🦕",  label: "QUAD DOUBLE",      condition: "4 categories 10+",     fp: 30  },
    { icon: "🖐️", label: "5x5",              condition: "all 5 categories 5+",  fp: 15  },
    { icon: "👑",  label: "TRIPLE DOUBLE",    condition: "3 categories 10+",     fp: 8   },
    { icon: "✌️", label: "DOUBLE DOUBLE",    condition: "2 categories 10+",     fp: 2   },
  ],
};

// Salary-cutoff tier — fallback only. Player data should carry an authoritative `tier`.
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 73 ? "RED" : s >= 58 ? "ORANGE" : s >= 44 ? "PURPLE" : s >= 30 ? "BLUE" : s >= 23 ? "GREEN" : "WHITE";
}

export default function GameView() {
  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "basketball",
    sportAdapter,
    localStorageNamespace: "",
    leaderboardScope: sportAdapter.sportKey as "basketball",
    routeBasePath: "/basketball/",
    gaugeThresholds: GAUGE_THRESHOLDS,
    tierFromSalary,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap: BASKETBALL_WIN_TIERS,
    getStreakMultiplier,
    gameBarWinTiers: WIN_TIERS,
    gameBarLegend: LEGEND_DATA,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    ftueDealRoster: dealFTUERoster,
    ftueRedrawRoster: redrawFTUERoster,
    ftueResolveRoster: resolveFTUERoster,
    getTodaysStars,
    computeRosterCeiling,
    // AthleteCard's Props type marks several fields optional (locked,
    // isMvp, flipped, etc.) that RosterGridCardProps requires. Functionally
    // the wider/looser AthleteCard shape can absorb any RosterGridCardProps
    // call site, but TypeScript treats the optional/required asymmetry as
    // an incompatible signature. Cast pins it to the contract.
    CardComponent: AthleteCard as GameAdapter["CardComponent"],
    rosterGridColumns: 3,
    resetAllOverlays,
    ftueTextConfig: BASKETBALL_FTUE_CONFIG,
    // PostHandSheet — basketball does not surface this overlay.
    audioBedSrc: "/audio/basketball/crowd/bed-murmur.mp3",
    // Slate v2 chip — only when flag is ON for basketball. With flag OFF,
    // SlateChipComponent stays undefined and the shared GameView renders
    // nothing in the chip slot, so no slate-v2 code runs in-game.
    SlateChipComponent: isSlateV2Enabled("basketball") ? BasketballSlateChip : undefined,
  }), []);

  return <SharedGameView adapter={adapter} />;
}
