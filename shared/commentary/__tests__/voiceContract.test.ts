// shared/commentary/__tests__/voiceContract.test.ts
//
// Phase 3 step 2 — deterministic tests on the prompt assembler. Voice
// quality is reviewed (eval loop + on-glass), not unit-asserted; these
// tests pin the things the validator and the lock require to be present:
// season substitution (anti-anachronism), verdict appearing in the
// brief, facts-only rendering (no leak of non-facts content), and
// inheritance of the §3 / accuracy / trademark segments.

import { describe, expect, it } from "vitest";
import { buildVoiceContract, buildUserPrompt } from "../voiceContract";
import type { CommentaryFacts } from "../commentaryFacts";

const WADE_FACTS: CommentaryFacts = {
  surface: "challenge_headline",
  sport: "basketball",
  season: "0809",
  trigger: "rare_pull",
  verdict: "credited",
  winTier: "ALL_STAR",
  anchor: {
    name: "Dwyane Wade",
    basePlayerId: "2548",
    nicknames: ["Flash", "D-Wade"],
    knownFor: "Three-time NBA champion, Finals MVP at 24.",
    tier: "RED",
    team: "MIA",
    statLine: { pts: 48, reb: 10, ast: 8, stl: 4, blk: 6 },
    opponent: "UTA",
    homeAway: "H",
    date: "2009-02-22",
    topReason: { category: "pts", value: 48, label: "48 pts (career)" },
  },
};

describe("buildVoiceContract — system prompt composition", () => {
  it("inherits the basketball register, factual accuracy, trademark, §3, gold-standard segments verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("═══ CHAD'S VOICE — REPLAYMOD COMMENTARY STANDARD ═══");
    expect(system).toContain("FACTUAL ACCURACY: Ground every numerical");
    expect(system).toContain("TRADEMARK USAGE:");
    expect(system).toContain("PERSONAL LIFE:");
    expect(system).toContain("═══ GOLD-STANDARD EXAMPLES");
  });

  it("appends the headline-specific surface layer with overrides", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("═══ SURFACE: CHALLENGE HEADLINE");
    expect(system).toContain("OVERRIDE — STRUCTURE:");
    expect(system).toContain("OVERRIDE — LENGTH:");
    expect(system).toContain("OVERRIDE — OUTPUT FORMAT:");
  });

  it("substitutes {season} into the anti-anachronism rule", () => {
    const { system } = buildVoiceContract({ ...WADE_FACTS, season: "9596" });
    expect(system).toContain("game is from season 9596");
    expect(system).not.toMatch(/\{season\}/);
  });

  it("OBEY THE VERDICT rule explicitly enumerates credited / blamed / neutral", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("\"credited\"");
    expect(system).toContain("\"blamed\"");
    expect(system).toContain("\"neutral\"");
  });

  it("does NOT include the culture-entry JSON output instruction", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("Return ONLY a JSON array of objects");
  });

  it("does NOT include the field-structural-rules tail (basePlayerId, nicknames, ...)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    // The culture-entry tail enumerates output JSON fields; the headline
    // surface returns a plain string and must not see that block.
    expect(system).not.toContain("═══ FIELD STRUCTURAL RULES ═══");
    expect(system).not.toContain("salaryTier: max | star");
  });

  it("explicitly tells the model to return a plain string, no JSON, no prefix", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toMatch(/Return ONE plain string\. No JSON\./);
    expect(system).toContain("No \"Headline:\" prefix");
  });

  it("falls back to basketball segments + warns on unknown sport", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { system } = buildVoiceContract({ ...WADE_FACTS, sport: "cricket" });
    expect(system).toContain("═══ CHAD'S VOICE");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("cricket"));
    warnSpy.mockRestore();
  });
});

describe("buildUserPrompt — facts brief assembly", () => {
  it("renders every required surface field", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("SURFACE: challenge_headline");
    expect(user).toContain("SPORT: basketball");
    expect(user).toContain("SEASON: 0809");
    expect(user).toContain("TRIGGER: rare_pull");
    expect(user).toContain("VERDICT: credited");
    expect(user).toContain("WIN_TIER: ALL_STAR");
  });

  it("renders the anchor block when present", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("name: Dwyane Wade");
    expect(user).toContain("team: MIA");
    expect(user).toContain("opponent: UTA");
    expect(user).toContain("home_away: H");
    expect(user).toContain("date: 2009-02-22");
    expect(user).toContain("nicknames: Flash, D-Wade");
    expect(user).toContain("knownFor: Three-time NBA champion");
    expect(user).toContain("statLine: 48 pts, 10 reb, 8 ast, 4 stl, 6 blk");
    expect(user).toContain("topReason: 48 pts (career) (pts=48)");
  });

  it("marks ANCHOR: none when facts has no anchor", () => {
    const facts: CommentaryFacts = {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "miss",
      verdict: "neutral",
      winTier: "STARTER",
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    };
    const user = buildUserPrompt(facts);
    expect(user).toContain("ANCHOR: (none");
    expect(user).toContain("NEAR_MISS_GAP_FP: 7");
    expect(user).toContain("NEAR_MISS_NEXT_TIER: ALL_STAR");
  });

  it("omits winTier line when caller didn't populate it", () => {
    const facts = { ...WADE_FACTS };
    delete facts.winTier;
    const user = buildUserPrompt(facts);
    expect(user).not.toContain("WIN_TIER:");
  });

  it("ends with the explicit one-line instruction", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user.trimEnd().endsWith("ONE line. Plain string. No quotes, no prefix.")).toBe(true);
  });

  it("does NOT leak non-facts content (no opponent invented when facts omits it)", () => {
    const facts: CommentaryFacts = {
      ...WADE_FACTS,
      anchor: { ...WADE_FACTS.anchor!, opponent: "" },
    };
    const user = buildUserPrompt(facts);
    expect(user).not.toContain("opponent:");
  });
});

// vi import for the warn-spy test
import { vi } from "vitest";
