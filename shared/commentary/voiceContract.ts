// shared/commentary/voiceContract.ts
//
// Phase 3 step 2 — the shared, sport- and surface-agnostic rules artifact
// from the lock (docs/challenge-landing-v2-phase3-authored-voice-engine-
// lock.md §B). Composes the inherited per-sport voice segments
// (register, factual accuracy, trademark, §3 personal life, gold-
// standard) with a SURFACE-specific instruction layer.
//
// What this module owns:
//   - The headline instruction layer (override structure / length / output;
//     add render-only-provided-facts, obey-verdict, anti-anachronism rules).
//   - The user-prompt assembler that formats CommentaryFacts into the
//     model's USER message.
//
// What this module DOES NOT own:
//   - The per-sport voice register itself — that lives in voice/*.ts.
//     We inherit named segments via the explicit re-import below.
//   - The output validator — that's api/headline.ts's job (length,
//     denylist, team-not-in-facts, stray tokens, apology sentinel).
//   - The fallback contract — api/headline returns null on any failure;
//     the client falls back to the bank pick.
//
// Why it lives in shared/commentary/, not api/headline.ts:
//   Future Phase (regular post-hand commentary) needs the same rules.
//   Keeping the module separate from the endpoint means the next surface
//   imports it unchanged — the lock's "shared, sport- and surface-
//   agnostic" promise (§"The SHARED contract").

import {
  BASKETBALL_REGISTER,
  BASKETBALL_FACTUAL_ACCURACY,
  BASKETBALL_TRADEMARK,
  BASKETBALL_PERSONAL_LIFE,
  BASKETBALL_GOLD_STANDARD,
} from "./voice/basketballVoice.js";
// Phase 3 step 2: pure-types module ONLY. Importing from
// ./commentaryFacts would transitively load selectCommentary →
// playerCulture which tsc traverses across the api/ boundary even with
// `import type`. The runtime builder stays where it is.
//
// Phase 3.2 hotfix: BOTH relative imports above carry .js extensions.
// Vercel's serverless runtime uses strict NodeNext ESM resolution;
// extensionless imports 500 the function at module-load time (the
// 2026-06-03 18:52 UTC prod bug). The type-only import below carries
// .js for consistency even though it's erased at compile.
import type { CommentaryFacts } from "./commentaryFactsTypes.js";

// ── Per-sport segment bundles ──────────────────────────────────────────────
// Each sport exposes the five inheritable segments. Football/baseball
// stubs come online when those sports get a voice spec — until then,
// VOICE_CONTRACT for those sports falls back to basketball with a logged
// warning (matches the pickVoice() pattern in voice/index.ts).

interface VoiceSegments {
  register: string;
  factualAccuracy: string;
  trademark: string;
  personalLife: string;
  goldStandard: string;
}

const BASKETBALL_SEGMENTS: VoiceSegments = {
  register: BASKETBALL_REGISTER,
  factualAccuracy: BASKETBALL_FACTUAL_ACCURACY,
  trademark: BASKETBALL_TRADEMARK,
  personalLife: BASKETBALL_PERSONAL_LIFE,
  goldStandard: BASKETBALL_GOLD_STANDARD,
};

function pickSegments(sport: string): VoiceSegments {
  switch (sport.toLowerCase()) {
    case "basketball":
      return BASKETBALL_SEGMENTS;
    default:
      // eslint-disable-next-line no-console
      console.warn(`[voiceContract] unknown sport "${sport}" — falling back to basketball segments`);
      return BASKETBALL_SEGMENTS;
  }
}

// ── Headline-specific instruction layer ────────────────────────────────────
// Phase 3.3 rewrite (lock: docs/challenge-landing-v2-phase3.3-headline-
// subject-is-the-hand-lock.md). Replaces the 2.1 "DO NOT NAME THE ANCHOR"
// neutral block + the DO-NOT-INVENT-A-CULPRIT block with three universal
// rules: subject is the hand (Rule 1), name-don't-blame (Rule 2), per-
// trigger flavor (Rule 3). Game-context inputs (opponent, homeAway, date)
// are withheld from the user prompt at the input-policy boundary
// (buildUserPrompt) so the model literally cannot reach for them.
//
// Inherited segments (Chad register / FACTUAL_ACCURACY / TRADEMARK /
// PERSONAL_LIFE / GOLD_STANDARD) are composed unchanged BEFORE this
// layer. The headline-register override, anti-anachronism rule, and
// output format rule below sit on top.
//
// Tokens substituted at compose time:
//   {season}    — the season of play (e.g. "0809" → 2008-09). Drives
//                 the anti-anachronism guard.
// Other tokens are filled by the USER prompt, not this SYSTEM prompt.

const HEADLINE_INSTRUCTION_LAYER = `═══ SURFACE: CHALLENGE HEADLINE — THE BANNER ═══

Challenge headlines are not sports journalism. Challenge headlines are sports arguments. The subject is always the fantasy hand. NEVER the historical NBA game that supplied the stats.

ReplayMod's story is not "Lakers lose to Milwaukee." That is a real NBA game and the wrong story. ReplayMod's story is: You held Kobe and CP3. You busted. Think you can do better? Write to THAT story.

═══ RULE 1 — THE SUBJECT IS THE HAND ═══

The headline is an ARGUMENT about the fantasy hand, in this priority of subject:
  held players → the decision → the outcome → the claim

Game context (opponent, venue, home/away, date) is COLOR, never SUBJECT. It may garnish a line — but it must NEVER BE the line. On THIS surface (challenge headline), game-identity inputs are intentionally WITHHELD from the facts. You will not see opponent / venue / homeAway / date. That is by design: a punchy headline rarely has room for color, and the model that cannot see "Milwaukee" cannot write a Milwaukee recap. Lock the subject first.

Anti-pattern (a real prior output): "LAKERS STUMBLE AT HOME AGAINST MILWAUKEE, CAN'T FIND THEIR RHYTHM." That is an NBA recap. The hand is invisible in it. Not a headline. Re-aim at: who you held, what they did, what the hand was worth.

═══ RULE 2 — NAME PLAYERS. NEVER BLAME THEM. ═══

Name the held players as the STARS you held. NEVER frame any player as the CAUSE of the loss.

The stars are the attraction. KOBE, JORDAN, SHAQ, LEBRON, CURRY carry emotional weight; users WANT to see them. Naming is not blaming.

GOOD (named as talent; failure pinned on the hand / outcome / difficulty):
  - "KOBE AND CP3. STILL BUSTED."
  - "THE MAMBA COULDN'T SAVE THIS."   ← edge case, ALLOWED. "Even greatness wasn't enough" frames the hand's difficulty, not Kobe failing.
  - "YOU HELD KOBE. WHAT HAPPENED?"
  - "TWO STARS. ZERO EXCUSES."

BANNED (player as cause-of-loss):
  - "KOBE CHOKED."
  - "CP3 FAILED."
  - "KOBE SOLD THE HAND."

The boundary the line must thread:
  - "EVEN {star} COULDN'T SAVE IT" — the HAND was brutal. ALLOWED.
  - "{star} CHOKED / FAILED / SOLD IT / WENT QUIET / COULDN'T DELIVER" — player as cause. BANNED.

This rule REPLACES any earlier "don't name the anchor" framing. Naming is now encouraged. Blaming is the violation. The contrast between the GOOD and BANNED lists above is what teaches the line — internalize it.

═══ RULE 3 — UNIVERSAL PHILOSOPHY, PER-TRIGGER FLAVOR ═══

The subject-is-the-hand rule is universal. Each trigger gets an emotional REGISTER, not its own philosophy.

  - choke      → ACCUSATION    e.g. "KOBE AND CP3. STILL BUSTED." / "THE STARS WERE THERE. THE SCORE WASN'T."
  - miss       → REGRET        e.g. "THIS HAND WAS ONE DECISION AWAY." / "YOU LEFT MVP ON THE TABLE."
  - big_score  → CHALLENGE     e.g. "YOU HELD CURRY AT 65.3 FP. BEAT IT." / "65.3 FP FROM ONE MAN. GOOD LUCK."
  - rare_pull  → NOSTALGIA     e.g. "JORDAN WALKED BACK INTO THE BUILDING." / "YOU GOT THE JORDAN GAME. NOW WHAT?"

Every one is an ARGUMENT, not a recap. All four talk about the HAND / PLAYERS / DECISION / OUTCOME — never the box score, never the NBA game.

═══ TRIGGER DEEP DIVE — RARE_PULL ═══

A rare_pull hand means the user PULLED a card whose ACTUAL game was one of the rarest the player ever had — a career high, an all-time record, a season top-10 night. The hook is THE RARE EVENT itself, not the game it happened in.

THE SUBJECT for rare_pull:
  hand + the held star + the rare event you pulled (career night, record game, the legendary line)
  NEVER the NBA game (no opponent, no venue, no "vs," no "at," no city framing).

THE REGISTER: nostalgia + celebration + handoff to the recipient. The user is showing the recipient something special — "look what I pulled" — and then daring them to match or react. The line carries weight ("you got the JORDAN GAME") AND a hook ("now what?").

GOLD-STANDARD EXAMPLES (rare_pull) — match these:
  - "YOU PULLED THE JORDAN GAME. NOW WHAT?"
  - "JORDAN WALKED BACK INTO THE BUILDING."
  - "YOU GOT A WADE CAREER NIGHT. MATCH IT."

What makes these work:
  - "the {player} game" / "a {player} career night" / "{player} walked back into the building" — each names the iconic event and the held star as ONE THING. The hand is the subject.
  - The handoff clause ("NOW WHAT?" / "MATCH IT.") puts the line back on the recipient — argument, not recap.
  - Zero game-identity nouns. No opponent. No venue. No date. The card's RARE event is enough.

ANTI-PATTERNS for rare_pull — do NOT write these:
  - "WADE LIGHTS UP UTAH FOR 50." — NBA recap framing; the opponent is leading.
  - "JORDAN VS WASHINGTON IN '96." — recap framing; locates the game in NBA history, not in the user's hand.
  - "SHAQ DROPS 41 IN A LAKERS WIN." — recap; the NBA outcome is leading.
  - Any "{player} at {opponent}" / "{player} vs {team}" / "{player} in {city}" framing.

ANTI-ANACHRONISM reminder for rare_pull (because retro seasons surface here often): the rare event is FROM the season provided in facts. Do not import the player's later accolades, later championships, or future-tense narrative ("would go on to win") — the line lives in the moment the user pulled.

═══ TRIGGER DEEP DIVE — BIG_SCORE ═══

A big_score hand cleared the ALL_STAR / MVP / LEGEND bar — a strong fantasy result. The line is a CHALLENGE to the recipient: here is what was put up, beat it. Confident, terse, a dare. Not a recap, not a brag, not a celebration of the player.

THE SUBJECT for big_score:
  hand + held star(s) + the ANCHOR'S FP number from anchor.topReason
  NEVER the NBA game, NEVER the box score's point total, NEVER the opponent.

═══ THE FP-VS-POINTS RULE (BIG_SCORE — STRICT) ═══

The number that anchors a big_score line is the ANCHOR'S FANTASY POINTS — anchor.topReason.label (e.g. "65.3 FP"). This number is the WEAPON.

  - anchor.topReason is FANTASY POINTS. Render it as "FP" — "65.3 FP", "238 FP". NEVER as "POINTS", "PTS", "points scored", or any phrasing that suggests game points.
  - statLine.pts (e.g. 42) is the player's GAME points — a real-world stat from the actual NBA game. It is context, NOT the anchor number. NEVER make statLine.pts the headline number. NEVER label anchor.topReason's value as if it were statLine.pts.
  - If the line carries a number, that number comes from anchor.topReason and is labeled "FP". One number per line is the ceiling — no slash-separated stat dumps.

This rule exists because the model has previously conflated the two — writing "YOU HELD CURRY AT 65 POINTS" from a 65.3 FP topReason while statLine pts was 42. The number was right; the label was a category error. Do not repeat it.

THE REGISTER: confident-challenge. The user delivered. The line dares the recipient to match. Tones to hit: "good luck," "beat it," "your turn," "safe?" / "now what?" The held star is named as the engine; the FP figure is the receipt.

GOLD-STANDARD EXAMPLES (big_score) — match these:
  - "YOU HELD CURRY AT 65.3 FP. BEAT IT."
  - "65.3 FP FROM ONE MAN. GOOD LUCK."

What makes these work:
  - The FP figure (when used) is named "FP," not "POINTS." It is the weapon.
  - The held star is named as the talent that delivered (Rule 2 — naming, not blaming; here the player is the talent, not the cause). "Held CURRY AT 65.3 FP" frames the player as having LIT UP the hand.
  - The dare clause ("BEAT IT," "GOOD LUCK," "SAFE?") puts the line back on the recipient — argument, not recap.
  - Brevity is the surface. The line is short enough to land as a banner.

ANTI-PATTERNS for big_score — do NOT write these:
  - "YOU HELD CURRY AT 65 POINTS." — category error. anchor.topReason was FP, not game points. The label "POINTS" is the violation; "FP" is the only label that may render anchor.topReason.
  - "CURRY DROPPED 42 ON YOUR HAND." — using statLine.pts as the number. statLine is context; the FP figure is the anchor.
  - "CURRY GOES OFF FOR 42/5/7 IN A WARRIORS WIN." — NBA recap framing; the held FP is invisible; the box score is leading.
  - "STEPH WAS UNSTOPPABLE." — generic; no FP figure, no dare, no recipient. A culture-entry sentence, not a challenge headline.
  - Any "{player} vs {team}" / "{player} at {city}" / "{player} in {arena}" framing — game-identity color the headline surface withholds.

═══ FORMAT + INHERITED CONSTRAINTS ═══

OVERRIDE — STRUCTURE: One to two clauses. Setup + editorial twist, OR a single confident assertion. Headline register, not paragraph register.

OVERRIDE — LENGTH: 60–110 characters target, 160 hard ceiling. Brevity is the surface.

OVERRIDE — OUTPUT FORMAT: Return ONE plain string. No JSON. No quotes around it. No "Headline:" prefix. No leading bullet or dash. Just the line itself.

RENDER ONLY PROVIDED FACTS: The CommentaryFacts object handed to you is the ENTIRETY of what you may name. If a fact is not in the object, it does not exist for purposes of this line. NEVER invent stats, opponents, awards, venues, teammates, dates, game contexts ("Game 1," "Game 7," "the playoffs," "the Finals," "regular-season"), or franchise lore.

ANTI-ANACHRONISM: The game is from season {season}. NEVER reference a venue name, an arena nickname, a stadium-evocative phrase ("the Garden," "the Madhouse," "the Capital," "the Forum," "the Palace," "Oracle," "Chase Center," "Crypto.com Arena," "STAPLES Center," "American Airlines Arena," "Kaseya Center," "MSG," any place-evocative phrasing that reads as a venue), roster member, team affiliation, award, record, or franchise fact that postdates the season of play. The venue rule is ABSOLUTE — the venue field is intentionally absent from CommentaryFacts in v1. The training set skews modern; a 2009 Heat game must not gain a 2024 arena, a future title ("the 2012 ring"), or a teammate who hadn't been drafted yet. Lean on the stat line and the held players' image — never the year-of-prompt-training detail you can't see in facts.

REGISTER: A confident sportswriter's line about THIS hand. Not a culture-entry paragraph. Not a tweet caption. Not a generic dare. The bar to clear: would this land on a page-A sports-section banner as an argument the reader has to respond to?`;

// ── User-prompt assembly ───────────────────────────────────────────────────
// Format CommentaryFacts into the USER message. The structure is plain
// labeled key:value lines, NOT JSON — model adherence is better when the
// facts read as a brief. The verdict + season are repeated near the top
// so the obey-verdict and anti-anachronism rules fire on the first pass.

function formatStatLine(statLine: Record<string, number | string> | undefined): string {
  if (!statLine) return "";
  const order = ["pts", "reb", "ast", "stl", "blk", "to", "threes", "min"];
  const parts: string[] = [];
  for (const k of order) {
    const v = statLine[k];
    if (v == null) continue;
    parts.push(`${v} ${k}`);
  }
  // Tail any remaining keys we didn't enumerate, in input order.
  for (const [k, v] of Object.entries(statLine)) {
    if (order.includes(k)) continue;
    if (v == null) continue;
    parts.push(`${v} ${k}`);
  }
  return parts.join(", ");
}

export function buildUserPrompt(facts: CommentaryFacts): string {
  const lines: string[] = [];
  lines.push(`SURFACE: ${facts.surface}`);
  lines.push(`SPORT: ${facts.sport}`);
  lines.push(`SEASON: ${facts.season}`);
  lines.push(`TRIGGER: ${facts.trigger}`);
  lines.push(`VERDICT: ${facts.verdict}`);
  if (facts.winTier) lines.push(`WIN_TIER: ${facts.winTier}`);
  lines.push("");

  // Phase 3.3 input-policy boundary (lock: docs/challenge-landing-v2-
  // phase3.3-headline-subject-is-the-hand-lock.md, §"Rule 1 —
  // Surface-specific input policy"). On the CHALLENGE HEADLINE surface,
  // game-identity fields (opponent / homeAway / date) are WITHHELD —
  // the prompt's Rule 1 promises the model it will not see them, and
  // that promise is enforced here. The full CommentaryFacts shape stays
  // intact for the future commentary surface (which keeps game context
  // as permitted color). This is the only place the headline path
  // differs from the commentary path in what reaches the model.
  const isHeadlineSurface = facts.surface === "challenge_headline";

  if (facts.anchor) {
    const a = facts.anchor;
    lines.push("ANCHOR:");
    lines.push(`  name: ${a.name}`);
    lines.push(`  team: ${a.team}`);
    lines.push(`  tier: ${a.tier}`);
    if (!isHeadlineSurface) {
      if (a.opponent) lines.push(`  opponent: ${a.opponent}`);
      if (a.homeAway) lines.push(`  home_away: ${a.homeAway}`);
      if (a.date) lines.push(`  date: ${a.date}`);
    }
    if (a.nicknames.length > 0) lines.push(`  nicknames: ${a.nicknames.join(", ")}`);
    if (a.knownFor) lines.push(`  knownFor: ${a.knownFor}`);
    const stats = formatStatLine(a.statLine);
    if (stats) lines.push(`  statLine: ${stats}`);
    if (a.topReason) lines.push(`  topReason: ${a.topReason.label} (${a.topReason.category}=${a.topReason.value})`);
  } else {
    lines.push("ANCHOR: (none — no anchor on this hand)");
  }
  if (facts.nearMissGap != null || facts.nearMissNextTier) {
    lines.push("");
    if (facts.nearMissGap != null) lines.push(`NEAR_MISS_GAP_FP: ${facts.nearMissGap}`);
    if (facts.nearMissNextTier) lines.push(`NEAR_MISS_NEXT_TIER: ${facts.nearMissNextTier}`);
  }
  lines.push("");
  lines.push(`Write the headline. ONE line. Plain string. No quotes, no prefix.`);
  return lines.join("\n");
}

// ── Public entry point ────────────────────────────────────────────────────

/** Assembles the {system, user} pair routeCommentary expects. system =
 *  the inherited per-sport voice segments + the headline instruction
 *  layer (with {season} substituted). user = the formatted facts brief.
 *
 *  Caller (api/headline.ts) passes the returned strings into
 *  routeCommentary(system, user, tier, config). VOICE_CONTRACT itself
 *  knows nothing about routing, models, or validation. */
export function buildVoiceContract(facts: CommentaryFacts): {
  system: string;
  user: string;
} {
  const seg = pickSegments(facts.sport);
  const headlineLayer = HEADLINE_INSTRUCTION_LAYER.replace(/\{season\}/g, facts.season);
  const system = [
    seg.register,
    seg.factualAccuracy,
    seg.trademark,
    seg.personalLife,
    seg.goldStandard,
    headlineLayer,
  ].join("\n\n");
  const user = buildUserPrompt(facts);
  return { system, user };
}
