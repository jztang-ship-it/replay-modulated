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

  // Natural basketball language. ≤46 chars target.
  if (bid === "QUAD_DBL") return pick([`${name} with the Quad Double${o} ${em}`, `${name} stuffed the whole sheet ${em}`], seed2);
  if (bid === "5X5") return pick([`${name} went 5x5${o} ${em}`, `${name} touched every column ${em}`], seed2);
  if (bid === "TRIPLE_DBL") return pick([`${name} Triple Double${o} ${em}`, `${name} filled it all up${o} ${em}`], seed2);
  if (bid === "MAESTRO") return pick([`${name} ran the show${o} ${em}`, `${name} with ${ast} dimes and no TOs ${em}`], seed2);
  if (bid === "GOD_MODE") return pick([`${name} dropped ${pts}${o} and was in God Mode ${em}`, `${name} couldn't be stopped${o} ${em}`], seed2);
  if (bid === "FIRE") return pick([`${name} was cooking${o} with ${pts} ${em}`, `${name} caught fire${o} for ${pts} ${em}`], seed2);
  if (bid === "BUCKET") return pick([`${name} got busy${o} with ${pts} ${em}`, `${name} was getting buckets${o} ${em}`], seed2);
  if (bid === "BEAST") return pick([`${name} beasted${o} with ${reb} boards ${em}`, `${name} was a problem inside${o} ${em}`], seed2);
  if (bid === "GLASS") return pick([`${name} owned the glass${o} with ${reb} ${em}`, `${name} cleaned up everything${o} ${em}`], seed2);
  if (bid === "WIZARD") return pick([`${name} was dealing${o} with ${ast} dimes ${em}`, `${name} had the whole offense flowing ${em}`], seed2);
  if (bid === "DIME") return pick([`${name} dished ${ast} dimes${o} ${em}`, `${name} was finding everyone${o} ${em}`], seed2);
  if (bid === "SWAT") return pick([`${name} swatted ${blk}${o} ${em}`, `${name} was protecting the rim${o} ${em}`], seed2);
  if (bid === "REJECTION") return pick([`${name} blocked ${blk}${o} ${em}`, `${name} was at the rim all night ${em}`], seed2);
  if (bid === "THIEF" || bid === "PICKPOCKET") return pick([`${name} with ${stl} steals${o} ${em}`, `${name} had the quickest hands${o} ${em}`], seed2);
  if (bid === "PURE") return pick([`${name} was surgical${o} ${em}`, `${name} with ${ast} dimes and zero TOs ${em}`], seed2);
  if (bid === "DOUBLE_DBL") return pick([`${name} Double Double${o} ${em}`, `${name} filled two columns${o} ${em}`], seed2);
  if (bid === "TURNOVER_MACHINE") return pick([`${name} gave it away ${tov} times${o} ${em}`, `${name} couldn't hold onto it${o} ${em}`], seed2);
  if (bid === "SLOPPY") return pick([`${name} was loose with it${o} ${em}`, `${name} had ${tov} turnovers${o} ${em}`], seed2);

  if (pts >= 40) return pick([`${name} dropped ${pts}${o} — was in a zone ${E.SOLID}`, `${name} hung ${pts}${o} — different level ${E.SOLID}`], seed2);
  if (pts >= 30) return pick([`${name} put up ${pts}${o} — carried his weight`, `${name} got his${o} with ${pts}`], seed2);
  if (reb >= 12) return `${name} grabbed ${reb} boards${o} ${E.SOLID}`;
  if (ast >= 10) return `${name} with ${ast} dimes${o} — kept it moving ${E.SOLID}`;
  if (pts >= 20) return pick([`${name} got his ${pts}${o} — did his job`, `${name} put up ${pts}${o} — solid shift`], seed2);

  if (isNegativeStory) return pick([`${name} never got going${o} ${E.BUST}`, `${name} was quiet all night${o} ${E.BUST}`], seed2);

  return pick([`${name} held it down${o}`, `${name} did his thing${o}`], seed2);
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
        return ret(
          `Whole squad ate tonight ${E.GOAT}`,
          overCount >= 4 ? `${overCount} of 6 went off — everybody showed up` : `Top to bottom, nobody took a play off`,
        );
      }
      return ret(pick([`That lineup just hit different ${E.GOAT}`, `Somebody went nuclear tonight ${E.GOAT}`, `This one's going on the highlight reel ${E.GOAT}`], seed1), line2(false));
    }

    // ── RULE 1: High ceiling team story ──────────────────────────────────
    if (!isBust && ceilingPct != null && ceilingPct >= 80 && overCount >= 3) {
      return ret(pick([`Full squad showed up — easy ${tl} ${E.SOLID}`, `Nobody took a night off — clean ${tl}`, `Whole lineup locked in tonight ${E.SOLID}`], seed1),
        overCount >= 4 ? `${overCount} players outplayed their line` : line2(false));
    }

    // ── RULE 2-3: Streak milestones ─────────────────────────────────────
    if (!isBust && streak === 5) return ret(`Five straight dubs — 15% bonus pool ${E.STREAK}`, subject ? `${lastName(subject.name)} been carrying this run` : `This heater is real`);
    if (!isBust && streak === 3) return ret(`Three in a row — 5% bonus pool ${E.STREAK}`, `Keep this energy, the streak is building`);

    // ── RULE 4: Near miss ───────────────────────────────────────────────
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier ?? "next tier";
      return ret(pick([`${gap.toFixed(1)} FP from ${nextLabel} — so close ${E.NEAR_MISS}`, `Just ${gap.toFixed(1)} short of ${nextLabel} ${E.NEAR_MISS}`, `That was right there — ${gap.toFixed(1)} off ${E.NEAR_MISS}`], seed1),
        anchorUnderperformed ? line2(true) : line2(false));
    }

    // ── RULE 5: Barely made tier ────────────────────────────────────────
    if (barelyMade) return ret(pick([`Snuck into ${tl} — we'll take it`, `Barely ${tl} but a dub is a dub`, `Caught the line for ${tl} — close one`], seed1), line2(false));

    // ── RULE 6: Bust ────────────────────────────────────────────────────
    if (isBust) {
      return ret(pick([`Tough night — lineup never got going ${E.BUST}`, `Cold one — couldn't find a rhythm ${E.BUST}`, `Nothing fell tonight ${E.BUST}`], seed1),
        line2(true));
    }

    // ── RULE 7: Dominant clear ──────────────────────────────────────────
    if (dominant) return ret(pick([`Easy ${tl} — lineup was in a bag`, `Cruised to ${tl} — that was smooth`, `${tl} without breaking a sweat`], seed1), line2(false));

    // ── RULE 8: Normal win ──────────────────────────────────────────────
    return ret(pick([`Solid ${tl} night — the lineup delivered`, `Clean ${tl} — everybody did their job`, `Good ${tl} — lineup held it down`], seed1), line2(false));
  },
};
