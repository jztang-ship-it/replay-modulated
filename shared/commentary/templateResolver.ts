/**
 * templateResolver.ts — Resolves template tokens and injects supporting details.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { TemplateData, DetailId, RecordEvent } from "./types";
import type { CommentaryInput, CommentaryRosterCard } from "./types";
import { describeExtremes } from "../utils/extremeGames";
import { getHighestBadge } from "./badgeTiers";

// ─── Helpers ────────────────────────────────────────────────────────────────

function lastName(n: string): string {
  const parts = n.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? n;
}

function statN(c: CommentaryRosterCard, key: string): number {
  const s = c.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

const CITY: Record<string, string> = {
  ATL:"Atlanta",BOS:"Boston",BKN:"Brooklyn",CHA:"Charlotte",CHI:"Chicago",
  CLE:"Cleveland",DAL:"Dallas",DEN:"Denver",DET:"Detroit",GSW:"Golden State",
  HOU:"Houston",IND:"Indiana",LAC:"LA",LAL:"LA",MEM:"Memphis",MIA:"Miami",
  MIL:"Milwaukee",MIN:"Minnesota",NOP:"New Orleans",NYK:"New York",OKC:"OKC",
  ORL:"Orlando",PHI:"Philly",PHX:"Phoenix",POR:"Portland",SAC:"Sacramento",
  SAS:"San Antonio",TOR:"Toronto",UTA:"Utah",WAS:"Washington",
};

function oppPhrase(c: CommentaryRosterCard): string {
  const city = CITY[c.opponent?.toUpperCase() ?? ""] ?? c.opponent ?? "";
  if (!city) return "";
  return c.homeAway === "A" ? ` in ${city}` : ` against ${city}`;
}

// Stat categories with measurable units. Categories NOT in this map (e.g.
// "fifty_plus_game", "five_by_five", "td_30_20_20") are flag-style markers
// with value:1 — never render them as "1 fifty_plus_game".
const STAT_UNITS: Record<string, string> = {
  // basketball
  pts: "pts", reb: "reb", ast: "ast", threes: "threes", stl: "stl", blk: "blk",
  // baseball
  hr: "HR", h: "hits", rbi: "RBI", k: "K", sb: "SB", ip: "IP", bb: "BB", r: "R",
};

// Human-readable phrasing of a stat category for inline use in templates
// (e.g. "{topCategory}" → "scoring"). Flag categories map to "" so any
// template referencing them degrades cleanly.
const CATEGORY_READABLE: Record<string, string> = {
  pts: "scoring",
  reb: "rebounding",
  ast: "playmaking",
  stl: "steals",
  blk: "blocks",
  threes: "three-point shooting",
  hr: "home run",
  h: "hits",
  rbi: "RBI",
  k: "strikeout",
  sb: "stolen base",
  ip: "innings pitched",
  bb: "walks",
  r: "runs",
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Pick the stat-typed reason from allReasons (fall back to primaryReason).
 *  Avoids surfacing flag categories like "fifty_plus_game" as headlines. */
function pickStatReason(topGame: NonNullable<CommentaryInput["topGame"]>) {
  const all = topGame.allReasons?.length
    ? topGame.allReasons
    : (topGame.primaryReason ? [topGame.primaryReason] : []);
  return all.find(r => r.category in STAT_UNITS) ?? topGame.primaryReason ?? null;
}

function formatTopStat(topGame: NonNullable<CommentaryInput["topGame"]>, _star: CommentaryRosterCard | null): string {
  const r = pickStatReason(topGame);
  if (!r) return "";
  const unit = STAT_UNITS[r.category];
  if (!unit) return ""; // all reasons were flag categories — skip
  return `${r.value} ${unit}`;
}

// ─── Build template data ────────────────────────────────────────────────────

export function buildTemplateData(
  star: CommentaryRosterCard | null,
  input: CommentaryInput,
  recordEvents: RecordEvent[],
  culture: { nicknames?: string[] } | null,
  costar: CommentaryRosterCard | null = null,
): TemplateData {
  const name = star?.name ?? "The roster";
  const last = star ? lastName(star.name) : "the roster";
  const first = star ? star.name.trim().split(/\s+/)[0] : "the roster";
  const nick = culture?.nicknames?.[0] ?? last;
  const nick2 = culture?.nicknames?.[1] ?? nick;
  const opp = star ? oppPhrase(star) : "";
  const rec = recordEvents[0];

  // Find the most extreme game in the hand for commentary focus
  const extremeCard = input.roster
    .filter(c => (c.extremeFlags?.length ?? 0) > 0)
    .sort((a, b) => (b.extremeFlags![0]?.priority ?? 0) - (a.extremeFlags![0]?.priority ?? 0))[0];
  const extremeDescription = extremeCard
    ? describeExtremes(extremeCard.extremeFlags!, extremeCard.name)
    : "";

  // Resolve the star's highest badge for commentary focus.
  //
  // Several badge labels in badgeTiers.ts hardcode the badge's THRESHOLD
  // (e.g. BEAST = "15-rebound game") rather than the actual stat the player
  // posted. A 16-rebound game triggers BEAST and the snippet read "15-
  // rebound game on the side" while the card back showed "16 REB" — the
  // user's exact mismatch report. Format these single-stat threshold badges
  // dynamically with the player's actual stat so commentary and card back
  // agree. Multi-stat badges (triple double, 5x5) and qualitative ones
  // (double-digit boards, rim protection) stay as-is — their labels don't
  // make a stat claim.
  const STAT_BADGE_FORMAT: Record<string, { stat: string; unit: string }> = {
    GOD_MODE: { stat: "pts", unit: "point" },
    FIRE:     { stat: "pts", unit: "point" },
    BUCKET:   { stat: "pts", unit: "point" },
    BEAST:    { stat: "reb", unit: "rebound" },
    WIZARD:   { stat: "ast", unit: "assist" },
    THIEF:    { stat: "stl", unit: "steal" },
    SWAT:     { stat: "blk", unit: "block" },
  };
  const starBadgeIds = (star?.achievements ?? []).map(a => a.id);
  const highestBadge = getHighestBadge(starBadgeIds);
  const badgeFormat = highestBadge?.id ? STAT_BADGE_FORMAT[highestBadge.id] : null;
  const badgeLabel = (badgeFormat && star)
    ? `${Math.round(statN(star, badgeFormat.stat))}-${badgeFormat.unit} game`
    : (highestBadge?.commentaryLabel ?? "");

  // Compute topStat: the star's stat with the highest FP contribution.
  // Previously picked by raw value, which surfaced "12 pts" over "15 ast"
  // even though 15 ast (22.5 FP) was the bigger driver of the night.
  // Weights mirror computeFp in basketball's economy: pts=1, reb=1.2,
  // ast=1.5, stl=3, blk=3.
  const ptsVal = star ? Math.round(statN(star, "pts")) : 0;
  const rebVal = star ? Math.round(statN(star, "reb")) : 0;
  const astVal = star ? Math.round(statN(star, "ast")) : 0;
  const stlVal = star ? Math.round(statN(star, "stl")) : 0;
  const blkVal = star ? Math.round(statN(star, "blk")) : 0;
  const statEntries: Array<{ value: number; unit: string; fp: number }> = [
    { value: ptsVal, unit: "pt",  fp: ptsVal },
    { value: rebVal, unit: "reb", fp: rebVal * 1.2 },
    { value: astVal, unit: "ast", fp: astVal * 1.5 },
    { value: stlVal, unit: "stl", fp: stlVal * 3 },
    { value: blkVal, unit: "blk", fp: blkVal * 3 },
  ];
  const top = statEntries.reduce((best, cur) => cur.fp > best.fp ? cur : best, { value: 0, unit: "pt", fp: 0 });
  const topStat = top.value > 0 ? `${top.value} ${top.unit}` : "";

  // Costar tokens — populated only when classifyArchetype's multi-star rule
  // fired. Otherwise empty strings (templates that reference {costar} simply
  // won't surface because they belong to the multi_star_carry archetype).
  const costarName = costar?.name ?? "";
  const costarLast = costar ? lastName(costar.name) : "";
  let costarStat = "";
  if (costar) {
    const cPts = Math.round(statN(costar, "pts"));
    const cReb = Math.round(statN(costar, "reb"));
    const cAst = Math.round(statN(costar, "ast"));
    const entries: [number, string][] = [[cPts, "pts"], [cReb, "reb"], [cAst, "ast"]];
    const [v, u] = entries.reduce((best, cur) => cur[0] > best[0] ? cur : best, [0, "pts"]);
    costarStat = v > 0 ? `${v} ${u}` : "";
  }

  return {
    name,
    last,
    first,
    nick,
    nick2,
    costar: costarName,
    costarLast,
    costarStat,
    pts: ptsVal,
    reb: rebVal,
    ast: astVal,
    stl: stlVal,
    blk: blkVal,
    to: star ? Math.round(statN(star, "turnovers") || statN(star, "to")) : 0,
    opp,
    badge: badgeLabel,
    topStat: input.topGame?.primaryReason ? formatTopStat(input.topGame, star) : topStat,
    topTier: input.topGame?.tier ?? null,
    topLabel: input.topGame?.primaryReason?.label ?? "",
    // Readable phrasing of the stat category ("scoring", "rebounding", etc.).
    // Falls back through to the stat-typed reason in allReasons so flag
    // categories (fifty_plus_game) don't bleed into "{topCategory}" templates.
    topCategory: (() => {
      if (!input.topGame) return "";
      const r = pickStatReason(input.topGame);
      return r ? (CATEGORY_READABLE[r.category] ?? "") : "";
    })(),
    // Raw stat-typed category code — internal-use for detail-snippet guards
    // (e.g. rare_badge skips "40-point game on the side" when headline is pts).
    topCategoryRaw: (() => {
      if (!input.topGame) return "";
      const r = pickStatReason(input.topGame);
      return r && r.category in STAT_UNITS ? r.category : "";
    })(),
    // Ranked-form tokens — replace the old hardcoded "Top-ten" framing in
    // templates. topRank is just the ordinal ("7th"); topRankPhrase is the
    // full ranked claim ("7th highest scoring game of the season"). Both
    // empty when the reason lacks a rank (composite/flag reasons).
    topRank: (() => {
      if (!input.topGame) return "";
      const r = pickStatReason(input.topGame);
      return r?.rank ? ordinal(r.rank) : "";
    })(),
    topRankPhrase: (() => {
      if (!input.topGame) return "";
      const r = pickStatReason(input.topGame);
      if (!r?.rank) return "";
      const phrase = CATEGORY_READABLE[r.category];
      if (!phrase) return "";
      // "7th highest scoring game of the season"
      return `${ordinal(r.rank)} highest ${phrase} game of the season`;
    })(),
    // T1 career — provides personal-best phrasing for templates that opt in via requires:['season_best_stat'].
    // The detail-token name predates the tier rename; kept for stable template references.
    seasonBestStat: input.topGame?.tier === "career" ? (input.topGame.primaryReason?.label ?? "") : "",
    streak: input.streak,
    gap: (input.nextTierMin ?? 0) > 0 ? Math.round((input.nextTierMin! - input.totalFp) * 10) / 10 : 0,
    record: rec ? `The NBA record is ${rec.record}.` : "",
    recordHolder: rec?.holder ?? "",
    recordValue: rec?.record ?? 0,
    extremeDescription,
  };
}

// ─── Resolve tokens ─────────────────────────────────────────────────────────

/** Remove the topStat-equivalent phrase from topLabel so a template that uses
 *  both tokens doesn't restate the same milestone twice ("52 pts. 50+ point
 *  game."). Only invoked when the template references {topStat} AND {topLabel}. */
function dedupeTopLabel(rawLabel: string, topStat: string): string {
  if (!rawLabel || !topStat) return rawLabel;
  const m = topStat.match(/^(\d+)\s+(\S+)$/);
  if (!m) return rawLabel;
  const value = m[1];
  const unit = m[2];
  const unitSingular = unit.replace(/s$/, "");
  const patterns: RegExp[] = [
    new RegExp(`${value}\\s+${unit}\\b`, "gi"),
    new RegExp(`${value}\\s+${unitSingular}\\b`, "gi"),
    new RegExp(`${value}[\\s+-]+point[s]?(\\s+game|\\s+night)?\\b`, "gi"),
    new RegExp(`${value}\\+\\s*${unit}\\b`, "gi"),
    new RegExp(`\\bof\\s+${value}\\b`, "gi"),
  ];
  let cleaned = rawLabel;
  for (const re of patterns) cleaned = cleaned.replace(re, "");
  cleaned = cleaned
    .replace(/\(\s*([,;]\s*)+/g, "(")
    .replace(/\s*[,;]\s*\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[—–-]\s*$/, "")
    .replace(/\s*[—–-]\s*([.,;:]|$)/g, "$1")
    .replace(/^\s*[—–:-]\s*/, "")
    .replace(/\s*:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned : rawLabel;
}

/** Variables in the topGame / record family. Templates that reference
 *  these design their scaffolding AROUND them (e.g., "{topStat}. The
 *  {topRankPhrase}. Read the line.") — when the data is empty, the
 *  scaffold leaks as orphan punctuation. Other vars like {opp}, {badge},
 *  {costar*} are designed to render gracefully empty (e.g., "{name}
 *  went off{opp}." → "Jokić went off."), so they stay out of this set.
 *
 *  Number-typed vars ({streak}, {gap}, {recordValue}) are NOT in this set —
 *  they have valid zero/falsy states the templates handle. */
const STRING_VARS_REQUIRING_VALUE: Array<keyof TemplateData> = [
  "topStat", "topLabel", "topCategory", "topRank", "topRankPhrase",
  "seasonBestStat",
  "record", "recordHolder",
];

const VAR_REF_RE = /\{(\w+)\}/g;

/** Returns true if the template references a string variable that resolves
 *  to empty in `data`. Used to short-circuit templates that would render
 *  with orphan scaffold punctuation around missing variables. */
function templateHasEmptyRequiredVariable(template: string, data: TemplateData): boolean {
  for (const match of template.matchAll(VAR_REF_RE)) {
    const varName = match[1] as keyof TemplateData;
    if (!STRING_VARS_REQUIRING_VALUE.includes(varName)) continue;
    const value = data[varName];
    if (typeof value !== "string" || value === "") return true;
  }
  return false;
}

export function resolveTemplate(template: string, data: TemplateData): string {
  // Guard: refuse to render templates whose referenced string vars are
  // empty. Returning "" signals the caller (selectCommentary's scoring
  // step) to skip this candidate. Without this guard, "{topStat}. The
  // {topRankPhrase}. Read the line." renders as ". The . Read the line."
  // when topGame data is incomplete — the punctuation scaffold leaks.
  if (templateHasEmptyRequiredVariable(template, data)) return "";

  const usesBoth = template.includes("{topStat}") && template.includes("{topLabel}");
  const topLabel = usesBoth ? dedupeTopLabel(data.topLabel ?? "", data.topStat) : (data.topLabel ?? "");
  return template
    .replace(/\{name\}/g, data.name)
    .replace(/\{last\}/g, data.last)
    .replace(/\{first\}/g, data.first)
    .replace(/\{nick\}/g, data.nick)
    .replace(/\{nick2\}/g, data.nick2)
    .replace(/\{costar\}/g, data.costar ?? "")
    .replace(/\{costarLast\}/g, data.costarLast ?? "")
    .replace(/\{costarStat\}/g, data.costarStat ?? "")
    // Stats always include units — "22 pts" never bare "22"
    .replace(/\{pts\}/g, `${data.pts} pts`)
    .replace(/\{reb\}/g, `${data.reb} reb`)
    .replace(/\{ast\}/g, `${data.ast} ast`)
    .replace(/\{stl\}/g, `${data.stl} stl`)
    .replace(/\{blk\}/g, `${data.blk} blk`)
    .replace(/\{opp\}/g, data.opp)
    .replace(/\{badge\}/g, data.badge)
    .replace(/\{topStat\}/g, data.topStat)
    .replace(/\{topLabel\}/g, topLabel)
    .replace(/\{topCategory\}/g, data.topCategory ?? "")
    .replace(/\{topRank\}/g, data.topRank ?? "")
    .replace(/\{topRankPhrase\}/g, data.topRankPhrase ?? "")
    .replace(/\{seasonBestStat\}/g, data.seasonBestStat ?? "")
    .replace(/\{streak\}/g, String(data.streak))
    .replace(/\{gap\}/g, String(data.gap))
    .replace(/\{record\}/g, data.record)
    .replace(/\{recordHolder\}/g, data.recordHolder)
    .replace(/\{recordValue\}/g, String(data.recordValue));
}

// ─── Supporting detail injection ────────────────────────────────────────────

const DETAIL_SNIPPETS: Record<string, (data: TemplateData) => string> = {
  record_event: (d) => d.record ? `${d.record}` : "",
  rare_badge: (d) => {
    // When badge_explosion fires as the archetype the template embeds {badge}
    // and composeMessage's substring-dedup keeps the snippet from doubling.
    // But achievement archetypes (historic_record/career/season) preempt
    // badge_explosion at priority 0, so without this snippet a Jokic 22-reb
    // season-top hand that is ALSO a triple double drops the badge entirely.
    // Skip when the badge is a single-stat milestone in the same category as
    // the topGame headline (e.g., "50-point game" badge on a points-tier-of-
    // the-season hand) — that would just restate the headline.
    if (!d.badge) return "";
    // Use the RAW category code, not the readable form. {topCategory} is now
    // "scoring"/"rebounding"/etc. so comparing it to "pts" would always miss
    // and let "40-point game on the side" pair with a "47 pts" headline.
    const cat = (d.topCategoryRaw ?? "").toLowerCase();
    const b = d.badge.toLowerCase();
    const overlaps = (
      (cat === "pts" && (b.includes("point") || b.includes("-point"))) ||
      (cat === "reb" && b.includes("rebound")) ||
      (cat === "ast" && (b.includes("assist") || b.includes("dime"))) ||
      (cat === "stl" && b.includes("steal")) ||
      (cat === "blk" && b.includes("block")) ||
      (cat === "threes" && (b.includes("three") || b.includes("3-point")))
    );
    if (overlaps) return "";
    return `${d.badge[0].toUpperCase() + d.badge.slice(1)} on the side.`;
  },
  common_badge: (d) => d.badge ? `${d.badge[0].toUpperCase() + d.badge.slice(1)} on the stat sheet.` : "",
  held_card_paid: () => "Holding that card was the right call.",
  high_stats: () => "",  // Stats are embedded in the main template via {pts}/{reb}/{ast} — no separate injection
  near_miss_win: (d) => d.gap > 0 ? `${Math.round(d.gap * 10) / 10} away from the next level.` : "",
  near_miss_loss: (d) => d.gap > 0 ? `${Math.round(d.gap * 10) / 10} short. Almost survived it.` : "",
  streak_event: (d) => d.streak > 0 ? `That's ${d.streak} in a row.` : "",
  streak_proximity: (d) => {
    // Sport-agnostic FTUE-then-1/3 cooldown: first time the player is at the
    // +1 boundary for a tier, the nudge fires deterministically (teaches the
    // mechanic). Subsequent times at the same boundary, fires 1 in 3 hands so
    // it stays "in passing" instead of nagging.
    // Multipliers must match STREAK_TIERS in shared/utils/payoutLogic.ts.
    const seenKey = (tier: number) => `replaymod_streak_nudge_seen_${tier}`;
    const shouldFire = (tier: number): boolean => {
      try {
        if (!localStorage.getItem(seenKey(tier))) {
          localStorage.setItem(seenKey(tier), "1");
          return true; // first encounter — teach
        }
      } catch { /* private mode → behave as first-encounter every time */ return true; }
      return Math.random() < 1 / 3;
    };
    if (d.streak === 2 && shouldFire(3))  return "One more win unlocks the 1.3x streak bonus.";
    if (d.streak === 4 && shouldFire(5))  return "One more win and you hit 1.7x streak.";
    if (d.streak === 9 && shouldFire(10)) return "One more win to 2.5x streak.";
    return "";
  },
  streak_broken: () => "The streak is done.",
  extreme_game: (d) => d.extremeDescription || "",
  zero_card: () => "Someone on the roster gave you nothing.",
  turnover_problem: () => "The turnovers didn't help.",
  injury_cost: () => "Limited minutes from a key card hurt.",
  culture_hit: () => "",
  culture_loss: () => "",
  // ── Low-minute outcome details (fires when a resolved card has min < 10).
  //    Variants picked via Math.random() at template time. Voice register:
  //    genuine fan reaction, NOT system narration. Avoid telling the user
  //    a fact they can already see (the card's minutes are right there on
  //    the front). Lean into confusion/sarcasm.
  //
  //    TODO: ingestion enrichment for injured/ejected flags — see
  //    shared/types/index.ts RawLog comment. Until that lands, `injured`
  //    and `ejected` are dormant (their guards never pass). All low-min
  //    outcomes fire `low_min_ambiguous`.
  injured: () => pickVariant([
    "Pulled something early — looked like he never recovered.",
    "Tweaked the hammy in the second. Trainer's table from there.",
    "Out by halftime — whatever it was, he wasn't running through it.",
    "Limped off and didn't come back. Bad night to need him.",
    "Whatever the trainers were looking at, it ended his night.",
    "Down early. The bench got more minutes than your card did.",
  ]),
  ejected: () => pickVariant([
    "Don't think he's sending the ref any Christmas cards.",
    "Got T'd up out of the game. Your night went with him.",
    "Two technicals and a long walk. That's on him.",
    "Ejected. The locker-room couch got more minutes than he did.",
    "Couldn't keep his mouth shut. The ref ran out of patience.",
    "Tossed early. You can't score from the tunnel.",
  ]),
  low_min_ambiguous: () => pickVariant([
    "Man, he bombed today — what happened?",
    "Yikes, where was he tonight?",
    "Tough night for him. No idea what was going on.",
    "Whatever that was, you don't want to see it again.",
    "Coach didn't trust him, the refs didn't toss him — pick your theory.",
    "He was on the bench more than the floor.",
    "Couldn't tell you what happened. Couldn't tell you why.",
    "Short night. No story. Bad result.",
  ]),
};

// Deterministic-enough pick for the low-min copy variants. Uses Math.random
// directly (matches the streak_proximity pattern earlier in this file).
// Stable within a single template-resolve call because the dispatcher only
// invokes each handler once per hand.
function pickVariant(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)] ?? "";
}

// ─── Compose final message ──────────────────────────────────────────────────

const MAX_CHARS = 200;

function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastPunct = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );
  return lastPunct > 50 ? truncated.slice(0, lastPunct + 1) : truncated;
}

/** Map a free-text snippet to a stat category (pts/reb/ast/stl/blk/threes)
 *  so we can dedupe against the message it's appended to. Returns null when
 *  the snippet doesn't reference a single stat. */
function snippetStatCategory(snippet: string): string | null {
  const s = snippet.toLowerCase();
  if (s.includes("point") || s.includes("-pt") || s.match(/\b\d+\s*pts?\b/)) return "pts";
  if (s.includes("rebound")) return "reb";
  if (s.includes("assist") || s.includes("dime")) return "ast";
  if (s.includes("steal")) return "stl";
  if (s.includes("block")) return "blk";
  if (s.includes("three") || s.includes("3-point")) return "threes";
  return null;
}

/** True when the message already mentions a stat number with the given
 *  category — used to suppress "X on the side" snippets that would echo a
 *  category the message just headlined. Also returns true when the badge
 *  is single-stat and the message has no stat number at all (so "on the
 *  side" doesn't dangle without a primary thing to be alongside). */
function messageBlocksBadgeSnippet(message: string, snippet: string): boolean {
  const cat = snippetStatCategory(snippet);
  if (!cat) return false;
  const NUMBERS_AND_NOUNS: Record<string, RegExp> = {
    pts:    /\d+\s*[-+]?\s*(?:point|pt)s?\b|\d+\s+pts?\b/i,
    reb:    /\d+\s*[-+]?\s*rebound[s]?\b/i,
    ast:    /\d+\s*[-+]?\s*assist[s]?\b|\d+\s*[-+]?\s*dime[s]?\b/i,
    stl:    /\d+\s*[-+]?\s*steal[s]?\b/i,
    blk:    /\d+\s*[-+]?\s*block[s]?\b/i,
    threes: /\d+\s*[-+]?\s*three[s]?\b|\d+\s*[-+]?\s*3-point/i,
  };
  // Same category already in message → suppress.
  if (NUMBERS_AND_NOUNS[cat].test(message)) return true;
  // No stat number anywhere in the message → "on the side" has no anchor;
  // skip rather than dangle. Catches the Gobert case (primary names no
  // headline stat, then snippet says "15-rebound game on the side").
  const anyStatNumber = Object.values(NUMBERS_AND_NOUNS).some(re => re.test(message));
  if (!anyStatNumber && (snippet.toLowerCase().includes("on the side") || snippet.toLowerCase().includes("on the stat sheet"))) {
    return true;
  }
  return false;
}

// Achievement labels that should appear at most once in a unified message.
// Prevents "triple double in the box, plus a triple double on the side"
// type doubling-up when the badge fires across multiple detail snippets.
const ACHIEVEMENT_TERMS = [
  "triple double", "triple-double",
  "double double", "double-double",
  "quadruple double", "quadruple-double",
  "5x5", "five by five",
];

function countTerm(message: string, term: string): number {
  const re = new RegExp(`\\b${term.replace(/-/g, "\\-")}\\b`, "gi");
  return (message.match(re)?.length ?? 0);
}

function snippetIntroducesRepeatAchievement(message: string, snippet: string): boolean {
  const merged = `${message} ${snippet}`.toLowerCase();
  for (const term of ACHIEVEMENT_TERMS) {
    if (countTerm(merged, term) >= 2) return true;
  }
  return false;
}

export function composeMessage(
  template: string,
  data: TemplateData,
  details: DetailId[],
): string {
  let message = resolveTemplate(template, data);

  for (const detailId of details) {
    const snippetFn = DETAIL_SNIPPETS[detailId];
    if (!snippetFn) continue;
    const snippet = snippetFn(data);
    if (!snippet) continue;
    if (message.toLowerCase().includes(snippet.toLowerCase().slice(0, 15))) continue;
    if (messageBlocksBadgeSnippet(message, snippet)) continue;
    if (snippetIntroducesRepeatAchievement(message, snippet)) continue;
    if (message.length + snippet.length + 1 > MAX_CHARS) break;
    message += ` ${snippet}`;
  }

  return capAtSentence(message, MAX_CHARS);
}
