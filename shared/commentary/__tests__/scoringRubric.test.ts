import { autoReject, computeOverall, scoreLine, PRODUCTION_THRESHOLD } from "../workshop/scoringRubric";

describe("autoReject", () => {
  test("rejects generic filler phrases", () => {
    expect(autoReject("Player had a strong performance tonight.").some(r => r.includes("generic_filler"))).toBe(true);
  });

  test("rejects game mechanic terms", () => {
    expect(autoReject("Player scored 40 FP tonight.").some(r => r.includes("mechanic_leak"))).toBe(true);
  });

  test("rejects templates with no tokens", () => {
    expect(autoReject("A good night of basketball was had by all.")).toContain("no_tokens_generic");
  });

  test("accepts clean templates with tokens", () => {
    expect(autoReject("{name} dropped {pts}{opp}. Cash the hand.")).toHaveLength(0);
  });

  test("rejects too-long templates", () => {
    const long = "{name} ".repeat(30) + "tonight.";
    expect(autoReject(long)).toContain("too_long");
  });
});

describe("computeOverall", () => {
  test("perfect scores give 10.0", () => {
    expect(computeOverall({
      humanSounding: 10, oneMessage: 10, humor: 10,
      specificity: 10, factualFit: 10, nonGeneric: 10, sportsVoice: 10,
    })).toBe(10);
  });

  test("all-5s give 5.0", () => {
    expect(computeOverall({
      humanSounding: 5, oneMessage: 5, humor: 5,
      specificity: 5, factualFit: 5, nonGeneric: 5, sportsVoice: 5,
    })).toBe(5);
  });
});

describe("scoreLine", () => {
  test("auto-reject caps overall at 3.0", () => {
    const result = scoreLine("Player had a strong performance tonight.", {
      humanSounding: 8, oneMessage: 8, humor: 8,
      specificity: 8, factualFit: 8, nonGeneric: 8, sportsVoice: 8,
    });
    expect(result.overall).toBeLessThanOrEqual(3.0);
    expect(result.rejectReasons.length).toBeGreaterThan(0);
  });

  test("clean line gets full score", () => {
    const result = scoreLine("{name} dropped {pts}{opp}. Statement night.", {
      humanSounding: 8, oneMessage: 9, humor: 7,
      specificity: 8, factualFit: 9, nonGeneric: 8, sportsVoice: 8,
    });
    expect(result.overall).toBeGreaterThan(PRODUCTION_THRESHOLD);
    expect(result.rejectReasons).toHaveLength(0);
  });
});
