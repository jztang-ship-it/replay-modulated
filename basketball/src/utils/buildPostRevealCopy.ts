/**
 * buildPostRevealCopy.ts
 * Smart post-reveal copy replacing "X FP to NEXT TIER" after results settle.
 * Priority: streak milestone > dominant > near miss > barely made >
 *           bust > carry/underperform > balanced > streak fallback
 * All selection is deterministic — no Math.random().
 */

const NEAR_MISS_THRESHOLD   = 8;   // FP
const BARELY_MADE_THRESHOLD = 5;   // FP above tier floor
const DOMINANT_THRESHOLD    = 12;  // FP above tier floor

const TIER_LABELS: Record<string, string> = {
  ROOKIE: "ROOKIE", STARTER: "STARTER", ALL_STAR: "ALL-STAR",
  MVP: "MVP", GOAT: "G.O.A.T.", BUST: "BUST",
};

export interface PostRevealCopyInput {
  totalFp: number;
  winTier: string;
  nextTier: string | null;
  tierFloor: number;       // min FP for achieved tier
  nextTierMin: number;     // min FP for next tier (0 if none)
  roster: Array<{ name: string; actualFp: number; projectedFp?: number }>;
  streak: number;          // streak AFTER this hand (0 on bust)
  prevStreak: number;      // streak BEFORE this hand
  isBust: boolean;
}

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

// Deterministic pick — stable across re-renders
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function lastName(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(-1)[0] ?? fullName;
}

function topOverperformer(roster: PostRevealCopyInput["roster"]): string | null {
  let best: { name: string; ratio: number } | null = null;
  for (const c of roster) {
    if (!c.projectedFp || c.projectedFp <= 0) continue;
    const ratio = c.actualFp / c.projectedFp;
    if (ratio >= 1.3 && (!best || ratio > best.ratio)) {
      best = { name: lastName(c.name), ratio };
    }
  }
  return best?.name ?? null;
}

function topUnderperformer(roster: PostRevealCopyInput["roster"]): string | null {
  let worst: { name: string; ratio: number } | null = null;
  for (const c of roster) {
    if (!c.projectedFp || c.projectedFp <= 0) continue;
    const ratio = c.actualFp / c.projectedFp;
    if (ratio <= 0.7 && (!worst || ratio < worst.ratio)) {
      worst = { name: lastName(c.name), ratio };
    }
  }
  return worst?.name ?? null;
}

export function buildPostRevealCopy(input: PostRevealCopyInput): PostRevealCopy {
  const {
    totalFp, winTier, nextTier, tierFloor, nextTierMin,
    roster, streak, prevStreak, isBust,
  } = input;

  // Stable seed from hand data — no random
  const seed = Math.floor(totalFp * 10) + streak * 7 + (isBust ? 3 : 0);

  const margin = totalFp - tierFloor;
  const gap    = nextTierMin > 0 ? nextTierMin - totalFp : 0;

  const isNearMiss  = !isBust && nextTier != null && gap > 0 && gap <= NEAR_MISS_THRESHOLD;
  const barelyMade  = !isBust && margin >= 0 && margin <= BARELY_MADE_THRESHOLD;
  const dominant    = !isBust && margin >= DOMINANT_THRESHOLD;
  const hit3        = !isBust && streak === 3;
  const hit5        = !isBust && streak === 5;

  const tierLabel = TIER_LABELS[winTier] ?? winTier;
  const over  = topOverperformer(roster);
  const under = topUnderperformer(roster);

  // ── 1. Streak bonus milestone ─────────────────────────────────────────────
  if (hit5) return {
    primary:   pick(["5 straight — that's a 15% hit.", "5 in a row. Streak paid out.", "You cashed the 15% bonus."], seed),
    secondary: "Bonus pool reward locked.",
  };
  if (hit3) return {
    primary:   pick(["3 straight — you grabbed 5%.", "Heater. 3 in a row.", "Streak paid out. Keep it alive."], seed),
    secondary: "You're stacking streak value.",
  };

  // ── 2. Dominant clear ─────────────────────────────────────────────────────
  if (dominant) return {
    primary: pick([
      `Way past ${tierLabel}. Dominance.`,
      "Everything hit. That's a run.",
      "No sweat — clear win.",
      "That lineup was different.",
    ], seed),
  };

  // ── 3. Near miss ──────────────────────────────────────────────────────────
  if (isNearMiss) {
    const primary = pick([
      `${gap.toFixed(1)} FP short — right there.`,
      `${gap.toFixed(1)} away. One play.`,
      `${gap.toFixed(1)} FP short. Felt that.`,
      "Right there — run it back.",
    ], seed);
    const secondary = over  ? `${over} was the swing.`
      : under ? `One more from ${under} does it.`
      : "Needed one more pop.";
    return { primary, secondary };
  }

  // ── 4. Barely made tier ───────────────────────────────────────────────────
  if (barelyMade) {
    const secondary = over ? `${over} pushed you over.` : "That last push got you there.";
    return {
      primary: pick([
        `Snuck into ${tierLabel}. We take that.`,
        `Just enough for ${tierLabel}.`,
        "You caught the line.",
        "That one slipped through.",
      ], seed),
      secondary,
    };
  }

  // ── 5. Bust ───────────────────────────────────────────────────────────────
  if (isBust) {
    const primary = under
      ? pick([`${under} never got going.`, "One slot held this back.", "Needed one spark."], seed)
      : pick(["Cold hand. Reset fast.", "Not this one. Run it back.", "Shake it off. Next hand."], seed);
    return {
      primary,
      secondary: prevStreak >= 2 ? "Next hand breaks it." : undefined,
    };
  }

  // ── 6. Carry / underperform ───────────────────────────────────────────────
  if (over && !under) return {
    primary: pick([
      `${over} went off — almost carried higher.`,
      `Big night from ${over}.`,
      "That was a carry game.",
    ], seed),
  };
  if (under && !over) return {
    primary: pick([
      `${under} held this one back.`,
      "Fix that slot — this climbs.",
      "One cold card cost the jump.",
    ], seed),
  };

  // ── 7. Win streak momentum ────────────────────────────────────────────────
  if (streak >= 2) return {
    primary: pick([`That's ${streak} straight. Stay hot.`, "Streak's alive.", "Momentum's yours."], seed),
  };

  // ── 8. Balanced / neutral ─────────────────────────────────────────────────
  return {
    primary: pick([
      "Solid across the board — needed a spark.",
      "Well built. Missing the breakout.",
      "One pop game and this jumps.",
      "You're building it right.",
    ], seed),
  };
}
