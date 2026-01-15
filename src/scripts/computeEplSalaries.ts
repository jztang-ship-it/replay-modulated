import fs from "fs";
import path from "path";
import { FootballDemoSportConfig } from "../sports/footballDemo";

// ---- config knobs (safe defaults) ----
// Salary range for 6-player roster under cap=150
// If salaries are 10..40, you can afford 1-2 studs + value.
const MIN_SALARY = Number(process.env.MIN_SALARY ?? 10);
const MAX_SALARY = Number(process.env.MAX_SALARY ?? 40);

// How many matches minimum to trust a player’s FP (prevents weird tiny samples)
const MIN_MATCHES = Number(process.env.SAL_MIN_MATCHES ?? 8);

// Winsorize trims extreme FP outliers (optional but stabilizes pricing)
const WINSOR_PCT = Number(process.env.WINSOR_PCT ?? 0.05); // 5%

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  salary: number;
  tier?: "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";
  // optional debug fields allowed
  avgFP?: number;
  matches?: number;
};

type GameLog = {
  playerId: string;
  stats?: Record<string, number>;
  minutesPlayed?: number;
};

const root = process.cwd();
const processedDir = process.env.FOOTBALL_PROCESSED_DIR
  ? path.join(root, "src", "data", "football", process.env.FOOTBALL_PROCESSED_DIR.trim())
  : path.join(root, "src", "data", "football", "processed-epl");

const playersPath = path.join(processedDir, "players.json");
const logsPath = path.join(processedDir, "game-logs.json");

function readJson<T>(p: string): T {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as T;
}

function writeJson(p: string, obj: unknown) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

// projectionWeights: stat -> multiplier
const weights = FootballDemoSportConfig.projectionWeights ?? {};

function fpFromLog(log: GameLog): number {
  const s = log.stats ?? {};
  // If minutes exists and you want to require it, keep it — you already filter minMinutes=1.
  let fp = 0;
  for (const [stat, w] of Object.entries(weights)) {
    const val = Number(s[stat] ?? 0);
    if (Number.isFinite(val)) fp += val * Number(w);
  }
  return fp;
}

// winsorize: trims extremes by pct on both ends
function winsorize(values: number[], pct: number): number[] {
  if (values.length < 5 || pct <= 0) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const loIdx = Math.floor(sorted.length * pct);
  const hiIdx = Math.ceil(sorted.length * (1 - pct)) - 1;
  const lo = sorted[Math.max(0, loIdx)];
  const hi = sorted[Math.min(sorted.length - 1, hiIdx)];
  return values.map(v => Math.max(lo, Math.min(hi, v)));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function percentile(sortedAsc: number[], p: number) {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const t = idx - lo;
  return sortedAsc[lo] * (1 - t) + sortedAsc[hi] * t;
}

function tierFromSalary(s: number, cuts: { w: number; g: number; b: number; p: number }) {
  if (s >= cuts.p) return "ORANGE";
  if (s >= cuts.b) return "PURPLE";
  if (s >= cuts.g) return "BLUE";
  if (s >= cuts.w) return "GREEN";
  return "WHITE";
}

async function main() {
  console.log(`[computeEplSalaries] processedDir=${processedDir}`);
  console.log(`[computeEplSalaries] MIN_SALARY=${MIN_SALARY} MAX_SALARY=${MAX_SALARY} MIN_MATCHES=${MIN_MATCHES}`);

  const players = readJson<Player[]>(playersPath);
  const logs = readJson<GameLog[]>(logsPath);

  // group logs per player
  const byPlayer = new Map<string, number[]>();
  for (const l of logs) {
    const pid = String(l.playerId);
    const fp = fpFromLog(l);
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push(fp);
  }

  // compute avgFP (winsorized) for each player
  const playerMetrics = players.map((p) => {
    const fps = byPlayer.get(p.id) ?? [];
    const matches = fps.length;
    const adj = winsorize(fps, WINSOR_PCT);
    const avgFP = matches > 0 ? adj.reduce((a, x) => a + x, 0) / matches : 0;
    return { id: p.id, matches, avgFP };
  });

  // only price players with enough matches; others get MIN_SALARY
  const priced = playerMetrics.filter(m => m.matches >= MIN_MATCHES);
  const avgFPs = priced.map(m => m.avgFP).sort((a,b) => a-b);

  const p10 = percentile(avgFPs, 0.10);
  const p90 = percentile(avgFPs, 0.90);

  console.log(`[computeEplSalaries] pricing pool=${priced.length}/${players.length} p10=${p10.toFixed(3)} p90=${p90.toFixed(3)}`);

  // map avgFP -> salary using a robust linear map between p10..p90
  function salaryFromAvgFP(avgFP: number, matches: number): number {
    if (matches < MIN_MATCHES) return MIN_SALARY;
    if (p90 <= p10) return MIN_SALARY;

    const t = (avgFP - p10) / (p90 - p10); // roughly 0..1
    const raw = MIN_SALARY + clamp(t, 0, 1) * (MAX_SALARY - MIN_SALARY);
    return Math.round(raw);
  }

  // write salary + debug metrics back into players
  const updated = players.map((p) => {
    const m = playerMetrics.find(x => x.id === p.id)!;
    const salary = salaryFromAvgFP(m.avgFP, m.matches);
    return { ...p, salary, avgFP: Number(m.avgFP.toFixed(4)), matches: m.matches };
  });

  // tiers based on salary percentiles (on updated salaries)
  const sSorted = updated.map(p => p.salary).sort((a,b)=>a-b);
  const cuts = {
    w: percentile(sSorted, 0.20),
    g: percentile(sSorted, 0.40),
    b: percentile(sSorted, 0.70),
    p: percentile(sSorted, 0.90),
  };

  const updatedWithTiers = updated.map(p => ({
    ...p,
    tier: tierFromSalary(p.salary, cuts),
  }));

  console.log(`[computeEplSalaries] tier cuts salaries: GREEN>=${cuts.w.toFixed(0)} BLUE>=${cuts.g.toFixed(0)} PURPLE>=${cuts.b.toFixed(0)} ORANGE>=${cuts.p.toFixed(0)}`);

  writeJson(playersPath, updatedWithTiers);
  console.log(`[computeEplSalaries] wrote ${playersPath}`);

  // quick sanity output
  const sampleTop = [...updatedWithTiers].sort((a,b)=>b.salary-a.salary).slice(0,10);
  console.log(`[computeEplSalaries] top10 by salary:`);
  for (const p of sampleTop) {
    console.log(`  ${p.salary} ${p.tier}  ${p.name} (${p.position}) matches=${p.matches} avgFP=${p.avgFP}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
