import fs from "fs";
import path from "path";

type Tier = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

type PlayerIn = {
  id: string;
  name: string;
  position: string;
  team: string;
  salary: number;
  tier?: Tier;
};

type GameLogIn = {
  id: string;
  sport: "football";
  playerId: string;
  season?: number;
  matchDate: string;
  minutesPlayed?: number;
  stats: Record<string, number>;
  events: Record<string, number>;
};

type PlayerCardOut = {
  id: string;
  basePlayerId: string;
  season: number;
  name: string;
  position: string;
  team: string;
  tier: Tier;
  salary: number;
  avgFP: number;
  matches: number;
  minutes: number;
};

type GameLogOut = {
  id: string;
  sport: "football";
  playerId: string;
  basePlayerId: string;
  season: number;
  matchDate: string;
  minutesPlayed?: number;
  stats: Record<string, number>;
  events: Record<string, number>;
};

// --- CONFIG & CONSTANTS ---

const root = process.cwd();
const IN_DIR = path.join(root, "src", "data", "football", "processed-epl");
const OUT_DIR = path.join(root, "src", "data", "football", "processed-epl-cards");
const OUT_PLAYERS = path.join(OUT_DIR, "players.json");
const OUT_LOGS = path.join(OUT_DIR, "game-logs.json");

// Allowed seasons (your pipeline uses 2022/2023/2024 as season keys)
const ALLOWED_SEASONS = new Set([2022, 2023, 2024]);

// Tier salary bands (your latest)
const TIER_BANDS: Record<Tier, { min: number; max: number }> = {
  ORANGE: { min: 48, max: 60 },
  PURPLE: { min: 38, max: 47.99 },
  BLUE: { min: 28, max: 37.99 },
  GREEN: { min: 18, max: 27.99 },
  WHITE: { min: 5, max: 17.99 },
};

// Filters for card qualification
const MIN_MATCHES = 3;
const MIN_MINUTES = 180;

// ✅ POSITIONAL PERCENTILE CUTS (sports-agnostic: applies per position group)
// Default: top 8% ORANGE, next 17% PURPLE, next 25% BLUE, next 25% GREEN, rest WHITE
// These are easy knobs to tune later.
const POSITION_TIER_CUTS = {
  ORANGE: 0.92,
  PURPLE: 0.75,
  BLUE: 0.50,
  GREEN: 0.25,
} as const;

// --- HELPERS ---

function hashToUnitFloat(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function tierFromPercentile(p01: number): Tier {
  const p = clamp01(p01);
  if (p >= POSITION_TIER_CUTS.ORANGE) return "ORANGE";
  if (p >= POSITION_TIER_CUTS.PURPLE) return "PURPLE";
  if (p >= POSITION_TIER_CUTS.BLUE) return "BLUE";
  if (p >= POSITION_TIER_CUTS.GREEN) return "GREEN";
  return "WHITE";
}

function salaryFromTierAndRank(tier: Tier, withinTierRank01: number, stableKey: string): number {
  const band = TIER_BANDS[tier];
  const t = clamp01(withinTierRank01);

  // Small deterministic jitter so ties don’t cause identical salaries every run
  const jitter = (hashToUnitFloat(stableKey) - 0.5) * 0.06; // +/- 3%
  const tj = clamp01(t + jitter);

  const raw = band.min + (band.max - band.min) * tj;
  return Math.round(raw);
}

function safeReadJson<T>(fp: string, fallback: T): T {
  try {
    if (!fs.existsSync(fp)) return fallback;
    const raw = fs.readFileSync(fp, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function num(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * ✅ “FP model” for card-building.
 * Right now this is a lightweight FPL-ish scorer.
 * Later we can swap to ProjectionEngine.calculateFantasyPoints(stats, sportConfig)
 * to make it fully config-driven + sport-agnostic.
 */
function scoreLog(stats: Record<string, number>): number {
  const minutes = num(stats.minutes);
  const goals = num(stats.goals_scored ?? stats.goals);
  const assists = num(stats.assists);
  const cleanSheets = num(stats.clean_sheets ?? stats.cleanSheets);
  const saves = num(stats.saves);
  const goalsConceded = num(stats.goals_conceded ?? stats.goalsConceded);
  const yellow = num(stats.yellow_cards ?? stats.yellowCards);
  const red = num(stats.red_cards ?? stats.redCards);
  const bonus = num(stats.bonus);

  return (
    (minutes / 30) * 0.5 +
    goals * 6 +
    assists * 4 +
    cleanSheets * 3 +
    saves * 1 +
    goalsConceded * -1 +
    yellow * -2 +
    red * -6 +
    bonus * 1
  );
}

type PerfEntry = {
  basePlayerId: string;
  season: number;
  position: string;
  avgFP: number;
  matches: number;
  minutes: number;
};

function main() {
  const playersFp = path.join(IN_DIR, "players.json");
  const logsFp = path.join(IN_DIR, "game-logs.json");

  const basePlayers = safeReadJson<PlayerIn[]>(playersFp, []);
  const logs = safeReadJson<GameLogIn[]>(logsFp, []);

  console.log(`\n=== Build EPL Season Cards (Position Percentiles) ===`);
  console.log(`IN_DIR:  ${IN_DIR}`);
  console.log(`OUT_DIR: ${OUT_DIR}`);

  if (basePlayers.length === 0 || logs.length === 0) {
    console.error("ERROR: Missing input data. Run ingest script first.");
    process.exit(1);
  }

  const baseIndex = new Map<string, PlayerIn>();
  for (const p of basePlayers) baseIndex.set(String(p.id), p);

  const aggByPlayerSeason = new Map<string, { fpSum: number; matches: number; minutes: number }>();
  const usableLogs: Array<{ basePlayerId: string; season: number; log: GameLogIn }> = [];

  // Aggregate FP and minutes per (basePlayerId, season)
  for (const l of logs) {
    const season = typeof l.season === "number" ? l.season : null;
    if (!season || !ALLOWED_SEASONS.has(season)) continue;

    const basePlayerId = String(l.playerId);
    usableLogs.push({ basePlayerId, season, log: l });

    const key = `${basePlayerId}::${season}`;
    const a = aggByPlayerSeason.get(key) ?? { fpSum: 0, matches: 0, minutes: 0 };

    a.minutes += num(l.minutesPlayed ?? l.stats?.minutes);
    a.matches += 1;
    a.fpSum += scoreLog(l.stats ?? {});
    aggByPlayerSeason.set(key, a);
  }

  // Build performance entries (one per player-season) and attach position for per-position tiering
  const perfEntries: PerfEntry[] = [];
  for (const [key, a] of aggByPlayerSeason.entries()) {
    const [pid, sStr] = key.split("::");
    if (a.matches < MIN_MATCHES || a.minutes < MIN_MINUTES) continue;

    const base = baseIndex.get(pid);
    const position = base?.position ?? "UNKNOWN";

    perfEntries.push({
      basePlayerId: pid,
      season: Number(sStr),
      position,
      avgFP: a.fpSum / a.matches,
      matches: a.matches,
      minutes: a.minutes,
    });
  }

  // Group by position (sports-agnostic: whatever positions exist in basePlayers)
  const byPos = new Map<string, PerfEntry[]>();
  for (const e of perfEntries) {
    const arr = byPos.get(e.position) ?? [];
    arr.push(e);
    byPos.set(e.position, arr);
  }

  // Assign tiers per position, and within-tier rank for salary mapping
  const outPlayers: PlayerCardOut[] = [];
  const cardIdByBaseSeason = new Map<string, string>();

  // For reporting
  const tierCounts: Record<Tier, number> = { ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
  const posCounts: Record<string, number> = {};

  for (const [pos, arr] of byPos.entries()) {
    // Sort ascending by avgFP so percentile grows with index
    arr.sort((a, b) => a.avgFP - b.avgFP);

    posCounts[pos] = arr.length;

    // First pass: tier assignment based on percentile within THIS position group
    const entriesWithTier = arr.map((e, idx) => {
      const p01 = arr.length <= 1 ? 1 : idx / (arr.length - 1); // 0..1
      const tier = tierFromPercentile(p01);
      return { ...e, p01, tier };
    });

    // Second pass: compute within-tier rank (0..1) for salary mapping
    const buckets = new Map<Tier, typeof entriesWithTier>();
    for (const t of ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as Tier[]) buckets.set(t, []);
    for (const e of entriesWithTier) buckets.get(e.tier)!.push(e);

    for (const t of buckets.keys()) {
      const bucket = buckets.get(t)!;
      // Sort ascending so the best within bucket is at the end; salary rank uses index (ascending)
      bucket.sort((a, b) => a.avgFP - b.avgFP);

      bucket.forEach((e, i) => {
        const within = bucket.length <= 1 ? 1 : i / (bucket.length - 1);
        const cardId = `${e.basePlayerId}-${e.season}`;
        const salary = salaryFromTierAndRank(t, within, cardId);

        const base = baseIndex.get(e.basePlayerId);

        cardIdByBaseSeason.set(`${e.basePlayerId}::${e.season}`, cardId);

        outPlayers.push({
          id: cardId,
          basePlayerId: e.basePlayerId,
          season: e.season,
          name: base?.name ?? `Player ${e.basePlayerId}`,
          position: base?.position ?? pos,
          team: base?.team ?? "Unknown",
          tier: t,
          salary,
          avgFP: e.avgFP,
          matches: e.matches,
          minutes: e.minutes,
        });

        tierCounts[t] += 1;
      });
    }
  }

  // Map usable logs to the new card IDs, but only for qualified cards
  const outLogs: GameLogOut[] = [];
  const qualifiedIds = new Set(outPlayers.map((p) => p.id));

  for (const u of usableLogs) {
    const cid = cardIdByBaseSeason.get(`${u.basePlayerId}::${u.season}`);
    if (!cid || !qualifiedIds.has(cid)) continue;

    outLogs.push({
      id: u.log.id,
      sport: "football",
      playerId: cid,
      basePlayerId: u.basePlayerId,
      season: u.season,
      matchDate: u.log.matchDate,
      minutesPlayed: u.log.minutesPlayed,
      stats: u.log.stats ?? {},
      events: u.log.events ?? {},
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PLAYERS, JSON.stringify(outPlayers, null, 2));
  fs.writeFileSync(OUT_LOGS, JSON.stringify(outLogs, null, 2));

  console.log(`\nQualified cards: ${outPlayers.length}`);
  console.log(`Mapped logs:     ${outLogs.length}`);
  console.log(`Tier counts:     ${JSON.stringify(tierCounts)}`);
  console.log(`Pos counts:      ${JSON.stringify(posCounts)}\n`);
  console.log(`DONE: Wrote ${outPlayers.length} cards and ${outLogs.length} logs.`);
}

main();
