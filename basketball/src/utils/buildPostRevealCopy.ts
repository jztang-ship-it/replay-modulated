/**
 * buildPostRevealCopy.ts — Basketball-specific 2-line post-reveal summary.
 *
 * Line 1 = what happened to the lineup (near miss / dominant / barely made / bust)
 * Line 2 = why — who drove it, what badge/stat mattered, opponent city if available
 *
 * Priority:
 *   1. Streak bonus milestone (3 wins = 5%, 5 wins = 15%)
 *   2. Dominant clear (12+ FP above tier floor)
 *   3. Near miss (within 8 FP of next tier)
 *   4. Barely made current tier (within 5 FP above floor)
 *   5. Bust
 *   6. Carry / underperform explanation
 *   7. Balanced fallback
 *
 * All selection is deterministic — no Math.random().
 */

// ── Thresholds ──────────────────────────────────────────────────────────────
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
  /** Opponent team from the sampled historical game log */
  opponent?: string;
  /** Badge IDs earned by this card (e.g. "god_mode", "triple_double") */
  badges?: string[];
  /** Raw stat line from the sampled log */
  statLine?: Record<string, number>;
}

export interface PostRevealCopyInput {
  totalFp: number;
  winTier: string;
  roster: RosterCardInfo[];
  streak: number;       // streak AFTER this hand (0 on bust)
  prevStreak: number;   // streak BEFORE this hand
  isBust: boolean;
  /** Set when streak hits a milestone this hand */
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

/** Extract city from opponent string: "Toronto Raptors" → "Toronto" */
function opponentCity(opp?: string): string | null {
  if (!opp) return null;
  const parts = opp.trim().split(/\s+/);
  if (parts.length <= 1) return opp;
  // Handle multi-word cities: "New York Knicks" → "New York", "Golden State Warriors" → "Golden State"
  const knownTwo = ["New York", "New Orleans", "Golden State", "Oklahoma City", "San Antonio", "Los Angeles"];
  const twoWord = parts.slice(0, 2).join(" ");
  if (knownTwo.includes(twoWord)) return twoWord;
  return parts[0];
}

// ── Badge/stat analysis ─────────────────────────────────────────────────────

interface StandoutPlayer {
  name: string;
  actualFp: number;
  ratio: number;         // actual/projected
  opponent: string | null;
  topBadge: string | null;
  statHighlight: string | null;
}

// Human-readable badge phrasing — two variants each for variety
const BADGE_COPY: Record<string, [string, string]> = {
  god_mode:        ["God Mode", "absolutely cooking"],
  fire:            ["Fire", "was on fire"],
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

// Priority order for positive badges (most notable first)
const BADGE_PRIORITY = [
  "quad_double", "5x5", "triple_double", "god_mode",
  "beast", "fire", "bucket", "glass", "swat", "rejection",
  "wizard", "dime", "thief", "pickpocket", "maestro", "pure",
  "double_double",
];

const NEG_BADGES = ["turnover_machine", "sloppy"];

function buildStatHighlight(s?: Record<string, number>): string | null {
  if (!s) return null;
  const pts = Number(s.pts ?? s.points ?? 0);
  const reb = Number(s.reb ?? s.rebounds ?? s.trb ?? 0);
  const ast = Number(s.ast ?? s.assists ?? 0);
  const stl = Number(s.stl ?? s.steals ?? 0);
  const blk = Number(s.blk ?? s.blocks ?? 0);

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

function findStandout(roster: RosterCardInfo[], positive: boolean): StandoutPlayer | null {
  let best: StandoutPlayer | null = null;
  let bestScore = 0;

  for (const c of roster) {
    const proj = Number(c.projectedFp ?? 0);
    const ratio = proj > 0 ? c.actualFp / proj : 1;
    const isExtreme = positive ? ratio >= 1.3 : ratio <= 0.7;
    if (!isExtreme) continue;

    const score = positive ? ratio : (1 / ratio);
    if (score <= bestScore) continue;

    const badges = (c.badges ?? []).map(b => b.toLowerCase().replace(/\s+/g, "_"));
    const topBadge = positive
      ? BADGE_PRIORITY.find(b => badges.includes(b)) ?? null
      : NEG_BADGES.find(b => badges.includes(b)) ?? null;

    best = {
      name: lastName(c.name),
      actualFp: c.actualFp,
      ratio,
      opponent: opponentCity(c.opponent),
      topBadge,
      statHighlight: buildStatHighlight(c.statLine),
    };
    bestScore = score;
  }

  return best;
}

// ── Line 2 builder ──────────────────────────────────────────────────────────

function buildLine2(star: StandoutPlayer, seed: number): string {
  const name = star.name;
  const opp = star.opponent;
  const badge = star.topBadge;
  const stat = star.statHighlight;
  const bc = badge ? BADGE_COPY[badge] : null;

  // Best case: stat + opponent + badge
  if (stat && opp && bc) {
    return pick([
      `${name} dropped ${stat} on ${opp} and hit ${bc[0]} — ${bc[1]}.`,
      `${name} went ${stat} against ${opp} — ${bc[1]}.`,
    ], seed);
  }

  // Stat + badge (no opponent)
  if (stat && bc) {
    return pick([
      `${name} went ${stat} and hit ${bc[0]} — ${bc[1]}.`,
      `${name} put up ${stat} — ${bc[1]}.`,
    ], seed);
  }

  // Stat + opponent (no badge)
  if (stat && opp) {
    return pick([
      `${name} dropped ${stat} on ${opp} — big night.`,
      `${name} went ${stat} against ${opp}.`,
    ], seed);
  }

  // Badge only
  if (bc) {
    return pick([
      `${name} hit ${bc[0]} — ${bc[1]}.`,
      `${name} ${bc[1]}.`,
    ], seed);
  }

  // Stat only
  if (stat) {
    return pick([
      `${name} went ${stat} — that slot carried.`,
      `${name} put up ${stat}.`,
    ], seed);
  }

  // Generic overperformer
  return pick([
    `${name} went off — that card was different.`,
    `Big night from ${name}.`,
  ], seed);
}

function buildNegLine2(star: StandoutPlayer, seed: number): string {
  const name = star.name;
  const badge = star.topBadge;
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

  const star = findStandout(roster, true);
  const dud = findStandout(roster, false);

  // ── 1. Streak milestone ───────────────────────────────────────────────
  if (streakMilestone) {
    const primary = pick([
      `${streakMilestone.wins} straight — that's a ${streakMilestone.pct}% hit.`,
      `Heater. ${streakMilestone.wins} in a row — streak paid out.`,
      `You cashed the ${streakMilestone.pct}% bonus. Keep it alive.`,
    ], seed);
    const secondary = star ? buildLine2(star, seed) : "Bonus pool reward locked.";
    return { primary, secondary };
  }

  // ── 2. Dominant clear ─────────────────────────────────────────────────
  if (dominant && tierIdx >= 4) {
    const primary = pick([
      `Way past ${tierLabel} — that lineup was different.`,
      "Everything hit. That's dominance.",
      `Cruised past ${tierLabel}. No sweat.`,
    ], seed);
    const secondary = star ? buildLine2(star, seed) : undefined;
    return { primary, secondary };
  }

  // ── 3. Near miss ──────────────────────────────────────────────────────
  if (isNearMiss) {
    const nextLabel = TIER_LABELS[nextTier!] ?? nextTier;
    const primary = pick([
      `Just ${gap.toFixed(1)} FP short of ${nextLabel} — that was right there.`,
      `${gap.toFixed(1)} away from ${nextLabel}. One play.`,
      `You were right there — ${gap.toFixed(1)} FP from the jump.`,
    ], seed);
    const secondary = dud
      ? buildNegLine2(dud, seed)
      : star
        ? `${star.name} was the swing — needed one more push.`
        : "Needed one more pop.";
    return { primary, secondary };
  }

  // ── 4. Barely made tier ───────────────────────────────────────────────
  if (barelyMade) {
    const primary = pick([
      `Snuck into ${tierLabel}. We take that.`,
      `Just enough for ${tierLabel} — barely caught the line.`,
      `That one slipped through into ${tierLabel}.`,
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
      "Shake it off. Next hand.",
    ], seed);
    const secondary = dud
      ? buildNegLine2(dud, seed)
      : prevStreak >= 2 ? "This turns fast." : "Needed one real spark.";
    return { primary, secondary };
  }

  // ── 6. Carry / underperform ───────────────────────────────────────────
  if (star) {
    const primary = pick([
      `${star.name} went off — almost carried you higher.`,
      `Big night from ${star.name}. Team almost followed.`,
    ], seed);
    return { primary, secondary: buildLine2(star, seed) };
  }

  if (dud && !star) {
    const primary = pick([
      "The lineup had enough, but one spot stalled it out.",
      "One cold card cost the jump.",
    ], seed);
    return { primary, secondary: buildNegLine2(dud, seed) };
  }

  // ── 7. Dominant (lower tiers) ─────────────────────────────────────────
  if (dominant) {
    const primary = pick([
      `Clear ${tierLabel}. Solid result.`,
      "No sweat — clean win.",
    ], seed);
    return { primary };
  }

  // ── 8. Win streak momentum ────────────────────────────────────────────
  if (streak >= 2) {
    return {
      primary: pick([`That's ${streak} straight. Stay hot.`, "Streak's alive. Momentum's yours."], seed),
    };
  }

  // ── 9. Balanced fallback ──────────────────────────────────────────────
  return {
    primary: pick([
      "A solid result, but not enough to crack the next tier.",
      "No major badge hit — the lineup needed one real spike.",
      "Well built. Missing the breakout.",
      "One pop game and this jumps.",
    ], seed),
  };
}
