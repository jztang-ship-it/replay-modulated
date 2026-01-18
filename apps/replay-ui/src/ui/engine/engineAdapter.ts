// apps/replay-ui/src/ui/engine/engineAdapter.ts
// GameView imports:
// import { dealInitialRoster, redrawRoster, resolveRoster } from "./engine/engineAdapter";

import type { PlayerCard, ResolveResult, Position, TierColor } from "./types";

// Browser URLs (must exist under apps/replay-ui/public)
const PLAYERS_URL = "/data/players.json";
const LOGS_URL = "/data/game-logs.json";

// Core constraints (football)
const CAP_MAX = 180;
const CAP_MIN = 172;
const ROSTER_SIZE = 6;
const MIN_MINUTES = 20; // temporarily set to 1 for debugging if needed

// -------------------- Raw data types --------------------
type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  season: string | number;
  position: string;
  tier?: string; // ORANGE/PURPLE/...
  salary: number | string;
  photoCode?: string;
};

type RawLog = {
  playerId: string;
  stats: Record<string, any>;
  date?: string;
  opponent?: string;
  homeAway?: "H" | "A";
  // some providers may put minutes top-level; we tolerate that
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
function asPosition(raw: unknown): Position {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "GK" || s === "G" || s.includes("KEEP")) return "GK";
  if (["DEF", "D", "CB", "LB", "RB", "LWB", "RWB"].includes(s) || s.includes("BACK")) return "DEF";
  if (["MID", "M", "CM", "CDM", "CAM", "LM", "RM"].includes(s) || s.includes("MID")) return "MID";
  if (["FWD", "F", "FW", "ST", "CF", "LW", "RW"].includes(s) || s.includes("WING") || s.includes("STRIK"))
    return "FWD";
  return "MID";
}
function asTier(raw: unknown): TierColor {
  const s = String(raw ?? "WHITE").trim().toUpperCase();
  if (s === "ORANGE" || s === "PURPLE" || s === "BLUE" || s === "GREEN" || s === "WHITE") return s;
  return "WHITE";
}
function isGK(pos: unknown): boolean {
  return asPosition(pos) === "GK";
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

  // NOTE: minutes now uses the forgiving getter
  const minutes = getMinutes(log);

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

// -------------------- data cache --------------------
let _players: RawPlayer[] | null = null;
let _logs: RawLog[] | null = null;

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Some feeds might wrap logs as { logs: [...] } / { data: [...] }.
 * We normalize to RawLog[].
 */
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

// -------------------- log picker (FIXED) --------------------
function coerceNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Forgiving minutes extractor:
 * - top-level: log.minutes/min/mins/MIN
 * - stats-level: stats.minutes/min/mins/MIN/minutesPlayed/timePlayed/time, etc.
 * - also tolerates "MM:SS" or "HH:MM:SS" in a few common fields
 */
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
    st.time, // sometimes time is minutes
  ];

  for (const c of candidates) {
    const v = coerceNumber(c);
    if (v != null && v >= 0) return v;
  }

  const timeStr =
    (st.timeOnField ?? st.time_on_field ?? (log as any)?.timeOnField ?? (log as any)?.time_on_field) as unknown;

  if (typeof timeStr === "string") {
    const parts = timeStr.split(":").map((p) => Number(p));
    if (parts.every((n) => Number.isFinite(n))) {
      // "MM:SS"
      if (parts.length === 2) return parts[0];
      // "HH:MM:SS"
      if (parts.length === 3) return parts[0] * 60 + parts[1];
    }
  }

  return 0;
}

/**
 * Also tolerate logs where playerId might equal basePlayerId.
 * We try exact match against cardId first, then baseId.
 */
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

// -------------------- roster helpers --------------------
function sumSalary(players: RawPlayer[]): number {
  return players.reduce((s, p) => s + n(p.salary), 0);
}
function countPos(players: RawPlayer[], pos: Position): number {
  return players.reduce((acc, p) => acc + (asPosition(p.position) === pos ? 1 : 0), 0);
}
function isValidComposition(players: RawPlayer[]): boolean {
  return (
    countPos(players, "GK") === 1 &&
    countPos(players, "DEF") >= 1 &&
    countPos(players, "MID") >= 1 &&
    countPos(players, "FWD") >= 1
  );
}
function isValidSalary(players: RawPlayer[]): boolean {
  const total = sumSalary(players);
  return total >= CAP_MIN && total <= CAP_MAX;
}

// -------------------- Strategy selection --------------------
type Path = "A_SOLO_STAR" | "B_DUAL_ELITE" | "C_BALANCED";

function choosePath(rng: () => number): Path {
  const r = rng();
  if (r < 0.34) return "A_SOLO_STAR";
  if (r < 0.67) return "B_DUAL_ELITE";
  return "C_BALANCED";
}

// Candidate selection utilities
function poolBy(pool: RawPlayer[], usedBase: Set<string>, predicate: (p: RawPlayer) => boolean): RawPlayer[] {
  return pool.filter((p) => !usedBase.has(baseId(p)) && predicate(p));
}

// pick closest salary to a target (within cap feasibility)
function pickClosestToTarget(cands: RawPlayer[], target: number, rng: () => number): RawPlayer | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => Math.abs(n(a.salary) - target) - Math.abs(n(b.salary) - target));
  const top = sorted.slice(0, Math.min(10, sorted.length));
  return top[Math.floor(rng() * top.length)];
}

// -------------------- THE ROSTER SCULPTOR (FIXED: ALWAYS 6) --------------------
function generateRosterSculpted(allPlayers: RawPlayer[], rng: () => number): RawPlayer[] {
  const pool = [...allPlayers];
  shuffleInPlace(pool, rng);

  const chosen: RawPlayer[] = [];
  const usedBase = new Set<string>();

  const path = choosePath(rng);

  // ---- Step 1: Anchors ----
  if (path === "A_SOLO_STAR") {
    const oranges = poolBy(pool, usedBase, (p) => asTier(p.tier) === "ORANGE");
    const pick = oranges.length
      ? oranges[Math.floor(rng() * oranges.length)]
      : [...poolBy(pool, usedBase, () => true)].sort((a, b) => n(b.salary) - n(a.salary))[0];

    if (pick) {
      chosen.push(pick);
      usedBase.add(baseId(pick));
    }
  } else if (path === "B_DUAL_ELITE") {
    const purples = poolBy(pool, usedBase, (p) => asTier(p.tier) === "PURPLE");
    shuffleInPlace(purples, rng);
    for (const p of purples) {
      if (chosen.length >= 2) break;
      chosen.push(p);
      usedBase.add(baseId(p));
    }
    while (chosen.length < 2) {
      const fallback = poolBy(pool, usedBase, (p) => asPosition(p.position) !== "GK").sort(
        (a, b) => n(b.salary) - n(a.salary)
      )[0];
      if (!fallback) break;
      chosen.push(fallback);
      usedBase.add(baseId(fallback));
    }
  } else {
    while (chosen.length < 2) {
      const bg = poolBy(pool, usedBase, (p) => {
        const t = asTier(p.tier);
        return t === "BLUE" || t === "GREEN";
      });
      if (bg.length === 0) break;
      const p = bg[Math.floor(rng() * bg.length)];
      chosen.push(p);
      usedBase.add(baseId(p));
    }
  }

  // ---- Step 2: Positional skeleton ----
  if (countPos(chosen, "GK") === 0) {
    const gks = poolBy(pool, usedBase, (p) => asPosition(p.position) === "GK");
    const gk = gks.length ? gks[Math.floor(rng() * gks.length)] : null;
    if (gk) {
      chosen.push(gk);
      usedBase.add(baseId(gk));
    }
  }

  const requiredOutfield: Position[] = ["DEF", "MID", "FWD"];
  for (const pos of requiredOutfield) {
    if (countPos(chosen, pos) >= 1) continue;
    const cands = poolBy(pool, usedBase, (p) => asPosition(p.position) === pos);
    const pick = cands.length ? cands[Math.floor(rng() * cands.length)] : null;
    if (pick) {
      chosen.push(pick);
      usedBase.add(baseId(pick));
    }
  }

  // ---- Step 3: Fill to 6 FLEX (no GK) guided by remaining budget ----
  while (chosen.length < ROSTER_SIZE) {
    const total = sumSalary(chosen);
    const remaining = CAP_MAX - total;
    const slotsLeft = ROSTER_SIZE - chosen.length;
    const targetAvg = remaining / Math.max(1, slotsLeft);

    const flexCands = poolBy(pool, usedBase, (p) => asPosition(p.position) !== "GK");
    const pick = pickClosestToTarget(flexCands, targetAvg, rng);

    // IMPORTANT: don't break; let the hard-fill handle it
    if (!pick) break;

    chosen.push(pick);
    usedBase.add(baseId(pick));
  }

  // ---- HARD GUARANTEE: ALWAYS 6 ----
  let roster = chosen.slice(0, ROSTER_SIZE);

  // If short, fill with cheapest legal (prefer non-GK unless GK missing)
  if (roster.length < ROSTER_SIZE) {
    const hasGK = roster.some((p) => isGK(p.position));
    const used = new Set(roster.map((p) => baseId(p)));

    // If GK missing (shouldn't happen, but tolerate), add one first
    if (!hasGK) {
      const gk = pool
        .filter((p) => isGK(p.position))
        .filter((p) => !used.has(baseId(p)))
        .sort((a, b) => n(a.salary) - n(b.salary))[0];
      if (gk) {
        roster.push(gk);
        used.add(baseId(gk));
      }
    }

    const fillPool = pool
      .filter((p) => !used.has(baseId(p)))
      .filter((p) => asPosition(p.position) !== "GK" || !roster.some((x) => isGK(x.position)))
      .sort((a, b) => n(a.salary) - n(b.salary));

    for (const p of fillPool) {
      if (roster.length >= ROSTER_SIZE) break;
      roster.push(p);
      used.add(baseId(p));
    }
  }

  // If we accidentally have >1 GK, replace extra GKs with cheapest flex until exactly 1.
  while (countPos(roster, "GK") > 1) {
    const firstGKIdx = roster.findIndex((p) => isGK(p.position));
    const extraIdx = roster.findIndex((p, i) => isGK(p.position) && i !== firstGKIdx);
    if (extraIdx < 0) break;

    const used = new Set(roster.map((p) => baseId(p)));
    const flex = pool
      .filter((p) => asPosition(p.position) !== "GK" && !used.has(baseId(p)))
      .sort((a, b) => n(a.salary) - n(b.salary))[0];

    if (!flex) break;
    roster[extraIdx] = flex;
  }

  // ---- Repair salary band again after hard fill ----
  roster = repairSalaryBand(pool, roster, rng);

  // If repair failed to keep 6 (rare), re-fill to 6 again (cheapest available)
  if (roster.length < ROSTER_SIZE) {
    const used = new Set(roster.map((p) => baseId(p)));
    const fillPool = pool
      .filter((p) => !used.has(baseId(p)))
      .filter((p) => asPosition(p.position) !== "GK" || !roster.some((x) => isGK(x.position)))
      .sort((a, b) => n(a.salary) - n(b.salary));

    for (const p of fillPool) {
      if (roster.length >= ROSTER_SIZE) break;
      roster.push(p);
      used.add(baseId(p));
    }
  }

  // If still invalid, last-resort build — but ALSO hard-fill to 6 afterwards
  if (roster.length !== ROSTER_SIZE || !isValidComposition(roster) || !isValidSalary(roster)) {
    roster = lastResortBuild(pool, rng);
    if (roster.length < ROSTER_SIZE) {
      const used = new Set(roster.map((p) => baseId(p)));
      const fillPool = pool
        .filter((p) => !used.has(baseId(p)))
        .filter((p) => asPosition(p.position) !== "GK" || !roster.some((x) => isGK(x.position)))
        .sort((a, b) => n(a.salary) - n(b.salary));
      for (const p of fillPool) {
        if (roster.length >= ROSTER_SIZE) break;
        roster.push(p);
        used.add(baseId(p));
      }
    }
    roster = repairSalaryBand(pool, roster, rng).slice(0, ROSTER_SIZE);
  }

  return roster.slice(0, ROSTER_SIZE);
}

function repairSalaryBand(pool: RawPlayer[], roster0: RawPlayer[], rng: () => number): RawPlayer[] {
  let roster = [...roster0].slice(0, ROSTER_SIZE);

  const maxIter = 60;
  for (let iter = 0; iter < maxIter; iter++) {
    const total = sumSalary(roster);
    if (total >= CAP_MIN && total <= CAP_MAX) return roster;

    const used = new Set(roster.map((p) => baseId(p)));

    if (total < CAP_MIN) {
      const victimIdx = roster
        .map((p, i) => ({ p, i, sal: n(p.salary) }))
        .sort((a, b) => a.sal - b.sal)[0]?.i;

      if (victimIdx === undefined) break;
      const victim = roster[victimIdx];
      const pos = asPosition(victim.position);
      const need = CAP_MIN - total;

      const cands = pool
        .filter((p) => asPosition(p.position) === pos)
        .filter((p) => !used.has(baseId(p)))
        .filter((p) => n(p.salary) > n(victim.salary))
        .sort(
          (a, b) =>
            Math.abs(n(a.salary) - (n(victim.salary) + need)) -
            Math.abs(n(b.salary) - (n(victim.salary) + need))
        );

      if (cands.length === 0) break;

      const pick = cands[Math.floor(rng() * Math.min(8, cands.length))];
      roster[victimIdx] = pick;
      continue;
    } else {
      const victimIdx = roster
        .map((p, i) => ({ p, i, sal: n(p.salary) }))
        .sort((a, b) => b.sal - a.sal)[0]?.i;

      if (victimIdx === undefined) break;
      const victim = roster[victimIdx];
      const pos = asPosition(victim.position);
      const over = total - CAP_MAX;

      const cands = pool
        .filter((p) => asPosition(p.position) === pos)
        .filter((p) => !used.has(baseId(p)))
        .filter((p) => n(p.salary) < n(victim.salary))
        .sort(
          (a, b) =>
            Math.abs(n(victim.salary) - over - n(a.salary)) -
            Math.abs(n(victim.salary) - over - n(b.salary))
        );

      if (cands.length === 0) break;

      const pick = cands[Math.floor(rng() * Math.min(8, cands.length))];
      roster[victimIdx] = pick;
      continue;
    }
  }

  return roster;
}

function lastResortBuild(pool0: RawPlayer[], rng: () => number): RawPlayer[] {
  const pool = [...pool0];
  shuffleInPlace(pool, rng);

  const used = new Set<string>();
  const roster: RawPlayer[] = [];

  // exactly 1 GK
  const gk = pool.find((p) => asPosition(p.position) === "GK");
  if (gk) {
    roster.push(gk);
    used.add(baseId(gk));
  }

  // need 1 DEF/MID/FWD
  for (const pos of ["DEF", "MID", "FWD"] as const) {
    const p = pool.find((x) => asPosition(x.position) === pos && !used.has(baseId(x)));
    if (p) {
      roster.push(p);
      used.add(baseId(p));
    }
  }

  // fill remaining flex (no GK) by closest to target avg
  while (roster.length < ROSTER_SIZE) {
    const total = sumSalary(roster);
    const remaining = CAP_MAX - total;
    const slotsLeft = ROSTER_SIZE - roster.length;
    const target = remaining / Math.max(1, slotsLeft);

    const cands = pool.filter((p) => asPosition(p.position) !== "GK" && !used.has(baseId(p)));
    const pick = pickClosestToTarget(cands, target, rng);
    if (!pick) break;
    roster.push(pick);
    used.add(baseId(pick));
  }

  const repaired = repairSalaryBand(pool, roster.slice(0, ROSTER_SIZE), rng).slice(0, ROSTER_SIZE);

  // ensure exactly 6 even here
  if (repaired.length < ROSTER_SIZE) {
    const used2 = new Set(repaired.map((p) => baseId(p)));
    const fill = pool
      .filter((p) => !used2.has(baseId(p)))
      .filter((p) => asPosition(p.position) !== "GK" || !repaired.some((x) => isGK(x.position)))
      .sort((a, b) => n(a.salary) - n(b.salary));
    for (const p of fill) {
      if (repaired.length >= ROSTER_SIZE) break;
      repaired.push(p);
      used2.add(baseId(p));
    }
  }

  return repaired.slice(0, ROSTER_SIZE);
}

// -------------------- module seed so redraw changes --------------------
let _seed = Date.now();

// -------------------- PUBLIC API (GameView-compatible) --------------------
// -------------------- PUBLIC API (GameView-compatible) --------------------
export async function dealInitialRoster(): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = mulberry32(_seed++);

  const rawRoster = generateRosterSculpted(players, rng);
  const cards = rawRoster.map(buildCard);

  for (const card of cards) {
    const log = pickRandomLogForCard(card.cardId, logs, rng, card.basePlayerId);
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
  const lockedSalary = locked.reduce((s, c) => s + (c.salary ?? 0), 0);

  // Pool excludes locked base ids
  const pool = players.filter((p) => !lockedBase.has(baseId(p)));

  // Fresh candidates (already buildCard'd)
  const fresh = generateRosterSculpted(pool, rng).map(buildCard);

  const merged: PlayerCard[] = [...locked];
  const used = new Set(locked.map((c) => c.basePlayerId));
  let capUsed = lockedSalary;

  // 1) Add fresh cards under cap, respecting uniqueness + GK rule
  for (const c of fresh) {
    if (merged.length >= ROSTER_SIZE) break;
    if (used.has(c.basePlayerId)) continue;
    if (c.position === "GK" && merged.some((x) => x.position === "GK")) continue; // exactly 1 GK
    const sal = c.salary ?? 0;
    if (capUsed + sal > CAP_MAX) continue;

    merged.push(c);
    used.add(c.basePlayerId);
    capUsed += sal;
  }

  // 2) If short, fill with cheapest legal under cap (never exceed cap)
  if (merged.length < ROSTER_SIZE) {
    const used2 = new Set(merged.map((c) => c.basePlayerId));
    const fill = pool
      .filter((p) => !used2.has(baseId(p)))
      .filter((p) => asPosition(p.position) !== "GK" || !merged.some((c) => c.position === "GK"))
      .sort((a, b) => n(a.salary) - n(b.salary));

    for (const p of fill) {
      if (merged.length >= ROSTER_SIZE) break;

      const sal = clampInt(n(p.salary), 1, 99);
      if (capUsed + sal > CAP_MAX) continue;

      const c = buildCard(p);
      merged.push(c);
      used2.add(c.basePlayerId);
      capUsed += sal;
    }
  }

  // 3) If we have 6 but are below CAP_MIN, try to upgrade unlocked cards (best-effort).
  // Greedy: upgrade cheapest unlocked first, same position only, keep uniqueness + GK rule, never exceed CAP_MAX.
  if (merged.length === ROSTER_SIZE && capUsed < CAP_MIN) {
    const lockedSet = args.lockedCardIds;

    const upgradeTargets = merged
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !lockedSet.has(c.cardId))
      .sort((a, b) => (a.c.salary ?? 0) - (b.c.salary ?? 0));

    for (const { c: victim, i } of upgradeTargets) {
      if (capUsed >= CAP_MIN) break;

      const victimPos = victim.position;
      const victimSal = victim.salary ?? 0;
      const capAfterRemove = capUsed - victimSal;

      const usedNow = new Set(merged.map((x) => x.basePlayerId));
      usedNow.delete(victim.basePlayerId);

      let bestP: RawPlayer | null = null;
      let bestSal = -1;

      for (const p of pool) {
        const b = baseId(p);
        if (usedNow.has(b)) continue;

        const pos = asPosition(p.position);
        if (pos !== victimPos) continue;

        // GK rule: only one GK total
        if (pos === "GK" && merged.some((x) => x.position === "GK" && x.cardId !== victim.cardId)) continue;

        const sal = clampInt(n(p.salary), 1, 99);
        if (capAfterRemove + sal > CAP_MAX) continue;

        if (sal > bestSal) {
          bestSal = sal;
          bestP = p;
        }
      }

      if (!bestP) continue;

      const repl = buildCard(bestP);
      merged[i] = repl;
      capUsed = capAfterRemove + (repl.salary ?? 0);
    }
  }

  // 4) Attach logs only for new (unlocked) cards
  for (const card of merged) {
    if (args.lockedCardIds.has(card.cardId)) continue;

    const log = pickRandomLogForCard(card.cardId, logs, rng, card.basePlayerId);
    if (!log) continue;

    const actualFp = computeFantasyPointsFromLog(log) * 10;
    card.actualFp = actualFp;
    card.fpDelta = actualFp - (card.projectedFp ?? 0);
    card.statLine = log.stats ?? {};
    card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
  }

  return { cards: merged.slice(0, ROSTER_SIZE), capMax: CAP_MAX };
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
