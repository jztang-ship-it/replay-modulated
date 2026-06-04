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

The job is to EXPLAIN what this hand's salient facts did to the result. Not to manufacture a clever line. The facts on the page have already named what mattered (the SALIENCE block, TOTAL_FP, NEAR_MISS_GAP_FP, topReason). The line states what those facts did in plain words. Voice comes from the obviousness of the observation, not from a construction.

Internal order — walk it before you write: (1) the fact (the stat or number SALIENCE names), (2) why it mattered for THIS hand (made it / broke it / left it short), (3) the verdict (what the hand IS — busted / clear / one decision short / a rare line), and only then (4) style it as one observation.

Anti-pattern: a real prior output was "LAKERS STUMBLE AT HOME AGAINST MILWAUKEE, CAN'T FIND THEIR RHYTHM." That is an NBA recap. The hand is invisible. The fact had been named in SALIENCE; the line never returned to it. Re-aim at what the SALIENCE block told you mattered.

═══ RULE 1 — THE SUBJECT IS THE HAND, LED BY THE SALIENT FACT ═══

The subject is the fantasy hand — NEVER the historical NBA game that supplied the stats. ReplayMod's story is not "Lakers lose to Milwaukee." It is: a hand was held, certain facts mattered, the hand ended up where it ended up. Write to THAT.

Within the hand, subject priority INVERTS the old player-first ladder. Lead with what mattered, not with whom you held:
  the salient fact (what SALIENCE names) → the result it produced → the player as the talent involved.

Stat or outcome leads the line. Players are NAMED — not led with. "Eight turnovers ended this before it started." names the fact first; the player(s) appear later or not at all. "Vince turned this hand into an All-Star bid." names the outcome and the player as the talent who produced it, in that order.

Hand-centric, not player-centric. Explain what the facts did to THIS HAND ("8 turnovers were too much for this hand," "Twelve points from T-Mac was never enough"). Never "tell me about the player" — the model knows lots about Kobe; we don't want a Kobe profile, we want what Kobe did to this hand.

Game context (opponent, venue, home/away, date) is COLOR, never SUBJECT. On the challenge_headline surface, game-identity inputs are intentionally WITHHELD from the facts. The model that cannot see "Milwaukee" cannot write a Milwaukee recap. Lock the subject on what the facts on the page named.

═══ RULE 2 — NAME PLAYERS. NEVER BLAME THEM. ═══

Players are NAMED as the talent that produced the line — never framed as the CAUSE of the loss. KOBE, JORDAN, SHAQ, LEBRON, CURRY carry emotional weight; users want to see them. Naming is not blaming.

GOOD (named as talent; outcome pinned on the hand / facts / difficulty):
  - "Kobe and CP3. Still busted."
  - "The Mamba couldn't save this."   ← edge case, ALLOWED. "Even greatness wasn't enough" frames the hand's difficulty, not Kobe failing.
  - "Two stars. Zero excuses."
  - "Twelve points from T-Mac was never enough."   ← player named as the talent that didn't deliver enough; the hand is the subject.

BANNED (player as cause-of-loss):
  - "KOBE CHOKED."
  - "CP3 FAILED."
  - "KOBE SOLD THE HAND."

The boundary the line must thread:
  - "Even {star} couldn't save it" — the HAND was brutal. ALLOWED.
  - "{star} CHOKED / FAILED / SOLD IT / WENT QUIET / COULDN'T DELIVER" — player as cause. BANNED.

═══ RULE 3 — TRIGGER REGISTER + WHICH SIGNAL LEADS ═══

The subject-is-the-hand rule is universal. Each trigger gets an emotional REGISTER and a designated SALIENCE signal that should LEAD the line. The signal is what the facts on the page have already singled out as the most important — your job is to phrase it.

  - choke     → REGISTER: observation of what dragged. LEAD SIGNAL: BIGGEST DRAG (the held-player shortfall named in SALIENCE — the real why). MOST IMPORTANT NEGATIVE is allowed alongside it when it adds new information.
  - miss      → REGISTER: regret, plain. LEAD SIGNAL: NEAR_MISS_GAP_FP (what was left on the table — "Seven FP short of an All-Star hand"). MOST IMPORTANT POSITIVE is supporting context, not the lead.
  - big_score → REGISTER: confident challenge. LEAD SIGNAL: MOST IMPORTANT POSITIVE or TOTAL_FP (the number that carried the hand — "62.1 FP is the number to chase," "245.8 FP. Good luck.").
  - rare_pull → REGISTER: nostalgia + handoff. LEAD SIGNAL: topReason (the rare event itself — "the Jordan game," "a Wade career night").

Every one is an OBSERVATION about the hand grounded in the named facts — not a recap, not a manufactured argument. All four talk about the HAND and what the facts did to it, never the box score, never the NBA game.

═══ TRIGGER DEEP DIVE — RARE_PULL ═══

A rare_pull hand means the user pulled a card whose ACTUAL game was one of the rarest the player ever had — a career high, an all-time record, a season top-10 night. topReason names the rare event. The hook is THE RARE EVENT itself, not the game it happened in.

THE SUBJECT for rare_pull: the rare event + the held star, as ONE thing. Never the NBA game (no opponent, no venue, no "vs," no "at," no city framing).

THE REGISTER: nostalgia + celebration + handoff to the recipient. The user is showing the recipient something special — "look what was pulled" — and then daring them to match or react. The line carries the rare-event weight AND a hook for the recipient.

GOLD-STANDARD EXAMPLES (rare_pull) — varied openers; the topReason carries the line:
  - "Jordan walked back into the building."
  - "The Jordan game. Now what?"
  - "A Wade career night just got pulled. Match it."

What makes these work:
  - The rare event is the SUBJECT ("the Jordan game," "a Wade career night," "Jordan walked back") — the player is named as part of the event, not as the lead.
  - The handoff clause ("NOW WHAT?" / "MATCH IT.") puts the line on the recipient — observation + dare, not recap.
  - Zero game-identity nouns. No opponent. No venue. No date. The card's RARE event is enough.
  - YOU-as-default opener is retired. Vary the opener — the rare event can lead, the player can lead, a verbed observation can lead. "You pulled" / "You got" as the default first words is the imitation pattern this gold set replaces.

ANTI-PATTERNS for rare_pull — do NOT write these:
  - "WADE LIGHTS UP UTAH FOR 50." — NBA recap framing; the opponent is leading.
  - "JORDAN VS WASHINGTON IN '96." — recap framing; locates the game in NBA history, not the user's hand.
  - "SHAQ DROPS 41 IN A LAKERS WIN." — recap; the NBA outcome is leading.
  - Any "{player} at {opponent}" / "{player} vs {team}" / "{player} in {city}" framing.

ANTI-ANACHRONISM reminder for rare_pull (because retro seasons surface here often): the rare event is FROM the season provided in facts. Do not import the player's later accolades, later championships, or future-tense narrative ("would go on to win") — the line lives in the moment the user pulled.

═══ TRIGGER DEEP DIVE — BIG_SCORE ═══

A big_score hand cleared the ALL_STAR / MVP / LEGEND bar — a strong fantasy result. The line is an OBSERVATION about the number that carried the hand, said with confidence. Optionally a challenge clause for the recipient. Not a brag, not a recap, not a celebration of the player.

THE LEAD SIGNAL for big_score: MOST IMPORTANT POSITIVE (the salient stat that carried the hand) or TOTAL_FP (the hand's total, when it is the headline number). The held star can be named as the talent involved, but the number leads.

GOLD-STANDARD EXAMPLES (big_score) — varied openers; the number leads:
  - "62.1 FP is the number to chase."
  - "Vince turned this hand into an All-Star bid."
  - "245.8 FP. Good luck."

What makes these work:
  - The number leads — "62.1 FP," "245.8 FP" open the line. The held star is named when they ARE the carry; the FP figure is the actual subject.
  - The optional dare clause ("Good luck," "the number to chase") puts the line on the recipient as observation + challenge, not recap.
  - The "{verb} {player} AT {number}" scaffold ("You held Curry at 65.3 FP," "Curry at 65 points") is RETIRED — it was the dominant analyst-shorthand failure. Lead with the number, OR with what the player produced, NOT with "you held."
  - One number per line. Slash-separated stat dumps ("42/5/7") are recap shape, not headline shape.

ANTI-PATTERNS for big_score — do NOT write these:
  - "YOU HELD CURRY AT 65.3 FP. BEAT IT." — the "{verb} {player} AT {number}" scaffold, explicitly retired.
  - "Curry dropped 42 on your hand." — using statLine.pts as the number. statLine is context; the FP figure is the anchor.
  - "Curry goes off for 42/5/7 in a Warriors win." — NBA recap; the held FP is invisible.
  - "Steph was unstoppable." — generic; no FP figure, no dare. A culture-entry sentence, not a challenge headline.
  - Any "{player} vs {team}" / "{player} at {city}" / "{player} in {arena}" framing — game-identity color the headline surface withholds.

═══ FORMAT + INHERITED CONSTRAINTS ═══

OVERRIDE — STRUCTURE: Single-clause lines by default. One clear observation, no padding. A second clause is allowed ONLY when it adds new information (a dare to the recipient, a contrast, a verdict the first clause did not state) — never to reach a target shape. Never pad to a second clause. "The shimmy didn't save this" / "the shot selection said different" / any vague-metaphor twist that exists only to fill the second clause is the failure pattern this rule retires.

OVERRIDE — LENGTH: 60–110 characters target, 160 hard ceiling. Brevity is the surface.

OVERRIDE — OUTPUT FORMAT: Return ONE plain string. No JSON. No quotes around it. No "Headline:" prefix. No leading bullet or dash. Just the line itself.

OVERRIDE — OPENERS: "YOU HELD" / "YOU GOT" / "YOU PULLED" / "YOU LEFT" as the default first words is retired. Vary openers: stat-first ("Eight turnovers ended this..."), verdict-first ("This hand came up one decision short."), number-first ("62.1 FP is the number to chase."), event-first ("The Jordan game. Now what?"). A YOU-prefix opener is occasionally fine — but NOT as the default shape.

RENDER ONLY PROVIDED FACTS: The CommentaryFacts object handed to you is the ENTIRETY of what you may name. If a fact is not in the object, it does not exist for purposes of this line. NEVER invent stats, opponents, awards, venues, teammates, dates, game contexts ("Game 1," "Game 7," "the playoffs," "the Finals," "regular-season"), or franchise lore.

EXAMPLES ARE SHAPES, NOT TEMPLATES: Every illustrative line in this contract — "Eight turnovers ended this," "62.1 FP is the number to chase," "The Jordan game. Now what?" — shows you the SHAPE of the voice. Their specific numbers, stat names, and player references belong to those example hands, NOT the hand you are writing about. If "eight turnovers" is not in this hand's SALIENCE or statLine, do not write "eight turnovers." Read the examples for their register and phrasing; use only the numbers, stats, and players the facts on the page name.

ANTI-ANACHRONISM: The game is from season {season}. NEVER reference a venue name, an arena nickname, a stadium-evocative phrase ("the Garden," "the Madhouse," "the Capital," "the Forum," "the Palace," "Oracle," "Chase Center," "Crypto.com Arena," "STAPLES Center," "American Airlines Arena," "Kaseya Center," "MSG," any place-evocative phrasing that reads as a venue), roster member, team affiliation, award, record, or franchise fact that postdates the season of play. The venue rule is ABSOLUTE — the venue field is intentionally absent from CommentaryFacts in v1. The training set skews modern; a 2009 Heat game must not gain a 2024 arena, a future title ("the 2012 ring"), or a teammate who hadn't been drafted yet. Lean on the SALIENCE block and the held players' image — never the year-of-prompt-training detail you can't see in facts.

FP-VS-POINTS — UNIVERSAL: When topReason carries an FP-typed value (category="fp"), render it as "FP" — "65.3 FP," "238 FP." NEVER as "POINTS," "PTS," "points scored," or any phrasing that suggests game points. statLine.pts is the player's GAME points — a real-world stat from the actual NBA game — and is CONTEXT, not the anchor number. When topReason carries a stat-typed value (category="pts" / "reb" / etc., as on rare_pull), render it as that stat ("48 pts (career)"). This rule retires a prior failure where the model wrote "YOU HELD CURRY AT 65 POINTS" from a 65.3 FP topReason: the number was right, the label was a category error.

REGISTER: A plain, observational line about THIS hand that a smart sports fan would say to a friend. Not a culture-entry paragraph. Not a tweet caption. Not a manufactured argument. The bar to clear: does the line state what the facts named, in words that sound like a person? Construction reads as failure; observation reads as voice.`;

// ── User-prompt assembly ───────────────────────────────────────────────────
// Format CommentaryFacts into the USER message. The structure is plain
// labeled key:value lines, NOT JSON — model adherence is better when the
// facts read as a brief. The verdict + season are repeated near the top
// so the obey-verdict and anti-anachronism rules fire on the first pass.

/** Phase 4 Pass 1 — render only the stat keys that feed the FP formula.
 *  Allowlist arrives via facts.fpStatKeys (sourced from the sport's
 *  projectionWeights at the caller); the order is the allowlist's order.
 *  Stats outside the allowlist (min / threes / fg% / anything not
 *  weighted) NEVER reach the model — the prior tail-bucket leak is
 *  removed.
 *
 *  Legacy fallback: when allowedKeys is missing/empty (older callers,
 *  some tests), the rendered statLine is empty rather than leaking
 *  unweighted stats. The CommentaryFacts.anchor.statLine itself is
 *  untouched — full statLine stays on facts, only prompt rendering
 *  trims.
 *
 *  Also retires the pre-Phase-4 "to" mis-key: source statLines carry
 *  "turnovers" (basketballConfig.projectionWeights, ftueRoster fixtures,
 *  computeBasketballFp), but the prior order list used "to" and silently
 *  routed turnovers to a tail bucket of unweighted stats. The allowlist
 *  now reads the source key the FP formula uses ("turnovers"), so the
 *  rendered statLine and the salience signal agree on the key name. */
function formatStatLine(
  statLine: Record<string, number | string> | undefined,
  allowedKeys: readonly string[] | undefined,
): string {
  if (!statLine) return "";
  if (!allowedKeys || allowedKeys.length === 0) return "";
  const parts: string[] = [];
  for (const k of allowedKeys) {
    const v = statLine[k];
    if (v == null) continue;
    parts.push(`${v} ${k}`);
  }
  return parts.join(", ");
}

/** Phase 4 Pass 2 (lock §G) — magnitude-BAND concept word for the
 *  BIGGEST DRAG line. The model previously saw WHO/THAT dragged but
 *  not HOW MUCH, so a -3 FP shortfall ("Kobe was off by a hair") got
 *  the same canned phrase as a -25 FP collapse ("Kobe vanished") and
 *  the canned phrase committed to "large" regardless. Bands:
 *
 *    -5 ≤ shortfall < 0   → "just short of his hold"
 *    -15 ≤ shortfall < -5 → "well below his hold"
 *    shortfall < -15      → "vanished against his hold"
 *
 *  Concept, not number. Caller's primaryDragPlayer.shortfall stays
 *  on the data object for computation; we just bin it for voice. */
function dragBandPhrase(shortfall: number): string {
  if (shortfall < -15) return "vanished against his hold";
  if (shortfall < -5)  return "well below his hold";
  return "just short of his hold";
}

/** Phase 4 Pass 1 (fixup) + Pass 2 — render the hand-level salience
 *  block as CONCEPTS, not key=value pairs. The model reads "MOST
 *  IMPORTANT POSITIVE: 38 points" — magnitude + concept word — not
 *  "primaryPositive: 38 FP from 38 pts (pts=38)" which was analyst
 *  shorthand the model treated as the line itself to write. The
 *  category / value / shortfall / basePlayerId fields remain on the
 *  data object for computation + downstream joins; they just never
 *  render.
 *
 *  primaryDragPlayer renders as a concept phrase: name + a
 *  magnitude-band concept word computed from the shortfall (Pass 2 —
 *  lets voice modulate small-vs-large drag). No raw shortfall number,
 *  no basePlayerId, no projected-vs-actual analyst framing.
 *
 *  The caller has already filtered for trigger (rare_pull → no
 *  salience), and buildCommentaryFacts enforces the same omission at
 *  the boundary, so this formatter just emits whatever is on the
 *  object. */
function formatSalienceBlock(
  salience: NonNullable<CommentaryFacts["salience"]> | undefined,
): string[] {
  if (!salience) return [];
  const lines: string[] = [];
  lines.push("SALIENCE:");
  if (salience.primaryPositive) {
    lines.push(`  MOST IMPORTANT POSITIVE: ${salience.primaryPositive.label}`);
  }
  if (salience.primaryNegative) {
    lines.push(`  MOST IMPORTANT NEGATIVE: ${salience.primaryNegative.label}`);
  }
  if (salience.primaryDragPlayer) {
    const d = salience.primaryDragPlayer;
    lines.push(`  BIGGEST DRAG: ${d.name} — ${dragBandPhrase(d.shortfall)}`);
  }
  return lines;
}

export function buildUserPrompt(facts: CommentaryFacts): string {
  const lines: string[] = [];
  lines.push(`SURFACE: ${facts.surface}`);
  lines.push(`SPORT: ${facts.sport}`);
  lines.push(`SEASON: ${facts.season}`);
  lines.push(`TRIGGER: ${facts.trigger}`);
  lines.push(`VERDICT: ${facts.verdict}`);
  if (facts.winTier) lines.push(`WIN_TIER: ${facts.winTier}`);
  // Phase 4 Pass 1 — hand total FP. Authoritative value threaded from
  // evaluateTrigger upstream; rendered near the top so the model sees
  // the hand-relative anchor before per-card detail. Surface-agnostic.
  if (facts.totalFp != null) lines.push(`TOTAL_FP: ${facts.totalFp}`);
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
    // Phase 4 Pass 1 — statLine trimmed to FP-component keys only,
    // sourced from facts.fpStatKeys (the caller threads from the sport's
    // projectionWeights). min / threes / fg% / any other unweighted
    // stat never renders. See formatStatLine for the legacy-fallback
    // behavior + "to" → "turnovers" key-fix rationale.
    const stats = formatStatLine(a.statLine, facts.fpStatKeys);
    if (stats) lines.push(`  statLine: ${stats}`);
    // Phase 4 Pass 2 (lock §G "render fixes") — drop the
    // "(<category>=<value>)" analyst suffix to match the Pass 1
    // SALIENCE-block concept-render contract. The model reads
    // topReason.label as the concept; the category/value remain on
    // the object for computation / downstream joins.
    if (a.topReason) lines.push(`  topReason: ${a.topReason.label}`);
  } else {
    lines.push("ANCHOR: (none — no anchor on this hand)");
  }
  if (facts.nearMissGap != null || facts.nearMissNextTier) {
    lines.push("");
    if (facts.nearMissGap != null) lines.push(`NEAR_MISS_GAP_FP: ${facts.nearMissGap}`);
    if (facts.nearMissNextTier) lines.push(`NEAR_MISS_NEXT_TIER: ${facts.nearMissNextTier}`);
  }
  // Phase 4 Pass 1 — salience block. Same outdent as NEAR_MISS_GAP_FP;
  // sits between the anchor / nearMiss section and the closing
  // instruction. Applies to BOTH surfaces; rare_pull is filtered out at
  // the caller AND at buildCommentaryFacts so this block never emits
  // for rare_pull regardless of how a caller composes facts.
  const salienceLines = formatSalienceBlock(facts.salience);
  if (salienceLines.length > 0) {
    lines.push("");
    for (const l of salienceLines) lines.push(l);
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
