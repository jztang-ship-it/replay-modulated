// shared/commentary/__tests__/voiceContract.test.ts
//
// Phase 4 Pass 2 — gates on the rewritten VOICE_CONTRACT (lock: docs/
// challenge-landing-v2-phase4-pass2-voice-foundation-lock.md). Pass 2
// replaces the player-first / "write a clever argument" framing with a
// fact-first narrative target ("explain what the salient facts did to
// the result"); retires the Norman-Chad named-commentator framing in
// favor of "a smart sports fan explaining to a friend"; flips the
// structure default to single-clause; bans the "{verb} {player} AT
// {number}" scaffold and the YOU-as-default opener; rebuilds the gold
// set; lifts FP-vs-points into FORMAT as a universal conditional rule;
// adds per-trigger SALIENCE consumption guidance to Rule 3; drops the
// (category=value) suffix on topReason render.
//
// Voice quality is NOT unit-asserted (that is on-glass + smoke); this
// file pins the contract-text surface so a regression to the prior
// framing is visible at review time. Includes negative assertions
// (anti-regression) for every retired Pass-3.3-era artifact.

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
  fpStatKeys: ["pts", "reb", "ast", "stl", "blk", "turnovers"] as const,
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

// ── Inherited segments (Pass 2 — Norman Chad retired) ─────────────────────

describe("buildVoiceContract — inherited segments (Pass 2: Chad retired)", () => {
  it("inherits the (renamed) basketball register + factual / trademark / §3 / gold-standard segments", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("═══ COMMENTARY VOICE — REPLAYMOD STANDARD ═══");
    expect(system).toContain("FACTUAL ACCURACY: Ground every numerical");
    expect(system).toContain("TRADEMARK USAGE:");
    expect(system).toContain("PERSONAL LIFE:");
    expect(system).toContain("═══ GOLD-STANDARD EXAMPLES");
  });

  it("retires the Norman Chad / named-commentator framing", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("═══ CHAD'S VOICE");
    expect(system).not.toContain("Norman Chad");
    expect(system).not.toContain("Chad is the commentator");
    // Replacement framing.
    expect(system).toContain("smart sports fan explaining to a friend");
    expect(system).toContain("no impression");
    expect(system).toContain("no named-commentator bit");
  });

  it("falls back to basketball segments + warns on unknown sport", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { system } = buildVoiceContract({ ...WADE_FACTS, sport: "cricket" });
    expect(system).toContain("═══ COMMENTARY VOICE");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("cricket"));
    warnSpy.mockRestore();
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
});

// ── Inherited STRUCTURE — Pass 2 flips to single-clause default ───────────

describe("inherited STRUCTURE rule — Pass 2 single-clause default", () => {
  it("retires the 'Two-clause lines. Setup, then editorial twist.' instruction", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("Two-clause lines. Setup, then editorial twist.");
  });

  it("declares single-clause as the inherited default", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Single-clause lines by default");
    expect(system).toContain("no padding");
    // Named anti-examples — the vague-metaphor padding pattern.
    expect(system).toContain("The shimmy didn't save this");
    expect(system).toContain("the shot selection said different");
  });
});

// ── Narrative target (lock §A) ────────────────────────────────────────────

describe("buildVoiceContract — Pass 2 narrative target (fact → why → verdict → style)", () => {
  it("opens with the EXPLAIN framing (not 'sports argument' / 'clever line')", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("EXPLAIN what this hand's salient facts did to the result");
    expect(system).toContain("Not to manufacture a clever line");
    expect(system).toContain("Voice comes from the obviousness of the observation");
  });

  it("walks the internal fact → why → verdict → style order", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("walk it before you write");
    expect(system).toContain("(1) the fact");
    expect(system).toContain("(2) why it mattered for THIS hand");
    expect(system).toContain("(3) the verdict");
    expect(system).toContain("(4) style it as one observation");
  });

  it("retires the prior 'Challenge headlines are sports arguments' framing", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("Challenge headlines are not sports journalism");
    expect(system).not.toContain("Challenge headlines are sports arguments");
  });

  it("cites the LAKERS-recap anti-pattern verbatim (regression guard)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("LAKERS STUMBLE AT HOME AGAINST MILWAUKEE");
  });
});

// ── Rule 1 — subject is the hand, LED BY salient fact ─────────────────────

describe("buildVoiceContract — Rule 1 (subject inverted to fact-first)", () => {
  it("Rule 1 header carries the 'LED BY THE SALIENT FACT' suffix", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 1 — THE SUBJECT IS THE HAND, LED BY THE SALIENT FACT");
  });

  it("retires the old 'held players → the decision → the outcome → the claim' ladder", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("held players → the decision → the outcome → the claim");
  });

  it("declares the INVERTED priority — fact → result → player", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("the salient fact (what SALIENCE names) → the result it produced → the player as the talent involved");
    expect(system).toContain("Players are NAMED — not led with");
  });

  it("keeps the hand-centric / not-player-profile reminder", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Hand-centric, not player-centric");
    expect(system).toContain("Never \"tell me about the player\"");
  });

  it("keeps the game-context withholding rationale", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("game-identity inputs are intentionally WITHHELD");
    expect(system).toContain("cannot see \"Milwaukee\"");
  });
});

// ── Rule 2 — name don't blame (refreshed examples) ────────────────────────

describe("buildVoiceContract — Rule 2 (name, don't blame; refreshed)", () => {
  it("Rule 2 declares naming-is-not-blaming", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 2 — NAME PLAYERS. NEVER BLAME THEM.");
    expect(system).toContain("Naming is not blaming");
  });

  it("GOOD list — title case; YOU-prefix example retired", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Kobe and CP3. Still busted.");
    expect(system).toContain("The Mamba couldn't save this.");
    expect(system).toContain("Two stars. Zero excuses.");
    expect(system).toContain("Twelve points from T-Mac was never enough.");
    // YOU-prefix example retired in Pass 2.
    expect(system).not.toContain("YOU HELD KOBE. WHAT HAPPENED?");
  });

  it("BANNED list (player-as-cause) kept verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("KOBE CHOKED.");
    expect(system).toContain("CP3 FAILED.");
    expect(system).toContain("KOBE SOLD THE HAND.");
  });

  it("retires the prior 'REPLACES any earlier don\\'t name the anchor' meta-line", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("REPLACES any earlier");
  });
});

// ── Rule 3 — register + LEAD SIGNAL per trigger (lock §E) ─────────────────

describe("buildVoiceContract — Rule 3 (per-trigger register + LEAD SIGNAL)", () => {
  it("Rule 3 header — TRIGGER REGISTER + WHICH SIGNAL LEADS", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("RULE 3 — TRIGGER REGISTER + WHICH SIGNAL LEADS");
    // Old header retired.
    expect(system).not.toContain("UNIVERSAL PHILOSOPHY, PER-TRIGGER FLAVOR");
  });

  it("choke → leads with BIGGEST DRAG", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("choke");
    expect(system).toContain("LEAD SIGNAL: BIGGEST DRAG");
  });

  it("miss → leads with NEAR_MISS_GAP_FP", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("miss");
    expect(system).toContain("LEAD SIGNAL: NEAR_MISS_GAP_FP");
    expect(system).toContain("Seven FP short of an All-Star hand");
  });

  it("big_score → leads with MOST IMPORTANT POSITIVE or TOTAL_FP", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("big_score");
    expect(system).toContain("LEAD SIGNAL: MOST IMPORTANT POSITIVE or TOTAL_FP");
    expect(system).toContain("62.1 FP is the number to chase");
    expect(system).toContain("245.8 FP. Good luck.");
  });

  it("rare_pull → leads with topReason", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("rare_pull");
    expect(system).toContain("LEAD SIGNAL: topReason");
    expect(system).toContain("the Jordan game");
  });
});

// ── rare_pull deep dive (gold set refreshed; YOU-prefix retired) ──────────

describe("buildVoiceContract — rare_pull deep dive (Pass 2 refresh)", () => {
  it("ships a rare_pull section keyed off topReason as the rare-event signal", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("TRIGGER DEEP DIVE — RARE_PULL");
    expect(system).toContain("topReason names the rare event");
    expect(system).toContain("nostalgia");
    expect(system).toContain("handoff to the recipient");
  });

  it("new gold set — varied openers; YOU-prefix retired as default", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Jordan walked back into the building.");
    expect(system).toContain("The Jordan game. Now what?");
    expect(system).toContain("A Wade career night just got pulled. Match it.");
    // Pre-Pass-2 YOU-prefix golds retired.
    expect(system).not.toContain("YOU PULLED THE JORDAN GAME. NOW WHAT?");
    expect(system).not.toContain("YOU GOT A WADE CAREER NIGHT. MATCH IT.");
    // The contract explicitly retires YOU-as-default opener.
    expect(system).toContain("YOU-as-default opener is retired");
  });

  it("calls out rare_pull recap anti-patterns verbatim", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("WADE LIGHTS UP UTAH FOR 50");
    expect(system).toContain("JORDAN VS WASHINGTON IN '96");
    expect(system).toContain("SHAQ DROPS 41 IN A LAKERS WIN");
  });

  it("retains the anti-anachronism reminder", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("ANTI-ANACHRONISM reminder for rare_pull");
    expect(system).toContain("later championships");
  });
});

// ── big_score deep dive (number leads; AT-scaffold banned) ────────────────

describe("buildVoiceContract — big_score deep dive (Pass 2: AT-scaffold retired)", () => {
  it("ships a big_score section; number leads, not player", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("TRIGGER DEEP DIVE — BIG_SCORE");
    expect(system).toContain("LEAD SIGNAL for big_score");
    expect(system).toContain("the number leads");
  });

  it("new big_score gold set — number leads", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("62.1 FP is the number to chase.");
    expect(system).toContain("Vince turned this hand into an All-Star bid.");
    expect(system).toContain("245.8 FP. Good luck.");
    // The "{verb} {player} AT {number}" scaffold is explicitly retired.
    expect(system).toContain("scaffold, explicitly retired");
  });

  it("explicitly retires the {verb} {player} AT {number} scaffold as the gold form", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    // The scaffold survives ONLY as an anti-pattern citation
    // (regression guard); the gold list no longer carries it.
    expect(system).not.toContain("GOLD-STANDARD EXAMPLES (big_score) — match these");
    // Anti-pattern entry for the scaffold is present.
    expect(system).toContain("\"YOU HELD CURRY AT 65.3 FP. BEAT IT.\" — the \"{verb} {player} AT {number}\" scaffold");
  });

  it("calls out the recap + statLine.pts-as-number anti-patterns", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("Curry dropped 42 on your hand.");
    expect(system).toContain("Curry goes off for 42/5/7 in a Warriors win.");
    expect(system).toContain("Steph was unstoppable.");
  });
});

// ── FP-vs-points lifted to FORMAT, conditional (lock §F) ──────────────────

describe("buildVoiceContract — FP-vs-points lifted to shared FORMAT", () => {
  it("retires the big_score-only FP-VS-POINTS RULE section header", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).not.toContain("THE FP-VS-POINTS RULE (BIG_SCORE — STRICT)");
  });

  it("the rule sits in FORMAT as 'FP-VS-POINTS — UNIVERSAL' and is conditional on category", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("FP-VS-POINTS — UNIVERSAL");
    expect(system).toContain("When topReason carries an FP-typed value (category=\"fp\")");
    expect(system).toContain("render it as \"FP\"");
    expect(system).toContain("NEVER as \"POINTS,\"");
    // Conditional clause for stat-typed topReason (rare_pull case).
    expect(system).toContain("When topReason carries a stat-typed value");
    expect(system).toContain("render it as that stat");
    // The Curry failure citation is kept as a general regression guard.
    expect(system).toContain("YOU HELD CURRY AT 65 POINTS");
  });
});

// ── FORMAT overrides — single-clause leads + no padding + openers ─────────

describe("buildVoiceContract — FORMAT overrides (single-clause leads)", () => {
  it("STRUCTURE override leads single-clause; second clause earned only on new info", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("OVERRIDE — STRUCTURE: Single-clause lines by default");
    expect(system).toContain("Never pad to a second clause");
    expect(system).toContain("adds new information");
    // Retire the prior "One to two clauses... Setup + editorial twist, OR..." framing.
    expect(system).not.toContain("OVERRIDE — STRUCTURE: One to two clauses. Setup");
  });

  it("LENGTH override unchanged (60-110 target, 160 ceiling)", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("OVERRIDE — LENGTH: 60–110 characters target");
    expect(system).toContain("160 hard ceiling");
  });

  it("new OVERRIDE — OPENERS bans YOU-prefix as the default opener", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("OVERRIDE — OPENERS:");
    expect(system).toContain("\"YOU HELD\" / \"YOU GOT\" / \"YOU PULLED\" / \"YOU LEFT\"");
    expect(system).toContain("Vary openers");
    expect(system).toContain("stat-first");
    expect(system).toContain("verdict-first");
    expect(system).toContain("number-first");
    expect(system).toContain("event-first");
  });

  it("OUTPUT FORMAT override kept", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toMatch(/Return ONE plain string\. No JSON\./);
    expect(system).toContain("No \"Headline:\" prefix");
  });
});

// ── season substitution + anti-anachronism (unchanged) ───────────────────

describe("buildVoiceContract — format + anti-anachronism + season substitution", () => {
  it("substitutes {season} into the anti-anachronism rule", () => {
    const { system } = buildVoiceContract({ ...WADE_FACTS, season: "9596" });
    expect(system).toContain("game is from season 9596");
    expect(system).not.toMatch(/\{season\}/);
  });

  it("anti-anachronism rule still lists arena-evocative phrases", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("the Garden");
    expect(system).toContain("the Forum");
    expect(system).toContain("MSG");
    expect(system).toContain("venue rule is ABSOLUTE");
  });

  it("REGISTER (closing) carries the smart-fan / observation framing", () => {
    const { system } = buildVoiceContract(WADE_FACTS);
    expect(system).toContain("smart sports fan would say to a friend");
    expect(system).toContain("Construction reads as failure");
    expect(system).toContain("observation reads as voice");
  });
});

// ── user-prompt assembly ──────────────────────────────────────────────────

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

  it("renders anchor identity (name / team / tier) + culture + statLine + topReason (no analyst suffix)", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("name: Dwyane Wade");
    expect(user).toContain("team: MIA");
    expect(user).toContain("tier: RED");
    expect(user).toContain("nicknames: Flash, D-Wade");
    expect(user).toContain("knownFor: Three-time NBA champion");
    expect(user).toContain("statLine: 48 pts, 10 reb, 8 ast, 4 stl, 6 blk");
    // Pass 2 §G: drop the "(<category>=<value>)" analyst suffix.
    expect(user).toContain("topReason: 48 pts (career)");
    expect(user).not.toContain("(pts=48)");
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

describe("buildUserPrompt — Phase 3.3 headline-scoped game-context omission (unchanged)", () => {
  it("OMITS opponent / home_away / date for the challenge_headline surface", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).not.toMatch(/^\s*opponent:/m);
    expect(user).not.toMatch(/^\s*home_away:/m);
    expect(user).not.toMatch(/^\s*date:/m);
    expect(user).not.toContain("UTA");
    expect(user).not.toContain("2009-02-22");
  });

  it("INCLUDES opponent / home_away / date for the post_hand commentary surface", () => {
    const user = buildUserPrompt({ ...WADE_FACTS, surface: "post_hand" });
    expect(user).toContain("opponent: UTA");
    expect(user).toContain("home_away: H");
    expect(user).toContain("date: 2009-02-22");
  });

  it("still includes player identity + stats + culture on the headline surface", () => {
    const user = buildUserPrompt(WADE_FACTS);
    expect(user).toContain("name: Dwyane Wade");
    expect(user).toContain("tier: RED");
    expect(user).toContain("statLine:");
    expect(user).toContain("nicknames:");
  });
});
