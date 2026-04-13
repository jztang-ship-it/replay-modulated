/**
 * templateResolver.ts — Resolves template tokens and injects supporting details.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { TemplateData, DetailId, RecordEvent } from "./types";
import type { CommentaryInput, CommentaryRosterCard } from "./types";

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

  return {
    name,
    last,
    first,
    nick,
    nick2,
    pts: star ? statN(star, "pts") : 0,
    reb: star ? statN(star, "reb") : 0,
    ast: star ? statN(star, "ast") : 0,
    opp,
    badge: "",
    streak: input.streak,
    gap: (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 0,
    record: rec ? `The NBA record is ${rec.record}.` : "",
    recordHolder: rec?.holder ?? "",
    recordValue: rec?.record ?? 0,
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
    .replace(/\{pts\}/g, String(data.pts))
    .replace(/\{reb\}/g, String(data.reb))
    .replace(/\{ast\}/g, String(data.ast))
    .replace(/\{opp\}/g, data.opp)
    .replace(/\{badge\}/g, data.badge)
    .replace(/\{streak\}/g, String(data.streak))
    .replace(/\{gap\}/g, String(data.gap))
    .replace(/\{record\}/g, data.record)
    .replace(/\{recordHolder\}/g, data.recordHolder)
    .replace(/\{recordValue\}/g, String(data.recordValue));
}

// ─── Supporting detail injection ────────────────────────────────────────────

const DETAIL_SNIPPETS: Record<string, (data: TemplateData) => string> = {
  record_event: (d) => d.record ? `${d.record}` : "",
  rare_badge: (d) => d.badge ? `${d.badge} on the stat sheet.` : "",
  common_badge: (d) => d.badge ? `${d.badge}.` : "",
  held_card_paid: () => "Holding that card was the right call.",
  high_stats: (d) => {
    if (d.pts >= 30) return `${d.pts} points.`;
    if (d.reb >= 12) return `${d.reb} boards.`;
    if (d.ast >= 10) return `${d.ast} assists.`;
    return "";
  },
  near_miss_win: (d) => d.gap > 0 ? `${d.gap} away from the next level.` : "",
  near_miss_loss: (d) => d.gap > 0 ? `${d.gap} short. Almost survived it.` : "",
  streak_event: (d) => d.streak > 0 ? `That's ${d.streak} in a row.` : "",
  streak_broken: () => "The streak is done.",
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
