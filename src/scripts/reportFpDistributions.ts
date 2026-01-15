// src/scripts/reportFpDistributions.ts
import fs from "fs";
import path from "path";
import { ProjectionEngine } from "../engine/ProjectionEngine";
import { FootballDemoSportConfig } from "../sports/footballDemo";
import type { Player, GameLog } from "../models";

type CardPlayer = Player & { tier?: string };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function baseId(p: any): string {
  const b = (p.basePlayerId ?? "").toString().trim();
  return b.length > 0 ? b : p.id;
}

async function main() {
  const dirName = process.env.FOOTBALL_PROCESSED_DIR || "processed-epl-cards";
  const dataDir = path.resolve(process.cwd(), "src/data/football", dirName);

  const playersPath = path.join(dataDir, "players.json");
  const logsPath = path.join(dataDir, "game-logs.json");

  if (!fs.existsSync(playersPath)) throw new Error(`Missing ${playersPath}`);
  if (!fs.existsSync(logsPath)) throw new Error(`Missing ${logsPath}`);

  const players = loadJson<CardPlayer[]>(playersPath);
  const logs = loadJson<GameLog[]>(logsPath);

  // Index logs by playerId for fast grouping
  const logsByPlayer = new Map<string, GameLog[]>();
  for (const gl of logs) {
    const pid = String((gl as any).playerId ?? "");
    if (!pid) continue;
    const arr = logsByPlayer.get(pid) ?? [];
    arr.push(gl);
    logsByPlayer.set(pid, arr);
  }

  // Compute expected FP per card (mean FP across its logs)
  type CardRow = {
    id: string;
    basePlayerId: string;
    name: string;
    position: string;
    tier: string;
    salary: number;
    nLogs: number;
    meanFP: number;
    p90FP: number;
  };

  const rows: CardRow[] = [];

  for (const p of players) {
    const pid = String(p.id);
    const plogs = logsByPlayer.get(pid) ?? [];
    const fps = plogs.map((l) => ProjectionEngine.calculateFantasyPoints(l.stats, FootballDemoSportConfig));
    fps.sort((a, b) => a - b);

    rows.push({
      id: pid,
      basePlayerId: baseId(p),
      name: p.name,
      position: p.position,
      tier: (p as any).tier ?? "UNK",
      salary: (p as any).salary ?? 0,
      nLogs: fps.length,
      meanFP: mean(fps),
      p90FP: percentile(fps, 0.9),
    });
  }

  // Report by position
  const positions = Array.from(new Set(rows.map((r) => r.position))).sort();
  const tiers = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE", "UNK"];

  console.log(`\n=== FP Distribution Report (derived from ProjectionEngine) ===`);
  console.log(`Dir: ${dataDir}`);
  console.log(`Cards: ${rows.length} | Logs: ${logs.length}`);
  console.log(`Config statCategories: ${FootballDemoSportConfig.statCategories.join(", ")}`);

  for (const pos of positions) {
    const pr = rows.filter((r) => r.position === pos);
    const means = pr.map((r) => r.meanFP).sort((a, b) => a - b);
    const p90s = pr.map((r) => r.p90FP).sort((a, b) => a - b);

    console.log(`\n${pos} (cards=${pr.length})`);
    console.log(`  meanFP:  avg=${mean(means).toFixed(2)}  med=${median(means).toFixed(2)}  p90=${percentile(means, 0.9).toFixed(2)}`);
    console.log(`  p90FP:   avg=${mean(p90s).toFixed(2)}  med=${median(p90s).toFixed(2)}  p90=${percentile(p90s, 0.9).toFixed(2)}`);

    // Tier breakdown inside position
    for (const t of tiers) {
      const tr = pr.filter((r) => r.tier === t);
      if (tr.length === 0) continue;
      const tm = tr.map((r) => r.meanFP).sort((a, b) => a - b);
      console.log(`  ${t}: cards=${tr.length} meanFP med=${median(tm).toFixed(2)} p90=${percentile(tm, 0.9).toFixed(2)} (salary avg=${mean(tr.map(x=>x.salary)).toFixed(1)})`);
    }
  }

  // Global check: do salaries align with expected FP?
  const pairs = rows
    .filter((r) => r.nLogs > 0)
    .map((r) => ({ salary: r.salary, meanFP: r.meanFP }))
    .sort((a, b) => a.salary - b.salary);

  const low = pairs.slice(0, Math.min(30, pairs.length));
  const high = pairs.slice(Math.max(0, pairs.length - 30));

  console.log(`\n=== Sanity: salary vs expected FP (sample) ===`);
  console.log(`Lowest salary sample: avg salary=${mean(low.map(x=>x.salary)).toFixed(1)}, avg meanFP=${mean(low.map(x=>x.meanFP)).toFixed(2)}`);
  console.log(`Highest salary sample: avg salary=${mean(high.map(x=>x.salary)).toFixed(1)}, avg meanFP=${mean(high.map(x=>x.meanFP)).toFixed(2)}`);

  console.log(`\nDONE\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
