import * as fs from "fs";
import * as path from "path";
import { buildPostRevealCopy, type PostRevealCopyInput, type PostRevealRosterCard } from "../buildPostRevealCopy";

// ── Data loading ──────────────────────────────────────────────────────────────
const dataDir = path.join(process.cwd(), "public", "data");
const players: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "players.json"), "utf8"));
const gameLogs: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, "game-logs.json"), "utf8"));

const logsByPlayer = new Map<string, any[]>();
for (const log of gameLogs) {
  const pid = String(log.basePlayerId);
  if (!logsByPlayer.has(pid)) logsByPlayer.set(pid, []);
  logsByPlayer.get(pid)!.push(log);
}

const pool = players.filter(p => p.salary > 0 && p.active !== false && logsByPlayer.has(String(p.basePlayerId)));

const W: Record<string, number> = { pts: 1.0, reb: 1.2, ast: 1.5, stl: 2.0, blk: 2.0, turnovers: -1.0 };
function computeFp(stats: Record<string, any>): number {
  return Object.entries(W).reduce((s, [k, w]) => s + (Number(stats[k] ?? 0)) * w, 0);
}
function tierFromSalary(s: number): string {
  if (s >= 73) return "RED";
  if (s >= 58) return "ORANGE"; if (s >= 44) return "PURPLE";
  if (s >= 30) return "BLUE"; if (s >= 23) return "GREEN"; return "WHITE";
}
const TIERS = [
  { tier: "LEGEND", minFP: 255 }, { tier: "MVP", minFP: 235 },
  { tier: "ALL_STAR", minFP: 225 }, { tier: "STARTER", minFP: 205 }, { tier: "ROOKIE", minFP: 190 },
];
function calcWinTier(fp: number): string {
  for (const t of TIERS) if (fp >= t.minFP) return t.tier;
  return "BUST";
}
function nextTierInfo(winTier: string) {
  const idx = TIERS.findIndex(t => t.tier === winTier);
  if (winTier === "BUST") return { nextTier: "ROOKIE", tierFloor: 0, nextTierMin: 190 };
  if (idx < 0) return { nextTier: null, tierFloor: 0, nextTierMin: 0 };
  return {
    tierFloor: TIERS[idx].minFP,
    nextTier: idx > 0 ? TIERS[idx - 1].tier : null,
    nextTierMin: idx > 0 ? TIERS[idx - 1].minFP : 0,
  };
}
function pickRand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildRandomRoster(): { cards: PostRevealRosterCard[]; totalFp: number } | null {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected: any[] = [];
  let capUsed = 0;
  for (const p of shuffled) {
    if (selected.length >= 6) break;
    const sal = Number(p.salary);
    if (capUsed + sal > 250) continue;
    if (capUsed + sal + (5 - selected.length) * 5 > 250) continue;
    selected.push(p);
    capUsed += sal;
  }
  if (selected.length < 6) return null;
  const cards: PostRevealRosterCard[] = [];
  let totalFp = 0;
  for (const p of selected) {
    const logs = logsByPlayer.get(String(p.basePlayerId)) ?? [];
    if (!logs.length) continue;
    const log = pickRand(logs);
    const stats = log.stats ?? log;
    const fp = Math.round(computeFp(stats) * 10) / 10;
    totalFp += fp;
    cards.push({
      name: p.name, salary: Number(p.salary), actualFp: fp,
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      achievements: [], opponent: log.opponent ?? "UNK",
      gameDate: log.date ?? "", statLine: stats,
      wasHeld: false, homeAway: (log.homeAway ?? "H") as "H"|"A"|"",
      cardTier: tierFromSalary(Number(p.salary)),
    });
  }
  return { cards, totalFp: Math.round(totalFp * 10) / 10 };
}

// ── Scorer ────────────────────────────────────────────────────────────────────

// Forbidden patterns — any match scores 0 on the patterns dimension
const FORBIDDEN = [
  /\bthe math\b/i,
  /^the lineup\b/i,
  /\bthe draw was\b/i,
  /\bthe lineup held\b/i,
  /\bfp added up\b/i,
  /\bslot delivered\b/i,
  /\bsalary didn't deliver\b/i,
  /\bdraw was kind\b/i,
  /\bdraw changes everything\b/i,
  /\bone better draw\b/i,
];

// Human grammar — these patterns hurt the grammar score
const JARGON = [
  /\bprojection\b/i,
  /\bfp\b(?!.*\b[A-Z][a-z]+\b)/,  // "FP" without a player name nearby
  /^the lineup/i,
  /\bheld its ground\b/i,
  /\badded up right\b/i,
  /\bthe draw\b/i,
];

// Positive bust signals (wrong register on a bust hand)
const POSITIVE_ON_BUST = [
  /that's why you pick him/i,
  /delivered above/i,
  /went above/i,
  /good draw/i,
  /earned tonight/i,
];

// Negative win signals (wrong register on a win)
const NEGATIVE_ON_WIN = [
  /fell apart/i,
  /went quiet/i,
  /put up nothing/i,
  /didn't deliver/i,
  /full collapse/i,
];

// Single-word endings that feel lazy
const LAZY_ENDINGS = /\b(everything\.|tonight\.|somehow\.|definitely\.|always\.|again\.)$/i;

function scoreSpecificity(line: string, cards: PostRevealRosterCard[]): number {
  let score = 0;
  const hasPlayerName = cards.some(c => {
    const parts = c.name.split(" ");
    return parts.some(part => part.length > 2 && line.includes(part));
  });
  const hasNumber = /\d+(\.\d+)?/.test(line);
  const hasOpponent = /against|hosting|road in|in [A-Z]/.test(line);
  if (hasPlayerName) score += 5;
  if (hasNumber) score += 3;
  if (hasOpponent) score += 2;
  return Math.min(score, 10);
}

function scoreGrammar(line: string): number {
  let score = 10;
  for (const pattern of JARGON) {
    if (pattern.test(line)) score -= 2;
  }
  if (LAZY_ENDINGS.test(line)) score -= 2;
  if (line.length < 20) score -= 4;
  if (/^[A-Z][a-z]+ (dropped|grabbed|dished|had|went|delivered|came)/.test(line)) score += 1;
  return Math.max(0, Math.min(score, 10));
}

function scoreRegister(line: string, isBust: boolean, winTier: string): number {
  let score = 7;
  if (isBust) {
    for (const p of POSITIVE_ON_BUST) {
      if (p.test(line)) score -= 4;
    }
  }
  if (!isBust && winTier !== "BUST") {
    for (const p of NEGATIVE_ON_WIN) {
      if (p.test(line)) score -= 3;
    }
  }
  return Math.max(0, Math.min(score, 10));
}

function scoreVariety(line: string, seen: Map<string, number>): number {
  const count = seen.get(line) ?? 0;
  seen.set(line, count + 1);
  if (count === 0) return 10;
  if (count === 1) return 6;
  if (count === 2) return 3;
  if (count === 3) return 1;
  return 0;
}

function scorePatterns(line: string): number {
  for (const pattern of FORBIDDEN) {
    if (pattern.test(line)) return 0;
  }
  return 10;
}

interface LineScore {
  specificity: number;
  grammar: number;
  register: number;
  variety: number;
  patterns: number;
  total: number;
}

function scoreLine(
  line: string,
  cards: PostRevealRosterCard[],
  isBust: boolean,
  winTier: string,
  seen: Map<string, number>
): LineScore {
  const specificity = scoreSpecificity(line, cards);
  const grammar = scoreGrammar(line);
  const register = scoreRegister(line, isBust, winTier);
  const variety = scoreVariety(line, seen);
  const patterns = scorePatterns(line);
  return { specificity, grammar, register, variety, patterns, total: specificity + grammar + register + variety + patterns };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SAMPLE_SIZE = 200;
const REWRITE_THRESHOLD = 30;

const seenPrimary = new Map<string, number>();
const seenSecondary = new Map<string, number>();

let streak = 0;
let prevStreak = 0;
let totalPrimaryScore = 0;
let totalSecondaryScore = 0;
let handsScored = 0;
let rewriteFlagged = 0;

const flaggedHands: string[] = [];
const dimensionTotals = { specificity: 0, grammar: 0, register: 0, variety: 0, patterns: 0 };

for (let h = 1; h <= SAMPLE_SIZE; h++) {
  const result = buildRandomRoster();
  if (!result) continue;

  const { cards, totalFp } = result;
  const winTier = calcWinTier(totalFp);
  const { nextTier, tierFloor, nextTierMin } = nextTierInfo(winTier);
  const isBust = winTier === "BUST";

  if (!isBust) { prevStreak = streak; streak++; } else { prevStreak = streak; streak = 0; }

  const input: PostRevealCopyInput = {
    totalFp, winTier, nextTier, tierFloor, nextTierMin,
    streak, prevStreak, isBust, handCount: h, roster: cards,
  };

  const copy = buildPostRevealCopy(input);
  const primary = copy.primary ?? "";
  const secondary = copy.secondary ?? "";

  const ps = scoreLine(primary, cards, isBust, winTier, seenPrimary);
  const ss = scoreLine(secondary, cards, isBust, winTier, seenSecondary);
  const handTotal = ps.total + ss.total;

  totalPrimaryScore += ps.total;
  totalSecondaryScore += ss.total;
  handsScored++;

  for (const dim of ["specificity","grammar","register","variety","patterns"] as const) {
    dimensionTotals[dim] += ps[dim] + ss[dim];
  }

  if (ps.total < REWRITE_THRESHOLD || ss.total < REWRITE_THRESHOLD) {
    rewriteFlagged++;
    flaggedHands.push(
      `[${winTier} ${totalFp.toFixed(1)}] Hand ${h} — primary: ${ps.total}/50 | secondary: ${ss.total}/50\n` +
      `  P: "${primary}"\n` +
      `    spec:${ps.specificity} gram:${ps.grammar} reg:${ps.register} var:${ps.variety} pat:${ps.patterns}\n` +
      `  S: "${secondary}"\n` +
      `    spec:${ss.specificity} gram:${ss.grammar} reg:${ss.register} var:${ss.variety} pat:${ss.patterns}`
    );
  }
}

const avgP = (totalPrimaryScore / handsScored).toFixed(1);
const avgS = (totalSecondaryScore / handsScored).toFixed(1);
const avgTotal = ((totalPrimaryScore + totalSecondaryScore) / handsScored).toFixed(1);

console.log("═══════════════════════════════════════════════════════");
console.log("  COMMENTARY SCORE REPORT — " + SAMPLE_SIZE + " hands");
console.log("═══════════════════════════════════════════════════════\n");
console.log(`  Average primary score:    ${avgP}/50`);
console.log(`  Average secondary score:  ${avgS}/50`);
console.log(`  Average combined:         ${avgTotal}/100`);
console.log(`  Flagged for rewrite:      ${rewriteFlagged}/${handsScored} hands (${((rewriteFlagged/handsScored)*100).toFixed(0)}%)\n`);

console.log("  Dimension averages (primary + secondary combined):");
for (const dim of ["specificity","grammar","register","variety","patterns"] as const) {
  const avg = (dimensionTotals[dim] / handsScored).toFixed(1);
  const bar = "█".repeat(Math.round(Number(avg)));
  console.log(`    ${dim.padEnd(12)} ${avg.padStart(4)}/20  ${bar}`);
}

console.log("\n═══ FLAGGED HANDS (scoring below " + REWRITE_THRESHOLD + " on either line) ═══\n");
for (const h of flaggedHands.slice(0, 30)) {
  console.log(h);
  console.log();
}
if (flaggedHands.length > 30) {
  console.log(`  ... and ${flaggedHands.length - 30} more flagged hands not shown.`);
}
