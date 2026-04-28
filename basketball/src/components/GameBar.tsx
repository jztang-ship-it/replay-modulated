/**
 * basketball/src/components/GameBar.tsx
 * Thin wrapper — injects basketball win tiers + legend data into shared GameBar.
 * hideTierBar is always true — we use TierGauge in GameView instead.
 */

import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData, type CelebrationData } from "@shared/components/GameBar";

export type { CelebrationData };
export type { GameStateLabel };

// Thresholds calibrated for $250 cap + 6-tier salary system (Option B boundaries) — must stay in sync with BASKETBALL_WIN_TIERS in payoutLogic.ts
// Option C slot-like economy — must stay in sync with BASKETBALL_WIN_TIERS in payoutLogic.ts
const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 190, color: "#22C55E", glow: "rgba(34,197,94,0.6)"    },
  { label: "STARTER",  minFp: 205, color: "#3B82F6", glow: "rgba(59,130,246,0.6)"   },
  { label: "ALL-STAR", minFp: 225, color: "#C084FC", glow: "rgba(192,132,252,0.7)"  },
  { label: "MVP",      minFp: 235, color: "#FB923C", glow: "rgba(251,146,60,0.7)"   },
  { label: "LEGEND",   minFp: 255, color: "#EF4444", glow: "rgba(239,68,68,0.9)"   },
];

const LEGEND_DATA: LegendData = {
  payoutRows: [
    { label: "LEGEND",   score: "255+", payout: "50x",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.35)"    },
    { label: "MVP",      score: "235+", payout: "8x",   color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.3)"    },
    { label: "ALL-STAR", score: "225+", payout: "3x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)",  border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: "205+", payout: "1.5x", color: "#3B82F6", bg: "rgba(59,130,246,0.08)",    border: "rgba(59,130,246,0.25)"    },
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

type Props = {
  gameState: GameStateLabel;
  balance: number;
  isBalanceAnimating?: boolean;
  totalFp: number;
  lastCardProgress?: number;
  lastCardFp?: number;
  capMax: number;
  capUsed: number;
  lockedSalary: number;
  revealedSalary: number;
  betMultiplier: number;
  baseBet: number;
  onBetMultiplier: (m: number) => void;
  onAction: () => void;
  celebration?: CelebrationData;
  onWinCelebrationComplete?: () => void;
  ftueDrawBlocked?: boolean;
  ftueHideSkip?: boolean;
  ftuePulseNearMiss?: boolean;
  ftueReplayBlocked?: boolean;
  /** FTUE: sets data-ftue-anchor on Deal/Draw/replay primary button for CoachLayer */
  dataFtuePrimaryAnchor?: "deal" | "draw";
  tierGaugeSlot?: React.ReactNode;
  splitFooter?: {
    multipliersHost: HTMLElement | null;
    controlsHost: HTMLElement | null;
  };
  splitMultiplierRowVisible?: boolean;
  /** Tap target for the trophy button to the right of the action button. */
  onViewLeaderboard?: () => void;
  onWageAnimationComplete?: () => void;
  ftueReplayPulse?: boolean;
  legendPulsing?: boolean;
  /** Current win streak for fire emoji display */
  streak?: number;
  onLegendOpened?: () => void;
};

import React, { useMemo } from 'react';
import { getTodaysStars } from "../adapters/gameAdapter";
export function GameBar(props: Props) {
  const legendWithStars = useMemo(() => {
    const extra: Partial<LegendData> = {};
    try {
      const stars = getTodaysStars();
      if (stars.length > 0) extra.todaysStars = stars;
    } catch { /* data not loaded yet */ }
    return { ...LEGEND_DATA, ...extra };
  }, []);

  return (
    <SharedGameBar
      {...props}
      winTiers={WIN_TIERS}
      legend={legendWithStars}
      hideTierBar={true}
    />
  );
}