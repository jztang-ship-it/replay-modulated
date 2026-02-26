export type WinTier = "BUST" | "BRONZE" | "GOLD" | "MVP" | "JACKPOT";

export function calculateWinTier(totalFp: number): WinTier {
  if (totalFp >= 180) return "JACKPOT";  // ~2%
  if (totalFp >= 160) return "MVP";       // ~7%
  if (totalFp >= 132) return "GOLD";      // ~20%
  if (totalFp >= 115) return "BRONZE";    // ~27%
  return "BUST";                          // ~44%
}

export function calculatePayout(tier: WinTier, betAmount: number): number {
  switch (tier) {
    case "JACKPOT": return betAmount * 15;
    case "MVP":     return betAmount * 5;
    case "GOLD":    return betAmount * 2.5;
    case "BRONZE":  return betAmount * 1.5;
    case "BUST":    return 0;
  }
}