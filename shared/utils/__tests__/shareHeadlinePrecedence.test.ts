// shared/utils/__tests__/shareHeadlinePrecedence.test.ts
// Load-bearing RED-guard for the human grievance loop: the contrarian-cold grievance
// atom must be AUTHORITATIVE for the DM taunt (share_headline). If grievance ever stops
// winning over a non-null /api/headline authored line, the thesis breaks — and this
// goes red.
import { describe, it, expect } from "vitest";
import { pickShareHeadline } from "../shareHeadlinePrecedence";

describe("pickShareHeadline — grievance is authoritative for the DM taunt", () => {
  it("grievance WINS even when /api/headline returned a non-null authored line", () => {
    expect(
      pickShareHeadline({
        grievance: "Sengun no-showed — a third of his number. Your turn — better dice?",
        authored: "SOME AUTHORED LINE FROM /api/headline",
        fallback: "bank fallback",
      }),
    ).toBe("Sengun no-showed — a third of his number. Your turn — better dice?");
  });

  it("no grievance → authored wins (existing behavior preserved)", () => {
    expect(pickShareHeadline({ grievance: null, authored: "AUTHORED", fallback: "bank" })).toBe("AUTHORED");
  });

  it("no grievance, no authored → fallback", () => {
    expect(pickShareHeadline({ grievance: null, authored: null, fallback: "bank" })).toBe("bank");
  });

  it("blank grievance is treated as absent (authored still wins)", () => {
    expect(pickShareHeadline({ grievance: "   ", authored: "AUTHORED", fallback: "bank" })).toBe("AUTHORED");
  });
});
