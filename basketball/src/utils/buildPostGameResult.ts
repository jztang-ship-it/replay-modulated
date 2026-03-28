/**
 * buildPostGameResult.ts
 * Adapter: maps GameView state → PostGameResult (beta v1)
 */

import type {
    PostGameResult,
    WinTier,
  } from "@shared/components/PostGameScreen";
  
  const WIN_TIER_ORDER: WinTier[] = [
    "NONE", "BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "BONUS_POOL",
  ];
  
  // Canonical thresholds — must match payoutLogic.ts exactly
  const WIN_TIER_THRESHOLDS: Record<WinTier, number> = {
    NONE:     0,
    BUST:     0,
    ROOKIE:   133,
    STARTER:  160,
    ALL_STAR: 183,
    MVP:      207,
    BONUS_POOL:  225,
  };
  
  function getNextTier(tier: WinTier): WinTier | null {
    const idx = WIN_TIER_ORDER.indexOf(tier);
    if (idx === -1 || idx === WIN_TIER_ORDER.length - 1) return null;
    return WIN_TIER_ORDER[idx + 1];
  }
  
  export function buildPostGameResult(
    roster: any[],
    winTier: WinTier,
    winPayout: number,
    balance: number,
    streak: number,      // current streak BEFORE this hand resolves
    isBust: boolean,     // true if this hand was a loss
  ): PostGameResult {
    const totalFP = parseFloat(
      roster
        .reduce((sum, card) => sum + parseFloat(card.actualFp ?? card.fp ?? 0), 0)
        .toFixed(1)
    );
  
    // PostGameScreen shows the streak AFTER this hand:
    // win → streak + 1, bust → 0
    const displayStreak = isBust ? 0 : streak + 1;

    const nextTier = getNextTier(winTier);
    const nextTierThreshold = nextTier ? WIN_TIER_THRESHOLDS[nextTier] : 0;
  
    return {
      tier: winTier,
      totalFP,
      payout: winPayout,
      balance,
      streak: displayStreak,
      nextTier,
      nextTierThreshold,
    };
  }
