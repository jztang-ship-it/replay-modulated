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
} from "./voice/basketballVoice";
// Phase 3 step 2: pure-types module ONLY. Importing from
// ./commentaryFacts would transitively load selectCommentary →
// playerCulture which tsc traverses across the api/ boundary even with
// `import type`. The runtime builder stays where it is.
import type { CommentaryFacts } from "./commentaryFactsTypes";

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
// Per the lock §B "VOICE_CONTRACT — the rules module (extends the existing
// Chad spec)." Overrides the inherited STRUCTURE + LENGTH rules (which
// were sized for culture-entry prose) and the JSON output format. Adds
// the four Phase-3-specific rules: render-only-provided-facts, obey-
// verdict, anti-anachronism, ESPN/newspaper-headline register.
//
// Tokens substituted at compose time:
//   {season}    — the season of play (e.g. "0809" → 2008-09). Drives
//                 the anti-anachronism guard.
// Other tokens are filled by the USER prompt, not this SYSTEM prompt.

const HEADLINE_INSTRUCTION_LAYER = `═══ SURFACE: CHALLENGE HEADLINE — OVERRIDES + ADDITIONS ═══

This is NOT a culture entry. This is the headline that opens the challenge accept page — one sentence about THAT player and THAT night that reads like an ESPN / newspaper headline.

OVERRIDE — STRUCTURE: One to two clauses. Setup + editorial twist, OR a single confident assertion. Headline register, not paragraph register.

OVERRIDE — LENGTH: 60–110 characters target, 160 hard ceiling. Brevity is the surface.

OVERRIDE — OUTPUT FORMAT: Return ONE plain string. No JSON. No quotes around it. No "Headline:" prefix. No leading bullet or dash. Just the line itself.

ADDITIONAL RULE — RENDER ONLY PROVIDED FACTS: The CommentaryFacts object handed to you is the ENTIRETY of what you may name. If a fact is not in the object, it does not exist for purposes of this line. NEVER invent stats, opponents, awards, venues, teammates, dates, or franchise lore. If you want to reference an opponent and one isn't in the facts, find another angle.

ADDITIONAL RULE — OBEY THE VERDICT: The facts carry a "verdict" field with one of three values. It is binding. The code already determined the honest truth of the hand — do not contradict.
  - "credited" — The anchor delivered AND at least one other held card tanked. The anchor is the hero. The line vindicates the anchor; the indictment lands on the rest of the hand.
  - "blamed" — The anchor itself tanked. The line indicts the anchor. No hedging, no third-party blame.
  - "neutral" — Mid-zone outcome (neither clearly delivered nor clearly tanked) OR no clear hero/villain available. Name NO hero. Name NO villain. The line lives ON THE HAND or THE STAKES, not on any player as cause of the outcome. This is the most disciplined of the three — when in doubt, this is the safe register; never reach for a hero/villain frame to make the line punchier.

ADDITIONAL RULE — ANTI-ANACHRONISM (critical for retro seasons): The game is from season {season}. NEVER reference a venue name, roster member, team affiliation, award, record, or franchise fact that postdates the season of play. The training set skews modern — a 2009 Heat game must not gain a 2024 arena ("Kaseya Center"), a future title ("the 2012 ring"), or a teammate who hadn't been drafted yet. If the season's specifics aren't in your provided facts, do not reach for them from memory; lean on the stat line and the anchor's image instead.

ADDITIONAL RULE — REGISTER (ESPN / newspaper headline): A confident sportswriter's line about that player and that night. Not a culture-entry paragraph. Not a tweet caption. Not a generic dare. The bar to clear: would this land on the page-A sports-section banner?`;

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
  if (facts.anchor) {
    const a = facts.anchor;
    lines.push("ANCHOR:");
    lines.push(`  name: ${a.name}`);
    lines.push(`  team: ${a.team}`);
    lines.push(`  tier: ${a.tier}`);
    if (a.opponent) lines.push(`  opponent: ${a.opponent}`);
    if (a.homeAway) lines.push(`  home_away: ${a.homeAway}`);
    if (a.date) lines.push(`  date: ${a.date}`);
    if (a.nicknames.length > 0) lines.push(`  nicknames: ${a.nicknames.join(", ")}`);
    if (a.knownFor) lines.push(`  knownFor: ${a.knownFor}`);
    const stats = formatStatLine(a.statLine);
    if (stats) lines.push(`  statLine: ${stats}`);
    if (a.topReason) lines.push(`  topReason: ${a.topReason.label} (${a.topReason.category}=${a.topReason.value})`);
  } else {
    lines.push("ANCHOR: (none — no honest hero/villain on this hand)");
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
