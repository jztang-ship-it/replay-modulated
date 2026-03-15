import React from "react";
/**
 * basketball/src/components/GameBar.tsx
 * Thin wrapper — injects basketball win tiers + legend data into shared GameBar.
 */

import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData, type CelebrationData } from "@shared/components/GameBar";

export type { CelebrationData };

export type { GameStateLabel };

const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 133, color: "#22C55E", glow: "rgba(34,197,94,0.6)"    },
  { label: "STARTER",  minFp: 160, color: "#60A5FA", glow: "rgba(96,165,250,0.6)"   },
  { label: "ALL-STAR", minFp: 183, color: "#C084FC", glow: "rgba(192,132,252,0.7)"  },
  { label: "MVP",      minFp: 207, color: "#FB923C", glow: "rgba(251,146,60,0.7)"   },
  { label: "JACKPOT",  minFp: 225, color: "#EF4444", glow: "rgba(239,68,68,0.9)"   },
];

const LEGEND: LegendData = {
  payoutRows: [
    { label: "JACKPOT",  score: "225+", payout: "POOL",  color: "#EF4444", bg: "rgba(239,68,68,0.15)",    border: "rgba(239,68,68,0.4)"     },
    { label: "MVP",      score: "207+", payout: "15x",  color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.3)"    },
    { label: "ALL-STAR", score: "183+", payout: "7x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)", border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: "160+", payout: "2.5x", color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.25)"   },
    { label: "ROOKIE",   score: "133+", payout: "0.5x", color: "#22C55E", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.25)"    },
    { label: "BUST",     score: "<133", payout: "--",   color: "#E5E7EB", bg: "rgba(229,231,235,0.08)", border: "rgba(229,231,235,0.2)"   },
  ],
  scoringRules: [
    { stat: "Point",    pts: "+1.0" },
    { stat: "Rebound",  pts: "+1.2" },
    { stat: "Assist",   pts: "+1.5" },
    { stat: "Steal",    pts: "+2.0" },
    { stat: "Block",    pts: "+2.0" },
    { stat: "Turnover", pts: "-1.0" },
  ],
  stamps: [
    { icon: "🔴", label: "SMOKING HOT", condition: "FP ≥ 160% of projection" },
    { icon: "🟠", label: "ON FIRE",     condition: "FP ≥ 140% of projection" },
    { icon: "⬜", label: "ICE COLD",    condition: "FP ≤ 80% of projection"  },
    { icon: "⬛", label: "FREEZING",    condition: "FP ≤ 60% of projection"  },
  ],
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
    { icon: "🛡️", label: "REJECTION",   condition: "3-4 blocks"            },
    { icon: "🎼",  label: "MAESTRO",          condition: "10+ ast, 0 turnovers"  },
    { icon: "🎯",  label: "PURE",             condition: "5+ ast, 0 turnovers"   },
    { icon: "💦",  label: "SLOPPY",           condition: "4-5 turnovers (-3 FP)" },
    { icon: "🤦",  label: "TURNOVER MACHINE", condition: "6+ turnovers (-6 FP)"  },
    { icon: "🦕",  label: "QUAD DOUBLE",      condition: "4 categories 10+"      },
    { icon: "🖐️", label: "5x5",         condition: "all 5 categories 5+"   },
    { icon: "👑",  label: "TRIPLE DOUBLE",    condition: "3 categories 10+"      },
    { icon: "✌️", label: "DOUBLE DOUBLE",   condition: "2 categories 10+"      },
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
};

export function GameBar(props: Props) {
  return <SharedGameBar {...props} winTiers={WIN_TIERS} legend={LEGEND} />;
}