/**
 * basketball/src/components/GameBar.tsx
 * Thin wrapper — injects basketball win tiers + legend data into shared GameBar.
 * hideTierBar is always true — we use TierGauge in GameView instead.
 */

import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData, type CelebrationData } from "@shared/components/GameBar";

export type { CelebrationData };
export type { GameStateLabel };

// Thresholds calibrated for $250 cap + 6-tier salary system (Option B boundaries) — must stay in sync with BASKETBALL_WIN_TIERS in payoutLogic.ts
const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 180, color: "#22C55E", glow: "rgba(34,197,94,0.6)"    },
  { label: "STARTER",  minFp: 195, color: "#00FFD8", glow: "rgba(0,255,216,0.6)"   },
  { label: "ALL-STAR", minFp: 210, color: "#C084FC", glow: "rgba(192,132,252,0.7)"  },
  { label: "MVP",      minFp: 225, color: "#FB923C", glow: "rgba(251,146,60,0.7)"   },
  { label: "G.O.A.T.", minFp: 240, color: "#EF4444", glow: "rgba(239,68,68,0.9)"   },
];

const LEGEND: LegendData = {
  payoutRows: [
    { label: "G.O.A.T.", score: "240+", payout: "BONUS", color: "#EF4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.35)"    },
    { label: "MVP",      score: "225+", payout: "15x",   color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.3)"    },
    { label: "ALL-STAR", score: "210+", payout: "7x",    color: "#C084FC", bg: "rgba(192,132,252,0.10)",  border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: "195+", payout: "2.5x",  color: "#00FFD8", bg: "rgba(0,255,216,0.08)",    border: "rgba(0,255,216,0.25)"    },
    { label: "ROOKIE",   score: "180+", payout: "0.5x",  color: "#22C55E", bg: "rgba(34,197,94,0.10)",    border: "rgba(34,197,94,0.25)"    },
    { label: "BUST",     score: "<180", payout: "—",     color: "#6B7280", bg: "rgba(107,114,128,0.08)",  border: "rgba(107,114,128,0.2)"   },
  ],
  bonusRows: [
    { label: "3-WIN STREAK", condition: "3 wins in a row", reward: "1.2x payout"  },
    { label: "5-WIN STREAK", condition: "5 wins in a row", reward: "1.5x payout"  },
    { label: "10-WIN STREAK", condition: "10 wins in a row", reward: "2.0x payout" },
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
    { icon: "⚡",  label: "GOD MODE",         condition: "50+ points"            },
    { icon: "🔥",  label: "FIRE",             condition: "40-49 points"          },
    { icon: "🏀",  label: "BUCKET",           condition: "30-39 points"          },
    { icon: "🦍",  label: "BEAST",            condition: "15+ rebounds"          },
    { icon: "🧲",  label: "GLASS",            condition: "10-14 rebounds"        },
    { icon: "🪄",  label: "WIZARD",           condition: "15+ assists"           },
    { icon: "🧠",  label: "DIME",             condition: "10-14 assists"         },
    { icon: "🧤",  label: "THIEF",            condition: "5+ steals"             },
    { icon: "👀",  label: "PICKPOCKET",       condition: "3-4 steals"            },
    { icon: "🚫",  label: "SWAT",             condition: "5+ blocks"             },
    { icon: "🛡️", label: "REJECTION",        condition: "3-4 blocks"            },
    { icon: "🎼",  label: "MAESTRO",          condition: "10+ ast, 0 turnovers"  },
    { icon: "🎯",  label: "PURE",             condition: "5+ ast, 0 turnovers"   },
    { icon: "💦",  label: "SLOPPY",           condition: "4-5 turnovers (-3 FP)" },
    { icon: "🤦",  label: "TURNOVER MACHINE", condition: "6+ turnovers (-6 FP)"  },
    { icon: "🦕",  label: "QUAD DOUBLE",      condition: "4 categories 10+"      },
    { icon: "🖐️", label: "5x5",              condition: "all 5 categories 5+"   },
    { icon: "👑",  label: "TRIPLE DOUBLE",    condition: "3 categories 10+"      },
    { icon: "✌️", label: "DOUBLE DOUBLE",    condition: "2 categories 10+"      },
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
  onLegendOpened?: () => void;
};

import React, { useMemo } from 'react';
import { getTodaysStars } from "../adapters/gameAdapter";
import { getDailyMysteryScore, MYSTERY_SCORE_BONUS } from "@shared/utils/mysteryScore";

export function GameBar(props: Props) {
  const legendWithStars = useMemo(() => {
    const extra: Partial<LegendData> = {};
    try {
      const stars = getTodaysStars();
      if (stars.length > 0) extra.todaysStars = stars;
    } catch { /* data not loaded yet */ }
    extra.mysteryScore = getDailyMysteryScore();
    extra.mysteryBonus = MYSTERY_SCORE_BONUS;
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