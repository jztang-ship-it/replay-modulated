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

function formatTopStat(topGame: NonNullable<CommentaryInput["topGame"]>, star: CommentaryRosterCard | null): string {
  if (!topGame.primaryReason || !star?.statLine) return "";
  const { category, value } = topGame.primaryReason;
  if (category.startsWith("td_") || category === "quad_double" || category === "five_by_five") {
    const s = star.statLine;
    return `${s.pts ?? 0}/${s.reb ?? 0}/${s.ast ?? 0}`;
  }
  if (category === "fifty_plus_game") return `${star.statLine.pts ?? value} pts`;
  const units: Record<string, string> = { pts: "pts", reb: "reb", ast: "ast", threes: "threes", stl: "stl", blk: "blk" };
  return `${value} ${units[category] ?? category}`;
}

// ─── Build template data ────────────────────────────────────────────────────

export function buildTemplateData(
  star: CommentaryRosterCard | null,
  input: CommentaryInput,
  recordEvents: RecordEvent[],
  culture: { nicknames?: string[] } | null,
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

  return {
    name,
    last,
    first,
    nick,
    nick2,
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

export function resolveTemplate(template: string, data: TemplateData): string {
  return template
    .replace(/\{name\}/g, data.name)
    .replace(/\{last\}/g, data.last)
    .replace(/\{first\}/g, data.first)
    .replace(/\{nick\}/g, data.nick)
    .replace(/\{nick2\}/g, data.nick2)
    // Stats always include units — "22 pts" never bare "22"
    .replace(/\{pts\}/g, `${data.pts} pts`)
    .replace(/\{reb\}/g, `${data.reb} reb`)
    .replace(/\{ast\}/g, `${data.ast} ast`)
    .replace(/\{stl\}/g, `${data.stl} stl`)
    .replace(/\{blk\}/g, `${data.blk} blk`)
    .replace(/\{opp\}/g, data.opp)
    .replace(/\{badge\}/g, data.badge)
    .replace(/\{topStat\}/g, data.topStat)
    .replace(/\{topLabel\}/g, data.topLabel ?? "")
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
  rare_badge: () => "",  // Rare badges are now the template story, not a detail snippet
  common_badge: (d) => d.badge ? `${d.badge[0].toUpperCase() + d.badge.slice(1)} on the stat sheet.` : "",
  held_card_paid: () => "Holding that card was the right call.",
  high_stats: () => "",  // Stats are embedded in the main template via {pts}/{reb}/{ast} — no separate injection
  near_miss_win: (d) => d.gap > 0 ? `${Math.round(d.gap * 10) / 10} away from the next level.` : "",
  near_miss_loss: (d) => d.gap > 0 ? `${Math.round(d.gap * 10) / 10} short. Almost survived it.` : "",
  streak_event: (d) => d.streak > 0 ? `That's ${d.streak} in a row.` : "",
  streak_proximity: (d) => {
    if (d.streak === 2) return "One more win unlocks the 1.2x streak bonus.";
    if (d.streak === 4) return "One more win and you hit 1.5x streak.";
    if (d.streak >= 8 && d.streak < 10) return `${10 - d.streak} more win${10 - d.streak > 1 ? "s" : ""} to 2.0x streak.`;
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
