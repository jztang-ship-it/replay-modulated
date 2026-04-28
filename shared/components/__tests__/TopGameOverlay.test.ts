import { describe, it, expect } from "vitest";
import { TopGameStamp } from "../TopGameOverlay";

describe("TopGameStamp", () => {
  it("renders null when tier is null", () => {
    expect(TopGameStamp({ tier: null })).toBe(null);
  });

  it("renders RECORD for tier=record", () => {
    const result = TopGameStamp({ tier: "record" }) as any;
    expect(result.props.children).toBe("RECORD");
    expect(result.props.className).toContain("tg-stamp-record");
  });

  it("renders CAREER for tier=career", () => {
    const result = TopGameStamp({ tier: "career" }) as any;
    expect(result.props.children).toBe("CAREER");
    expect(result.props.className).toContain("tg-stamp-career");
  });

  it("renders SEASON for tier=season", () => {
    const result = TopGameStamp({ tier: "season" }) as any;
    expect(result.props.children).toBe("SEASON");
    expect(result.props.className).toContain("tg-stamp-season");
  });
});
