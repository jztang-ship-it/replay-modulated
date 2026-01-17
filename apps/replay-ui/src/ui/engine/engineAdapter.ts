// apps/replay-ui/src/ui/engine/engineAdapter.ts
// Matches GameView imports:
// import { dealInitialRoster, redrawRoster, resolveRoster } from "./engine/engineAdapter";

import type { PlayerCard } from "./types";

// -------------------- CONFIG: set these to your real /public/data paths --------------------
// These must be reachable in the browser at http://localhost:xxxx/<path>
const PLAYERS_URL = "/data/players.json";
const LOGS_URL = "/data/game-logs.json";


// -------------------- GAME CONSTANTS --------------------
const CAP_MAX = 180;
const ROSTER_SIZE = 6;
const MIN_MINUTES = 20;

// -------------------- RAW TYPES (what we load from JSON) --------------------
type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  season: string | number;
  position: string;
  tier?: string;
  salary: number | string;
};

type RawLog = {
  playerId: string;
  stats: Record<string, any>;
  date?: string;
  opponent?: string;
  homeAway?: "H" | "A";
};

// -------------------- tiny utils --------------------
function n(v: unknown): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampInt(v: unknown, min: number, max: number): number {
  const x = Math.trunc(n(v));
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function mulberry32(seed: number) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseId(p: { id: string; basePlayerId?: string }) {
  const b = (p.basePlayerId ?? "").trim();
  return b.length ? b : p.id;
}

// -------------------- normalizers --------------------
type Position = "GK" | "DEF" | "MID" | "FWD";

function asPosition(raw: unknown): Position {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();

  if (s === "GK" || s === "G" || s.includes("KEEP")) return "GK";

  if (["DEF", "D", "CB", "LB", "RB", "LWB", "RWB"].includes(s) || s.includes("BACK")) return "DEF";
  if (["MID", "M", "CM", "CDM", "CAM", "LM", "RM"].includes(s) || s.includes("MID")) return "MID";
  if (["FWD", "F", "FW", "ST", "CF", "LW", "RW"].includes(s) || s.includes("WING") || s.includes("STRIK"))
    return "FWD";

  return "MID";
}

// -------------------- objective FP (base units; UI scales x10) --------------------
function computeFantasyPointsFromLog(log: RawLog): number {
  const st = log?.stats ?? {};

  const goals = n(st.goals ?? st.G ?? st.goal);
  const assists = n(st.assists ?? st.A ?? st.ast);

  const shots = n(st.shots ?? st.sh);
  const shotsOnTarget = n(st.shotsOnTarget ?? st.sot);
  const keyPasses = n(st.keyPasses ?? st.kp);

  const tacklesWon = n(st.tacklesWon ?? st.tw);
  const interceptions = n(st.interceptions ?? st.int);

  const saves = n(st.saves ?? st.sv);
  const cleanSheet = n(st.cleanSheet ?? st.cs);
  const goalsConceded = n(st.goalsConceded ?? st.gc);

  const yellow = n(st.yellowCards ?? st.yellow ?? st.yc);
  const red = n(st.redCards ?? st.red ?? st.rc);

  const minutes = n(st.minutes ?? st.min);

  let fp = 0;

  fp += goals * 10;
  fp += assists * 6;

  fp += shots * 0.5;
  fp += shotsOnTarget * 1.0;
  fp += keyPasses * 1.0;

  fp += tacklesWon * 1.0;
  fp += interceptions * 1.0;

  fp += saves * 1.0;
  fp += cleanSheet * 4.0;
  fp -= goalsConceded * 1.0;

  fp -= yellow * 1.0;
  fp -= red * 3.0;

  fp += Math.min(90, Math.max(0, minutes)) * 0.02;

  if (fp < 0) fp = 0;
  return fp;
}

// -------------------- data cache (browser) --------------------
let _players: RawPlayer[] | null = null;
let _logs: RawLog[] | null = null;

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

async function ensureDataLoaded(): Promise<{ players: RawPlayer[]; logs: RawLog[] }> {
  if (_players && _logs) return { players: _players, logs: _logs };

  const [players, logs] = await Promise.all([loadJson<RawPlayer[]>(PLAYERS_URL), loadJson<RawLog[]>(LOGS_URL)]);

  _players = players;
  _logs = logs;
  return { players, logs };
}

// -------------------- card builder (matches your UI PlayerCard shape) --------------------
function buildCard(p: RawPlayer): PlayerCard {
  return {
    cardId: p.id,
    basePlayerId: baseId(p),

    name: p.name,
    team: p.team ?? "Unknown",
    season: String(p.season),
    position: asPosition(p.position),
    tier: (String(p.tier ?? "D").toUpperCase() as any) ?? "D",

    salary: clampInt(n(p.salary), 1, 99),
    projectedFp: 0,

    actualFp: 0,
    fpDelta: 0,
    statLine: {},
    achievements: [],
    gameInfo: { date: "", opponent: "", homeAway: undefined },
  } as PlayerCard;
}

// -------------------- log picker --------------------
function getMinutes(log: RawLog): number {
  const st = log?.stats ?? {};
  return n(st.minutes ?? st.min ?? st.MIN);
}

function pickRandomLogForCard(cardId: string, logs: RawLog[], rng: () => number): RawLog | null {
  const candidates = logs.filter(
    (l) => l.playerId === cardId && getMinutes(l) >= MIN_MINUTES && l.stats && typeof l.stats === "object"
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

// -------------------- roster sculptor (anchor + feasibility fill) --------------------
function minSalaryInPool(pool: RawPlayer[], usedBase: Set<string>, allowGK: boolean): number {
  let best = Infinity;
  for (const p of pool) {
    if (usedBase.has(baseId(p))) continue;
    const pos = asPosition(p.position);
    if (!allowGK && pos === "GK") continue;
    const s = n(p.salary);
    if (s > 0 && s < best) best = s;
  }
  return best === Infinity ? 0 : best;
}

function fillRosterSculpted(players: RawPlayer[], rng: () => number): RawPlayer[] {
  const pool = [...players];
  shuffleInPlace(pool, rng);

  const chosen: RawPlayer[] = [];
  const usedBase = new Set<string>();
  let capUsed = 0;

  // ---- 0) anchors: pick up to 2 expensive-ish, but still feasible ----
  const bySalaryDesc = [...pool].sort((a, b) => n(b.salary) - n(a.salary));
  const anchorCand = bySalaryDesc.slice(0, Math.min(40, bySalaryDesc.length));

  for (const p of anchorCand) {
    if (chosen.length >= 2) break;
    const b = baseId(p);
    if (usedBase.has(b)) continue;

    const s = n(p.salary);
    if (capUsed + s > CAP_MAX) continue;

    const slotsLeftAfter = ROSTER_SIZE - (chosen.length + 1);
    const minRest = minSalaryInPool(pool, new Set([...usedBase, b]), false) * slotsLeftAfter;
    if (capUsed + s + minRest > CAP_MAX) continue;

    chosen.push(p);
    usedBase.add(b);
    capUsed += s;
  }

  // ---- 1) optional 1 GK early if feasible ----
  if (!chosen.some((c) => asPosition(c.position) === "GK")) {
    const gks = pool.filter((p) => asPosition(p.position) === "GK" && !usedBase.has(baseId(p)));
    shuffleInPlace(gks, rng);

    for (const gk of gks) {
      const b = baseId(gk);
      const s = n(gk.salary);
      const slotsLeftAfter = ROSTER_SIZE - (chosen.length + 1);
      const minRest = minSalaryInPool(pool, new Set([...usedBase, b]), false) * slotsLeftAfter;
      if (capUsed + s + minRest <= CAP_MAX) {
        chosen.push(gk);
        usedBase.add(b);
        capUsed += s;
        break;
      }
    }
  }

  // ---- 2) ensure at least 1 DEF/MID/FWD ----
  const need: Position[] = ["DEF", "MID", "FWD"];
  for (const pos of need) {
    if (chosen.some((c) => asPosition(c.position) === pos)) continue;

    const candidates = pool.filter((p) => asPosition(p.position) === pos && !usedBase.has(baseId(p)));
    shuffleInPlace(candidates, rng);

    for (const cand of candidates) {
      const b = baseId(cand);
      const s = n(cand.salary);
      const slotsLeftAfter = ROSTER_SIZE - (chosen.length + 1);
      const minRest = minSalaryInPool(pool, new Set([...usedBase, b]), false) * slotsLeftAfter;

      if (capUsed + s + minRest <= CAP_MAX) {
        chosen.push(cand);
        usedBase.add(b);
        capUsed += s;
        break;
      }
    }
  }

  // ---- 3) fill remaining slots (no extra GK) ----
  for (const p of pool) {
    if (chosen.length >= ROSTER_SIZE) break;

    const b = baseId(p);
    if (usedBase.has(b)) continue;

    if (asPosition(p.position) === "GK") continue;

    const s = n(p.salary);
    if (capUsed + s > CAP_MAX) continue;

    const slotsLeftAfter = ROSTER_SIZE - (chosen.length + 1);
    const minRest = minSalaryInPool(pool, new Set([...usedBase, b]), false) * slotsLeftAfter;
    if (capUsed + s + minRest > CAP_MAX) continue;

    chosen.push(p);
    usedBase.add(b);
    capUsed += s;
  }

  // ---- 4) last resort: cheapest fill under cap (outfield only) ----
  if (chosen.length < ROSTER_SIZE) {
    const rest = pool
      .filter((p) => !usedBase.has(baseId(p)) && asPosition(p.position) !== "GK")
      .sort((a, b) => n(a.salary) - n(b.salary));

    for (const p of rest) {
      if (chosen.length >= ROSTER_SIZE) break;
      const s = n(p.salary);
      if (capUsed + s > CAP_MAX) continue;
      chosen.push(p);
      usedBase.add(baseId(p));
      capUsed += s;
    }
  }

  return chosen.slice(0, ROSTER_SIZE);
}

// -------------------- module seed (so redraw changes) --------------------
let _seed = Date.now();

// -------------------- PUBLIC API (matches GameView) --------------------
export async function dealInitialRoster(): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = mulberry32(_seed++);

  const rawRoster = fillRosterSculpted(players, rng);
  const cards = rawRoster.map(buildCard);

  // attach a random real log + compute actual fp (x10 UI scaling)
  for (const card of cards) {
    const log = pickRandomLogForCard(card.cardId, logs, rng);
    if (!log) continue;

    const actualFp = computeFantasyPointsFromLog(log) * 10;
    card.actualFp = actualFp;
    card.fpDelta = actualFp - (card.projectedFp ?? 0);
    card.statLine = log.stats ?? {};
    card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
  }

  return { cards, capMax: CAP_MAX };
}

export async function redrawRoster(args: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = mulberry32(_seed++);

  const locked = args.currentCards.filter((c) => args.lockedCardIds.has(c.cardId));
  const lockedBase = new Set(locked.map((c) => c.basePlayerId));

  // pool excludes locked base ids
  const pool = players.filter((p) => !lockedBase.has(baseId(p)));
  const rawRoster = fillRosterSculpted(pool, rng).map(buildCard);

  // merge locked + new (avoid dup base)
  const used = new Set(locked.map((c) => c.basePlayerId));
  const merged: PlayerCard[] = [...locked];

  for (const c of rawRoster) {
    if (merged.length >= ROSTER_SIZE) break;
    if (used.has(c.basePlayerId)) continue;
    merged.push(c);
    used.add(c.basePlayerId);
  }

  // attach logs for any new cards (locked cards keep their existing stats)
  for (const card of merged) {
    if (args.lockedCardIds.has(card.cardId)) continue; // keep locked as-is
    const log = pickRandomLogForCard(card.cardId, logs, rng);
    if (!log) continue;
    const actualFp = computeFantasyPointsFromLog(log) * 10;
    card.actualFp = actualFp;
    card.fpDelta = actualFp - (card.projectedFp ?? 0);
    card.statLine = log.stats ?? {};
    card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
  }

  return { cards: merged.slice(0, ROSTER_SIZE), capMax: CAP_MAX };
}

export async function resolveRoster(args: {
  finalCards: PlayerCard[];
}): Promise<{
  cards: PlayerCard[];
  totalFp: number;
  winTierLabel: string;
  mvpCardId: string;
  topContributors: { cardId: string; name: string; fp: number }[];
}> {
  const cards = args.finalCards;

  const totalFp = cards.reduce((s, c) => s + (Number.isFinite(c.actualFp) ? (c.actualFp as number) : 0), 0);

  let winTierLabel: string;
  if (totalFp >= 600) winTierLabel = "JACKPOT";
  else if (totalFp >= 450) winTierLabel = "BIG WIN";
  else if (totalFp >= 320) winTierLabel = "WIN";
  else if (totalFp >= 220) winTierLabel = "SMALL WIN";
  else winTierLabel = "NO WIN";

  const sorted = [...cards].sort((a, b) => (b.actualFp || 0) - (a.actualFp || 0));
  const topCards = sorted.slice(0, 3);

  const topContributors = topCards.map((c) => ({ cardId: c.cardId, name: c.name, fp: c.actualFp || 0 }));
  const mvpCardId = sorted[0]?.cardId ?? "";

  return { cards, totalFp, winTierLabel, mvpCardId, topContributors };
}
