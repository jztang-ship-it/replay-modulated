// frontend/src/adapters/gameAdapter.ts
// SPORT-AGNOSTIC VERSION - Uses backend LineupGenerationEngine

import type { PlayerCard, ResolveResult, Position, TierColor } from "./types";
import { sportAdapter } from "./SportAdapter";
import { LineupGenerationEngine } from '../../../backend/engines/LineupGenerationEngine';
import { RandomEngine } from '../../../backend/engines/RandomEngine';
import type { RosterSlot } from '../../../backend/models';

// Browser URLs (must exist under frontend/public)
const PLAYERS_URL = "/data/players.json";
const LOGS_URL = "/data/game-logs.json";

// Get values from sport adapter
const CAP_MAX = sportAdapter.salaryCap;
const MIN_MINUTES = 20;

// -------------------- Raw data types --------------------
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

// -------------------- tiny utils --------------------
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

// -------------------- normalizers --------------------
function asPosition(raw: unknown): Position {
  return sportAdapter.normalizePosition(raw);
}

function asTier(raw: unknown): TierColor {
  return sportAdapter.normalizeTier(raw);
}

// -------------------- objective FP --------------------
function computeFantasyPointsFromLog(log: RawLog): number {
  const stats = log?.stats ?? {};
  const minutes = getMinutes(log);
  stats.minutes = minutes;
  return sportAdapter.computeFantasyPoints(stats);
}

// -------------------- data cache --------------------
let _players: RawPlayer[] | null = null;
let _logs: RawLog[] | null = null;

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

async function ensureDataLoaded(): Promise<{ players: RawPlayer[]; logs: RawLog[] }> {
  if (_players && _logs) return { players: _players, logs: _logs };

  const [playersRaw, logsRaw] = await Promise.all([loadJson<any>(PLAYERS_URL), loadJson<any>(LOGS_URL)]);
  const players = (Array.isArray(playersRaw) ? playersRaw : []) as RawPlayer[];
  const logs = normalizeLogs(logsRaw);

  _players = players;
  _logs = logs;
  return { players, logs };
}

// -------------------- card builder --------------------
function buildCard(p: RawPlayer): PlayerCard {
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
    projectedFp: 0,
    actualFp: 0,
    fpDelta: 0,
    statLine: {},
    achievements: [],
    gameInfo: { date: "", opponent: "", homeAway: undefined },
  };
}

// -------------------- log picker --------------------
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

  const timeStr = (st.timeOnField ?? st.time_on_field ?? (log as any)?.timeOnField ?? (log as any)?.time_on_field) as unknown;

  if (typeof timeStr === "string") {
    const parts = timeStr.split(":").map((p) => Number(p));
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 2) return parts[0];
      if (parts.length === 3) return parts[0] * 60 + parts[1];
    }
  }

  return 0;
}

function pickRandomLogForCard(cardId: string, logs: RawLog[], rng: () => number, basePlayerId?: string): RawLog | null {
  const cid = String(cardId);
  const bid = String(basePlayerId ?? "");

  const candidates = logs.filter((l) => {
    if (!l || !l.stats || typeof l.stats !== "object") return false;
    const pid = String((l as any).playerId ?? (l as any).player_id ?? (l as any).athleteId ?? (l as any).athlete_id ?? "");
    if (!pid) return false;
    const match = pid === cid || (bid && pid === bid);
    if (!match) return false;
    return getMinutes(l) >= MIN_MINUTES;
  });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

// -------------------- MAIN FUNCTIONS --------------------
let _seed = Date.now();

export async function dealInitialRoster(): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = new RandomEngine(_seed++);

  // Use the validated backend engine
  const roster: RosterSlot[] = LineupGenerationEngine.generateDeterministicLineup(
    sportAdapter.config,
    players as any[],
    rng,
    []
  );

  console.log("=== DEAL DEBUG ===");
  console.log("Generated roster length:", roster.length);
  roster.forEach((slot, i) => {
    if (slot.player) {
      console.log(`Slot ${i}: ${slot.player.position} $${slot.player.salary}`);
    }
  });

  const cards: PlayerCard[] = [];
  for (const slot of roster) {
    if (!slot.player) continue;
    
    const card = buildCard(slot.player as any);
    const log = pickRandomLogForCard(card.cardId, logs, () => rng.random(), card.basePlayerId);
    
    if (log) {
      const actualFp = computeFantasyPointsFromLog(log) * 10;
      card.actualFp = actualFp;
      card.fpDelta = actualFp - (card.projectedFp ?? 0);
      card.statLine = log.stats ?? {};
      card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
    }
    
    cards.push(card);
  }

  return { cards, capMax: CAP_MAX };
}

export async function redrawRoster(args: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = new RandomEngine(_seed++);

  // Convert locked cards to RosterSlots
  const heldSlots: RosterSlot[] = args.currentCards.map((card, index) => ({
    index,
    player: args.lockedCardIds.has(card.cardId) ? {
      id: card.cardId,
      basePlayerId: card.basePlayerId,
      name: card.name,
      position: card.position,
      salary: card.salary,
      team: card.team,
      season: card.season,
      tier: card.tier,
    } as any : null,
    held: args.lockedCardIds.has(card.cardId),
  }));

  // Use the validated backend engine with held slots
  const roster: RosterSlot[] = LineupGenerationEngine.generateDeterministicLineup(
    sportAdapter.config,
    players as any[],
    rng,
    heldSlots
  );

  const cards: PlayerCard[] = [];
  for (const slot of roster) {
    if (!slot.player) continue;
    
    const card = buildCard(slot.player as any);
    
    // Don't re-resolve held cards
    if (args.lockedCardIds.has(card.cardId)) {
      const existing = args.currentCards.find(c => c.cardId === card.cardId);
      if (existing) {
        cards.push(existing);
        continue;
      }
    }
    
    const log = pickRandomLogForCard(card.cardId, logs, () => rng.random(), card.basePlayerId);
    if (log) {
      const actualFp = computeFantasyPointsFromLog(log) * 10;
      card.actualFp = actualFp;
      card.fpDelta = actualFp - (card.projectedFp ?? 0);
      card.statLine = log.stats ?? {};
      card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
    }
    
    cards.push(card);
  }

  return { cards, capMax: CAP_MAX };
}

export async function resolveRoster(args: { finalCards: PlayerCard[] }): Promise<ResolveResult> {
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

  return { cards, totalFp, winTierLabel, topContributors, mvpCardId };
}