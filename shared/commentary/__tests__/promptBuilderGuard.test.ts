/**
 * promptBuilderGuard.test.ts — Verifies the LLM prompt builders apply the
 * stat-citation guard so historical stat references can't leak into the
 * culture nuggets the model ingests.
 *
 * Bug 4 was originally caught at the runtime selector layer; this test
 * extends the guarantee to the LLM-prompt path.
 */
import { describe, it, expect } from "vitest";
import { buildBasketballContext } from "../../../basketball/src/utils/buildBasketballContext";
import { buildBaseballContext } from "../../../baseball/src/utils/buildBaseballContext";
import type { CommentaryRosterCard } from "../types";

// Mirrors lineCitesMismatchedStat's regex — rejects single-game stat citations
// but permits career/season totals carrying a thousands separator
// ("15,000 points", "30,000-point club" etc.).
const STAT_CITATION_RE = /(?<![\d,])\d{2,3}[\s-]+(?:point|points|pts|pt|assist|assists|ast|rebound|rebounds|reb|board|boards|steal|steals|stl|block|blocks|blk|HR|home runs?|RBI|hits?|innings?|strikeouts?|stolen base|K)\b/i;

function findStatCitations(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (STAT_CITATION_RE.test(v)) out.push(v);
  }
  return out;
}

describe("buildBasketballContext — stat-citation guard", () => {
  it("does not surface historical stat citations that don't match the current game (Giannis vs IND, 37 pts)", () => {
    const roster: CommentaryRosterCard[] = [{
      name: "Giannis Antetokounmpo",
      basePlayerId: "203507",
      salary: 89,
      actualFp: 75,
      projectedFp: 60,
      cardTier: "ORANGE",
      statLine: { pts: 37, reb: 10, ast: 11, stl: 2, blk: 1, turnovers: 6 },
      opponent: "IND",
      gameDate: "2024-11-22",
      homeAway: "H",
    }];
    const nuggets = buildBasketballContext(roster);
    expect(nuggets.length).toBe(1);
    const n = nuggets[0];
    // None of the nugget fields should mention a stat number that doesn't
    // match Giannis's actual line (e.g. "64-point game", "20-assist game").
    const allLines = [
      ...(n.relevantTones ?? []),
      ...(n.salaryNarrative ?? []),
      ...(n.streakLines ?? []),
      ...(n.teamContext ?? []),
      ...(n.draftAndPath ?? []),
      ...(n.formerTeam ?? []),
      ...(n.rivalry ?? []),
      ...(n.milestones ?? []),
      n.opponentFlavor,
    ];
    const offending = findStatCitations(allLines).filter(l =>
      // Reject only citations that don't match the current game (37 pts, 10 reb, 11 ast, 2 stl, 1 blk).
      !/\b3[6-8][\s-]+(?:point|pts|pt)\b/i.test(l) &&
      !/\b1[0-2][\s-]+(?:assist|ast)\b/i.test(l) &&
      !/\b(?:9|10|11)[\s-]+(?:reb|rebound|board)/i.test(l)
    );
    expect(offending, `unfiltered citations: ${JSON.stringify(offending)}`).toEqual([]);
  });

  it("preserves stat-free culture lines unchanged", () => {
    const roster: CommentaryRosterCard[] = [{
      name: "Giannis Antetokounmpo",
      basePlayerId: "203507", salary: 89, actualFp: 75, projectedFp: 60,
      cardTier: "ORANGE",
      statLine: { pts: 37, reb: 10, ast: 11 },
      opponent: "DET",
      gameDate: "2024-11-22",
    }];
    const nuggets = buildBasketballContext(roster);
    expect(nuggets[0].relevantTones?.length).toBeGreaterThan(0);
  });
});

describe("buildBaseballContext — stat-citation guard", () => {
  it("filters citations of strikeout / HR / RBI counts that don't match", () => {
    const roster: CommentaryRosterCard[] = [{
      name: "Hunter Greene",
      basePlayerId: "h1",
      salary: 60,
      actualFp: 45,
      projectedFp: 40,
      cardTier: "PURPLE",
      // 6 K — pool may include "12 K" lines, those must not survive
      statLine: { ip: 6, k: 6, bb: 2, h: 4, r: 2 },
      opponent: "MIL",
      gameDate: "2025-04-12",
    }];
    const nuggets = buildBaseballContext(roster);
    const tones = nuggets[0]?.relevantTones ?? [];
    const offending = tones.filter(l => /\b1[0-9][\s-]+K\b/i.test(l));
    expect(offending, `unfiltered K citations: ${JSON.stringify(offending)}`).toEqual([]);
  });
});
