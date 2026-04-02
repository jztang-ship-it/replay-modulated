/**
 * buildPostRevealCopy.ts — Basketball-specific 2-line post-reveal summary.
 *
 * Line 1 = what happened (near miss / dominant / barely made / bust)
 * Line 2 = why — headline card story (badge, stat, opponent)
 *
 * CRITICAL: Line 2 almost always features the anchor/star card, not scrubs.
 * Selection uses a "headline score" that biases heavily toward:
 *   - higher salary (card importance)
 *   - higher actual FP (impact)
 *   - notable badges / milestone stats
 * Low-salary filler cards only win when they're truly extreme outliers.
 */

const NEAR_MISS_FP   = 8;
const BARELY_MADE_FP = 5;
const DOMINANT_FP    = 12;

const TIER_LABELS: Record<string, string> = {
  BUST: "Bust", ROOKIE: "Rookie", STARTER: "Starter",
  ALL_STAR: "All-Star", MVP: "MVP", GOAT: "G.O.A.T.",
};
const TIER_MIN: Record<string, number> = {
  BUST: 0, ROOKIE: 155, STARTER: 175, ALL_STAR: 195, MVP: 215, GOAT: 235,
};
const TIER_ORDER = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];

// ── Types ───────────────────────────────────────────────────────────────────

export interface RosterCardInfo {
  name: string;
  actualFp: number;
  projectedFp?: number;
  salary?: number;
  opponent?: string;
  badges?: string[];
  statLine?: Record<string, number>;
}

export interface PostRevealCopyInput {
  totalFp: number;
  winTier: string;
  roster: RosterCardInfo[];
  streak: number;
  prevStreak: number;
  isBust: boolean;
  streakMilestone?: { wins: number; pct: number } | null;
}

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

// ── Deterministic pick ──────────────────────────────────────────────────────
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function lastName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

function opponentCity(opp?: string): string | null {
  if (!opp) return null;
  const parts = opp.trim().split(/\s+/);
  if (parts.length <= 1) return opp;
  const twoWord = parts.slice(0, 2).join(" ");
  const knownTwo = ["New York", "New Orleans", "Golden State", "Oklahoma City", "San Antonio", "Los Angeles"];
  if (knownTwo.includes(twoWord)) return twoWord;
  return parts[0];
}

// ── Badge + stat analysis ───────────────────────────────────────────────────

const BADGE_COPY: Record<string, [string, string]> = {
  god_mode:        ["God Mode", "absolutely cooking"],
  fire:            ["Fire", "on fire"],
  bucket:          ["Bucket", "couldn't miss"],
  beast:           ["Beast", "dominated inside"],
  glass:           ["Glass", "owned the glass"],
  wizard:          ["Wizard", "was dealing"],
  dime:            ["Dime", "threading the needle"],
  thief:           ["Thief", "picked pockets all night"],
  pickpocket:      ["Pickpocket", "ripped it clean"],
  swat:            ["Swat", "was everywhere defensively"],
  rejection:       ["Rejection", "sent it back"],
  maestro:         ["Maestro", "ran the show"],
  pure:            ["Pure", "zero turnovers, all precision"],
  sloppy:          ["Sloppy", "too many giveaways"],
  turnover_machine:["Turnover Machine", "coughed it up all night"],
  quad_double:     ["Quad Double", "filled everything up"],
  "5x5":           ["5x5", "a stat sheet stuffer"],
  triple_double:   ["Triple Double", "filled it all up"],
  double_double:   ["Double Double", "solid across two categories"],
};

const BADGE_PRIORITY_POS = [
  "quad_double", "5x5", "triple_double", "god_mode",
  "beast", "fire", "bucket", "glass", "swat", "rejection",
  "wizard", "dime", "thief", "pickpocket", "maestro", "pure",
  "double_double",
];
const BADGE_PRIORITY_NEG = ["turnover_machine", "sloppy"];

function buildStatHighlight(s?: Record<string, number>): string | null {
  if (!s) return null;
  const pts = Number(s.pts ?? s.points ?? 0);
  const reb = Number(s.reb ?? s.rebounds ?? s.trb ?? 0);
  const ast = Number(s.ast ?? s.assists ?? 0);
  const blk = Number(s.blk ?? s.blocks ?? 0);
  const stl = Number(s.stl ?? s.steals ?? 0);

  if (pts >= 50) return `${pts} points`;
  if (pts >= 40) return `${pts} points`;
  if (pts >= 30 && reb >= 10) return `${pts} and ${reb}`;
  if (pts >= 30 && ast >= 10) return `${pts} and ${ast} dimes`;
  if (pts >= 30) return `${pts} points`;
  if (reb >= 15) return `${reb} boards`;
  if (ast >= 15) return `${ast} assists`;
  if (blk >= 5) return `${blk} blocks`;
  if (stl >= 5) return `${stl} steals`;
  if (reb >= 10) return `${reb} boards`;
  if (ast >= 10) return `${ast} assists`;
  if (blk >= 3) return `${blk} blocks`;
  if (stl >= 3) return `${stl} steals`;
  return null;
}

// ── Headline card selection ─────────────────────────────────────────────────
// Biased toward star/anchor cards. Low-salary scrubs almost never win.

interface HeadlineCard {
  name: string;
  actualFp: number;
  salary: number;
  ratio: number;
  opponent: string | null;
  topBadge: string | null;
  statHighlight: string | null;
  isPositive: boolean;
  headlineScore: number;
}

function selectHeadline(roster: RosterCardInfo[], positive: boolean): HeadlineCard | null {
  const maxSalary = Math.max(...roster.map(c => c.salary ?? 0), 1);
  let best: HeadlineCard | null = null;

  for (const c of roster) {
    const proj = Number(c.projectedFp ?? 0);
    const salary = Number(c.salary ?? 0);
    const ratio = proj > 0 ? c.actualFp / proj : 1;

    // For positive: ratio >= 1.2 or actualFp >= 35 (star performance regardless of proj)
    // For negative: ratio <= 0.75
    const isExtreme = positive
      ? (ratio >= 1.2 || c.actualFp >= 35)
      : ratio <= 0.75;
    if (!isExtreme) continue;

    const badges = (c.badges ?? []).map(b => b.toLowerCase().replace(/\s+/g, "_"));
    const topBadge = positive
      ? BADGE_PRIORITY_POS.find(b => badges.includes(b)) ?? null
      : BADGE_PRIORITY_NEG.find(b => badges.includes(b)) ?? null;

    // Headline score: heavily biased toward salary, actualFp, badges
    const salaryWeight = (salary / maxSalary) * 40;        // 0-40 points for salary importance
    const fpWeight = Math.min(c.actualFp / 5, 20);          // 0-20 points for raw FP output
    const badgeWeight = topBadge ? 15 : 0;                   // 15 bonus for any badge
    const milestoneBonus = (topBadge && ["quad_double", "5x5", "triple_double"].includes(topBadge)) ? 20 : 0;
    const ratioWeight = positive ? Math.max(0, (ratio - 1) * 10) : Math.max(0, (1 - ratio) * 10); // 0-10

    const headlineScore = salaryWeight + fpWeight + badgeWeight + milestoneBonus + ratioWeight;

    if (!best || headlineScore > best.headlineScore) {
      best = {
        name: lastName(c.name),
        actualFp: c.actualFp,
        salary,
        ratio,
        opponent: opponentCity(c.opponent),
        topBadge,
        statHighlight: buildStatHighlight(c.statLine),
        isPositive: positive,
        headlineScore,
      };
    }
  }

  return best;
}

// ── Line 2 builder ──────────────────────────────────────────────────────────

function buildLine2(h: HeadlineCard, seed: number): string {
  const { name, opponent: opp, topBadge: badge, statHighlight: stat } = h;
  const bc = badge ? BADGE_COPY[badge] : null;

  if (stat && opp && bc) {
    return pick([
      `${name} dropped ${stat} on ${opp} and hit ${bc[0]} — ${bc[1]}.`,
      `${name} went ${stat} against ${opp} — ${bc[1]}.`,
    ], seed);
  }
  if (stat && bc) {
    return pick([
      `${name} went ${stat} and hit ${bc[0]} — ${bc[1]}.`,
      `${name} put up ${stat} — ${bc[1]}.`,
    ], seed);
  }
  if (stat && opp) {
    return pick([
      `${name} dropped ${stat} on ${opp} — big night.`,
      `${name} went ${stat} against ${opp}.`,
    ], seed);
  }
  if (bc) {
    return pick([
      `${name} hit ${bc[0]} — ${bc[1]}.`,
      `${name} ${bc[1]}.`,
    ], seed);
  }
  if (stat) {
    return pick([
      `${name} went ${stat} — that card carried.`,
      `${name} put up ${stat}.`,
    ], seed);
  }
  return pick([
    `${name} went off — that card was different.`,
    `Big night from ${name}.`,
  ], seed);
}

function buildNegLine2(h: HeadlineCard, seed: number): string {
  const { name, topBadge: badge } = h;
  const bc = badge ? BADGE_COPY[badge] : null;

  if (bc) {
    return pick([
      `${name} hit ${bc[0]} — ${bc[1]}.`,
      `${name} ${bc[1]} — that slot gave points away.`,
    ], seed);
  }
  return pick([
    `${name} never got going — cold slot.`,
    `One cold card held this back.`,
  ], seed);
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildPostRevealCopy(input: PostRevealCopyInput): PostRevealCopy {
  const { totalFp, winTier, roster, streak, prevStreak, isBust, streakMilestone } = input;

  const seed = Math.floor(totalFp * 10) + streak * 7 + (isBust ? 3 : 0);
  const tierIdx = TIER_ORDER.indexOf(winTier);
  const tierMin = TIER_MIN[winTier] ?? 0;
  const nextTier = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const nextMin = nextTier ? TIER_MIN[nextTier] ?? 9999 : 9999;
  const tierLabel = TIER_LABELS[winTier] ?? winTier;

  const margin = totalFp - tierMin;
  const gap = nextMin - totalFp;
  const isNearMiss = !isBust && nextTier && gap > 0 && gap <= NEAR_MISS_FP;
  const barelyMade = !isBust && margin >= 0 && margin <= BARELY_MADE_FP && winTier !== "BUST";
  const dominant = !isBust && margin >= DOMINANT_FP && winTier !== "BUST";

  const star = selectHeadline(roster, true);
  const dud = selectHeadline(roster, false);

  // ── 1. Streak milestone ───────────────────────────────────────────────
  if (streakMilestone) {
    const primary = pick([
      `${streakMilestone.wins} straight — that's a ${streakMilestone.pct}% hit.`,
      `Heater. ${streakMilestone.wins} in a row — streak paid out.`,
    ], seed);
    const secondary = star ? buildLine2(star, seed) : "Bonus pool reward locked.";
    return { primary, secondary };
  }

  // ── 2. Dominant clear ─────────────────────────────────────────────────
  if (dominant && tierIdx >= 4) {
    const primary = pick([
      `Way past ${tierLabel} — that lineup was different.`,
      `Cruised past ${tierLabel}. No sweat.`,
    ], seed);
    const secondary = star ? buildLine2(star, seed) : undefined;
    return { primary, secondary };
  }

  // ── 3. Near miss ──────────────────────────────────────────────────────
  if (isNearMiss) {
    const nextLabel = TIER_LABELS[nextTier!] ?? nextTier;
    const primary = pick([
      `Just ${gap.toFixed(1)} FP short of ${nextLabel} — right there.`,
      `${gap.toFixed(1)} away from ${nextLabel}. One play.`,
    ], seed);
    const secondary = dud ? buildNegLine2(dud, seed)
      : star ? buildLine2(star, seed)
      : "Needed one more push.";
    return { primary, secondary };
  }

  // ── 4. Barely made tier ───────────────────────────────────────────────
  if (barelyMade) {
    const primary = pick([
      `Snuck into ${tierLabel}. We take that.`,
      `Just enough for ${tierLabel} — barely caught the line.`,
    ], seed);
    const secondary = star ? buildLine2(star, seed) : "That last push got you there.";
    return { primary, secondary };
  }

  // ── 5. Bust ───────────────────────────────────────────────────────────
  if (isBust) {
    const primary = pick([
      "Didn't hit — next one can.",
      "Cold hand. Reset fast.",
      "Not this one. Run it back.",
    ], seed);
    const secondary = dud ? buildNegLine2(dud, seed) : "Needed one real spark.";
    return { primary, secondary };
  }

  // ── 6. Star carry ─────────────────────────────────────────────────────
  if (star) {
    const primary = pick([
      `${star.name} went off — almost carried you higher.`,
      `Big night from ${star.name}.`,
    ], seed);
    return { primary, secondary: buildLine2(star, seed) };
  }

  // ── 7. Dominant lower tier ────────────────────────────────────────────
  if (dominant) {
    return {
      primary: pick([`Clear ${tierLabel}. Solid result.`, "No sweat — clean win."], seed),
    };
  }

  // ── 8. Streak momentum ────────────────────────────────────────────────
  if (streak >= 2) {
    return {
      primary: pick([`That's ${streak} straight. Stay hot.`, "Streak's alive."], seed),
    };
  }

  // ── 9. Balanced fallback ──────────────────────────────────────────────
  return {
    primary: pick([
      "A solid result, but not enough to crack the next tier.",
      "No major badge hit — the lineup needed one real spike.",
      "Well built. Missing the breakout.",
    ], seed),
  };
}
