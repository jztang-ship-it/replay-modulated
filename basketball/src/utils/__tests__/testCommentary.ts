import * as fs from "fs";
import * as path from "path";
import { buildPostRevealCopy, type PostRevealCopyInput, type PostRevealRosterCard } from "../buildPostRevealCopy";

// ── Data loading ──────────────────────────────────────────────────────────────
const dataDir = path.join(process.cwd(), "public", "data");
const players: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
const gameLogs: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "game-logs.json"), "utf8"));

// Index logs by basePlayerId
const logsByPlayer = new Map<string, any[]>();
for (const log of gameLogs) {
  const pid = String(log.basePlayerId);
  if (!logsByPlayer.has(pid)) logsByPlayer.set(pid, []);
  logsByPlayer.get(pid)!.push(log);
}

// Filter active players with salary and logs
const pool = players.filter(p =>
  p.salary > 0 && p.active !== false && logsByPlayer.has(String(p.basePlayerId))
);

// ── FP calculation ────────────────────────────────────────────────────────────
const W: Record<string, number> = { pts: 1.0, reb: 1.2, ast: 1.5, stl: 2.0, blk: 2.0, turnovers: -1.0 };

function computeFp(stats: Record<string, any>): number {
  return Object.entries(W).reduce((s, [k, w]) => s + (Number(stats[k] ?? 0)) * w, 0);
}

function tierFromSalary(salary: number): string {
  if (salary >= 52) return "ORANGE";
  if (salary >= 40) return "PURPLE";
  if (salary >= 28) return "BLUE";
  if (salary >= 16) return "GREEN";
  return "WHITE";
}

// ── Tier thresholds ───────────────────────────────────────────────────────────
const TIERS = [
  { tier: "GOAT", minFP: 235 },
  { tier: "MVP", minFP: 215 },
  { tier: "ALL_STAR", minFP: 195 },
  { tier: "STARTER", minFP: 175 },
  { tier: "ROOKIE", minFP: 155 },
];

function calcWinTier(fp: number): string {
  for (const t of TIERS) if (fp >= t.minFP) return t.tier;
  return "BUST";
}

function nextTierInfo(winTier: string): { nextTier: string | null; tierFloor: number; nextTierMin: number } {
  const idx = TIERS.findIndex(t => t.tier === winTier);
  if (winTier === "BUST") return { nextTier: "ROOKIE", tierFloor: 0, nextTierMin: 155 };
  if (idx < 0) return { nextTier: null, tierFloor: 0, nextTierMin: 0 };
  const tierFloor = TIERS[idx].minFP;
  const nextTier = idx > 0 ? TIERS[idx - 1].tier : null;
  const nextTierMin = idx > 0 ? TIERS[idx - 1].minFP : 0;
  return { nextTier, tierFloor, nextTierMin };
}

// ── Random roster builder (respects $200 cap) ─────────────────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildRandomRoster(): { cards: PostRevealRosterCard[]; totalFp: number } | null {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected: any[] = [];
  let capUsed = 0;

  for (const p of shuffled) {
    if (selected.length >= 6) break;
    const sal = Number(p.salary);
    if (capUsed + sal > 200) continue;
    // Ensure we can still fill remaining slots with min salary ($5)
    const slotsLeft = 5 - selected.length;
    if (capUsed + sal + slotsLeft * 5 > 200) continue;
    selected.push(p);
    capUsed += sal;
  }

  if (selected.length < 6) return null;

  const cards: PostRevealRosterCard[] = [];
  let totalFp = 0;

  for (const p of selected) {
    const logs = logsByPlayer.get(String(p.basePlayerId)) ?? [];
    if (logs.length === 0) continue;
    const log = pick(logs);
    const stats = log.stats ?? log;
    const fp = Math.round(computeFp(stats) * 10) / 10;
    totalFp += fp;

    cards.push({
      name: p.name,
      salary: Number(p.salary),
      actualFp: fp,
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      achievements: [],
      opponent: log.opponent ?? "UNK",
      gameDate: log.date ?? log.matchDate ?? "",
      statLine: stats,
      wasHeld: false,
      homeAway: (log.homeAway ?? "H") as "H" | "A" | "",
      cardTier: tierFromSalary(Number(p.salary)),
    });
  }

  totalFp = Math.round(totalFp * 10) / 10;
  return { cards, totalFp };
}

// ── Generate 10 hands and print results ───────────────────────────────────────
let streak = 0;
let prevStreak = 0;

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  REAL GAME LOG COMMENTARY TEST — 10 random hands from game-logs.json");
console.log("═══════════════════════════════════════════════════════════════════\n");

for (let h = 1; h <= 100; h++) {
  const result = buildRandomRoster();
  if (!result) { console.log(`Hand ${h}: Could not build roster (cap constraint)\n`); continue; }

  const { cards, totalFp } = result;
  const winTier = calcWinTier(totalFp);
  const { nextTier, tierFloor, nextTierMin } = nextTierInfo(winTier);
  const isBust = winTier === "BUST";

  if (!isBust) { prevStreak = streak; streak++; }
  else { prevStreak = streak; streak = 0; }

  const input: PostRevealCopyInput = {
    totalFp, winTier, nextTier, tierFloor, nextTierMin,
    streak, prevStreak, isBust, handCount: h,
    roster: cards,
  };

  const copy = buildPostRevealCopy(input);

  console.log(`── Hand ${h} ── ${winTier} (${totalFp.toFixed(1)} FP) ──`);
  console.log(`  Cap: $${cards.reduce((s, c) => s + c.salary, 0)}`);
  for (const c of cards) {
    const s = c.statLine as any;
    console.log(
      `  ${c.name.padEnd(22)} $${String(c.salary).padStart(2)} | ` +
      `${c.actualFp.toFixed(1).padStart(5)} actual / ${(c.projectedFp ?? 0).toFixed(1).padStart(5)} proj | ` +
      `${c.cardTier.padEnd(6)} | vs ${c.opponent} (${c.homeAway}) | ` +
      `${s.pts ?? 0}p ${s.reb ?? 0}r ${s.ast ?? 0}a ${s.stl ?? 0}s ${s.blk ?? 0}b ${s.turnovers ?? 0}to`
    );
  }
  console.log(`  ──────────────────────────────────────────────────────`);
  console.log(`  Primary:   ${copy.primary}`);
  console.log(`  Secondary: ${copy.secondary ?? "(none)"}`);
  console.log();
}
