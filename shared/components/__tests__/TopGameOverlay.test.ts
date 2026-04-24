import { describe, it, expect } from "vitest";
import { TopGameOverlay } from "../TopGameOverlay";

describe("TopGameOverlay", () => {
  it("renders null for career tier (invisible)", () => {
    const result = TopGameOverlay({ tier: "career" });
    expect(result).toBe(null);
  });

  it("renders null for null tier", () => {
    const result = TopGameOverlay({ tier: null });
    expect(result).toBe(null);
  });

  it("renders a React element for all_time", () => {
    const result = TopGameOverlay({ tier: "all_time", revealActive: true }) as any;
    expect(result).not.toBe(null);
    expect(result.type).toBe("div");
    expect(result.props.className).toContain("tg-overlay");
  });

  it("renders a React element for season", () => {
    const result = TopGameOverlay({ tier: "season", revealActive: false }) as any;
    expect(result).not.toBe(null);
    expect(result.type).toBe("div");
  });
});
