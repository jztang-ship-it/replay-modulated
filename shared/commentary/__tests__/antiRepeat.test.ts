import { extractOpeningPhrase, extractComparisonPattern } from "../antiRepeat";

// Note: scoreRepeatPenalty and recordUsage depend on localStorage
// which requires mocking. These tests cover the pure extraction functions.

describe("extractOpeningPhrase", () => {
  test("extracts first 4 words lowercase", () => {
    expect(extractOpeningPhrase("Jokic went off tonight and dominated")).toBe("jokic went off tonight");
  });

  test("handles short lines", () => {
    expect(extractOpeningPhrase("Good hand.")).toBe("good hand.");
  });

  test("handles single word", () => {
    expect(extractOpeningPhrase("Won.")).toBe("won.");
  });
});

describe("extractComparisonPattern", () => {
  test("detects 'treated X like Y'", () => {
    const result = extractComparisonPattern("Booker treated Toronto like batting practice");
    expect(result).toMatch(/treated.*like/);
  });

  test("detects 'turned X into Y'", () => {
    const result = extractComparisonPattern("He turned this into a private workout");
    expect(result).toMatch(/turned.*into/);
  });

  test("detects 'made X look Y'", () => {
    const result = extractComparisonPattern("Jokic made it look easy out there");
    expect(result).toMatch(/made.*look/);
  });

  test("returns null for no comparison", () => {
    expect(extractComparisonPattern("Jokic dropped 40 pts tonight")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(extractComparisonPattern("")).toBeNull();
  });
});
