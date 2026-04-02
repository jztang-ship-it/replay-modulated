/**
 * postRevealCopy.ts — Generates personalized post-reveal result text.
 *
 * Priority order:
 *   1. Streak bonus milestone hit (3 wins = 5%, 5 wins = 15%)
 *   2. Massive / dominant clear (12+ FP above tier threshold)
 *   3. Near miss to next tier (within 8 FP)
 *   4. Barely made current tier (within 5 FP above threshold)
 *   5. Bust
 *   6. Carry / underperform explanation
 *   7. Balanced / neutral
 *   8. Streak encouragement fallback
 */

// ── Tier thresholds (must match payoutLogic.ts) ─────────────────────────────
const TIER_ORDER = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"] as const;

const TIER_MIN_FP: Record<string, number> = {
  BUST: 0, ROOKIE: 155, STARTER: 175, ALL_STAR: 195, MVP: 215, GOAT: 235,
};

const TIER_LABELS: Record<string, string> = {
  BUST: "Bust", ROOKIE: "Rookie", STARTER: "Starter",
  ALL_STAR: "All-Star", MVP: "MVP", GOAT: "G.O.A.T.",
};

// ── Thresholds ──────────────────────────────────────────────────────────────
const NEAR_MISS_FP = 8;
const BARELY_MADE_FP = 5;
const DOMINANT_CLEAR_FP = 12;
const OVERPERFORM_RATIO = 1.30;
const UNDERPERFORM_RATIO = 0.70;

// ── Input type ──────────────────────────────────────────────────────────────
export interface PostRevealInput {
  tier: string;
  totalFp: number;
  roster: Array<{
    name?: string;
    actualFp?: number;
    projectedFp?: number;
  }>;
  /** Streak AFTER this hand resolves (0 = just lost) */
  streak: number;
  /** Consecutive losses (0 = just won) */
  lossStreak: number;
  /** Whether this hand hit a streak reward milestone */
  streakMilestone: null | { wins: number; pct: number };
}

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

// ── Deterministic pick (no Math.random) ─────────────────────────────────────
function pick(options: string[], seed: number): string {
  return options[Math.abs(Math.round(seed * 100)) % options.length];
}

// ── Player analysis ─────────────────────────────────────────────────────────
function analyzeRoster(roster: PostRevealInput["roster"]) {
  let topOver: { name: string; ratio: number } | null = null;
  let topUnder: { name: string; ratio: number } | null = null;
  let hasProjections = false;

  for (const c of roster) {
    const actual = Number(c.actualFp ?? 0);
    const proj = Number(c.projectedFp ?? 0);
    if (proj <= 0) continue;
    hasProjections = true;
    const ratio = actual / proj;
    if (ratio >= OVERPERFORM_RATIO && (!topOver || ratio > topOver.ratio)) {
      topOver = { name: c.name ?? "", ratio };
    }
    if (ratio <= UNDERPERFORM_RATIO && (!topUnder || ratio < topUnder.ratio)) {
      topUnder = { name: c.name ?? "", ratio };
    }
  }

  // Check if balanced (no extreme performers)
  const balanced = hasProjections && !topOver && !topUnder;

  return { topOver, topUnder, balanced, hasProjections };
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

// ── Main generator ──────────────────────────────────────────────────────────
export function buildPostRevealCopy(input: PostRevealInput): PostRevealCopy {
  const { tier, totalFp, roster, streak, lossStreak, streakMilestone } = input;

  const tierIdx = TIER_ORDER.indexOf(tier as any);
  const tierMin = TIER_MIN_FP[tier] ?? 0;
  const nextTier = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const nextTierMin = nextTier ? TIER_MIN_FP[nextTier] : null;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const nextTierLabel = nextTier ? TIER_LABELS[nextTier] : null;

  const marginAbove = totalFp - tierMin;
  const gapToNext = nextTierMin != null ? nextTierMin - totalFp : null;
  const isNearMiss = gapToNext != null && gapToNext > 0 && gapToNext <= NEAR_MISS_FP;
  const isBarelyMade = marginAbove >= 0 && marginAbove <= BARELY_MADE_FP && tier !== "BUST";
  const isDominant = marginAbove >= DOMINANT_CLEAR_FP && tier !== "BUST";
  const isBust = tier === "BUST";
  const isGoat = tier === "GOAT";

  const { topOver, topUnder, balanced } = analyzeRoster(roster);
  const seed = totalFp + streak; // deterministic seed

  // ── 1. Streak bonus milestone ─────────────────────────────────────────
  if (streakMilestone) {
    const primary = pick([
      `${streakMilestone.wins} straight — you grabbed ${streakMilestone.pct}%.`,
      `Heater. ${streakMilestone.wins} in a row.`,
      `Streak paid out. Keep it alive.`,
      `You cashed the streak bonus.`,
    ], seed);
    return { primary, secondary: "Bonus pool reward locked." };
  }

  // ── 2. Massive / dominant clear ───────────────────────────────────────
  if (isDominant && (isGoat || tierIdx >= 4)) {
    const primary = pick([
      `Way past ${tierLabel}. That's dominance.`,
      "You crushed this one.",
      "Everything hit. That's a run.",
      "That lineup was different.",
    ], seed);
    const secondary = topOver
      ? `${lastName(topOver.name)} went off.`
      : undefined;
    return { primary, secondary };
  }

  // ── 3. Near miss to next tier ─────────────────────────────────────────
  if (isNearMiss && gapToNext != null && nextTierLabel) {
    const gap = gapToNext.toFixed(1);
    const primary = pick([
      `${gap} FP short — that was right there.`,
      `${gap} away. One play.`,
      "You were right there — run it back.",
      `${gap} FP short. Felt that.`,
    ], seed);
    let secondary: string | undefined;
    if (topUnder) {
      secondary = `One more from ${lastName(topUnder.name)} does it.`;
    } else if (topOver) {
      secondary = `${lastName(topOver.name)} was the swing.`;
    }
    return { primary, secondary };
  }

  // ── 4. Barely made current tier ───────────────────────────────────────
  if (isBarelyMade) {
    const primary = pick([
      `Snuck into ${tierLabel}. We take that.`,
      `Just enough for ${tierLabel}.`,
      "Barely in — keep pressing.",
      "You caught the line.",
    ], seed);
    const secondary = topOver
      ? `${lastName(topOver.name)} pushed you over.`
      : undefined;
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
    let secondary: string | undefined;
    if (topUnder) {
      secondary = `${lastName(topUnder.name)} never got going.`;
    } else if (lossStreak >= 2) {
      secondary = "This turns fast.";
    }
    return { primary, secondary };
  }

  // ── 6. Carry / underperform ───────────────────────────────────────────
  if (topOver && !topUnder) {
    const primary = pick([
      `Big night from ${lastName(topOver.name)}.`,
      `${lastName(topOver.name)} showed up.`,
      "You hit the star.",
    ], seed);
    return { primary };
  }

  if (topUnder && !topOver) {
    const primary = pick([
      `${lastName(topUnder.name)} held this one back.`,
      "One cold card cost the jump.",
      "Fix that one slot — this climbs.",
    ], seed);
    return { primary };
  }

  // ── 7. Balanced / neutral ─────────────────────────────────────────────
  if (balanced || (!topOver && !topUnder)) {
    // Dominant clear without being top tier
    if (isDominant) {
      const primary = pick([
        "No sweat — clear win.",
        "Clean result. Keep building.",
        "Solid — room to push higher.",
      ], seed);
      return { primary };
    }

    const primary = pick([
      "Solid across the board.",
      "Well built. Missing the breakout.",
      "One pop game and this jumps.",
      "You're building it right.",
    ], seed);
    return { primary };
  }

  // ── 8. Streak encouragement fallback ──────────────────────────────────
  if (streak >= 2) {
    const primary = pick([
      `That's ${streak} straight. Stay hot.`,
      "Streak's alive.",
      "You're building a run.",
      "Momentum's yours.",
    ], seed);
    return { primary };
  }

  if (lossStreak >= 2) {
    const primary = pick([
      "Next hand breaks it.",
      "You're one hit from flipping this.",
      "Reset here. Bounce back.",
      "One good hand changes the run.",
    ], seed);
    return { primary };
  }

  // ── Absolute fallback ─────────────────────────────────────────────────
  return { primary: "Run it back." };
}
