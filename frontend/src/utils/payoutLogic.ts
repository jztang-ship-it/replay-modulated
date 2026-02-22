// frontend/src/utils/payoutLogic.ts
export type WinTier = "BUST" | "BRONZE" | "GOLD" | "MVP" | "JACKPOT";

export function calculateWinTier(totalFp: number): WinTier {
  if (totalFp >= 135) return "JACKPOT";
  if (totalFp >= 100) return "MVP";
  if (totalFp >= 75)  return "GOLD";
  if (totalFp >= 50)  return "BRONZE";
  return "BUST";
}

export function calculatePayout(tier: WinTier, betAmount: number): number {
  switch (tier) {
    case "JACKPOT": return betAmount * 20;
    case "MVP":     return betAmount * 6;
    case "GOLD":    return betAmount * 2.5;
    case "BRONZE":  return betAmount * 1.2;
    case "BUST":    return 0;
  }
}