import { resolveTemplate } from "../templateResolver";
import type { TemplateData } from "../types";

const mockData: TemplateData = {
  name: "Nikola Jokić",
  last: "Jokić",
  first: "Nikola",
  nick: "The Joker",
  nick2: "Big Honey",
  pts: 41, reb: 15, ast: 12, stl: 2, blk: 1, to: 3,
  opp: " against Phoenix",
  badge: "triple double",
  topStat: "41 pt",
  streak: 3,
  gap: 4.2,
  record: "The NBA record is 100.",
  recordHolder: "Wilt Chamberlain",
  recordValue: 100,
  extremeDescription: "Jokić posted a triple-double with 41 pts.",
};

describe("resolveTemplate", () => {
  test("replaces all tokens", () => {
    const result = resolveTemplate("{name} dropped {pts}{opp}. {badge} from {nick}.", mockData);
    expect(result).toBe("Nikola Jokić dropped 41 pts against Phoenix. triple double from The Joker.");
  });

  test("stats always include units", () => {
    const result = resolveTemplate("{last} had {pts}, {reb}, and {ast}.", mockData);
    expect(result).toContain("41 pts");
    expect(result).toContain("15 reb");
    expect(result).toContain("12 ast");
  });

  test("handles missing opponent gracefully", () => {
    const result = resolveTemplate("{name} went off{opp}.", { ...mockData, opp: "" });
    expect(result).toBe("Nikola Jokić went off.");
  });

  test("no broken tokens in output", () => {
    const result = resolveTemplate("{name} {pts} {badge} {streak} {gap}", mockData);
    expect(result).not.toContain("{");
    expect(result).not.toContain("}");
  });

  test("handles nick2 token", () => {
    expect(resolveTemplate("{nick2} showed up.", mockData)).toBe("Big Honey showed up.");
  });
});
