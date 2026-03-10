import React from "react";
/**
 * basketball/src/components/GameBar.tsx
 * Thin wrapper — injects basketball win tiers + legend data into shared GameBar.
 */

import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData } from "@shared/components/GameBar";

export type { GameStateLabel };

const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 125, color: "#CD7F32", glow: "rgba(205,127,50,0.6)"   },
  { label: "STARTER",  minFp: 150, color: "#FFD700", glow: "rgba(255,215,0,0.6)"    },
  { label: "ALL-STAR", minFp: 170, color: "#C084FC", glow: "rgba(192,132,252,0.7)"  },
  { label: "MVP",      minFp: 200, color: "#FF4500", glow: "rgba(255,69,0,0.7)"     },
];

const LEGEND: LegendData = {
  payoutRows: [
    { label: "MVP",      score: "200+", payout: "15x",  color: "#FF4500", bg: "rgba(255,69,0,0.10)",       border: "rgba(255,69,0,0.3)"      },
    { label: "ALL-STAR", score: "170+", payout: "5x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)",    border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: "150+", payout: "2.5x", color: "#FFD700", bg: "rgba(255,215,0,0.10)",      border: "rgba(255,215,0,0.25)"    },
    { label: "ROOKIE",   score: "125+", payout: "1.5x", color: "#CD7F32", bg: "rgba(205,127,50,0.10)",     border: "rgba(205,127,50,0.25)"   },
    { label: "BUST",     score: "<125", payout: "—",    color: "#6B7280", bg: "rgba(107,114,128,0.08)",    border: "rgba(107,114,128,0.2)"   },
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
    { icon: "🏆", label: "CAREER NIGHT", condition: "FP ≥ 140% of projection" },
    { icon: "🧊", label: "ICE COLD",     condition: "FP ≤ 60% of projection"  },
  ],
  badges: [
    { icon: "👑", label: "TRIPLE DOUBLE", condition: "10+ in three stat categories" },
    { icon: "🏀", label: "DOUBLE DOUBLE", condition: "10+ in two stat categories"   },
    { icon: "🔥", label: "BUCKET",        condition: "30+ points"                   },
    { icon: "✌️", label: "DIME",          condition: "7+ assists"                   },
    { icon: "💪", label: "GLASS",         condition: "10+ rebounds"                 },
    { icon: "🛡️", label: "LOCK",         condition: "3+ steals + blocks combined"  },
  ],
};

type Props = {
  gameState: GameStateLabel;
  balance: number;
  isBalanceAnimating?: boolean;
  totalFp: number;
  capMax: number;
  capUsed: number;
  lockedSalary: number;
  revealedSalary: number;
  betMultiplier: number;
  baseBet: number;
  onBetMultiplier: (m: number) => void;
  onAction: () => void;
};

export function GameBar(props: Props) {
  return <SharedGameBar {...props} winTiers={WIN_TIERS} legend={LEGEND} />;
}