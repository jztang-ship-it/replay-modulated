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
  - big_score  → CHALLENGE     e.g. "JOHN THINKS THIS HAND IS SAFE." / "238.7 FP. GOOD LUCK."
  - rare_pull  → NOSTALGIA     e.g. "JORDAN WALKED BACK INTO THE BUILDING." / "YOU GOT THE JORDAN GAME. NOW WHAT?"

Every one is an ARGUMENT, not a recap. All four talk about the HAND / PLAYERS / DECISION / OUTCOME — never the box score, never the NBA game.

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
