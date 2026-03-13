/**
 * buildPostGameResult.ts
 * Adapter: maps your existing GameView state fields → PostGameResult
 *
 * Place this at:
 *   basketball/src/utils/buildPostGameResult.ts
 *
 * Import in GameView.tsx:
 *   import { buildPostGameResult } from '../utils/buildPostGameResult';
 */

import type {
    PostGameResult,
    PostGameCard,
    WinTier,
    CardTier,
    PerformanceStamp,
    PostGameTask,
  } from "@shared/components/PostGameScreen";
  
  // ─── WIN TIER THRESHOLDS ───────────────────────────────────────────────────
  // Must match your economyEngine.ts WinTierMap.
  // The PostGameScreen uses nextTierThreshold for the near-miss bar.
  
  const WIN_TIER_ORDER: WinTier[] = [
    "NONE", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "JACKPOT",
  ];
  
  const WIN_TIER_THRESHOLDS: Record<WinTier, number> = {
    NONE:     0,
    ROOKIE:   133,
    STARTER:  160,
    ALL_STAR: 183,
    MVP:      207,
    JACKPOT:  225,
  };
  
  function getNextTier(tier: WinTier): WinTier | null {
    const idx = WIN_TIER_ORDER.indexOf(tier);
    if (idx === -1 || idx === WIN_TIER_ORDER.length - 1) return null;
    return WIN_TIER_ORDER[idx + 1];
  }
  
  // ─── CARD TIER MAPPING ─────────────────────────────────────────────────────
  // Maps your existing card tier strings to PostGameCard.tier
  // Adjust these string values to match your actual CardTier type from types.ts
  
  function mapCardTier(tier: string): CardTier {
    const map: Record<string, CardTier> = {
      ORANGE: "ORANGE",
      PURPLE: "PURPLE",
      BLUE:   "BLUE",
      GREEN:  "GREEN",
      GREY:   "GREY",
      WHITE:  "GREY",   // football version uses WHITE — map to GREY
    };
    return map[tier?.toUpperCase()] ?? "GREY";
  }
  
  // ─── PERFORMANCE STAMP MAPPING ─────────────────────────────────────────────
  // Maps your existing stamp/headline keys to PostGameCard.stamp
  
  function mapStamp(stamp: string | null | undefined): PerformanceStamp {
    if (!stamp) return null;
    const map: Record<string, PerformanceStamp> = {
      LEGENDARY:   "LEGENDARY",
      CAREER_NIGHT: "LEGENDARY",  // your existing "CAREER NIGHT" key
      ON_FIRE:     "ON_FIRE",
      ICE_COLD:    "COLD",        // your existing "ICE COLD" key
      COLD:        "COLD",
      BUST:        "BUST",
    };
    return map[stamp?.toUpperCase().replace(/\s/g, "_")] ?? null;
  }
  
  // ─── ANCHOR CARD SELECTION ─────────────────────────────────────────────────
  // The anchor card is the highest-performing card in the roster.
  // If mvpId is already tracked in your game state, use that instead.
  
  function findAnchorIndex(cards: PostGameCard[]): number {
    let maxFP = -Infinity;
    let idx = 0;
    cards.forEach((c, i) => {
      if (c.fp > maxFP) { maxFP = c.fp; idx = i; }
    });
    return idx;
  }
  
  // ─── MAIN ADAPTER ──────────────────────────────────────────────────────────
  
  /**
   * @param roster      Your game's resolved roster array (each card has actualFp, tier, headshotUrl, etc.)
   * @param winTier     The WinTier string from your payoutLogic (e.g. "RISING_STAR")
   * @param winPayout   Coins earned this game (from your payoutLogic)
   * @param balance     Current balance AFTER the payout has been added
   * @param streak      Current win streak (read from your session/localStorage state; seed at 1)
   * @param task        Active task for the Collect tab (null on very first game, 1 task after game 1)
   * @param mvpId       Optional: the card ID you already track as the spotlight/anchor card
   */
  export function buildPostGameResult(
    roster: any[],       // replace `any` with your actual RosterCard type
    winTier: WinTier,
    winPayout: number,
    balance: number,
    streak: number,
    task: PostGameTask | null,
    mvpId?: string
  ): PostGameResult {
    // Build the 6-card array
    const rawCards: PostGameCard[] = roster.map((card) => ({
      name:     card.name ?? card.playerName ?? "Unknown",
      pos:      card.position ?? card.pos ?? "?",
      fp:       parseFloat((card.actualFp ?? card.fp ?? 0).toFixed(1)),
      tier:     mapCardTier(card.tier ?? card.cardTier ?? "GREY"),
      stamp:    mapStamp(card.performanceTag ?? card.stamp ?? card.headline),
      isAnchor: false,  // assigned below
    }));
  
    // Assign anchor card — prefer mvpId lookup, fall back to highest FP
    const anchorIndex = mvpId
      ? roster.findIndex((c) => (c.id ?? c.cardId) === mvpId)
      : findAnchorIndex(rawCards);
  
    rawCards.forEach((c, i) => {
      c.isAnchor = i === anchorIndex;
    });
  
    const totalFP = parseFloat(
      rawCards.reduce((sum, c) => sum + c.fp, 0).toFixed(1)
    );
  
    const nextTier = getNextTier(winTier);
    const nextTierThreshold = nextTier ? WIN_TIER_THRESHOLDS[nextTier] : 0;
  
    return {
      tier: winTier,
      totalFP,
      payout: winPayout,
      balance,
      streak,
      cards: rawCards,
      nextTier,
      nextTierThreshold,
      task,
    };
  }