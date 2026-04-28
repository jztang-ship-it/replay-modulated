/**
 * baseball/src/components/GameBar.tsx
 * Thin wrapper — injects baseball win tiers into shared GameBar.
 */

import React, { useMemo } from "react";
import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData, type CelebrationData } from "@shared/components/GameBar";
import { getTodaysStars } from "../adapters/gameAdapter";

export type { CelebrationData };
export type { GameStateLabel };

const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 170, color: "#22C55E", glow: "rgba(34,197,94,0.6)"   },
  { label: "STARTER",  minFp: 200, color: "#00FFD8", glow: "rgba(0,255,216,0.6)"   },
  { label: "ALL-STAR", minFp: 230, color: "#C084FC", glow: "rgba(192,132,252,0.7)" },
  { label: "MVP",      minFp: 260, color: "#FB923C", glow: "rgba(251,146,60,0.7)"  },
  { label: "LEGEND",   minFp: 310, color: "#EF4444", glow: "rgba(239,68,68,0.9)"  },
];

const LEGEND: LegendData = {
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
    { icon: "🌪️",label: "MELTDOWN",        condition: "5+ ER (-5 FP)"           },
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
  onWageAnimationComplete?: () => void;
  ftueDrawBlocked?: boolean;
  ftueHideSkip?: boolean;
  ftuePulseNearMiss?: boolean;
  ftueReplayBlocked?: boolean;
  dataFtuePrimaryAnchor?: "deal" | "draw";
  tierGaugeSlot?: React.ReactNode;
  splitFooter?: {
    multipliersHost: HTMLElement | null;
    controlsHost: HTMLElement | null;
  };
  splitMultiplierRowVisible?: boolean;
  /** Tap target for the leaderboard trophy button on GameBar. */
  onViewLeaderboard?: () => void;
  /** Current win streak for fire emoji display in shared GameBar. */
  streak?: number;
  legendPulsing?: boolean;
  ftueReplayPulse?: boolean;
  onLegendOpened?: () => void;
};

export function GameBar(props: Props) {
  const legendWithStars = useMemo(() => {
    const extra: Partial<LegendData> = {};
    try {
      const stars = getTodaysStars();
      if (stars.length > 0) extra.todaysStars = stars;
    } catch { /* data not loaded yet */ }
    return { ...LEGEND, ...extra };
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
