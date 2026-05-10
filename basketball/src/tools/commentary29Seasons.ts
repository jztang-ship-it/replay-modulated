/**
 * commentary29Seasons.ts — Sample selectCommentary across 29 seasons of real game-logs.
 * Run: npx tsx basketball/src/tools/commentary29Seasons.ts [samples-per-season]
 *
 * Output: /tmp/commentary-29s.jsonl (one row per resolved hand)
 *
 * Each sampled hand: pick a random game-log as the star, build a 5-card roster
 * from that season, compute totalFp, derive winTier, and resolve commentary
 * via the live shared/commentary pipeline. Anti-repeat is engaged via a
 * localStorage shim so variance numbers reflect the real production behavior.
 */

import * as fs from "fs";
import * as path from "path";
import { selectCommentary } from "../../../shared/commentary/selectCommentary";
import type { CommentaryInput, CommentaryRosterCard, WinTier } from "../../../shared/commentary/types";

// ─── localStorage shim (anti-repeat needs it) ──────────────────────────────
const storage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
};

// ─── FP weights (mirror basketballConfig.projectionWeights) ────────────────
const W: Record<string, number> = { pts: 1.0, reb: 1.2, ast: 1.5, stl: 2.0, blk: 2.0, turnovers: -1.0 };
function fpFromStats(s: Record<string, any>): number {
  let fp = 0;
  for (const [k, w] of Object.entries(W)) fp += (Number(s?.[k]) || 0) * w;
  return Math.round(fp * 10) / 10;
}

// ─── Tier from totalFp (mirrors economyConfig — see commentaryAudit) ───────
function tierFromTotal(t: number): { winTier: WinTier; nextTier: WinTier | null; tierFloor: number; nextTierMin: number } {
  if (t < 190) return { winTier: "BUST", nextTier: "ROOKIE", tierFloor: 0, nextTierMin: 190 };
  if (t < 205) return { winTier: "ROOKIE", nextTier: "STARTER", tierFloor: 190, nextTierMin: 205 };
  if (t < 225) return { winTier: "STARTER", nextTier: "ALL_STAR", tierFloor: 205, nextTierMin: 225 };
  if (t < 235) return { winTier: "ALL_STAR", nextTier: "MVP", tierFloor: 225, nextTierMin: 235 };
  if (t < 255) return { winTier: "MVP", nextTier: "LEGEND", tierFloor: 235, nextTierMin: 255 };
  return { winTier: "LEGEND", nextTier: null, tierFloor: 255, nextTierMin: 255 };
}

// Achievement detection (lean — don't over-engineer)
function detectBadges(s: Record<string, any>) {
  const badges: Array<{ id: string; label: string; icon?: string; fp?: number }> = [];
  const pts = Number(s?.pts) || 0, reb = Number(s?.reb) || 0, ast = Number(s?.ast) || 0;
  const stl = Number(s?.stl) || 0, blk = Number(s?.blk) || 0, to = Number(s?.turnovers) || 0;
  const ddCount = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
  if (ddCount >= 4) badges.push({ id: "QUAD_DBL", label: "Quadruple Double", icon: "🌟" });
  else if (ddCount >= 3) badges.push({ id: "TRIPLE_DBL", label: "Triple Double", icon: "👑" });
  else if (ddCount >= 2) badges.push({ id: "DOUBLE_DBL", label: "Double Double", icon: "✌️" });
  if (pts >= 50) badges.push({ id: "GOD_MODE", label: "God Mode", icon: "⚡" });
  else if (pts >= 40) badges.push({ id: "FIRE", label: "Fire", icon: "🔥" });
  if (to >= 6) badges.push({ id: "TURNOVER_MACHINE", label: "Turnover Machine", icon: "🤦" });
  return badges;
}

// Synthetic topGame — used in tiered runs to exercise the achievement path.
function makeTopGame(rng: () => number) {
  const r = rng();
  if (r < 0.15) {
    return { tier: "record" as const, primaryReason: { category: "pts", label: "All-time top-50 scoring night", value: 64 } };
  }
  if (r < 0.40) {
    return { tier: "career" as const, primaryReason: { category: "pts", label: "Career high in points", value: 41 } };
  }
  if (r < 0.70) {
    return { tier: "season" as const, primaryReason: { category: "ast", label: "Season top-10 assist night", value: 17 } };
  }
  return null;
}

// ─── Per-season sampling ──────────────────────────────────────────────────
interface PlayerMeta { basePlayerId: string; name: string; salary: number; tier: string; }

// Per-tier targeted sampler: build rosters with controlled total FP so we hit
// every win tier evenly. Picks a real star + 4 bench cards, then scales bench
// FP up/down to land in the target band.
function sampleTargeted(seasonKey: string, perTier: number, rng: () => number) {
  const dir = path.join(process.cwd(), "basketball/public/data/seasons", seasonKey);
  const logs = JSON.parse(fs.readFileSync(path.join(dir, "gamelogs.json"), "utf8")) as any[];
  const players = JSON.parse(fs.readFileSync(path.join(dir, "players.json"), "utf8")) as any[];
  const playerMap = new Map<string, PlayerMeta>();
  for (const p of players) playerMap.set(p.basePlayerId, { basePlayerId: p.basePlayerId, name: p.name, salary: p.salary ?? 10, tier: p.tier ?? "WHITE" });

  // Bands: target totalFp middle-of-tier
  const bands: Array<{ tier: WinTier; target: number }> = [
    { tier: "BUST", target: -10 }, { tier: "ROOKIE", target: 197 }, { tier: "STARTER", target: 215 },
    { tier: "ALL_STAR", target: 230 }, { tier: "MVP", target: 245 }, { tier: "LEGEND", target: 265 },
  ];

  const stars: any[] = [];
  for (const p of players) {
    const w = p.tier === "RED" ? 8 : p.tier === "ORANGE" ? 6 : p.tier === "PURPLE" ? 4 : p.tier === "BLUE" ? 2 : 1;
    for (let i = 0; i < w; i++) stars.push(p);
  }

  const out: any[] = [];
  for (const band of bands) {
    for (let i = 0; i < perTier; i++) {
      const star = stars[Math.floor(rng() * stars.length)];
      const starLogs = logs.filter(l => l.basePlayerId === star.basePlayerId);
      if (starLogs.length === 0) { i--; continue; }
      const starLog = starLogs[Math.floor(rng() * starLogs.length)];
      const starFp = fpFromStats(starLog.stats);

      const bench: CommentaryRosterCard[] = [];
      for (let b = 0; b < 4; b++) {
        const benchLog = logs[Math.floor(rng() * logs.length)];
        if (benchLog.basePlayerId === star.basePlayerId) { b--; continue; }
        const meta = playerMap.get(benchLog.basePlayerId);
        if (!meta) { b--; continue; }
        bench.push({
          name: meta.name, salary: meta.salary, actualFp: fpFromStats(benchLog.stats),
          projectedFp: meta.salary * 0.7, cardTier: meta.tier, basePlayerId: meta.basePlayerId,
          statLine: benchLog.stats, opponent: benchLog.opponent, gameDate: benchLog.date, homeAway: benchLog.homeAway,
        });
      }
      // Scale bench FP to land near band target (preserving star FP)
      const benchSum = bench.reduce((a, c) => a + (c.actualFp ?? 0), 0);
      const wantBench = Math.max(0, band.target - starFp);
      const scale = benchSum > 0 ? wantBench / benchSum : 1;
      for (const c of bench) c.actualFp = Math.round((c.actualFp ?? 0) * scale * 10) / 10;

      const starCard: CommentaryRosterCard = {
        name: star.name, salary: star.salary, actualFp: starFp, projectedFp: star.avgFP ?? star.salary * 0.7,
        cardTier: star.tier, basePlayerId: star.basePlayerId, statLine: starLog.stats,
        opponent: starLog.opponent, gameDate: starLog.date, homeAway: starLog.homeAway, achievements: detectBadges(starLog.stats),
      };
      const roster = [starCard, ...bench];
      const totalFp = Math.round(roster.reduce((a, c) => a + (c.actualFp ?? 0), 0));
      const tInfo = tierFromTotal(totalFp);
      const streak = Math.floor(rng() * 13);

      const topGame = makeTopGame(rng);
      let primary = "", secondary = "", error = "";
      try {
        const r = selectCommentary({
          sport: "basketball", totalFp, winTier: tInfo.winTier, nextTier: tInfo.nextTier,
          tierFloor: tInfo.tierFloor, nextTierMin: tInfo.nextTierMin, streak, prevStreak: Math.max(0, streak - 1),
          isBust: totalFp < 0, handCount: 1 + Math.floor(rng() * 50), roster,
          topGame: topGame ?? undefined,
        });
        primary = r.primary ?? ""; secondary = r.secondary ?? "";
      } catch (e: any) { error = String(e?.message ?? e); }

      out.push({
        season: seasonKey, starName: star.name, starSalary: star.salary, starTier: star.tier, starFp,
        starRatio: starFp / Math.max(1, (star.avgFP ?? star.salary * 0.7)), totalFp, winTier: tInfo.winTier,
        targetTier: band.tier, streak, isBust: totalFp < 0, badges: starCard.achievements?.map(a => a.id) ?? [],
        opponent: starLog.opponent, gameDate: starLog.date,
        topTier: topGame?.tier ?? null,
        primary, primaryLen: primary.length,
        secondary, secondaryLen: secondary.length, hasSecondary: secondary.length > 0, error,
      });
    }
  }
  return out;
}

function sampleSeason(seasonKey: string, samplesPerSeason: number, rng: () => number) {
  const dir = path.join(process.cwd(), "basketball/public/data/seasons", seasonKey);
  const logs = JSON.parse(fs.readFileSync(path.join(dir, "gamelogs.json"), "utf8")) as any[];
  const players = JSON.parse(fs.readFileSync(path.join(dir, "players.json"), "utf8")) as any[];
  const playerMap = new Map<string, PlayerMeta>();
  for (const p of players) playerMap.set(p.basePlayerId, { basePlayerId: p.basePlayerId, name: p.name, salary: p.salary ?? 10, tier: p.tier ?? "WHITE" });

  // Bias toward higher-salary stars so we hit RED/ORANGE/PURPLE often (similar to engine sampling)
  const stars: any[] = [];
  for (const p of players) {
    const weight = p.tier === "RED" ? 8 : p.tier === "ORANGE" ? 6 : p.tier === "PURPLE" ? 4 : p.tier === "BLUE" ? 2 : 1;
    for (let i = 0; i < weight; i++) stars.push(p);
  }

  const out: any[] = [];
  for (let i = 0; i < samplesPerSeason; i++) {
    const star = stars[Math.floor(rng() * stars.length)];
    const starLogs = logs.filter(l => l.basePlayerId === star.basePlayerId);
    if (starLogs.length === 0) continue;
    const starLog = starLogs[Math.floor(rng() * starLogs.length)];
    const starFp = fpFromStats(starLog.stats);

    // Build 4 bench cards from same season, random players (not star)
    const bench: CommentaryRosterCard[] = [];
    for (let b = 0; b < 4; b++) {
      const benchLog = logs[Math.floor(rng() * logs.length)];
      if (benchLog.basePlayerId === star.basePlayerId) { b--; continue; }
      const meta = playerMap.get(benchLog.basePlayerId);
      if (!meta) { b--; continue; }
      bench.push({
        name: meta.name,
        salary: meta.salary,
        actualFp: fpFromStats(benchLog.stats),
        projectedFp: meta.salary * 0.7,
        cardTier: meta.tier,
        basePlayerId: meta.basePlayerId,
        statLine: benchLog.stats,
        opponent: benchLog.opponent,
        gameDate: benchLog.date,
        homeAway: benchLog.homeAway,
      });
    }

    const starCard: CommentaryRosterCard = {
      name: star.name,
      salary: star.salary,
      actualFp: starFp,
      projectedFp: star.avgFP ?? star.salary * 0.7,
      cardTier: star.tier,
      basePlayerId: star.basePlayerId,
      statLine: starLog.stats,
      opponent: starLog.opponent,
      gameDate: starLog.date,
      homeAway: starLog.homeAway,
      achievements: detectBadges(starLog.stats),
    };

    const roster = [starCard, ...bench];
    const totalFp = Math.round(roster.reduce((a, c) => a + (c.actualFp ?? 0), 0));
    const tierInfo = tierFromTotal(totalFp);
    const streak = Math.floor(rng() * 13); // 0..12

    const input: CommentaryInput & { sport?: string } = {
      sport: "basketball",
      totalFp,
      winTier: tierInfo.winTier,
      nextTier: tierInfo.nextTier,
      tierFloor: tierInfo.tierFloor,
      nextTierMin: tierInfo.nextTierMin,
      streak,
      prevStreak: Math.max(0, streak - 1),
      isBust: totalFp < 0,
      handCount: 1 + Math.floor(rng() * 50),
      roster,
    };

    let primary = "", secondary = "", error = "";
    try {
      const r = selectCommentary(input);
      primary = r.primary ?? "";
      secondary = r.secondary ?? "";
    } catch (e: any) { error = String(e?.message ?? e); }

    out.push({
      season: seasonKey,
      starName: star.name,
      starSalary: star.salary,
      starTier: star.tier,
      starFp,
      starRatio: starFp / Math.max(1, (star.avgFP ?? star.salary * 0.7)),
      totalFp,
      winTier: tierInfo.winTier,
      streak,
      isBust: totalFp < 0,
      badges: starCard.achievements?.map(a => a.id) ?? [],
      opponent: starLog.opponent,
      gameDate: starLog.date,
      primary,
      primaryLen: primary.length,
      secondary,
      secondaryLen: secondary.length,
      hasSecondary: secondary.length > 0,
      error,
    });
  }
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────
function main() {
  const samplesPerSeason = Number(process.argv[2] ?? 40);
  const seasonsDir = path.join(process.cwd(), "basketball/public/data/seasons");
  const seasons = fs.readdirSync(seasonsDir).filter(f => /^\d{4}$/.test(f)).sort();
  console.log(`Sampling ${samplesPerSeason}/season × ${seasons.length} seasons = ${samplesPerSeason * seasons.length} hands`);

  // Deterministic seeded RNG so re-runs are comparable
  let seed = 42;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const mode = process.argv[3] === "tiered" ? "tiered" : "random";
  const outPath = mode === "tiered" ? "/tmp/commentary-29s-tiered.jsonl" : "/tmp/commentary-29s.jsonl";
  const stream = fs.createWriteStream(outPath);
  let total = 0, errors = 0;
  for (const s of seasons) {
    const rows = mode === "tiered" ? sampleTargeted(s, samplesPerSeason, rng) : sampleSeason(s, samplesPerSeason, rng);
    for (const r of rows) { stream.write(JSON.stringify(r) + "\n"); total++; if (r.error) errors++; }
    process.stdout.write(`  ${s}: ${rows.length} samples\n`);
  }
  stream.end();
  console.log(`\nWrote ${total} samples to ${outPath} (${errors} errors)`);
}

main();
