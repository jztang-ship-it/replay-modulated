/**
 * shared/engines/dataEngine.ts — Layer 1 (sport-agnostic)
 * Call configure() first to point at a sport's data files.
 */

import type { RawPlayer, RawLog } from "../types";

let PLAYERS_URL = "/data/players.json";
let LOGS_URL_PRIMARY = "/data/game-logs.json";
let LOGS_URL_FALLBACK = "/data/game-logs.json";

export function configure(urls: { players: string; logsPrimary?: string; logsFallback: string }): void {
  PLAYERS_URL = urls.players;
  LOGS_URL_PRIMARY = urls.logsPrimary ?? urls.logsFallback;
  LOGS_URL_FALLBACK = urls.logsFallback;
  invalidateCache();
}

let _players: RawPlayer[] | null = null;
let _logsByKey: Map<string, RawLog[]> | null = null;
let _loading: Promise<void> | null = null;

export function getPlayers(): RawPlayer[] {
  if (!_players) throw new Error("dataEngine not loaded — call ensureLoaded() first");
  return _players;
}

export function getLogsByKey(): Map<string, RawLog[]> {
  if (!_logsByKey) throw new Error("dataEngine not loaded — call ensureLoaded() first");
  return _logsByKey;
}

export function isLoaded(): boolean {
  return _players !== null && _logsByKey !== null;
}

export async function ensureLoaded(): Promise<void> {
  if (isLoaded()) return;
  if (_loading) return _loading;
  _loading = (async () => {
    const [players, logs] = await Promise.all([fetchJson<RawPlayer[]>(PLAYERS_URL), fetchLogs()]);
    _players = players;
    _logsByKey = buildLogIndex(logs);
    _loading = null;
  })();
  return _loading;
}

export function invalidateCache(): void {
  _players = null;
  _logsByKey = null;
  _loading = null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

async function fetchLogs(): Promise<RawLog[]> {
  try { return await fetchJson<RawLog[]>(LOGS_URL_PRIMARY); }
  catch { return await fetchJson<RawLog[]>(LOGS_URL_FALLBACK); }
}

function buildLogIndex(logs: RawLog[]): Map<string, RawLog[]> {
  const m = new Map<string, RawLog[]>();
  const push = (key: string, log: RawLog) => {
    const k = key.trim();
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(log);
    else m.set(k, [log]);
  };
  for (const log of logs) {
    const base = String((log as any).basePlayerId ?? "").trim();
    const pid = String((log as any).playerId ?? "").trim();
    const season = toSeasonNum((log as any).season);
    if (base) push(base, log);
    if (pid && pid !== base) push(pid, log);
    if (season !== null) {
      if (base) push(`${base}|${season}`, log);
      if (pid && pid !== base) push(`${pid}|${season}`, log);
    }
  }
  return m;
}

function toSeasonNum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}
