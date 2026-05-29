import { describe, it, expect } from "vitest";
import { normalizeSeasonKey } from "../dataEngine";

describe("normalizeSeasonKey", () => {
  it("returns short-form keys unchanged (idempotent)", () => {
    expect(normalizeSeasonKey("2425")).toBe("2425");
    expect(normalizeSeasonKey("0001")).toBe("0001");
    expect(normalizeSeasonKey("9900")).toBe("9900");
  });

  it("converts standard label form 'YYYY-YY' to short form", () => {
    expect(normalizeSeasonKey("2024-25")).toBe("2425");
    expect(normalizeSeasonKey("2023-24")).toBe("2324");
    expect(normalizeSeasonKey("1996-97")).toBe("9697");
  });

  it("handles Y2K crossover 'YYYY-YYYY' form", () => {
    expect(normalizeSeasonKey("1999-2000")).toBe("9900");
  });

  it("handles 'YYYY-YY' Y2K form (1999-00)", () => {
    expect(normalizeSeasonKey("1999-00")).toBe("9900");
  });

  it("passes through unrecognized formats unchanged (safety)", () => {
    expect(normalizeSeasonKey("foo")).toBe("foo");
    expect(normalizeSeasonKey("2024")).toBe("2024"); // 4 digits → short form already
    expect(normalizeSeasonKey("24-25")).toBe("24-25"); // not YYYY-YY
  });

  it("passes through empty string", () => {
    expect(normalizeSeasonKey("")).toBe("");
  });
});
