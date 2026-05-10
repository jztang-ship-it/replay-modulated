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

function formatTopStat(topGame: NonNullable<CommentaryInput["topGame"]>, _star: CommentaryRosterCard | null): string {
  if (!topGame.primaryReason) return "";
  const { category, value } = topGame.primaryReason;
  const units: Record<string, string> = {
    // basketball
    pts: "pts", reb: "reb", ast: "ast", threes: "threes", stl: "stl", blk: "blk",
    // baseball
    hr: "HR", h: "hits", rbi: "RBI", k: "K", sb: "SB", ip: "IP", bb: "BB", r: "R",
  };
  return `${value} ${units[category] ?? category}`;
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

  // Resolve the star's highest badge for commentary focus
  const starBadgeIds = (star?.achievements ?? []).map(a => a.id);
  const highestBadge = getHighestBadge(starBadgeIds);
  const badgeLabel = highestBadge?.commentaryLabel ?? "";

  // Compute topStat: the star's highest stat value + unit (e.g. "22 pt")
  const ptsVal = star ? Math.round(statN(star, "pts")) : 0;
  const rebVal = star ? Math.round(statN(star, "reb")) : 0;
  const astVal = star ? Math.round(statN(star, "ast")) : 0;
  const stlVal = star ? Math.round(statN(star, "stl")) : 0;
  const blkVal = star ? Math.round(statN(star, "blk")) : 0;
  const statEntries: [number, string][] = [
    [ptsVal, "pt"], [rebVal, "reb"], [astVal, "ast"], [stlVal, "stl"], [blkVal, "blk"],
  ];
  const [topVal, topUnit] = statEntries.reduce((best, cur) => cur[0] > best[0] ? cur : best, [0, "pt"]);
  const topStat = topVal > 0 ? `${topVal} ${topUnit}` : "";

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
    topCategory: input.topGame?.primaryReason?.category ?? "",
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

export function resolveTemplate(template: string, data: TemplateData): string {
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
    const cat = (d.topCategory ?? "").toLowerCase();
    const b = d.badge.toLowerCase();
    const overlaps = (
      (cat === "pts" && (b.includes("point") || b.includes("-point"))) ||
      (cat === "reb" && b.includes("rebound")) ||
      (cat === "ast" && (b.includes("assist") || b.includes("dime")))
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
};

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
    if (message.length + snippet.length + 1 > MAX_CHARS) break;
    message += ` ${snippet}`;
  }

  return capAtSentence(message, MAX_CHARS);
}
