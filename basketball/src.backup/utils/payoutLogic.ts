export type WinTier = "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP";

export function calculateWinTier(totalFp: number): WinTier {
  if (totalFp >= 200) return "MVP";       // ~1%
  if (totalFp >= 170) return "ALL_STAR";  // ~5%
  if (totalFp >= 150) return "STARTER";   // ~13%
  if (totalFp >= 125) return "ROOKIE";    // ~34%
  return "BUST";                          // ~47%
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