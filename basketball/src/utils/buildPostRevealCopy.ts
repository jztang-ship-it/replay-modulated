/**
 * buildPostRevealCopy.ts
 *
 * Sport-agnostic orchestrator + basketball-specific pack.
 * To add a new sport: implement SportCopyPack and pass it to buildPostRevealCopy().
 * All selection is deterministic — no Math.random().
 *
 * Line 1: what happened to the lineup (headline)
 * Line 2: why — one player, one thing, basketball language + emoji
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PostRevealRosterCard {
  name: string;
  salary: number;
  actualFp: number;
  projectedFp?: number;
  achievements: Array<{ id: string; label: string; icon?: string; fp?: number }>;
  opponent?: string;      // raw team code: "TOR", "PHX", "MIL" etc.
  gameDate?: string;      // ISO date — reserved for future date-aware copy
  statLine?: Record<string, any>;
}

export interface PostRevealCopyInput {
  totalFp: number;
  winTier: string;
  nextTier: string | null;
  tierFloor: number;       // FP floor of achieved tier
  nextTierMin: number;     // FP floor of next tier (0 if none)
  roster: PostRevealRosterCard[];
  streak: number;          // streak AFTER this hand
  prevStreak: number;      // streak BEFORE this hand
  isBust: boolean;
  ceilingPct?: number;     // 0–100: what % of theoretical max FP was scored
  leaderboardContext?: {   // reserved — wire when leaderboard is live
    userRank?: number;
    gapToNextRank?: number;
    gapToTop?: number;
  };
}

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

export interface SportCopyPack {
  build(input: PostRevealCopyInput): PostRevealCopy;
}

// ─── Orchestrator (sport-agnostic shell) ──────────────────────────────────────

export function buildPostRevealCopy(
  input: PostRevealCopyInput,
  pack: SportCopyPack = basketballPack,
): PostRevealCopy {
  return pack.build(input);
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

function cap(s: string, max = 46): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max - 1);
  return cut > 20 ? s.slice(0, cut) : s.slice(0, max - 1) + "…";
}

function statN(card: PostRevealRosterCard, key: string): number {
  const s = card.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

// ─── Basketball pack ───────────────────────────────────────────────────────────

const CITY: Record<string, string> = {
  ATL: "Atlanta",      BOS: "Boston",       BKN: "Brooklyn",
  CHA: "Charlotte",    CHI: "Chicago",      CLE: "Cleveland",
  DAL: "Dallas",       DEN: "Denver",       DET: "Detroit",
  GSW: "Golden State", HOU: "Houston",      IND: "Indiana",
  LAC: "LA",           LAL: "LA",           MEM: "Memphis",
  MIA: "Miami",        MIL: "Milwaukee",    MIN: "Minnesota",
  NOP: "New Orleans",  NYK: "New York",     OKC: "OKC",
  ORL: "Orlando",      PHI: "Philly",       PHX: "Phoenix",
  POR: "Portland",     SAC: "Sacramento",   SAS: "San Antonio",
  TOR: "Toronto",      UTA: "Utah",         WAS: "Washington",
};

const TIER_LABEL: Record<string, string> = {
  ROOKIE: "Rookie", STARTER: "Starter", ALL_STAR: "All-Star",
  MVP: "MVP", GOAT: "G.O.A.T.", BUST: "Bust",
};

const BADGE_EMOJI: Record<string, string> = {
  GOD_MODE:        "⚡",
  FIRE:            "🔥",
  BUCKET:          "🏀",
  BEAST:           "🦍",
  GLASS:           "🧲",
  WIZARD:          "🪄",
  DIME:            "🧠",
  MAESTRO:         "🎼",
  PURE:            "🎯",
  SWAT:            "🚫",
  REJECTION:       "🛡️",
  THIEF:           "🧤",
  PICKPOCKET:      "👀",
  TRIPLE_DBL:      "👑",
  DOUBLE_DBL:      "✌️",
  "5X5":           "🖐️",
  QUAD_DBL:        "🦕",
  TURNOVER_MACHINE:"🤦",
  SLOPPY:          "💦",
};

const E = {
  NEAR_MISS: "😤",
  BUST:      "🧊",
  GOAT:      "🐐",
  STREAK:    "🔥",
  SOLID:     "💪",
};

const BADGE_PRIORITY = [
  "QUAD_DBL", "5X5", "TRIPLE_DBL", "GOD_MODE", "MAESTRO",
  "BEAST", "WIZARD", "FIRE", "THIEF", "SWAT",
  "DOUBLE_DBL", "GLASS", "DIME", "REJECTION", "PICKPOCKET",
  "PURE", "BUCKET", "TURNOVER_MACHINE", "SLOPPY",
];

function headlineScore(c: PostRevealRosterCard): number {
  const topBadgeFp = c.achievements.reduce((best, a) => {
    const abs = Math.abs(a.fp ?? 0);
    return abs > best ? abs : best;
  }, 0);
  return (c.salary * 2.5) + (c.actualFp * 1.5) + (topBadgeFp * 4);
}

function topBadge(c: PostRevealRosterCard): { id: string; label: string } | null {
  if (!c.achievements.length) return null;
  let best: { id: string; label: string; pri: number } | null = null;
  for (const a of c.achievements) {
    const pri = BADGE_PRIORITY.indexOf(a.id);
    const p = pri === -1 ? 99 : pri;
    if (!best || p < best.pri) best = { id: a.id, label: a.label, pri: p };
  }
  return best ? { id: best.id, label: best.label } : null;
}

function cityOf(card: PostRevealRosterCard): string {
  const opp = card.opponent?.trim() ?? "";
  if (!opp) return "";
  return CITY[opp.toUpperCase()] ?? opp;
}

function opp(card: PostRevealRosterCard): string {
  const c = cityOf(card);
  return c ? ` on ${c}` : "";
}

// ─── Line 2 builder ──────────────────────────────────────────────────────────

function buildLine2(
  subject: PostRevealRosterCard,
  seed1: number,
  seed2: number,
  isNegativeStory: boolean,
): string {
  const name  = lastName(subject.name);
  const o     = opp(subject);
  const badge = topBadge(subject);
  const bid   = badge?.id ?? "";
  const em    = BADGE_EMOJI[bid] ?? "";

  const pts = statN(subject, "pts");
  const reb = statN(subject, "reb");
  const ast = statN(subject, "ast");
  const stl = statN(subject, "stl");
  const blk = statN(subject, "blk");
  const tov = statN(subject, "turnovers");

  // All templates ≤46 chars. Priority: name → stat → emoji. City dropped if too long.
  if (bid === "QUAD_DBL") return pick([`${name} Quad Double${o} ${em}`, `${name} hit a Quad Double ${em}`], seed2);
  if (bid === "5X5") return pick([`${name} went 5x5${o} ${em}`, `${name} hit a 5x5 ${em}`], seed2);
  if (bid === "TRIPLE_DBL") return pick([`${name} tripled up${o} ${em}`, `${name} Triple Double${o} ${em}`], seed2);
  if (bid === "MAESTRO") return pick([`${name} ${ast} dimes, zero TOs${o} ${em}`, `${name} ran it clean${o} ${em}`], seed2);
  if (bid === "GOD_MODE") return pick([`${name} dropped ${pts}${o} ${em}`, `${name} hung ${pts}${o} ${em}`], seed2);
  if (bid === "FIRE") return pick([`${name} dropped ${pts}${o} ${em}`, `${name} was cooking${o} ${em}`], seed2);
  if (bid === "BUCKET") return pick([`${name} hung ${pts}${o} ${em}`, `${name} put up ${pts}${o} ${em}`], seed2);
  if (bid === "BEAST") return pick([`${name} ${reb} boards${o} ${em}`, `${name} owned the glass${o} ${em}`], seed2);
  if (bid === "GLASS") return pick([`${name} grabbed ${reb} boards${o} ${em}`, `${name} ${reb} rebounds${o} ${em}`], seed2);
  if (bid === "WIZARD") return pick([`${name} ${ast} dimes${o} ${em}`, `${name} was dealing${o} ${em}`], seed2);
  if (bid === "DIME") return pick([`${name} dished ${ast} assists${o} ${em}`, `${name} ${ast} dimes${o} ${em}`], seed2);
  if (bid === "SWAT") return pick([`${name} swatted ${blk}${o} ${em}`, `${name} ${blk} blocks${o} ${em}`], seed2);
  if (bid === "REJECTION") return o ? `${name} blocked ${blk}${o} ${em}` : `${name} with ${blk} blocks ${em}`;
  if (bid === "THIEF" || bid === "PICKPOCKET") return pick([`${name} ${stl} steals${o} ${em}`, `${name} active hands${o} ${em}`], seed2);
  if (bid === "PURE") return pick([`${name} ${ast} dimes, zero TOs${o} ${em}`, `${name} ran it clean${o} ${em}`], seed2);
  if (bid === "DOUBLE_DBL") return pick([`${name} doubled up${o} ${em}`, `${name} Double Double${o} ${em}`], seed2);
  if (bid === "TURNOVER_MACHINE") return pick([`${name} ${tov} TOs${o} ${em}`, `${name} coughed it up${o} ${em}`], seed2);
  if (bid === "SLOPPY") return pick([`${name} ${tov} turnovers${o} ${em}`, `${name} was careless${o} ${em}`], seed2);

  if (pts >= 40) return pick([`${name} dropped ${pts}${o} ${E.SOLID}`, `${name} hung ${pts}${o} ${E.SOLID}`], seed2);
  if (pts >= 30) return pick([`${name} put up ${pts}${o}`, `${name} hung ${pts}${o}`], seed2);
  if (reb >= 12) return `${name} grabbed ${reb} boards${o} ${E.SOLID}`;
  if (ast >= 10) return `${name} dished ${ast} assists${o} ${E.SOLID}`;
  if (pts >= 20) return pick([`${name} put up ${pts}${o}`, `${name} contributed ${pts}${o}`], seed2);

  if (isNegativeStory) return pick([`${name} had an off night${o} ${E.BUST}`, `${name} went quiet${o} ${E.BUST}`], seed2);

  return pick([`${name} held up his end${o}`, `${name} did his part${o}`], seed2);
}

// ─── Basketball pack ─────────────────────────────────────────────────────────

const basketballPack: SportCopyPack = {
  build(input: PostRevealCopyInput): PostRevealCopy {
    const {
      totalFp, winTier, nextTier, tierFloor, nextTierMin,
      roster, streak, prevStreak, isBust, ceilingPct,
    } = input;

    const seed1 = Math.floor(totalFp * 13) + streak * 7 + (isBust ? 3 : 0);

    const ranked  = [...roster].sort((a, b) => headlineScore(b) - headlineScore(a));
    const hero    = ranked[0] ?? null;
    const anchor  = [...roster].sort((a, b) => b.salary - a.salary)[0] ?? null;
    const subject = hero ?? anchor;

    const seed2 = subject ? Math.floor(subject.actualFp * 17) + subject.salary * 3 : seed1 + 1;
    const seed3 = subject ? (Math.floor(subject.actualFp * 7) ^ Math.floor(totalFp * 3)) : seed1 + 2;

    const tl     = TIER_LABEL[winTier] ?? winTier;
    const margin = totalFp - tierFloor;
    const gap    = nextTierMin > 0 ? nextTierMin - totalFp : 0;

    const isNearMiss  = !isBust && nextTier != null && gap > 0 && gap <= 8;
    const barelyMade  = !isBust && margin >= 0 && margin <= 5;
    const dominant    = !isBust && margin >= 15;
    const isGoatTier  = winTier === "GOAT";

    const overCount = roster.filter(c => c.projectedFp && c.projectedFp > 0 && c.actualFp / c.projectedFp >= 1.2).length;
    const heroPct = (subject && totalFp > 0) ? subject.actualFp / totalFp : 0;
    const anchorRatio = (anchor?.projectedFp && anchor.projectedFp > 0) ? anchor.actualFp / anchor.projectedFp : null;
    const anchorUnderperformed = anchorRatio !== null && anchorRatio < 0.82;

    function line2(isNegative = false): string {
      if (!subject) return `Lineup held together — no real spike`;
      return cap(buildLine2(subject, seed2, seed3, isNegative), 46);
    }

    function ret(primary: string, secondary?: string): PostRevealCopy {
      return { primary: cap(primary, 46), secondary: secondary ? cap(secondary, 46) : undefined };
    }

    // ── RULE 0: G.O.A.T. ────────────────────────────────────────────────
    if (isGoatTier) {
      const heroHasNuke = subject && (topBadge(subject)?.id === "GOD_MODE" || topBadge(subject)?.id === "QUAD_DBL" || topBadge(subject)?.id === "5X5");
      const isIndividualStory = heroPct >= 0.35 || !!heroHasNuke;
      const isTeamStory = (ceilingPct != null && ceilingPct >= 90) || (overCount >= 4 && !isIndividualStory);

      if (isTeamStory) {
        const teamL2 = overCount >= 4 ? `${overCount} of 6 players beat projection — everybody ate ${E.GOAT}` : `Whole squad locked in — top to bottom ${E.GOAT}`;
        return ret(`G.O.A.T. — whole squad showed out ${E.GOAT}`, teamL2);
      }
      return ret(pick([`G.O.A.T. — lineup had a monster tonight`, `G.O.A.T. — one slot went absolutely nuclear`, `G.O.A.T. — difference maker showed up`], seed1), line2(false));
    }

    // ── RULE 1: High ceiling team story ──────────────────────────────────
    if (!isBust && ceilingPct != null && ceilingPct >= 80 && overCount >= 3) {
      return ret(pick([`Complete lineup — way past ${tl} ${E.SOLID}`, `Everyone contributed — dominant ${tl}`, `Full lineup delivered — clean ${tl}`], seed1),
        overCount >= 4 ? `${overCount} players beat projection — no weak links ${E.SOLID}` : line2(false));
    }

    // ── RULE 2-3: Streak milestones ─────────────────────────────────────
    if (!isBust && streak === 5) return ret(`5 straight — 15% bonus pool hit ${E.STREAK}`, subject ? cap(`${lastName(subject.name)} leading the way ${E.STREAK}`, 46) : `Keep the streak alive ${E.STREAK}`);
    if (!isBust && streak === 3) return ret(`3 in a row — 5% bonus pool hit ${E.STREAK}`, `Streak's alive — keep the pressure on ${E.STREAK}`);

    // ── RULE 4: Near miss ───────────────────────────────────────────────
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier ?? "next tier";
      return ret(pick([`${gap.toFixed(1)} FP short of ${nextLabel} — right there ${E.NEAR_MISS}`, `${gap.toFixed(1)} away from ${nextLabel} — that one stings ${E.NEAR_MISS}`, `So close to ${nextLabel} — ${gap.toFixed(1)} FP short ${E.NEAR_MISS}`], seed1),
        anchorUnderperformed ? line2(true) : line2(false));
    }

    // ── RULE 5: Barely made tier ────────────────────────────────────────
    if (barelyMade) return ret(pick([`Snuck into ${tl} — caught the line`, `Just enough for ${tl} — we take it`, `Barely ${tl} — scraped through`], seed1), line2(false));

    // ── RULE 6: Bust ────────────────────────────────────────────────────
    if (isBust) {
      const l2 = line2(true);
      return ret(pick([`Lineup went cold — never found a rhythm ${E.BUST}`, `Cold hand — lineup stalled out ${E.BUST}`, `Couldn't get it going — bricks across the board ${E.BUST}`], seed1),
        prevStreak >= 2 ? cap(`${l2.replace(/[.!]$/, "")} — snapped at ${prevStreak}`, 46) : l2);
    }

    // ── RULE 7: Dominant clear ──────────────────────────────────────────
    if (dominant) return ret(pick([`Cruised past ${tl} — lineup ran it`, `Way past ${tl} — no sweat`, `Dominant ${tl} — that lineup was different`, `${tl} and it wasn't close`], seed1), line2(false));

    // ── RULE 8: Normal win ──────────────────────────────────────────────
    return ret(pick([`Solid ${tl} — lineup delivered`, `Clean ${tl} — did the job`, `${tl} — lineup held together`], seed1), line2(false));
  },
};
