// src/adapters/gameAdapter.ts
// Sport-agnostic roster deal/draw/resolve adapter

import { sportAdapter } from "./SportAdapter";
import type { PlayerCard, TierColor } from "./types";

// Browser URLs (must exist under /public)
const PLAYERS_URL = "/data/players.json";

// Prefer enriched if present
const LOGS_URL_PRIMARY = "/data/game-logs.enriched.json";
const LOGS_URL_FALLBACK = "/data/game-logs.json";

// Game constants (sportAdapter-driven)
const CAP_MAX = sportAdapter.salaryCap;


const ROSTER_SIZE = sportAdapter.rosterSize;

// Slot requirements (Layer-2 constraints)
const SLOT_REQ: Array<"FW" | "MD" | "DE" | "GK" | "FLEX"> = ["FW", "MD", "DE", "GK", "FLEX", "FLEX"];

// -------------------- Return shapes --------------------
type DealLikeResult = {
  roster: PlayerCard[];
  cards: PlayerCard[];
  lineup?: PlayerCard[];
  finalCards?: PlayerCard[];
};

type ResolveLikeResult = DealLikeResult & {
  mvpId?: string;
  mvpCardId?: string;
  topCardId?: string;
};

// -------------------- Raw data types --------------------
type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  season: string | number;
  position: string;
  tier?: string;
  salary?: number | string;
  photoCode?: number | string;
};

type RawLog = {
  id?: string;
  sport?: string;
  playerId?: string;
  basePlayerId?: string;
  season?: number | string;
  matchDate?: string;
  date?: string;
  opponent?: string;
  homeAway?: "H" | "A";
  stats: Record<string, any>;
  events?: Record<string, any>;
};

// -------------------- Tiny utils --------------------
function n(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.-]/g, "");
  const out = Number(cleaned);
  return Number.isFinite(out) ? out : 0;
}

function clampInt(v: number, lo: number, hi: number) {
  const x = Math.round(v);
  return Math.max(lo, Math.min(hi, x));
}

function upperPos(p: any): string {
  return String(p?.position ?? "").toUpperCase().trim();
}

function normStr(s: any) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function baseId(p: { id: string; basePlayerId?: string }) {
  const b = String(p.basePlayerId ?? "").trim();
  return b.length ? b : String(p.id);
}

/**
 * PERSON KEY (critical):
 * - Primary: basePlayerId (stable person id)
 * - Fallback: name|team (to catch data issues like Adam Wharton baseId conflict)
 */
function personKey(p: { basePlayerId?: string; name?: string; team?: string; id?: string }) {
  const b = String(p.basePlayerId ?? "").trim();
  if (b) return `base:${b}`;
  const nt = `${normStr(p.name)}|${normStr(p.team)}`;
  if (nt !== "|") return `nt:${nt}`;
  const id = String((p as any).id ?? "").trim();
  return id ? `id:${id}` : "unknown";
}

/**
 * UI card identity (should be stable and season-specific)
 * IMPORTANT: do NOT use this for "unique player" enforcement.
 */
function cardIdFor(p: { id: string; basePlayerId?: string; season?: any; position?: any }) {
  return `${baseId(p)}|${String(p.season ?? "").trim()}|${String(p.position ?? "").trim()}`;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(arr: T[], rnd: () => number) {
  return arr[Math.floor(rnd() * arr.length)];
}

function sumSalary(cards: PlayerCard[]) {
  return cards.reduce((s, c: any) => s + n(c?.salary), 0);
}

function toSeasonNum(v: any): number | null {
  const x = n(v);
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x);
}

// -------------------- Caches --------------------
let _players: RawPlayer[] | null = null;
let _logs: RawLog[] | null = null;
let _usableLogsByKey: Map<string, RawLog[]> | null = null;
let _projectedFpByBaseId: Map<string, number> | null = null;
let _posMeanProj: Record<string, number> | null = null;

// Auto FP scale so numbers aren’t "criminally low"
let _fpScale = 1;

type PlayerEval = RawPlayer & {
  __proj: number;
  __salary: number;
  __tier: TierColor;
  __personKey: string;
};

let _playerEval: PlayerEval[] | null = null;
let _posPools: Record<string, PlayerEval[]> | null = null;
let _allPoolSortedBySalaryAsc: PlayerEval[] | null = null;

// -------------------- Fetch helpers --------------------
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed fetch ${url}: ${r.status}`);
  return (await r.json()) as T;
}

async function fetchLogs(): Promise<RawLog[]> {
  try {
    return await fetchJson<RawLog[]>(LOGS_URL_PRIMARY);
  } catch {
    return await fetchJson<RawLog[]>(LOGS_URL_FALLBACK);
  }
}

function pushMap(m: Map<string, RawLog[]>, key: string, log: RawLog) {
  if (!key) return;
  const k = String(key).trim();
  if (!k) return;
  const arr = m.get(k);
  if (arr) arr.push(log);
  else m.set(k, [log]);
}

function buildUsableLogs(logs: RawLog[]) {
  const m = new Map<string, RawLog[]>();

  for (const l of logs) {
    const base = String((l as any).basePlayerId ?? "").trim();
    const pid = String((l as any).playerId ?? "").trim();
    const season = toSeasonNum((l as any).season);

    if (base) pushMap(m, base, l);
    if (pid) pushMap(m, pid, l);

    if (season !== null) {
      if (base) pushMap(m, `${base}|${season}`, l);
      if (pid) pushMap(m, `${pid}|${season}`, l);
    }
  }

  return m;
}

// -------------------- FP extraction --------------------
function fpFromStatsRaw(stats: Record<string, any>): number {
  if (!stats) return 0;

  const direct =
    stats.fp ??
    stats.fantasyPoints ??
    stats.fantasy_points ??
    stats.total_points ??
    stats.totalPoints ??
    stats.points ??
    stats.FP ??
    stats.xP ??
    stats.xp;

  const dv = n(direct);
  if (dv !== 0) return dv;

  // Generic fallback (signal only)
  const KEYS = ["goals_scored", "assists", "clean_sheets", "saves", "penalties_saved", "bonus", "bps", "minutes", "minutes_played"];
  let sum = 0;
  for (const k of KEYS) sum += n(stats[k]);
  return sum;
}

function fpFromStatsScaled(stats: Record<string, any>): number {
  const raw = fpFromStatsRaw(stats);
  const scaled = raw * _fpScale;
  return Number.isFinite(scaled) ? Math.max(0, scaled) : 0;
}

function buildProjectedFp(players: RawPlayer[], logsByKey: Map<string, RawLog[]>) {
  const proj = new Map<string, number>();

  for (const p of players) {
    const bid = baseId(p);
    const logs = logsByKey.get(bid) ?? [];
    if (!logs.length) {
      proj.set(bid, 0);
      continue;
    }

    let sum = 0;
    let cnt = 0;

    for (const l of logs) {
      const fp = fpFromStatsRaw(l.stats || {});
      if (Number.isFinite(fp)) {
        sum += fp;
        cnt++;
      }
    }

    proj.set(bid, cnt > 0 ? sum / cnt : 0);
  }

  return proj;
}

function computeAutoFpScale(projByBase: Map<string, number>) {
  // Target a normal-feeling mean projection
  const TARGET_MEAN_FP = 10.5;

  let sum = 0;
  let cnt = 0;

  for (const v of projByBase.values()) {
    if (!Number.isFinite(v) || v <= 0) continue;
    sum += v;
    cnt++;
  }

  const mean = cnt ? sum / cnt : 0;
  if (!mean || !Number.isFinite(mean)) return 1;

  const scale = TARGET_MEAN_FP / mean;
  return Math.max(0.75, Math.min(8, scale));
}

function buildPosMeans(players: RawPlayer[], projByBase: Map<string, number>) {
  const sum: Record<string, number> = {};
  const cnt: Record<string, number> = {};

  for (const p of players) {
    const pos = upperPos(p) || "UNK";
    const bid = baseId(p);
    const proj = (projByBase.get(bid) ?? 0) * _fpScale;
    if (!Number.isFinite(proj) || proj <= 0) continue;

    sum[pos] = (sum[pos] ?? 0) + proj;
    cnt[pos] = (cnt[pos] ?? 0) + 1;
  }

  const mean: Record<string, number> = {};
  for (const k of Object.keys(sum)) mean[k] = sum[k] / Math.max(1, cnt[k]);
  return mean;
}

function projectedFpFromLogs(p: RawPlayer): number {
  const bid = baseId(p);
  const v = _projectedFpByBaseId?.get(bid) ?? 0;
  const scaled = v * _fpScale;
  return Number.isFinite(scaled) ? scaled : 0;
}

// -------------------- Economy: proj -> salary -> tier --------------------
function tierFromSalary(s: number): TierColor {
  if (s >= 52) return "ORANGE";
  if (s >= 35) return "PURPLE";
  if (s >= 28) return "BLUE";
  if (s >= 16) return "GREEN";
  return "WHITE";
}

function salaryFromProj(
  proj: number,
  position: string,
  posMean: Record<string, number>,
  _capMax: number,
  _rosterSize: number
): number {
  const pos = String(position ?? "").toUpperCase() || "UNK";
  const mean = posMean[pos] ?? 10;
  const ratio = mean > 0 ? proj / mean : 1;
  const MIN_SAL = 5;
  const MAX_SAL = 65;
  const t = Math.max(0, Math.min(1, (ratio - 0.3) / (2.0 - 0.3)));
  return clampInt(MIN_SAL + t * (MAX_SAL - MIN_SAL), MIN_SAL, MAX_SAL);
}

function buildEvalPool(players: RawPlayer[]): { all: PlayerEval[]; byPos: Record<string, PlayerEval[]> } {
  const byPos: Record<string, PlayerEval[]> = {};
  const all: PlayerEval[] = [];

  for (const p of players) {
    const proj = projectedFpFromLogs(p);
    const sal = salaryFromProj(proj, String(p.position ?? ""), _posMeanProj ?? {}, CAP_MAX, ROSTER_SIZE);
    const tier = tierFromSalary(sal);
    const pk = personKey(p);

    const pe: PlayerEval = Object.assign({}, p, { __proj: proj, __salary: sal, __tier: tier, __personKey: pk });
    all.push(pe);

    const pos = upperPos(p) || "UNK";
    (byPos[pos] ??= []).push(pe);
  }

  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => a.__salary - b.__salary);
  return { all, byPos };
}

async function ensureLoaded() {
  if (_players && _logs && _usableLogsByKey && _projectedFpByBaseId && _posMeanProj && _playerEval && _posPools && _allPoolSortedBySalaryAsc) {
    return;
  }

  const [players, logs] = await Promise.all([fetchJson<RawPlayer[]>(PLAYERS_URL), fetchLogs()]);

  _players = players;
  _logs = logs;
  _usableLogsByKey = buildUsableLogs(logs);

  _projectedFpByBaseId = buildProjectedFp(players, _usableLogsByKey);
  _fpScale = computeAutoFpScale(_projectedFpByBaseId);
  _posMeanProj = buildPosMeans(players, _projectedFpByBaseId);

  const evalPool = buildEvalPool(players);
  _playerEval = evalPool.all;
  _posPools = evalPool.byPos;
  _allPoolSortedBySalaryAsc = [..._playerEval].sort((a, b) => a.__salary - b.__salary);
}

// -------------------- Achievements --------------------
type Achievement = { id: string; icon: string; label: string; fp: number };

function computeAchievements(stats: Record<string, any>, proj: number, actual: number): Achievement[] {
  const out: Achievement[] = [];

  if (proj > 0) {
    const ratio = actual / proj;
    if (ratio >= 1.4) out.push({ id: "career", icon: "🚀", label: "Career Night", fp: 3 });
    else if (ratio >= 1.15) out.push({ id: "hot", icon: "🔥", label: "On Fire", fp: 2 });
    else if (ratio <= 0.7) out.push({ id: "ice", icon: "🥶", label: "Ice Cold", fp: 0 });
  }

  const goals = n(stats?.goals_scored);
  const assists = n(stats?.assists);
  const cs = n(stats?.clean_sheets);

  if (goals >= 3) out.push({ id: "hattrick", icon: "🎩", label: "Hat Trick", fp: 4 });
  else if (goals >= 2) out.push({ id: "brace", icon: "⚡", label: "Two Goals", fp: 2 });

  if (assists >= 2) out.push({ id: "playmaker", icon: "🎯", label: "2+ Assists", fp: 2 });
  if (cs >= 1) out.push({ id: "cleansheet", icon: "🧱", label: "Clean Sheet", fp: 2 });

  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

// -------------------- Build a PlayerCard --------------------
function buildCardFromEval(p: PlayerEval, slotIndex: number): PlayerCard {
  return {
    cardId: cardIdFor(p),
    basePlayerId: baseId(p),
    name: p.name ?? "",
    team: p.team ?? "",
    season: String(p.season ?? ""),
    position: String(p.position ?? "") as any,
    tier: p.__tier,
    salary: p.__salary,
    projectedFp: p.__proj,
    actualFp: 0,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "", homeAway: "" as any },
    statLine: {},
    achievements: [],
    slotIndex,
    wasHeld: false,
  } as PlayerCard;
}

// -------------------- Slot arrangement (anchors in top 4) --------------------
function arrangeSlots(roster: PlayerCard[]) {
  const byPos: Record<string, PlayerCard[]> = {};
  for (const c of roster) {
    const pos = upperPos(c) || "UNK";
    (byPos[pos] ??= []).push(c);
  }
  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => n(b.salary) - n(a.salary));

  const used = new Set<string>();
  const pickBest = (req: (typeof SLOT_REQ)[number]) => {
    if (req === "FLEX") return null;
    const pool = byPos[req] ?? [];
    for (const c of pool) {
      const id = String((c as any).cardId ?? "");
      if (used.has(id)) continue;
      used.add(id);
      return c;
    }
    return null;
  };

  const ordered: PlayerCard[] = Array.from({ length: ROSTER_SIZE }, (_, i) => roster[i]) as any;

  for (let i = 0; i < Math.min(4, ROSTER_SIZE); i++) {
    const req = SLOT_REQ[i];
    const chosen = pickBest(req);
    if (chosen) ordered[i] = chosen;
  }

  const remaining = roster
    .filter((c) => !used.has(String((c as any).cardId ?? "")))
    .sort((a, b) => n(b.salary) - n(a.salary));

  let k = 0;
  for (let i = 4; i < ROSTER_SIZE; i++) {
    if (k < remaining.length) ordered[i] = remaining[k++];
  }

  ordered.forEach((c: any, i: number) => (c.slotIndex = i));
  return ordered;
}

// -------------------- Hard salary cap enforcement --------------------
function hardCapEnforce(roster: PlayerCard[], rnd: () => number, heldSlotMask?: boolean[]) {
  if (!_posPools || !_allPoolSortedBySalaryAsc) return roster;
  const sortedPool = _allPoolSortedBySalaryAsc;

  const isHeldSlot = (i: number) => (heldSlotMask ? !!heldSlotMask[i] : false);

  const clone = roster.map((c: any, i: number) => ({ ...(c as any), slotIndex: i })) as PlayerCard[];

  const rosterPeople = () => {
    const s = new Set<string>();
    for (const c of clone as any[]) s.add(personKey(c));
    return s;
  };

  const findCheaper = (slot: number, curSalary: number, usedPeople: Set<string>): PlayerEval | null => {
    const req = SLOT_REQ[slot] ?? "FLEX";
    const requiredPos = req === "FLEX" ? null : req;
  
    if (requiredPos) {
      const pool = _posPools?.[requiredPos] ?? [];
      for (let i = pool.length - 1; i >= 0; i--) {
        const cand = pool[i];
        if (cand.__salary >= curSalary) continue;
        if (usedPeople.has(cand.__personKey)) continue;
        return cand;
      }
      return null;
    }
  
    for (let i = _allPoolSortedBySalaryAsc!.length - 1; i >= 0; i--) {
      const cand = _allPoolSortedBySalaryAsc![i];
      if (cand.__salary >= curSalary) continue;
      if (usedPeople.has(cand.__personKey)) continue;
      return cand;
    }
    return null;
  };

  let guard = 0;
  while (sumSalary(clone) > CAP_MAX && guard++ < 260) {
    let idx = -1;
    let best = -1;

    for (let i = 0; i < clone.length; i++) {
      if (isHeldSlot(i)) continue;
      const s = n((clone[i] as any).salary);
      if (s > best) {
        best = s;
        idx = i;
      }
    }

    if (idx < 0) break;

    const usedPeople = rosterPeople();
    // remove current slot’s person (since we’re replacing it)
    usedPeople.delete(personKey(clone[idx] as any));

    const cur = clone[idx] as any;
    const curSalary = n(cur.salary);
    const cheaper = findCheaper(idx, curSalary, usedPeople);
    if (!cheaper) break;

    const replacement = buildCardFromEval(cheaper, idx);
    (replacement as any).wasHeld = false;
    clone[idx] = replacement;
  }

  // Last resort clamp (never exceed cap)
  const total = sumSalary(clone);
  if (total > CAP_MAX) {
    let over = total - CAP_MAX;
    const idxs = clone
      .map((c, i) => ({ i, s: n((c as any).salary) }))
      .filter((x) => !isHeldSlot(x.i))
      .sort((a, b) => b.s - a.s);

    for (const it of idxs) {
      if (over <= 0) break;
      const c: any = clone[it.i];
      const s = n(c.salary);
      if (s <= 1) continue;

      const dec = Math.min(over, Math.max(1, Math.floor(s * 0.15)));
      const nextSalary = Math.max(1, s - dec);

      c.salary = nextSalary;
      c.tier = tierFromSalary(nextSalary);
      over -= dec;
    }
  }

  clone.forEach((c: any, i: number) => (c.slotIndex = i));
  return clone;
}

function generateRoster(rnd: () => number): PlayerCard[] {
  if (!_playerEval || !_posPools) return [];

  const usedPeople = new Set<string>();
  const roster: Array<PlayerCard | null> = Array.from({ length: ROSTER_SIZE }, () => null);

  // Helper: pick randomly from top N candidates for a position
  const pickRandom = (pos: string): PlayerEval | null => {
    const pool = (_posPools?.[pos] ?? [])
      .filter(p => !usedPeople.has(p.__personKey));
    if (!pool.length) return null;
    // Weighted random: top 40% of pool by salary, shuffled
    const topN = [...pool]
      .sort((a, b) => b.__salary - a.__salary)
      .slice(0, Math.max(5, Math.floor(pool.length * 0.4)));
    const picked = topN[Math.floor(rnd() * topN.length)];
    usedPeople.add(picked.__personKey);
    return picked;
  };

  // Step 1: Fill required slots 0-3
  const reqPos = ["FW", "MD", "DE", "GK"];
  for (let i = 0; i < 4; i++) {
    const p = pickRandom(reqPos[i]);
    if (p) roster[i] = buildCardFromEval(p, i);
  }

  // Step 2: Fill FLEX slots 4-5
  const flexPool = [...(_playerEval ?? [])]
    .filter(p => !usedPeople.has(p.__personKey) && upperPos(p) !== "GK")
    .sort((a, b) => b.__salary - a.__salary);

  for (let i = 4; i < ROSTER_SIZE; i++) {
    const topFlex = flexPool
      .filter(p => !usedPeople.has(p.__personKey))
      .slice(0, Math.max(5, Math.floor(flexPool.length * 0.4)));
    if (!topFlex.length) continue;
    const picked = topFlex[Math.floor(rnd() * topFlex.length)];
    usedPeople.add(picked.__personKey);
    roster[i] = buildCardFromEval(picked, i);
  }

  const filled = roster.map((c, i) => ({
    ...(c as any),
    slotIndex: i,
  })) as PlayerCard[];

  // Step 3: Guarantee anchor — inject BEFORE cap enforcement
  // Find highest salary player NOT already in roster
  const hasAnchor = filled.some(c =>
    (c as any).tier === "ORANGE" || (c as any).tier === "PURPLE"
  );

  if (!hasAnchor) {
    const anchorPool = (_playerEval ?? [])
      .filter(p => p.__salary >= 35)
      .filter(p => !filled.some(f => (f as any).basePlayerId === p.basePlayerId))
      .sort((a, b) => b.__salary - a.__salary);

    if (anchorPool.length > 0) {
      // Replace lowest salary non-GK card
      const lowestIdx = filled
        .map((c, i) => ({ i, s: Number((c as any).salary ?? 0), pos: upperPos(c) }))
        .filter(x => x.pos !== "GK")
        .sort((a, b) => a.s - b.s)[0]?.i ?? 0;

      filled[lowestIdx] = buildCardFromEval(anchorPool[0], lowestIdx);
    }
  }

  // Step 4: Arrange slots
  const arranged = arrangeSlots(filled);

  // Step 5: Cap enforce — but protect anchor cards from tier demotion
  const capped = hardCapEnforce(arranged, rnd);

  // Step 6: Restore anchor tiers if cap enforcement demoted them
  capped.forEach((c: any) => {
    const sal = Number(c.salary ?? 0);
    c.tier = tierFromSalary(sal);
  });

  return capped;
}

// -------------------- Resolve: attach logs/stats --------------------
function pickRandomLogFor(basePlayerId: string, season: number | null, rnd: () => number): RawLog | null {
  if (!_usableLogsByKey) return null;
  const base = String(basePlayerId ?? "").trim();
  if (!base) return null;

  const candidates: RawLog[] = [];

  if (season !== null) {
    const exact = _usableLogsByKey.get(`${base}|${season}`) ?? [];
    candidates.push(...exact);
  }

  if (candidates.length === 0) {
    const any = _usableLogsByKey.get(base) ?? [];
    candidates.push(...any);
  }

  if (!candidates.length) return null;
  return pickOne(candidates, rnd);
}

// -------------------- Public API --------------------
export async function dealInitialRoster(): Promise<DealLikeResult> {
  await ensureLoaded();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const rnd = mulberry32(Date.now() ^ Math.floor(Math.random() * 1e9));
  const roster = generateRoster(rnd);
  console.log("SALARY DIST:", roster.map((c:any) => `${c.name}:$${c.salary}:${c.tier}`).join(", "));
  return { roster, cards: roster };
}

export async function redrawRoster(params: { currentCards: PlayerCard[]; lockedCardIds: Set<string> }): Promise<DealLikeResult> {
  await ensureLoaded();
  const { currentCards, lockedCardIds } = params;
  const rnd = mulberry32(Date.now() ^ Math.floor(Math.random() * 1e9));

  // Normalize currentCards
  const cur = Array.from({ length: ROSTER_SIZE }, (_, i) => ({ ...(currentCards[i] as any), slotIndex: i })) as PlayerCard[];

  const heldSlotMask: boolean[] = Array.from({ length: ROSTER_SIZE }, () => false);
  const final: PlayerCard[] = Array.from({ length: ROSTER_SIZE }, (_, i) => ({ ...(cur[i] as any), slotIndex: i })) as PlayerCard[];

  // Track used humans from held cards
  const usedPeople = new Set<string>();

  // Place held back into exact slots
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const c: any = cur[i];
    const id = String(c?.cardId ?? "");
    if (lockedCardIds.has(id)) {
      heldSlotMask[i] = true;
      final[i] = { ...(c as any), slotIndex: i, wasHeld: true };
      usedPeople.add(personKey(final[i] as any));
    }
  }

  // Fresh candidate roster gives us good distribution, but we MUST re-filter by person uniqueness
  const fresh = generateRoster(rnd);

  // Candidates: remove anyone who matches an already-used person (held), and avoid duplicates within candidates too
  const candidates: PlayerCard[] = [];
  const candPeople = new Set<string>();
  for (const c of fresh as any[]) {
    const pk = personKey(c);
    if (usedPeople.has(pk)) continue;
    if (candPeople.has(pk)) continue;
    candPeople.add(pk);
    candidates.push(c);
  }

  // Fill open slots respecting requirements
  for (let slot = 0; slot < ROSTER_SIZE; slot++) {
    if (heldSlotMask[slot]) continue;

    const req = SLOT_REQ[slot] ?? "FLEX";

    const pool = candidates
      .filter((c: any) => {
        const pk = personKey(c);
        if (usedPeople.has(pk)) return false;
        if (req !== "FLEX" && upperPos(c) !== req) return false;
        return true;
      })
      .sort((a: any, b: any) => n(b.salary) - n(a.salary));

    const chosen =
      pool.length ? pool[0] : candidates.find((c: any) => !usedPeople.has(personKey(c)));

    if (chosen) {
      usedPeople.add(personKey(chosen as any));
      final[slot] = { ...(chosen as any), slotIndex: slot, wasHeld: false };
    } else {
      final[slot] = { ...(final[slot] as any), slotIndex: slot, wasHeld: false };
    }
  }

  // Anchor arrangement without moving held
  const arranged = (() => {
    const out = final.map((c: any) => ({ ...(c as any) })) as PlayerCard[];

    const slotCandidates = (pos: string) => {
      const xs: Array<{ i: number; c: any }> = [];
      for (let i = 0; i < ROSTER_SIZE; i++) {
        if (heldSlotMask[i]) continue;
        const c = out[i] as any;
        if (upperPos(c) === pos) xs.push({ i, c });
      }
      xs.sort((a, b) => n(b.c.salary) - n(a.c.salary));
      return xs;
    };

    for (let i = 0; i < 4; i++) {
      if (heldSlotMask[i]) continue;
      const req = SLOT_REQ[i] as any;
      const best = slotCandidates(req)[0];
      if (!best) continue;
      if (best.i === i) continue;

      const tmp = out[i];
      out[i] = { ...(best.c as any), slotIndex: i };
      out[best.i] = { ...(tmp as any), slotIndex: best.i };
    }

    out.forEach((c: any, i: number) => (c.slotIndex = i));
    return out;
  })();

  // Hard cap enforce, never changing held slots
  const capped = hardCapEnforce(arranged, rnd, heldSlotMask);

  // Final sanity: slot requirements intact (repair via swaps among non-held slots)
  for (let i = 0; i < Math.min(4, ROSTER_SIZE); i++) {
    const req = SLOT_REQ[i];
    const pos = upperPos(capped[i]);
    if (req !== "FLEX" && pos !== req && !heldSlotMask[i]) {
      for (let j = 4; j < ROSTER_SIZE; j++) {
        if (heldSlotMask[j]) continue;
        if (upperPos(capped[j]) === req) {
          const tmp = capped[i];
          capped[i] = { ...(capped[j] as any), slotIndex: i };
          capped[j] = { ...(tmp as any), slotIndex: j };
          break;
        }
      }
    }
  }

  capped.forEach((c: any, i: number) => (c.slotIndex = i));
  return { roster: capped, cards: capped, finalCards: capped };
}

export async function resolveRoster(params: { finalCards: PlayerCard[] }): Promise<ResolveLikeResult> {
  await ensureLoaded();
  const rnd = mulberry32(Date.now() ^ Math.floor(Math.random() * 1e9));

  const finalCards = params.finalCards.map((c, i) => ({ ...(c as any), slotIndex: i })) as PlayerCard[];

  let bestId: string | undefined;
  let bestFp = -Infinity;

  const resolved: PlayerCard[] = finalCards.map((card: any) => {
    const bid = String(card?.basePlayerId ?? "").trim();
    const season = toSeasonNum(card?.season);

    const log = pickRandomLogFor(bid, season, rnd);
    const stats = (log?.stats ?? {}) as Record<string, any>;

    const baseActual = fpFromStatsScaled(stats);
    const proj = n(card?.projectedFp);

    const achievements = computeAchievements(stats, proj, baseActual);
    const badgeBonus = achievements.reduce((s, a) => s + n(a.fp), 0);

    const totalActual = baseActual + badgeBonus;

    const gi = {
      date: String((log as any)?.matchDate ?? (log as any)?.date ?? ""),
      opponent: String((log as any)?.opponent ?? ""),
      homeAway: String((log as any)?.homeAway ?? ""),
    };

    const next: PlayerCard = {
      ...(card as any),
      actualFp: totalActual,
      fpDelta: totalActual - proj,
      statLine: stats,
      gameInfo: gi as any,
      achievements: achievements as any,
    };

    if (totalActual > bestFp) {
      bestFp = totalActual;
      bestId = String((next as any).cardId);
    }

    return next;
  });

  return {
    roster: resolved,
    cards: resolved,
    finalCards: resolved,
    mvpId: bestId,
    mvpCardId: bestId,
    topCardId: bestId,
  };
}