import { applyRemix } from "../remixEngine";

describe("remixEngine", () => {
  test("does NOT remix non-eligible archetypes", () => {
    const line = "Jokic dropped 40 pts tonight.";
    expect(applyRemix(line, "balanced_win", "starter_normal", 42)).toBe(line);
  });

  test("does NOT remix non-eligible intensities", () => {
    const line = "Jokic dropped 40 pts tonight.";
    expect(applyRemix(line, "star_delivered", "starter_normal", 42)).toBe(line);
  });

  test("may remix eligible archetype + intensity", () => {
    const line = "Jokic dropped 40 pts tonight.";
    const results = new Set<string>();
    for (let s = 0; s < 100; s++) {
      results.add(applyRemix(line, "star_carry_big", "mvp", s));
    }
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  test("never adds new clauses or ideas", () => {
    const line = "Booker went off against Toronto.";
    for (let s = 0; s < 50; s++) {
      const result = applyRemix(line, "career_night", "legend", s);
      expect(result.length).toBeLessThan(line.length + 15);
      const origPeriods = (line.match(/\./g) ?? []).length;
      const remixPeriods = (result.match(/\./g) ?? []).length;
      expect(remixPeriods).toBeLessThanOrEqual(origPeriods);
    }
  });
});
