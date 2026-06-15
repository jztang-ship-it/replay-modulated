// RD7.12 — fail-closed honesty validator (the runtime gate). This is the
// honesty GUARANTEE since the LLM output is constrained-not-proven.
import { describe, it, expect } from "vitest";
import { validateFlavor, type FlavorFacts } from "../flavorValidator";

const WIN: FlavorFacts = {
  outcome: "win",
  player: { last: "Iverson", nickname: "AI" },
  box: { pts: 41, reb: 7, ast: 5, stl: 6 },
};

describe("validateFlavor — passes only clean, grounded, agency-free lines", () => {
  it("accepts a clean descriptive line citing only grounded numbers", () => {
    const v = validateFlavor("Iverson cooked — 41-7-5, vintage AI", WIN);
    expect(v.ok).toBe(true);
    expect(v.line).toBe("Iverson cooked — 41-7-5, vintage AI");
  });
  it("accepts a stats-only line", () => {
    expect(validateFlavor("The Answer went for 41 points, 6 steals", WIN).ok).toBe(true);
  });
});

describe("validateFlavor — FAILS CLOSED on every agency / forbidden framing", () => {
  const forbidden = [
    "you called him and he delivered",
    "you knew AI would cook",
    "your pick came through",
    "AI delivered when it mattered",
    "clutch when it mattered",
    "the redraw paid off — 41-7-5",
    "great call holding him",
    "AI stepped up",
    "you read it perfectly",
  ];
  for (const line of forbidden) {
    it(`rejects: "${line}"`, () => {
      const v = validateFlavor(line, WIN);
      expect(v.ok).toBe(false);
    });
  }
  it("rejects ANY second-person 'you'/'your'", () => {
    expect(validateFlavor("not your night", WIN).ok).toBe(false);
    expect(validateFlavor("that was all you", WIN).ok).toBe(false);
  });
});

describe("validateFlavor — numeric grounding (no invented stats)", () => {
  it("rejects a number not in the box line", () => {
    // 12 assists never happened (ast=5) → reject.
    expect(validateFlavor("Iverson went for 41-7-12", WIN).reason).toMatch(/ungrounded-number:12/);
  });
  it("accepts every grounded number", () => {
    expect(validateFlavor("41 pts, 7 boards, 5 dimes, 6 steals", WIN).ok).toBe(true);
  });
});

describe("validateFlavor — denylist / sentinel / shape (all fail closed)", () => {
  it("rejects personal-life denylist terms", () => {
    expect(validateFlavor("41 points despite the lawsuit", WIN).ok).toBe(false);
  });
  it("rejects the router apology sentinel", () => {
    expect(validateFlavor("Off night. The numbers don't lie.", WIN).ok).toBe(false);
  });
  it("rejects empty / whitespace / non-string / over-length / control chars", () => {
    expect(validateFlavor("", WIN).ok).toBe(false);
    expect(validateFlavor("   ", WIN).ok).toBe(false);
    expect(validateFlavor(null, WIN).ok).toBe(false);
    expect(validateFlavor(42 as unknown, WIN).ok).toBe(false);
    expect(validateFlavor("x".repeat(200), WIN).ok).toBe(false);
    expect(validateFlavor("line\x00with-null", WIN).ok).toBe(false);
  });
  it("rejects when outcome is beatdown (defense in depth — never should reach here)", () => {
    expect(validateFlavor("41-7-5", { ...WIN, outcome: "beatdown" }).ok).toBe(false);
  });
  it("never throws — returns ok:false on any internal error", () => {
    // A malformed facts object must not crash the validator.
    expect(() => validateFlavor("41 points", { outcome: "win", player: { last: "X" }, box: null as unknown as FlavorFacts["box"] })).not.toThrow();
  });
});
