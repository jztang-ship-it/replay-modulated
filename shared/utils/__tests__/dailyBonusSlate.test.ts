import { describe, expect, it } from "vitest";
import { getDailyBonusPlayers } from "../dailyBonus";

describe("dailyBonus consuming slate-restricted pool", () => {
  it("picks bonus players only from the input pool (caller's responsibility)", () => {
    // The contract is: the caller passes the slate-restricted pool when
    // flag is ON, full eligible pool when flag is OFF. dailyBonus does not
    // know about the flag — it just filters by tier from the input.
    const slateRestricted = [
      { basePlayerId: "a", name: "A", tier: "ORANGE" },
      { basePlayerId: "b", name: "B", tier: "PURPLE" },
      { basePlayerId: "c", name: "C", tier: "BLUE" },
      { basePlayerId: "d", name: "D", tier: "GREEN" },
    ];
    const bonuses = getDailyBonusPlayers(slateRestricted, new Date("2026-05-05"));
    expect(bonuses).toHaveLength(3);
    bonuses.forEach(b => {
      expect(["a", "b", "c", "d"]).toContain(b.basePlayerId);
    });
  });
});
