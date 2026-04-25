import { describe, it, expect } from "vitest";
import { TopGameStamp } from "../TopGameOverlay";

describe("TopGameStamp", () => {
  it("renders null for career and null tier", () => {
    expect(TopGameStamp({ tier: "career" })).toBe(null);
    expect(TopGameStamp({ tier: null })).toBe(null);
  });

  it("renders ALL-TIME for all_time", () => {
    const result = TopGameStamp({ tier: "all_time" }) as any;
    expect(result.props.children).toBe("ALL-TIME");
    expect(result.props.className).toContain("tg-stamp-allTime");
  });

  it("renders HISTORY! for season", () => {
    const result = TopGameStamp({ tier: "season" }) as any;
    expect(result.props.children).toBe("HISTORY!");
    expect(result.props.className).toContain("tg-stamp-season");
  });
});
