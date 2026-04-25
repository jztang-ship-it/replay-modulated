// shared/data/__tests__/compositeCategories.test.ts
import { describe, it, expect } from "vitest";
import { COMPOSITE_RULES, isCompositeCategory } from "../compositeCategories";

describe("compositeCategories", () => {
  describe("td_30_20_20", () => {
    it("accepts 30/20/20", () => {
      expect(COMPOSITE_RULES.td_30_20_20({ pts: 30, reb: 20, ast: 20 })).toBe(true);
    });
    it("accepts 31/21/22 (Jokic)", () => {
      expect(COMPOSITE_RULES.td_30_20_20({ pts: 31, reb: 21, ast: 22 })).toBe(true);
    });
    it("rejects 29/20/20", () => {
      expect(COMPOSITE_RULES.td_30_20_20({ pts: 29, reb: 20, ast: 20 })).toBe(false);
    });
    it("rejects 30/19/20", () => {
      expect(COMPOSITE_RULES.td_30_20_20({ pts: 30, reb: 19, ast: 20 })).toBe(false);
    });
  });

  describe("td_40_20_20", () => {
    it("accepts 45/22/20", () => {
      expect(COMPOSITE_RULES.td_40_20_20({ pts: 45, reb: 22, ast: 20 })).toBe(true);
    });
    it("rejects 30/21/22 (not 40 pts)", () => {
      expect(COMPOSITE_RULES.td_40_20_20({ pts: 30, reb: 21, ast: 22 })).toBe(false);
    });
  });

  describe("td_60_10_10", () => {
    it("accepts 62/10/10 (Luka 60-TD style)", () => {
      expect(COMPOSITE_RULES.td_60_10_10({ pts: 62, reb: 10, ast: 10 })).toBe(true);
    });
    it("rejects 59/10/10", () => {
      expect(COMPOSITE_RULES.td_60_10_10({ pts: 59, reb: 10, ast: 10 })).toBe(false);
    });
  });

  describe("fifty_plus_game", () => {
    it("accepts 50", () => {
      expect(COMPOSITE_RULES.fifty_plus_game({ pts: 50 })).toBe(true);
    });
    it("accepts 73 (Luka)", () => {
      expect(COMPOSITE_RULES.fifty_plus_game({ pts: 73 })).toBe(true);
    });
    it("rejects 49", () => {
      expect(COMPOSITE_RULES.fifty_plus_game({ pts: 49 })).toBe(false);
    });
  });

  describe("quad_double", () => {
    it("accepts 10/10/10/10/2 (pts/reb/ast/stl, not blk)", () => {
      expect(COMPOSITE_RULES.quad_double({ pts: 10, reb: 10, ast: 10, stl: 10, blk: 2 })).toBe(true);
    });
    it("rejects 10/10/10/9/9 (only 3 at 10+)", () => {
      expect(COMPOSITE_RULES.quad_double({ pts: 10, reb: 10, ast: 10, stl: 9, blk: 9 })).toBe(false);
    });
  });

  describe("five_by_five", () => {
    it("accepts 5/5/5/5/5", () => {
      expect(COMPOSITE_RULES.five_by_five({ pts: 5, reb: 5, ast: 5, stl: 5, blk: 5 })).toBe(true);
    });
    it("rejects 5/5/5/5/4", () => {
      expect(COMPOSITE_RULES.five_by_five({ pts: 5, reb: 5, ast: 5, stl: 5, blk: 4 })).toBe(false);
    });
  });

  describe("isCompositeCategory", () => {
    it("returns true for composite codes", () => {
      expect(isCompositeCategory("td_30_20_20")).toBe(true);
      expect(isCompositeCategory("five_by_five")).toBe(true);
    });
    it("returns false for single-stat codes", () => {
      expect(isCompositeCategory("pts")).toBe(false);
      expect(isCompositeCategory("reb")).toBe(false);
    });
  });

  describe("failure safety", () => {
    it("doesn't throw on missing fields", () => {
      // Malformed stat line — rule must not crash
      expect(() => COMPOSITE_RULES.td_30_20_20({} as any)).not.toThrow();
      expect(COMPOSITE_RULES.td_30_20_20({} as any)).toBe(false);
    });
  });
});
