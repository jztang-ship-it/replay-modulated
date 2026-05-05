import { describe, expect, it } from "vitest";
import { useDailySlate } from "../useDailySlate";

describe("useDailySlate (smoke)", () => {
  it("is exported and callable as a hook function", () => {
    expect(typeof useDailySlate).toBe("function");
  });
});
