import { describe, it, expect } from "vitest";
import { TopGameStamp } from "../TopGameOverlay";

describe("TopGameStamp", () => {
  it("renders null when tier is null", () => {
    expect(TopGameStamp({ tier: null })).toBe(null);
  });

  it("renders NEW RECORD for tier=record", () => {
    const result = TopGameStamp({ tier: "record" }) as any;
    expect(result.props.children).toBe("NEW RECORD");
    expect(result.props.className).toContain("tg-stamp-record");
  });

  it("renders CAREER HI for tier=career", () => {
    const result = TopGameStamp({ tier: "career" }) as any;
    expect(result.props.children).toBe("CAREER HI");
    expect(result.props.className).toContain("tg-stamp-career");
  });

  it("renders SEASON HI for tier=season", () => {
    const result = TopGameStamp({ tier: "season" }) as any;
    expect(result.props.children).toBe("SEASON HI");
    expect(result.props.className).toContain("tg-stamp-season");
  });
});
