// shared/commentary/__tests__/voiceContract.test.ts
//
// Phase 3.3 — gates on the rewritten VOICE_CONTRACT (lock: docs/
// challenge-landing-v2-phase3.3-headline-subject-is-the-hand-lock.md).
// The neutral-surface "DO NOT NAME THE ANCHOR" block + the DO-NOT-
// INVENT-A-CULPRIT block from 2.1 are replaced by three universal
// rules: subject is the hand (Rule 1), name-don't-blame (Rule 2),
// per-trigger flavor (Rule 3). The new tests pin those rules + the
// headline-scoped game-context omission. Voice quality is reviewed,
// not unit-asserted.

import { describe, expect, it, vi } from "vitest";
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

describe("buildVoiceContract — inherited segments unchanged", () => {
  it("inherits the basketball register, factual accuracy, trademark, §3, gold-standard segments verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("═══ CHAD'S VOICE — REPLAYMOD COMMENTARY STANDARD ═══");
    expect(system).toContain("FACTUAL ACCURACY: Ground every numerical");
    expect(system).toContain("TRADEMARK USAGE:");
    expect(system).toContain("PERSONAL LIFE:");
    expect(system).toContain("═══ GOLD-STANDARD EXAMPLES");
  });

  it("does NOT include the culture-entry JSON output instruction", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("Return ONLY a JSON array of objects");
  });

  it("does NOT include the field-structural-rules tail (basePlayerId, nicknames, ...)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("═══ FIELD STRUCTURAL RULES ═══");
    expect(system).not.toContain("salaryTier: max | star");
  });

  it("falls back to basketball segments + warns on unknown sport", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { system } = buildVoiceContract({ ...WADE_FACTS, sport: "cricket" });
    expect(system).toContain("═══ CHAD'S VOICE");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("cricket"));
    warnSpy.mockRestore();
  });
});

describe("buildVoiceContract — Phase 3.3 banner + Rule 1 (subject is the hand)", () => {
  it("opens with the lock's banner — sports arguments, not sports journalism", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Challenge headlines are not sports journalism");
    expect(system).toContain("Challenge headlines are sports arguments");
    expect(system).toContain("subject is always the fantasy hand");
  });

  it("cites the lock's anti-recap example verbatim (the 3.2 LAKERS vs MILWAUKEE failure)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("LAKERS STUMBLE AT HOME AGAINST MILWAUKEE");
  });

  it("Rule 1 declares game-identity inputs are WITHHELD from the surface", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 1 — THE SUBJECT IS THE HAND");
    expect(system).toContain("game-identity inputs are intentionally WITHHELD");
    // The priority of subject must be present so the model has the ladder.
    expect(system).toContain("held players → the decision → the outcome → the claim");
  });
});

describe("buildVoiceContract — Phase 3.3 Rule 2 (name-don't-blame)", () => {
  it("Rule 2 declares naming-is-not-blaming", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 2 — NAME PLAYERS. NEVER BLAME THEM.");
    expect(system).toContain("Naming is not blaming");
  });

  it("includes the GOOD list verbatim from the lock", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("KOBE AND CP3. STILL BUSTED.");
    expect(system).toContain("THE MAMBA COULDN'T SAVE THIS.");
    expect(system).toContain("YOU HELD KOBE. WHAT HAPPENED?");
    expect(system).toContain("TWO STARS. ZERO EXCUSES.");
  });

  it("includes the BANNED list verbatim from the lock", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("KOBE CHOKED.");
    expect(system).toContain("CP3 FAILED.");
    expect(system).toContain("KOBE SOLD THE HAND.");
  });

  it("draws the GOOD-vs-BANNED boundary explicitly ('EVEN {star} COULDN'T SAVE IT' is allowed)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("EVEN {star} COULDN'T SAVE IT");
    expect(system).toContain("CHOKED / FAILED / SOLD IT / WENT QUIET / COULDN'T DELIVER");
  });

  it("explicitly retires the 2.1 'don't name the anchor' framing", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    // 2.1 wording must be gone.
    expect(system).not.toContain("DO NOT NAME THE ANCHOR");
    expect(system).not.toContain("THE SIMPLE BINDING RULE");
    // And the rewrite makes the replacement explicit so a future
    // regression to 2.1 wording is visible at review time.
    expect(system).toContain("REPLACES any earlier \"don't name the anchor\"");
  });
});

describe("buildVoiceContract — Phase 3.3 Rule 3 (per-trigger flavor)", () => {
  it("Rule 3 declares universal philosophy + per-trigger emotional register", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 3 — UNIVERSAL PHILOSOPHY, PER-TRIGGER FLAVOR");
  });

  it("lists each trigger with its flavor + at least one example claim verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    // choke → accusation
    expect(system).toContain("choke");
    expect(system).toContain("ACCUSATION");
    expect(system).toContain("STILL BUSTED");
    // miss → regret
    expect(system).toContain("miss");
    expect(system).toContain("REGRET");
    expect(system).toContain("ONE DECISION AWAY");
    expect(system).toContain("LEFT MVP ON THE TABLE");
    // big_score → challenge
    expect(system).toContain("big_score");
    expect(system).toContain("CHALLENGE");
    // rare_pull → nostalgia
    expect(system).toContain("rare_pull");
    expect(system).toContain("NOSTALGIA");
    expect(system).toContain("JORDAN WALKED BACK INTO THE BUILDING");
    expect(system).toContain("YOU GOT THE JORDAN GAME. NOW WHAT?");
  });
});

describe("buildVoiceContract — Phase 3.3 rare_pull deep dive", () => {
  it("ships a dedicated rare_pull section with hook=rare event, subject=hand+star", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("TRIGGER DEEP DIVE — RARE_PULL");
    // The hook is the rare event itself.
    expect(system).toContain("rare event");
    expect(system).toContain("hand + the held star + the rare event");
    // Register is nostalgia + celebration + handoff to recipient.
    expect(system).toContain("nostalgia");
    expect(system).toContain("celebration");
  });

  it("includes the user's three rare_pull gold-standard examples verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("YOU PULLED THE JORDAN GAME. NOW WHAT?");
    expect(system).toContain("JORDAN WALKED BACK INTO THE BUILDING.");
    expect(system).toContain("YOU GOT A WADE CAREER NIGHT. MATCH IT.");
  });

  it("calls out rare_pull anti-patterns (NBA-recap framings) verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("WADE LIGHTS UP UTAH FOR 50");
    expect(system).toContain("JORDAN VS WASHINGTON IN '96");
    expect(system).toContain("SHAQ DROPS 41 IN A LAKERS WIN");
  });

  it("reminds rare_pull's anti-anachronism is anchored to the season provided", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("ANTI-ANACHRONISM reminder for rare_pull");
    expect(system).toContain("later championships");
    expect(system).toContain("would go on to win");
  });
});

describe("buildVoiceContract — Phase 3.3 big_score deep dive (confident-challenge register)", () => {
  it("ships a dedicated big_score section with subject=hand+star+anchor FP", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("TRIGGER DEEP DIVE — BIG_SCORE");
    expect(system).toContain("hand + held star(s) + the ANCHOR'S FP number");
    // Register cue — confident, terse, a dare.
    expect(system).toContain("confident-challenge");
  });

  it("includes the FP-vs-points strict rule — anchor.topReason is FP, statLine.pts is context", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("THE FP-VS-POINTS RULE (BIG_SCORE — STRICT)");
    // The label must be "FP", never "POINTS".
    expect(system).toContain("NEVER as \"POINTS\"");
    // statLine.pts is identified as game points, not the headline number.
    expect(system).toContain("statLine.pts");
    expect(system).toContain("GAME points");
    expect(system).toContain("NEVER make statLine.pts the headline number");
  });

  it("cites the prior smoke failure verbatim so a regression to it is visible", () => {
    // The "YOU HELD CURRY AT 65 POINTS" line is the receipt-of-failure
    // the rule exists to retire. Pinning it keeps the diagnostic in
    // the contract — if a future edit drops it, review will see it.
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("YOU HELD CURRY AT 65 POINTS");
  });

  it("includes the big_score gold-standard examples verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("YOU HELD CURRY AT 65.3 FP. BEAT IT.");
    expect(system).toContain("65.3 FP FROM ONE MAN. GOOD LUCK.");
  });

  it("calls out big_score anti-patterns (POINTS label, statLine.pts as number, recap framing)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("YOU HELD CURRY AT 65 POINTS.");
    expect(system).toContain("CURRY DROPPED 42 ON YOUR HAND.");
    expect(system).toContain("CURRY GOES OFF FOR 42/5/7 IN A WARRIORS WIN.");
  });
});

describe("buildVoiceContract — format + anti-anachronism + season substitution", () => {
  it("substitutes {season} into the anti-anachronism rule", () => {
    const { system } = buildVoiceContract({ ...WADE_FACTS, season: "9596" });
    expect(system).toContain("game is from season 9596");
    expect(system).not.toMatch(/\{season\}/);
  });

  it("anti-anachronism rule still lists arena-evocative phrases (carried from 2.1)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("the Garden");
    expect(system).toContain("the Forum");
    expect(system).toContain("MSG");
    expect(system).toContain("venue rule is ABSOLUTE");
  });

  it("explicitly tells the model to return a plain string, no JSON, no prefix", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toMatch(/Return ONE plain string\. No JSON\./);
    expect(system).toContain("No \"Headline:\" prefix");
  });

  it("retains the STRUCTURE / LENGTH / OUTPUT FORMAT overrides", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("OVERRIDE — STRUCTURE:");
    expect(system).toContain("OVERRIDE — LENGTH:");
    expect(system).toContain("OVERRIDE — OUTPUT FORMAT:");
  });
});

describe("buildUserPrompt — top-level fields + anchor block presence", () => {
  it("renders every required surface field", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("SURFACE: challenge_headline");
    expect(user).toContain("SPORT: basketball");
    expect(user).toContain("SEASON: 0809");
    expect(user).toContain("TRIGGER: rare_pull");
    expect(user).toContain("VERDICT: credited");
    expect(user).toContain("WIN_TIER: ALL_STAR");
  });

  it("renders anchor identity (name / team / tier) + culture (nicknames / knownFor) + statLine + topReason", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("name: Dwyane Wade");
    expect(user).toContain("team: MIA");
    expect(user).toContain("tier: RED");
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
});

describe("buildUserPrompt — Phase 3.3 headline-scoped game-context omission", () => {
  it("OMITS opponent / home_away / date for the challenge_headline surface", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).not.toMatch(/^\s*opponent:/m);
    expect(user).not.toMatch(/^\s*home_away:/m);
    expect(user).not.toMatch(/^\s*date:/m);
    // The values themselves must not leak via another label either.
    expect(user).not.toContain("UTA");
    expect(user).not.toContain("2009-02-22");
  });

  it("INCLUDES opponent / home_away / date for the post_hand commentary surface", () => {
    // Regression guard: the omission is SCOPED to the headline path.
    // The commentary surface (future phase) keeps game context.
    const user = buildUserPrompt({ ...WADE_FACTS, surface: "post_hand" });
    expect(user).toContain("opponent: UTA");
    expect(user).toContain("home_away: H");
    expect(user).toContain("date: 2009-02-22");
  });

  it("still includes player identity + stats + culture on the headline surface", () => {
    // The omission is real-game-IDENTITY only — held players, stat
    // line, culture stay. Test that the cut is targeted.
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("name: Dwyane Wade");
    expect(user).toContain("tier: RED");
    expect(user).toContain("statLine:");
    expect(user).toContain("nicknames:");
  });
});
