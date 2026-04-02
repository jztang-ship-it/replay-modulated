/**
 * buildPostRevealCopy.ts — Basketball-specific 2-line post-reveal summary.
 *
 * Line 1 = what happened to the lineup
 * Line 2 = why — anchor/star card story first, scrubs only if extreme
 *
 * All selection deterministic. No Math.random().
 */

const NEAR_MISS_FP   = 8;
const BARELY_MADE_FP = 5;

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
  /** % of theoretical max score (0–100) */
  ceilingPct?: number | null;
}

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function lastName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

function cap(s: string, max = 48): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function ratio(c: RosterCardInfo): number {
  const proj = Number(c.projectedFp ?? 0);
  return proj > 0 ? c.actualFp / proj : 1;
}

function anchorPlayer(roster: RosterCardInfo[]): RosterCardInfo | null {
  if (roster.length === 0) return null;
  return [...roster].sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))[0];
}

function topOverperformer(roster: RosterCardInfo[]): RosterCardInfo | null {
  let best: RosterCardInfo | null = null;
  let bestScore = 0;
  const maxSal = Math.max(...roster.map(c => c.salary ?? 0), 1);
  for (const c of roster) {
    const r = ratio(c);
    if (r < 1.2 && c.actualFp < 35) continue;
    const score = (r - 1) * 10 + ((c.salary ?? 0) / maxSal) * 30 + Math.min(c.actualFp / 5, 15);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function topUnderperformer(roster: RosterCardInfo[]): RosterCardInfo | null {
  let worst: RosterCardInfo | null = null;
  let worstScore = 0;
  const maxSal = Math.max(...roster.map(c => c.salary ?? 0), 1);
  for (const c of roster) {
    const r = ratio(c);
    if (r > 0.75) continue;
    const score = (1 - r) * 10 + ((c.salary ?? 0) / maxSal) * 30;
    if (score > worstScore) { worst = c; worstScore = score; }
  }
  return worst;
}

function countOver(roster: RosterCardInfo[], minRatio = 1.1): number {
  return roster.filter(c => ratio(c) >= minRatio).length;
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildPostRevealCopy(input: PostRevealCopyInput): PostRevealCopy {
  const { totalFp, winTier, roster, streak, prevStreak, isBust, streakMilestone, ceilingPct } = input;

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

  const anchor = anchorPlayer(roster);
  const anchorR = anchor ? ratio(anchor) : 1;
  const anchorName = anchor ? lastName(anchor.name) : null;
  const over = topOverperformer(roster);
  const under = topUnderperformer(roster);
  const overName = over ? lastName(over.name) : null;
  const underName = under ? lastName(under.name) : null;

  function r(primary: string, secondary?: string): PostRevealCopy {
    return { primary: cap(primary), secondary: secondary ? cap(secondary) : undefined };
  }

  // ── Rule 0: GOAT tier ─────────────────────────────────────────────────
  if (winTier === "GOAT") {
    const n = countOver(roster, 1.3);
    const sec = n >= 4 ? `${n} of your 6 outperformed their average 🔥`
      : n >= 2 ? "Half your lineup went off 🔥"
      : n === 1 ? "One standout lifted everyone."
      : "Balanced and dominant top to bottom.";
    return r("Your entire team showed up tonight.", sec);
  }

  // ── Rule 1: Ceiling ≥ 80% (dominant team, non-GOAT) ───────────────────
  if (ceilingPct != null && ceilingPct >= 80) {
    const n = countOver(roster, 1.1);
    const primary = pick([
      "That lineup was elite tonight.",
      `Way past ${tierLabel}. Full team effort.`,
    ], seed);
    return r(primary, `${n} players beat their projection.`);
  }

  // ── Rule 2: Streak milestone 5 ────────────────────────────────────────
  if (streakMilestone && streakMilestone.wins >= 5) {
    return r("5 straight — 15% bonus pool hit.", "Bonus locked in.");
  }

  // ── Rule 3: Streak milestone 3 ────────────────────────────────────────
  if (streakMilestone && streakMilestone.wins >= 3) {
    return r("3 in a row — 5% bonus pool hit.", "Keep the streak alive.");
  }

  // ── Rule 4: Near miss ─────────────────────────────────────────────────
  if (isNearMiss) {
    const nextLabel = TIER_LABELS[nextTier!] ?? nextTier;
    const primary = `${gap.toFixed(1)} FP short of ${nextLabel} — right there.`;
    let secondary: string;
    if (anchor && anchorR < 0.9 && anchorName) {
      secondary = `${anchorName} had an off night — that was the gap.`;
    } else if (overName) {
      secondary = `${overName} was your best, needed one more.`;
    } else {
      secondary = "Needed one more push.";
    }
    return r(primary, secondary);
  }

  // ── Rule 5: Barely made tier ──────────────────────────────────────────
  if (barelyMade) {
    const primary = pick([
      `Snuck into ${tierLabel}. We take that.`,
      `Just enough for ${tierLabel}.`,
    ], seed);
    const secondary = overName
      ? `${overName} pushed you over the line.`
      : "That last push got you there.";
    return r(primary, secondary);
  }

  // ── Rule 6: Bust ──────────────────────────────────────────────────────
  if (isBust) {
    let primary: string;
    if (anchor && anchorR < 0.7 && anchorName) {
      primary = `${anchorName} had a rough one.`;
    } else if (underName) {
      primary = `${underName} held this back.`;
    } else {
      primary = pick(["Cold hand — reset fast.", "Not this one. Run it back."], seed);
    }
    const secondary = prevStreak >= 2 ? `Streak snapped at ${prevStreak}.` : undefined;
    return r(primary, secondary);
  }

  // ── Rule 7: Anchor carried ────────────────────────────────────────────
  if (anchor && anchorR >= 1.4 && anchorName && tierIdx >= 2) {
    return r(`${anchorName} carried the lineup tonight.`, "Anchor delivered — build around that.");
  }

  // ── Rule 8: Anchor underperformed (team still won) ────────────────────
  if (anchor && anchorR < 0.75 && anchorName && !isBust) {
    const sec = overName
      ? `${overName} picked up the slack.`
      : "Rest of the lineup held it together.";
    return r(`${anchorName} had an off night.`, sec);
  }

  // ── Rule 9: Individual standout ───────────────────────────────────────
  if (over && ratio(over) >= 1.5) {
    return r(`${overName} went off — big night.`);
  }

  // ── Rule 10: Underperformer dragged ───────────────────────────────────
  if (under && ratio(under) <= 0.6) {
    return r(`${underName} held this one back.`, "Fix that slot — this lineup climbs.");
  }

  // ── Rule 11: Streak momentum ──────────────────────────────────────────
  if (streak >= 2) {
    return r(`That's ${streak} straight — stay hot.`);
  }

  // ── Rule 12: Balanced fallback ────────────────────────────────────────
  return r(pick([
    "Solid lineup — needed a spark.",
    "Well built — missing the breakout.",
    "One pop game and this jumps.",
  ], seed));
}
