export type WinTier = "LOSS" | "SMALL_WIN" | "MEDIUM_WIN" | "BIG_WIN" | "JACKPOT";

export function calculateWinTier(totalFp: number): WinTier {
  // Adjusted for Football scoring (higher FP ranges)
  if (totalFp >= 100) return "JACKPOT";    // Exceptional performance
  if (totalFp >= 75) return "BIG_WIN";     // Great performance
  if (totalFp >= 55) return "MEDIUM_WIN";  // Good performance
  if (totalFp >= 40) return "SMALL_WIN";   // Decent performance
  return "LOSS";                           // Below 40 FP
}

export function calculatePayout(tier: WinTier, betAmount: number): number {
  switch (tier) {
    case "JACKPOT": return betAmount * 25;
    case "BIG_WIN": return betAmount * 10;
    case "MEDIUM_WIN": return betAmount * 5;
    case "SMALL_WIN": return betAmount * 2;
    case "LOSS": return 0;
  }
}
