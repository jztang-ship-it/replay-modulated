import type { DealResult, PlayerCard, ResolveResult, TierColor, Position } from "./types";

const CAP_MAX = 150;
const MIN_REQ: Record<Position, number> = { GK: 1, DEF: 1, MID: 1, FWD: 1 };
const ROSTER_SIZE = 6;

type AnyObj = Record<string, any>;

function isSeasonCardLike(x: any): boolean {
  return (
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.season === "string" &&
    typeof x.position === "string" &&
    typeof x.salary === "number"
  );
}

function isGameLogLike(x: any): boolean {
  return (
    x &&
    typeof x === "object" &&
    (typeof x.playerId === "string" || typeof x.basePlayerId === "string") &&
    (typeof x.date === "string" || typeof x.matchDate === "string" || typeof x.kickoff === "string")
  );
}

async function loadAllJsonCandidates(): Promise<AnyObj[]> {
  // IMPORTANT: only scan inside the repo's data folders.
  const globs = [
    import.meta.glob<AnyObj>("../../../../../../data/**/*.json", { eager: true }),
    import.meta.glob<AnyObj>("../../../../../../src/data/**/*.json", { eager: true }),
  ];

  const out: AnyObj[] = [];
  for (const g of globs) {
    for (const k of Object.keys(g)) {
      const mod: any = (g as any)[k];
      out.push({ __path: k, data: mod?.default ?? mod });
    }
  }
  return out;
}

async function loadSeasonCardsAndLogs(): Promise<{ cards: any[]; logs: any[] }> {
  const candidates = await loadAllJsonCandidates();

  let bestCards: any[] = [];
  let bestLogs: any[] = [];

  for (const c of candidates) {
    const data = c.data;

    if (Array.isArray(data) && data.length) {
      const cardHits = data.slice(0, 50).filter(isSeasonCardLike).length;
      const logHits = data.slice(0, 50).filter(isGameLogLike).length;

      // Cards: prefer the biggest card array we can find
      if (cardHits >= 10 && data.length > bestCards.length) bestCards = data;

      // Logs: prefer the biggest logs array
      if (logHits >= 10 && data.length > bestLogs.length) bestLogs = data;
    } else if (data && typeof data === "object") {
      const values = Object.values(data);
      for (const v of values) {
        if (Array.isArray(v) && v.length) {
          const cardHits = v.slice(0, 50).filter(isSeasonCardLike).length;
          const logHits = v.slice(0, 50).filter(isGameLogLike).length;

          if (cardHits >= 10 && v.length > bestCards.length) bestCards = v;
          if (logHits >= 10 && v.length > bestLogs.length) bestLogs = v;
        }
      }
    }
  }

  if (!bestCards.length) {
    throw new Error(
      "Could not find season cards JSON under /data or /src/data. Ensure processed season cards are committed as JSON."
    );
  }
  if (!bestLogs.length) bestLogs = [];

  return { cards: bestCards, logs: bestLogs };
}

let CACHE: null | { cards: any[]; logs: any[] } = null;
async function ensureCache() {
  if (!CACHE) CACHE = await loadSeasonCardsAndLogs();
  return CACHE;
}

function toTierColor(tier: any): TierColor {
  const t = String(tier ?? "").toLowerCase();
  if (t.includes("orange")) return "ORANGE";
  if (t.includes("purple")) return "PURPLE";
  if (t.includes("blue")) return "BLUE";
  if (t.includes("green")) return "GREEN";
  if (t.includes("white")) return "WHITE";
  return "WHITE";
}

function toPosition(rawPos: any): Position {
  const p = String(rawPos ?? "").toUpperCase();
  if (p === "GK" || p === "GKP" || p === "GOALKEEPER") return "GK";
  if (p === "DEF" || p === "D" || p === "DEFENDER") return "DEF";
  if (p === "MID" || p === "M" || p === "MIDFIELDER") return "MID";
  if (p === "FWD" || p === "FW" || p === "F" || p === "FORWARD" || p === "ST" || p === "STRIKER") return "FWD";
  return "MID";
}

function mapCard(raw: any): PlayerCard {
  const cardId = String(raw.id);
  const basePlayerId = String(raw.basePlayerId ?? raw.id);
  const projected = Number(raw.avgFP ?? raw.projectedFp ?? raw.projFp ?? 0);

  return {
    cardId,
    basePlayerId,
    name: String(raw.name ?? raw.playerName ?? raw.displayName ?? "Unknown"),
    team: String(raw.team ?? raw.club ?? raw.squad ?? "Unknown"),
    season: String(raw.season ?? "Unknown"),
    position: toPosition(raw.position),
    tier: toTierColor(raw.tier),
    salary: Number(raw.salary ?? 0),
    projectedFp: Number.isFinite(projected) ? projected : 0,
  };
}

function groupByPosition(cards: PlayerCard[]) {
  const g: Record<Position, PlayerCard[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const c of cards) g[c.position].push(c);
  return g;
}

function sumSalary(cards: PlayerCard[]) {
  return cards.reduce((s, c) => s + c.salary, 0);
}

function uniqByBase(cards: PlayerCard[]) {
  const seen = new Set<string>();
  const out: PlayerCard[] = [];
  for (const c of cards) {
    if (seen.has(c.basePlayerId)) continue;
    seen.add(c.basePlayerId);
    out.push(c);
  }
  return out;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoster(allCards: PlayerCard[], locked: PlayerCard[] = []): PlayerCard[] {
  const pool = uniqByBase(allCards);
  const lockedBases = new Set(locked.map((c) => c.basePlayerId));
  const byPos = groupByPosition(pool.filter((c) => !lockedBases.has(c.basePlayerId)));

  if (locked.length > ROSTER_SIZE) return locked.slice(0, ROSTER_SIZE);

  const lockedCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const c of locked) lockedCounts[c.position]++;

  const needed: Position[] = [];
  (Object.keys(MIN_REQ) as Position[]).forEach((pos) => {
    const need = Math.max(0, MIN_REQ[pos] - lockedCounts[pos]);
    for (let i = 0; i < need; i++) needed.push(pos);
  });

  const remainingSlots = ROSTER_SIZE - locked.length;
  const flexPool = ([] as PlayerCard[]).concat(byPos.GK, byPos.DEF, byPos.MID, byPos.FWD);

  for (let attempt = 0; attempt < 2000; attempt++) {
    const picked: PlayerCard[] = [];

    let ok = true;
    for (const pos of needed) {
      const candidates = byPos[pos];
      if (!candidates.length) {
        ok = false;
        break;
      }
      picked.push(pickOne(candidates));
    }
    if (!ok) continue;

    const bases = new Set<string>([...lockedBases, ...picked.map((c) => c.basePlayerId)]);
    const flex = shuffle(flexPool).filter((c) => !bases.has(c.basePlayerId));

    while (picked.length < remainingSlots && flex.length) {
      const nxt = flex.shift()!;
      bases.add(nxt.basePlayerId);
      picked.push(nxt);
    }
    if (picked.length !== remainingSlots) continue;

    const roster = locked.concat(picked);
    const total = sumSalary(roster);
    if (total !== CAP_MAX) continue;

    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const c of roster) counts[c.position]++;

    const meets = (Object.keys(MIN_REQ) as Position[]).every((p) => counts[p] >= MIN_REQ[p]);
    if (!meets) continue;

    return roster;
  }

  const fallback = locked.concat(
    shuffle(pool).filter((c) => !lockedBases.has(c.basePlayerId)).slice(0, remainingSlots)
  );
  return fallback.slice(0, ROSTER_SIZE);
}

function normalizeDate(log: any): string {
  const d = log.date ?? log.matchDate ?? log.kickoff ?? "";
  return String(d).slice(0, 10) || "Unknown";
}

function extractOpponent(log: any): string {
  return String(log.opponent ?? log.opp ?? log.vs ?? log.teamAgainst ?? "Unknown");
}

function extractHomeAway(log: any): "H" | "A" | undefined {
  const v = log.homeAway ?? log.ha ?? log.venue ?? log.isHome;
  if (v === "H" || v === "A") return v;
  if (typeof v === "string") {
    const s = v.toUpperCase();
    if (s.startsWith("H")) return "H";
    if (s.startsWith("A")) return "A";
  }
  if (typeof v === "boolean") return v ? "H" : "A";
  return undefined;
}

function extractFp(log: any): number | null {
  const candidates = [log.fantasyPoints, log.fp, log.totalFp, log.points, log.fplPoints, log.fpl];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}

function extractStatLine(log: any): Record<string, number> {
  const statLine: Record<string, number> = {};
  const src = log.stats ?? log;
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "number" && Number.isFinite(v)) statLine[k] = v;
  }
  return statLine;
}

function detectAchievements(position: Position, statLine: Record<string, number>) {
  const ach: Array<{ id: string; label: string }> = [];
  const saves = statLine.saves ?? 0;
  const cs = statLine.cleanSheets ?? statLine.cleanSheet ?? 0;
  const red = statLine.redCards ?? statLine.red ?? 0;

  if (position === "GK" && cs >= 1) ach.push({ id: "clean-sheet-gk", label: "Clean Sheet" });
  if (position === "GK" && saves >= 6) ach.push({ id: "shot-stopper", label: "Shot Stopper" });
  if (red >= 1) ach.push({ id: "sent-off", label: "Sent Off" });

  return ach;
}

function findLogsForCard(logs: any[], card: PlayerCard): any[] {
  if (!logs.length) return [];
  return logs.filter((l) => {
    const pid = String(l.playerId ?? "");
    const bid = String(l.basePlayerId ?? "");
    return pid === card.cardId || bid === card.basePlayerId || pid === card.basePlayerId;
  });
}

export async function dealInitialRoster(): Promise<DealResult> {
  const { cards } = await ensureCache();
  const mapped = cards.map(mapCard).filter((c) => c.salary > 0);

  const roster = buildRoster(mapped, []);
  return { cards: roster, capUsed: sumSalary(roster), capMax: CAP_MAX };
}

export async function redrawRoster(opts: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<DealResult> {
  const { cards } = await ensureCache();
  const mapped = cards.map(mapCard).filter((c) => c.salary > 0);

  const locked = opts.currentCards.filter((c) => opts.lockedCardIds.has(c.cardId));
  const roster = buildRoster(mapped, locked);

  return { cards: roster, capUsed: sumSalary(roster), capMax: CAP_MAX };
}

export async function resolveRoster(opts: { finalCards: PlayerCard[] }): Promise<ResolveResult> {
  const { logs } = await ensureCache();

  const resolved: PlayerCard[] = opts.finalCards.map((c) => {
    const candidates = findLogsForCard(logs, c);
    const log = candidates.length ? pickOne(candidates) : null;

    const fpFromLog = log ? extractFp(log) : null;
    const noise = (Math.random() - 0.5) * 2.0;
    const actualFp = Number(((fpFromLog ?? (c.projectedFp + noise))).toFixed(1));
    const fpDelta = Number((actualFp - c.projectedFp).toFixed(1));

    const statLine = log ? extractStatLine(log) : {};
    const achievements = detectAchievements(c.position, statLine);

    const gameInfo = log
      ? {
          date: normalizeDate(log),
          opponent: extractOpponent(log),
          homeAway: extractHomeAway(log),
        }
      : undefined;

    return { ...c, actualFp, fpDelta, statLine, achievements, gameInfo };
  });

  const totalFp = Number(resolved.reduce((s, c) => s + (c.actualFp ?? 0), 0).toFixed(1));
  const sorted = [...resolved].sort((a, b) => (b.actualFp ?? 0) - (a.actualFp ?? 0));
  const mvpCardId = sorted[0]?.cardId ?? "";

  return {
    cards: resolved,
    totalFp,
    winTierLabel: labelTier(totalFp),
    topContributors: sorted.slice(0, 3).map((c) => ({ cardId: c.cardId, name: c.name, fp: c.actualFp ?? 0 })),
    mvpCardId,
  };
}

function labelTier(totalFp: number): string {
  if (totalFp >= 81) return "Legendary";
  if (totalFp >= 69) return "Epic";
  if (totalFp >= 55) return "Big Win";
  if (totalFp >= 45) return "Nice Win";
  if (totalFp >= 36) return "Solid";
  return "Try Again";
}
