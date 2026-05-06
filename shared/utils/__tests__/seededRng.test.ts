import { describe, expect, it } from "vitest";
import { hashStr, mulberry32 } from "../seededRng";

describe("hashStr (FNV-1a 32-bit)", () => {
  it("returns a deterministic 32-bit unsigned integer for a given string", () => {
    const h1 = hashStr("hello");
    const h2 = hashStr("hello");
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThan(2 ** 32);
  });

  it("returns different hashes for different strings", () => {
    expect(hashStr("a")).not.toBe(hashStr("b"));
  });
});

describe("mulberry32", () => {
  it("produces deterministic sequence for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});
