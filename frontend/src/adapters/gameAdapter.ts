// frontend/src/adapters/gameAdapter.ts
// BULLETPROOF VERSION - Uses slotIndex, never relies on array order
// + Deterministic log selection per cardId (stable reveal)
// + Filters out players with 0 usable logs
// + Projected FP computed from historical logs (avg)
// + Actual FP computed from ONE deterministic "random" log per cardId
// + FP breakdown attached for Stats Back
// + Multiplier applied to both projected & actual for game-feel tuning

import type { PlayerCard, ResolveResult, Position, TierColor } from "./types";
import { sportAdapter } from "./SportAdapter";
import { LineupGenerationEngine } from "../../../backend/engines/LineupGenerationEngine";
import { RandomEngine } from "../../../backend/engines/RandomEngine";
import type { RosterSlot } from "../../../backend/models";

const PLAYERS_URL = "/data/players.json";
const LOGS_URL = "/data/game-logs.json";
const CAP_MAX = sportAdapter.salaryCap;

// Filters
const MIN_MINUTES = 20;
const MIN_USABLE_GAMES_FOR_PLAYER = 3;

// Option A scaling (testing)
const FP_MULTIPLIER = 5;

type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  season: string | number;
  position: string;
  tier?: string;
  salary: number | string;
  photoCode?: string;
};

type RawLog = {
  playerId: string;
  stats: Record<string, any>;
  date?: string;
  opponent?: string;
  homeAway?: "H" | "A";
  minutes?: number | string;
  min?: number | string;
  mins?: number | string;
  MIN?: number | string;
};

function n(v: unknown): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampInt(v: unknown, min: number, max: number): number {
  const x = Math.trunc(n(v));
  return sportAdapter.clamp(x, min, max);
}

function baseId(p: { id: string; basePlayerId?: string }) {
  const b = (p.basePlayerId ?? "").trim();
  return b.length ? b : p.id;
}

function asPosition(raw: unknown): Position {
  return sportAdapter.normalizePosition(raw);
}

function asTier(raw: unknown): TierColor {
  return sportAdapter.normalizeTier(raw);
}

function coerceNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function getMinutes(log: RawLog): number {
  const st = (log?.stats ?? {}) as Record<string, any>;
  const candidates = [
    (log as any)?.minutes,
    (log as any)?.min,
    (log as any)?.mins,
    (log as any)?.MIN,
    st.minutes,
    st.min,
    st.mins,
    st.MIN,
    st.minutesPlayed,
    st.minutes_played,
    st.timePlayed,
    st.time_played,
    st.time,
  ];
  for (const c of candidates) {
    const v = coerceNumber(c);
    if (v != null && v >= 0) return v;
  }

  const timeStr = (st.timeOnField ??
    st.time_on_field ??
    (log as any)?.timeOnField ??
    (log as any)?.time_on_field) as unknown;

  if (typeof timeStr === "string") {
    const parts = timeStr.split(":").map((p) => Number(p));
    if (parts.every((k) => Number.isFinite(k))) {
      if (parts.length === 2) return parts[0]; // "MM:SS" => minutes
      if (parts.length === 3) return parts[0] * 60 + parts[1]; // "HH:MM:SS"
    }
  }

  return 0;
}

function getLogPlayerId(l: any): string {
  return String(l?.playerId ?? l?.player_id ?? l?.athleteId ?? l?.athlete_id ?? "").trim();
}

function scaleBreakdown(b: Record<string, number>, mult: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) out[k] = n * mult;
  }
  return out;
}

// SPORT-AGNOSTIC: compute FP + breakdown from a log
function computeFantasyFromLogWithBreakdown(log: RawLog): {
  total: number;
  breakdown: Record<string, number>;
  statsUsed: Record<string, any>;
} {
  const stats = (log?.stats ?? {}) as Record<string, any>;

  // Fast path: FPL-style (football) already provides fantasy total
  const tp = (stats as any).total_points;
  const tpNum = typeof tp === "number" ? tp : typeof tp === "string" ? Number(tp) : NaN;

  if (Number.isFinite(tpNum)) {
    const base = Math.max(0, tpNum);
    return { total: base, breakdown: { TOTAL_POINTS: base }, statsUsed: stats };
  }

  // Fallback: adapter weighted scoring (with breakdown)
  const minutes = getMinutes(log);
  const statsWithMinutes = { ...stats, minutes };

  const detailed = sportAdapter.computeFantasyPointsDetailed(statsWithMinutes);
  return { total: detailed.total, breakdown: detailed.breakdown, statsUsed: statsWithMinutes };
}

let _players: RawPlayer[] | null = null;
let _logs: RawLog[] | null = null;

// Derived indices built from logs
let _usableLogsByPlayerId: Map<string, RawLog[]> | null = null;
let _projectedFpByPlayerId: Map<string, number> | null = null;

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

function normalizeLogs(raw: any): RawLog[] {
  if (Array.isArray(raw)) return raw as RawLog[];
  if (raw && Array.isArray(raw.logs)) return raw.logs as RawLog[];
  if (raw && Array.isArray(raw.data)) return raw.data as RawLog[];
  if (raw && Array.isArray(raw.items)) return raw.items as RawLog[];
  return [];
}

function buildUsableLogIndex(logs: RawLog[]): Map<string, RawLog[]> {
  const idx = new Map<string, RawLog[]>();

  for (const l of logs) {
    if (!l || !l.stats || typeof l.stats !== "object") continue;

    const pid = getLogPlayerId(l);
    if (!pid) continue;

    if (getMinutes(l) < MIN_MINUTES) continue;

    const fx = computeFantasyFromLogWithBreakdown(l);
    if (!Number.isFinite(fx.total) || fx.total <= 0) continue;

    const arr = idx.get(pid) ?? [];
    arr.push(l);
    idx.set(pid, arr);
  }

  return idx;
}

function buildProjectionMap(idx: Map<string, RawLog[]>): Map<string, number> {
  const proj = new Map<string, number>();

  for (const [pid, arr] of idx.entries()) {
    if (!arr || arr.length < MIN_USABLE_GAMES_FOR_PLAYER) continue;

    let sum = 0;
    let count = 0;
    for (const l of arr) {
      const fx = computeFantasyFromLogWithBreakdown(l);
      if (!Number.isFinite(fx.total) || fx.total <= 0) continue;
      sum += fx.total;
      count++;
    }

    if (count >= MIN_USABLE_GAMES_FOR_PLAYER) {
      const avg = sum / count;
      proj.set(pid, Math.max(0, avg * FP_MULTIPLIER));
    }
  }

  return proj;
}

async function ensureDataLoaded(): Promise<{ players: RawPlayer[]; logs: RawLog[] }> {
  if (_players && _logs && _usableLogsByPlayerId && _projectedFpByPlayerId) {
    return { players: _players, logs: _logs };
  }

  const [playersRaw, logsRaw] = await Promise.all([loadJson<any>(PLAYERS_URL), loadJson<any>(LOGS_URL)]);
  const playersAll = (Array.isArray(playersRaw) ? playersRaw : []) as RawPlayer[];
  const logs = normalizeLogs(logsRaw);

  const usableIdx = buildUsableLogIndex(logs);
  const proj = buildProjectionMap(usableIdx);
  const eligibleIds = new Set<string>(proj.keys());

  // Filter out statless players (no usable logs to compute projection)
  const players = playersAll.filter((p) => {
    const id = String(p.id ?? "").trim();
    const bid = String((p as any).basePlayerId ?? "").trim();
    return (id && eligibleIds.has(id)) || (bid && eligibleIds.has(bid));
  });

  _players = players;
  _logs = logs;
  _usableLogsByPlayerId = usableIdx;
  _projectedFpByPlayerId = proj;

  console.log(
    `[DATA] logs=${logs.length} eligiblePlayers=${eligibleIds.size} players=${playersAll.length} -> ${players.length} ` +
      `(minGames=${MIN_USABLE_GAMES_FOR_PLAYER}, minMins=${MIN_MINUTES}) FPx${FP_MULTIPLIER}`
  );

  return { players, logs };
}

// --- Deterministic log selection (stable per cardId) ---
function hashStringToUint32(str: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickDeterministic<T>(arr: T[], seed: number): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const idx = seed % arr.length;
  return arr[idx];
}

// Get projection from logs (not arbitrary)
function projectedFpFromLogs(p: RawPlayer): number {
  const pid = baseId(p);
  const v = _projectedFpByPlayerId?.get(pid) ?? _projectedFpByPlayerId?.get(String(p.id)) ?? 0;
  return Number.isFinite(v) ? v : 0;
}

// BULLETPROOF: Always include slotIndex
function buildCard(p: RawPlayer, slotIndex: number, wasHeld: boolean = false): PlayerCard {
  return {
    cardId: p.id,
    basePlayerId: baseId(p),
    name: p.name,
    team: p.team ?? "Unknown",
    season: String(p.season),
    position: asPosition(p.position),
    tier: asTier(p.tier),
    salary: clampInt(n(p.salary), 1, 99),
    photoCode: p.photoCode,

    // Derived from logs average, already scaled by FP_MULTIPLIER
    projectedFp: projectedFpFromLogs(p),

    actualFp: 0,
    fpDelta: 0,
    statLine: {},
    achievements: [],
    gameInfo: { date: "", opponent: "", homeAway: undefined },
    slotIndex,
    wasHeld,
  };
}

// Deterministic: pick ONE log for this card, stable per cardId.
// Uses basePlayerId first for lookup, falls back to cardId.
function pickLogForCardDeterministic(card: PlayerCard): RawLog | null {
  const idx = _usableLogsByPlayerId;
  if (!idx) return null;

  const bid = String(card.basePlayerId ?? "").trim();
  const cid = String(card.cardId ?? "").trim();

  const logs = (bid && idx.get(bid)) || idx.get(cid) || null;
  if (!logs || logs.length === 0) return null;

  const seed = hashStringToUint32(cid);
  return pickDeterministic(logs, seed) ?? null;
}

let _seed = Date.now();

export async function dealInitialRoster(): Promise<{ cards: PlayerCard[]; capMax: number }> {
  await ensureDataLoaded();
  const rng = new RandomEngine(_seed++);

  const roster: RosterSlot[] = LineupGenerationEngine.generateDeterministicLineup(
    sportAdapter.config,
    (_players ?? []) as any[],
    rng,
    []
  );

  console.log("=== DEAL DEBUG ===");
  console.log("Generated roster length:", roster.length);

  const cards: PlayerCard[] = [];

  for (let i = 0; i < roster.length; i++) {
    const slot = roster[i];
    if (!slot.player) continue;

    const card = buildCard(slot.player as any, i, false);

    const log = pickLogForCardDeterministic(card);

    if (log) {
      const fx = computeFantasyFromLogWithBreakdown(log);

      card.actualFp = Math.max(0, fx.total * FP_MULTIPLIER);
      card.fpDelta = card.actualFp - (card.projectedFp ?? 0);
      card.statLine = fx.statsUsed ?? {};
      card.gameInfo = {
        date:     log.date     || (log.stats as any)?.kickoff_time || (log.stats as any)?.date          || (log.stats as any)?.game_date || "",
        opponent: log.opponent || (log.stats as any)?.opponent      || (log.stats as any)?.opponent_team || (log.stats as any)?.matchup   || "",
        homeAway: log.homeAway ?? ((log.stats as any)?.was_home === true ? "H" : (log.stats as any)?.was_home === false ? "A" : undefined),
      };

      // Attach breakdown for Stats Back (Agnostic)
      (card as any).fpBreakdown = scaleBreakdown(fx.breakdown, FP_MULTIPLIER);
    }

    if (i < 5) {
      console.log("[FP DEBUG - DEAL]", {
        name: card.name,
        cardId: card.cardId,
        basePlayerId: card.basePlayerId,
        projectedFp: card.projectedFp,
        actualFp: card.actualFp,
        ratio: card.projectedFp ? card.actualFp / card.projectedFp : null,
        base_total_points: log ? (log as any)?.stats?.total_points : null,
        base_fp_unscaled: log ? computeFantasyFromLogWithBreakdown(log).total : null,
        minutes: log ? getMinutes(log) : null,
        foundLog: !!log,
      });
    }

    cards.push(card);
  }

  const withLogs = cards.filter((c) => Number.isFinite(c.actualFp) && (c.actualFp as number) > 0).length;
  console.log(`[LOG MATCH RATE - DEAL] ${withLogs}/${cards.length}`);

  return { cards, capMax: CAP_MAX };
}

export async function redrawRoster(args: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ cards: PlayerCard[]; capMax: number }> {
  await ensureDataLoaded();
  const rng = new RandomEngine(_seed++);

  console.log("=== REDRAW DEBUG ===");
  console.log("Current cards:", args.currentCards.map((c) => `slot ${c.slotIndex}: ${c.position} $${c.salary}`));
  console.log("Locked IDs:", Array.from(args.lockedCardIds));

  // EARLY RETURN: All cards locked
  if (args.lockedCardIds.size === args.currentCards.length) {
    console.log("All cards locked - returning unchanged with wasHeld=true");
    return {
      cards: args.currentCards.map((c) => ({ ...c, wasHeld: true })),
      capMax: CAP_MAX,
    };
  }

  // Build heldSlots using slotIndex (not array position!)
  const rosterSize = args.currentCards.length;
  const heldSlots: RosterSlot[] = new Array(rosterSize);

  for (let i = 0; i < rosterSize; i++) {
    heldSlots[i] = { index: i, player: null, held: false };
  }

  // Fill in held positions
  for (const card of args.currentCards) {
    const isHeld = args.lockedCardIds.has(String(card.cardId));
    if (isHeld) {
      heldSlots[card.slotIndex] = {
        index: card.slotIndex,
        player: {
          id: card.cardId,
          basePlayerId: card.basePlayerId,
          name: card.name,
          position: card.position,
          salary: card.salary,
          team: card.team,
          season: card.season,
          tier: card.tier,
          photoCode: (card as any).photoCode,
        } as any,
        held: true,
      };
    }
  }

  const roster: RosterSlot[] = LineupGenerationEngine.generateDeterministicLineup(
    sportAdapter.config,
    (_players ?? []) as any[],
    rng,
    heldSlots
  );

  // BUILD CARDS USING SLOT INDEX
  const cards: PlayerCard[] = new Array(roster.length);

  // First pass: Place held cards using their slotIndex
  for (const card of args.currentCards) {
    if (args.lockedCardIds.has(String(card.cardId))) {
      const idx = card.slotIndex;
      cards[idx] = { ...card, wasHeld: true };
    }
  }

  // Second pass: Fill empty slots
  for (let i = 0; i < roster.length; i++) {
    if (cards[i]) continue;

    const slot = roster[i];
    if (!slot.player) continue;

    const card = buildCard(slot.player as any, i, false);
    const log = pickLogForCardDeterministic(card);

    if (log) {
      const fx = computeFantasyFromLogWithBreakdown(log);

      card.actualFp = Math.max(0, fx.total * FP_MULTIPLIER);
      card.fpDelta = card.actualFp - (card.projectedFp ?? 0);
      card.statLine = fx.statsUsed ?? {};
      card.gameInfo = {
        date:     log.date     || (log.stats as any)?.kickoff_time || (log.stats as any)?.date          || (log.stats as any)?.game_date || "",
        opponent: log.opponent || (log.stats as any)?.opponent      || (log.stats as any)?.opponent_team || (log.stats as any)?.matchup   || "",
        homeAway: log.homeAway ?? ((log.stats as any)?.was_home === true ? "H" : (log.stats as any)?.was_home === false ? "A" : undefined),
      };

      (card as any).fpBreakdown = scaleBreakdown(fx.breakdown, FP_MULTIPLIER);
    }

    if (i < 5) {
      console.log("[FP DEBUG - REDRAW]", {
        name: card.name,
        cardId: card.cardId,
        basePlayerId: card.basePlayerId,
        projectedFp: card.projectedFp,
        actualFp: card.actualFp,
        ratio: card.projectedFp ? card.actualFp / card.projectedFp : null,
        base_total_points: log ? (log as any)?.stats?.total_points : null,
        base_fp_unscaled: log ? computeFantasyFromLogWithBreakdown(log).total : null,
        minutes: log ? getMinutes(log) : null,
        foundLog: !!log,
      });
    }

    cards[i] = card;
  }

  const withLogs = cards.filter((c) => Number.isFinite(c.actualFp) && (c.actualFp as number) > 0).length;
  console.log(`[LOG MATCH RATE - REDRAW] ${withLogs}/${cards.length}`);

  return { cards, capMax: CAP_MAX };
}

export async function resolveRoster(args: { finalCards: PlayerCard[] }): Promise<ResolveResult> {
  // Preserve wasHeld and slotIndex - just clone the cards
  const cards = args.finalCards.map((c) => ({ ...c }));

  const totalFp = cards.reduce((s, c) => s + (Number.isFinite(c.actualFp) ? (c.actualFp as number) : 0), 0);
  const winTierLabel = ""; // Calculated in GameView via payoutLogic

  const sorted = [...cards].sort((a, b) => (b.actualFp || 0) - (a.actualFp || 0));
  const topCards = sorted.slice(0, 3);
  const topContributors = topCards.map((c) => ({ cardId: c.cardId, name: c.name, fp: c.actualFp || 0 }));
  const mvpCardId = sorted[0]?.cardId ?? "";

  return { cards, totalFp, winTierLabel, topContributors, mvpCardId };
}
