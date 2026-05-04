import React from "react";
/**
 * worldcup/src/components/GameBar.tsx
 * Thin wrapper — injects worldcup win tiers + legend data into shared GameBar.
 */

import { GameBar as SharedGameBar, type GameStateLabel, type WinTierDisplay, type LegendData } from "@shared/components/GameBar";

export type { GameStateLabel };

const WIN_TIERS: WinTierDisplay[] = [
  { label: "ROOKIE",   minFp: 170, color: "#10B981", glow: "rgba(16,185,129,0.6)"  },
  { label: "STARTER",  minFp: 215, color: "#3B82F6", glow: "rgba(59,130,246,0.6)"  },
  { label: "ALL-STAR", minFp: 255, color: "#8B5CF6", glow: "rgba(139,92,246,0.7)"  },
  { label: "MVP",      minFp: 310, color: "#F59E0B", glow: "rgba(245,158,11,0.7)"  },
];

const LEGEND: LegendData = {
  payoutRows: [
    { label: "MVP",      score: "310+", payout: "15x",  color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.30)"  },
    { label: "ALL-STAR", score: "255+", payout: "5x",   color: "#8B5CF6", bg: "rgba(139,92,246,0.10)",  border: "rgba(139,92,246,0.25)"  },
    { label: "STARTER",  score: "215+", payout: "2.5x", color: "#3B82F6", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.25)"  },
    { label: "ROOKIE",   score: "170+", payout: "1.5x", color: "#10B981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.25)"  },
    { label: "BUST",     score: "<170", payout: "—",    color: "#6B7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.20)" },
  ],
  scoringRules: [
    { stat: "Goal",           pts: "+30.0" },
    { stat: "Assist",         pts: "+20.0" },
    { stat: "Shot on Target", pts: "+5.0"  },
    { stat: "Key Pass",       pts: "+5.0"  },
    { stat: "Tackle",         pts: "+6.0"  },
    { stat: "Interception",   pts: "+7.5"  },
    { stat: "Save (GK)",      pts: "+4.0"  },
    { stat: "Yellow Card",    pts: "-5.0"  },
    { stat: "Red Card",       pts: "-15.0" },
  ],
  stamps: [
    { icon: "🏆", label: "CAREER NIGHT", condition: "FP ≥ 140% of projection" },
    { icon: "🧊", label: "ICE COLD",     condition: "FP ≤ 60% of projection"  },
  ],
  badges: [
    { icon: "🎩", label: "HAT-TRICK",   condition: "3 goals scored (FWD)"                    },
    { icon: "⚡", label: "BRACE",       condition: "2 goals scored (FWD)"                    },
    { icon: "🎯", label: "POACHER",     condition: "1 goal scored (FWD)"                     },
    { icon: "🎪", label: "CREATOR",     condition: "2+ assists (FWD)"                        },
    { icon: "🎭", label: "MAESTRO",     condition: "Goal + assist (MID)"                     },
    { icon: "⚙️", label: "DYNAMO",     condition: "5+ key passes (MID)"                     },
    { icon: "🛡️", label: "STOPPER",    condition: "3+ tackles + interceptions (DEF)"         },
    { icon: "🧱", label: "GUARDIAN",    condition: "Clean sheet + 2+ clearances (DEF)"       },
    { icon: "🧤", label: "WALL",        condition: "5+ saves (GK)"                           },
    { icon: "🏆", label: "CLEAN SHEET", condition: "No goals conceded (GK/DEF)"              },
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