/**
 * shared/engines/dataEngine.ts — Layer 1 (sport-agnostic)
 *
 * Two operating modes:
 *
 * 1. **Monolithic** (legacy) — `configure({ players, logsFallback })`. Loads
 *    one combined players.json + one combined game-logs.json. All seasons in
 *    one file. Used today by baseball/football, and was basketball's mode
 *    before the per-season migration.
 *
 * 2. **Per-season** — `configurePerSeason({ seasonsBaseUrl })` followed by
 *    `setActiveSeason(key)`. Loads only that season's
 *    `seasons/{key}/players.json` + `seasons/{key}/gamelogs.json`. The active
 *    season is set once per UTC day by the slot-machine reel; the data
 *    engine reloads when it changes. Mobile clients pull only ~10 MB per day
 *    instead of all-seasons-merged.
 */

import type { RawPlayer, RawLog } from "../types";

type LoadMode = "monolithic" | "per-season";

let loadMode: LoadMode = "monolithic";

// Monolithic-mode URLs.
let PLAYERS_URL = "/data/players.json";
let LOGS_URL_PRIMARY = "/data/game-logs.json";
let LOGS_URL_FALLBACK = "/data/game-logs.json";

// Per-season-mode config.
let SEASONS_BASE_URL = "/data/seasons";
let activeSeasonKey: string | null = null;

export function configure(urls: { players: string; logsPrimary?: string; logsFallback: string }): void {
  loadMode = "monolithic";
  PLAYERS_URL = urls.players;
  LOGS_URL_PRIMARY = urls.logsPrimary ?? urls.logsFallback;
  LOGS_URL_FALLBACK = urls.logsFallback;
  invalidateCache();
}

export function configurePerSeason(cfg: { seasonsBaseUrl: string }): void {
  loadMode = "per-season";
  SEASONS_BASE_URL = cfg.seasonsBaseUrl.replace(/\/$/, "");
  invalidateCache();
}

/**
 * Normalize a season identifier to the 4-digit directory-key form used by
 * the per-season data files (e.g., `seasons/2425/players.json`).
 *
 * Accepts:
 *   - "2425"           → "2425" (already short form, idempotent)
 *   - "2024-25"        → "2425" (label form, hyphenated)
 *   - "1999-00"        → "9900" (Y2K crossover)
 *   - "1999-2000"      → "9900" (4-digit second part)
 *   - anything else    → returned unchanged (pass-through for safety)
 *
 * Why: challenge records and some adapter paths historically stored the
 * label form ("2024-25") while the data files live under the directory
 * key ("2425"). Recipients landing on a challenge with a label-form
 * season would 404 on /basketball/data/seasons/2024-25/players.json.
 * Normalizing at the boundary handles legacy challenges AND any future
 * accidental drift.
 */
export function normalizeSeasonKey(input: string): string {
  if (!input) return input;
  if (/^\d{4}$/.test(input)) return input;
  const m = input.match(/^(\d{4})-(\d{2,4})$/);
  if (!m) return input;
  return m[1].slice(-2) + m[2].slice(-2);
}

/**
 * Pin the active season for per-season-mode loads. Idempotent — calling
 * with the same key is a no-op. Calling with a different key invalidates
 * the cache so the next ensureLoaded() pulls the new season's files.
 *
 * The input is normalized via normalizeSeasonKey so label-form values
 * ("2024-25") map to the directory-key form ("2425") used by the static
 * data files.
 */
export function setActiveSeason(key: string): void {
  const normalized = normalizeSeasonKey(key);
  if (normalized === activeSeasonKey) return;
  activeSeasonKey = normalized;
  invalidateCache();
  // Notify subscribers (GameView) so they can re-run ensureLoaded.
  // Without this, the FTUE→reel transition swaps the season key, blanks
  // the cache, but leaves dataReady=true — the next deal throws.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("replaymod:active-season-change", { detail: { key: normalized } }));
  }
}

export function getActiveSeason(): string | null {
  return activeSeasonKey;
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
    if (loadMode === "monolithic") {
      const [players, logs] = await Promise.all([fetchJson<RawPlayer[]>(PLAYERS_URL), fetchLogs()]);
      _players = players;
      _logsByKey = buildLogIndex(logs);
    } else {
      if (!activeSeasonKey) {
        throw new Error("dataEngine: per-season mode requires setActiveSeason() before ensureLoaded()");
      }
      const playersUrl = `${SEASONS_BASE_URL}/${activeSeasonKey}/players.json`;
      const logsUrl = `${SEASONS_BASE_URL}/${activeSeasonKey}/gamelogs.json`;
      const [players, logs] = await Promise.all([
        fetchJson<RawPlayer[]>(playersUrl),
        fetchJson<RawLog[]>(logsUrl),
      ]);
      _players = players;
      _logsByKey = buildLogIndex(logs);
    }
    _loading = null;
  })();
  return _loading;
}

export function invalidateCache(): void {
  _players = null;
  _logsByKey = null;
  _loading = null;
  _playersLoading = null;
}

// ── Players-only fast path ──────────────────────────────────────────────────
// The FTUE ceremony needs player RECORDS (~176 KB players.json) but not the
// ~9.5 MB gamelogs. ensureLoaded() awaits both in a Promise.all, so getPlayers()
// isn't usable until logs land — which made the ceremony wait behind the big
// download (the phone load-race that skipped it). ensurePlayersLoaded() loads
// only players.json so the ceremony can mount fast. Idempotent; a no-op once
// _players is set (by this OR ensureLoaded, whichever wins).
let _playersLoading: Promise<void> | null = null;
export function arePlayersLoaded(): boolean {
  return _players !== null;
}
export async function ensurePlayersLoaded(): Promise<void> {
  if (_players !== null) return;
  if (_playersLoading) return _playersLoading;
  _playersLoading = (async () => {
    const url = loadMode === "monolithic"
      ? PLAYERS_URL
      : (activeSeasonKey ? `${SEASONS_BASE_URL}/${activeSeasonKey}/players.json` : null);
    if (!url) { _playersLoading = null; return; } // per-season w/o pinned season → leave unloaded
    try {
      _players = await fetchJson<RawPlayer[]>(url);
    } catch (e) {
      _playersLoading = null;
      throw e; // reject → loader effect's .catch leaves unready (no false-ready)
    }
    _playersLoading = null;
  })();
  return _playersLoading;
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
