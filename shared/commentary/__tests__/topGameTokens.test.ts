import { describe, it, expect } from "vitest";
import { selectCommentary, lineNamesNonStarRosterMember, lineCitesMismatchedStat } from "../selectCommentary";
import { resolveTemplate, buildTemplateData } from "../templateResolver";
import type { CommentaryInput } from "../types";

function baseInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball",
    totalFp: 150,
    winTier: "MVP",
    streak: 1,
    prevStreak: 0,
    isBust: false,
    handCount: 5,
    roster: [
      { name: "Nikola Jokic", basePlayerId: "203999", salary: 89, actualFp: 120, projectedFp: 60,
        cardTier: "ORANGE", statLine: { pts: 31, reb: 21, ast: 22 }, gameDate: "2025-02-10" },
    ],
    ...overrides,
  };
}

describe("Top Games template tokens", () => {
  it("T0 record renders {topStat} with the record value", () => {
    const input = baseInput({
      roster: [{ name: "Wilt", basePlayerId: "x", salary: 80, actualFp: 100, projectedFp: 60,
                 cardTier: "ORANGE", statLine: { pts: 100, reb: 25, ast: 2 }, gameDate: "2025-02-10" }],
      topGame: {
        tier: "record",
        primaryReason: { category: "pts", label: "tied the all-time pts record of 100", value: 100 },
        allReasons: [],
      },
    });
    const result = selectCommentary(input as any);
    expect(result.primary).toMatch(/100/);
  });

  it("T2 season renders {topStat} with the stat headline", () => {
    const input = baseInput({
      totalFp: 80, winTier: "STARTER",
      roster: [{ name: "Luka", basePlayerId: "x", salary: 80, actualFp: 58, projectedFp: 55,
                 cardTier: "ORANGE", statLine: { pts: 58, reb: 7, ast: 9 }, gameDate: "2025-01-05" }],
      topGame: {
        tier: "season",
        primaryReason: { category: "pts", label: "Top-10 scoring game of the season (58 pts)", value: 58 },
        allReasons: [],
      },
    });
    const result = selectCommentary(input as any);
    expect(result.primary.toLowerCase()).toContain("58");
  });
});

describe("Top Games T1 career detail", () => {
  it("T1 career exposes a season_best_stat detail token (legacy name) for templates that opt in", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 140, winTier: "ALL_STAR", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [{
        name: "Anthony Edwards", basePlayerId: "1630162", salary: 62, actualFp: 95, projectedFp: 55,
        cardTier: "PURPLE", statLine: { pts: 45, reb: 6, ast: 5 }, gameDate: "2025-01-20",
      }],
      topGame: {
        tier: "career",
        primaryReason: { category: "pts", label: "personal best — 45 pts", value: 45 },
        allReasons: [{ category: "pts", label: "personal best — 45 pts", value: 45 }],
      },
    };
    const r = selectCommentary(input as any);
    expect(r.primary.toLowerCase()).toMatch(/best|45|personal|night/);
  });

  // The {topStat} and {topLabel} tokens both encode the player's milestone stat.
  // When a template uses BOTH (e.g. "{topStat} in the box. {topLabel}.") the
  // label must not restate the same number/unit phrase already in topStat —
  // otherwise commentary reads "52 pts. 50+ point game." (same fact twice).
  it("Resolver dedupes {topLabel} when {topStat} restates the same milestone", () => {
    const cases: Array<{ topStat: string; rawLabel: string; mustNotContain: RegExp }> = [
      { topStat: "52 pts", rawLabel: "personal best — 52 pts",   mustNotContain: /52 pts.*52 pts/ },
      { topStat: "45 pts", rawLabel: "personal best — 45 pts",   mustNotContain: /45 pts.*45 pts/ },
      { topStat: "50 pts", rawLabel: "Top-rarity: 50-point game",mustNotContain: /50 pts.*50[-+\s]point/i },
      { topStat: "100 pts",rawLabel: "tied the all-time pts record of 100 (Wilt Chamberlain)", mustNotContain: /100 pts.*\bof 100\b/ },
      { topStat: "22 ast", rawLabel: "personal best — 22 ast",   mustNotContain: /22 ast.*22 ast/ },
    ];
    for (const { topStat, rawLabel, mustNotContain } of cases) {
      const data = {
        name: "Star", last: "Star", first: "Star", nick: "Star", nick2: "Star",
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0,
        opp: "", badge: "", streak: 0, gap: 0, record: "", recordHolder: "", recordValue: 0,
        extremeDescription: "", topTier: "career" as const, topStat,
        topLabel: rawLabel, topCategory: "pts", seasonBestStat: rawLabel,
      };
      const out = resolveTemplate("{topStat} in the box. {topLabel}.", data as any);
      expect(out, `case "${topStat}" + "${rawLabel}" produced "${out}"`).not.toMatch(mustNotContain);
    }
  });

  // Top Games stamp at tier !== null MUST be referenced in commentary. T1 used to
  // only enable season_best_stat templates; they competed unweighted with the rest
  // of the pool and rarely won. Selector now narrows to those templates when T1
  // fires, guaranteeing the milestone shows up.
  it("T1 career — primary references the personal-best milestone across seed variations", () => {
    const seeds = [120, 130, 140, 150, 160, 170, 180];
    const seasonBestPattern = /personal best|season best|career|line of note|quietly buried|worth noting/i;
    for (const fp of seeds) {
      const input: CommentaryInput = {
        sport: "basketball", totalFp: fp, winTier: fp >= 160 ? "MVP" : "ALL_STAR",
        streak: 1, prevStreak: 0, isBust: false, handCount: 5,
        roster: [{
          name: "Anthony Edvards", basePlayerId: "1630162", salary: 62, actualFp: 95, projectedFp: 55,
          cardTier: "PURPLE", statLine: { pts: 45, reb: 6, ast: 5 }, gameDate: "2025-01-20",
        }],
        topGame: {
          tier: "career",
          primaryReason: { category: "pts", label: "personal best — 45 pts", value: 45 },
          allReasons: [{ category: "pts", label: "personal best — 45 pts", value: 45 }],
        },
      };
      const r = selectCommentary(input as any);
      expect(r.primary, `seed ${fp} produced "${r.primary}"`).toMatch(seasonBestPattern);
    }
  });
});

describe("Culture line — stat-citation freshness guard (Bug 4)", () => {
  // Rule: opponentFlavor / cultureFraming pools may include lines that cite
  // historical stat values ("Pacers have nightmares about his 64-point game").
  // When the current game's stats don't match the cited number, the line is
  // misleading — reads as if commentary is making up stats. Reject those.
  const guard = (line: string, statLine: Record<string, number>) =>
    lineCitesMismatchedStat(line, statLine);

  it("rejects a line citing a stat the star didn't reach", () => {
    expect(guard("Pacers have nightmares about his 64-point game.", { pts: 37, reb: 10, ast: 11 })).toBe(true);
    expect(guard("The 20-assist game shows his evolution.",          { pts: 37, reb: 10, ast: 11 })).toBe(true);
    expect(guard("Hornets witnessed greatness with that 62-point night.", { pts: 35, reb: 8, ast: 7 })).toBe(true);
  });

  it("allows a line citing stats that match the current game (within tolerance)", () => {
    expect(guard("Pacers have nightmares about his 37-point game.", { pts: 37, reb: 10, ast: 11 })).toBe(false);
    expect(guard("11 assists tonight tells the story.",              { pts: 37, reb: 10, ast: 11 })).toBe(false);
    expect(guard("36-point night again from this guy.",              { pts: 37, reb: 10, ast: 11 })).toBe(false); // ±1 tolerance
  });

  it("allows lines with no stat citations", () => {
    expect(guard("Bulls frontcourt can't handle him.",        { pts: 37 })).toBe(false);
    expect(guard("Pacers fans still miss his production.",    { pts: 37 })).toBe(false);
    expect(guard("Owns the Pistons historically.",            { pts: 37 })).toBe(false);
    expect(guard("The Indiana detour built his reputation.",  { pts: 37 })).toBe(false);
  });

  it("allows numeric mentions that aren't stat citations (years, jerseys)", () => {
    // "in 2024" / jersey "#34" should not trigger rejection
    expect(guard("Drafted in 2013, became MVP by 2019.", { pts: 37 })).toBe(false);
    expect(guard("Wears #34 with pride.",                { pts: 37 })).toBe(false);
  });

  it("allows career-total milestones with thousands separator", () => {
    // "15,000 points" / "30,000-point club" — these are SEASON or CAREER
    // totals. The single-game guard would otherwise capture trailing "000"
    // and reject every line that mentions a career milestone.
    expect(guard("Fastest player to 15,000 points, 7,500 rebounds.", { pts: 30, reb: 8 })).toBe(false);
    expect(guard("On pace to join the 30,000-point club.",           { pts: 30 })).toBe(false);
    expect(guard("Crossed 1,000 career assists last week.",          { pts: 30, ast: 5 })).toBe(false);
  });
});

describe("Output shape variance — same player, same opponent, many seeds", () => {
  // applyFraming has 6 assembly modes (3 for forceFraming/cultureOverride paths).
  // Across many seeds, the rendered commentary must take on multiple distinct
  // shapes — not always "framing → main → trailing analogy". Lock that in so
  // future tweaks don't silently collapse to one shape.
  const baseInput = (totalFp: number) => ({
    sport: "basketball" as const,
    totalFp,
    winTier: "ALL_STAR" as const,
    streak: 1, prevStreak: 0, isBust: false, handCount: 5,
    roster: [{
      name: "Generic Star",
      salary: 60, actualFp: 75, projectedFp: 55,
      cardTier: "PURPLE",
      statLine: { pts: 30, reb: 8, ast: 6, stl: 1, blk: 1 },
      opponent: "ZZZ",
      gameDate: "2024-11-22",
    }, {
      name: "Random Bench",
      salary: 12, actualFp: 12, projectedFp: 14,
      cardTier: "WHITE",
      statLine: { pts: 8, reb: 3 },
    }],
  });

  it("produces at least 4 distinct structural shapes across 20 seeds", () => {
    const shapes = new Set<string>();
    for (let fp = 100; fp <= 200; fp += 5) {
      const r = selectCommentary(baseInput(fp) as any);
      const startsWithStar = /^Generic Star\b|^The Star\b|^Star\b/.test(r.primary);
      const sentenceCount = Math.min((r.primary.match(/[.!?]/g) ?? []).length, 4);
      // Heuristic: analogies tend to use "hand equivalent / like a / fantasy
      // equivalent / kind of (hand|night)" patterns. Not exhaustive but stable.
      const hasAnalogy = /(hand equivalent|fantasy equivalent|like a |kind of (?:hand|night)|equivalent of|result with|that hand had|the hand you )/i.test(r.primary);
      shapes.add(`${startsWithStar ? "S" : "F"}-${hasAnalogy ? "A" : "N"}-${sentenceCount}`);
    }
    expect(shapes.size, `only ${shapes.size} distinct shapes seen: ${[...shapes].join(", ")}`).toBeGreaterThanOrEqual(4);
  });
});

describe("Bug 4 end-to-end — Giannis vs Pacers (37 pts) must not cite '64-point game'", () => {
  it("opponentFlavor citing a historical stat that doesn't match the current game is suppressed", () => {
    const seeds = [110, 120, 130, 140, 150, 160];
    for (const fp of seeds) {
      const input: CommentaryInput = {
        sport: "basketball", totalFp: fp, winTier: "MVP", streak: 1, prevStreak: 0,
        isBust: false, handCount: 5,
        roster: [{
          name: "Giannis Antetokounmpo", basePlayerId: "203507", salary: 89, actualFp: 75, projectedFp: 60,
          cardTier: "ORANGE",
          statLine: { pts: 37, reb: 10, ast: 11, stl: 2, blk: 1, turnovers: 6 },
          opponent: "IND",
          gameDate: "2024-11-22",
          homeAway: "H",
        }],
      };
      const r = selectCommentary(input as any);
      // Must not cite a different game's points
      expect(r.primary, `seed ${fp} produced "${r.primary}"`).not.toMatch(/\b6[0-9][-\s]*point|\b6[0-9]\s*pts\b/i);
      // Must not cite "20-assist game" (historical) when star had 11 ast tonight
      expect(r.primary, `seed ${fp} produced "${r.primary}"`).not.toMatch(/\b20[-\s]*assist|\b20\s*ast\b/i);
    }
  });
});

describe("Culture line — non-star roster member guard", () => {
  // Rule: a culture line that names a teammate (non-star roster member) must
  // be rejected. We don't want a teammate to be the explanation for the
  // star's individual performance ("Jimmy Butler brings out his best in
  // Giannis" when Butler is also on the played roster).
  const giannis = { name: "Giannis Antetokounmpo" };
  const butler = { name: "Jimmy Butler" };
  const tatum = { name: "Jayson Tatum" };
  const roster = [giannis, butler, tatum];

  it("flags a line that names a non-star teammate by full name", () => {
    expect(lineNamesNonStarRosterMember(
      "Jimmy Butler brings out his best in Giannis.",
      giannis,
      roster,
    )).toBe(true);
  });

  it("flags a line that names a non-star teammate by last name only", () => {
    expect(lineNamesNonStarRosterMember(
      "Tatum and the Greek Freak meet again.",
      giannis,
      roster,
    )).toBe(true);
  });

  it("does not flag lines that mention only the star", () => {
    expect(lineNamesNonStarRosterMember(
      "Antetokounmpo doing Antetokounmpo things tonight.",
      giannis,
      roster,
    )).toBe(false);
  });

  it("does not flag lines that mention nobody on the roster", () => {
    expect(lineNamesNonStarRosterMember(
      "Box score speaks for itself.",
      giannis,
      roster,
    )).toBe(false);
  });

  it("does not flag a non-roster name (real opponent or coach)", () => {
    // Doc Rivers isn't on the roster — line is fine
    expect(lineNamesNonStarRosterMember(
      "Doc Rivers had no answers tonight.",
      giannis,
      roster,
    )).toBe(false);
  });
});
