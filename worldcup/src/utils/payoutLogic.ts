/**
 * payoutLogic.ts — World Cup
 * Thresholds from simulator output. Multipliers from worldcupConfig.ts.
 */

export type WinTier = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP";

export function calculateWinTier(totalFp: number): WinTier {
  if (totalFp >= 310) return "MVP";
  if (totalFp >= 255) return "ALL_STAR";
  if (totalFp >= 215) return "STARTER";
  if (totalFp >= 170) return "ROOKIE";
  return "BUST";
}

export function calculatePayout(tier: WinTier, betAmount: number): number {
  switch (tier) {
    case "MVP":      return betAmount * 15;
    case "ALL_STAR": return betAmount * 5;
    case "STARTER":  return betAmount * 2.5;
    case "ROOKIE":   return betAmount * 1.5;
    case "BUST":     return 0;
  }
}
