/**
 * buildPostRevealCopy.ts — Commentary system.
 * Sport-agnostic orchestrator + basketball-specific pack.
 * Two lines below the gauge after every hand — smart, opinionated, culture-aware.
 */

import { PLAYER_CULTURE, type PlayerCulture } from "./playerCulture";
import { TEAM_FLAVOR } from "./teamFlavor";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PostRevealRosterCard {
  name: string;
  salary: number;
  actualFp: number;
  projectedFp?: number;
  achievements: Array<{ id: string; label: string; icon?: string; fp?: number }>;
  opponent?: string;
  gameDate?: string;
  statLine?: Record<string, any>;
  wasHeld: boolean;
  homeAway: "H" | "A" | "";
  cardTier: string;
}

export interface PostRevealCopyInput {
  totalFp: number;
  winTier: string;
  nextTier: string | null;
  tierFloor: number;
  nextTierMin: number;
  roster: PostRevealRosterCard[];
  streak: number;
  prevStreak: number;
  isBust: boolean;
  ceilingPct?: number;
  handCount: number;
  isFTUE?: boolean;
}

export interface PostRevealCopy { primary: string; secondary?: string; }
export interface SportCopyPack { build(input: PostRevealCopyInput): PostRevealCopy; }

export function buildPostRevealCopy(
  input: PostRevealCopyInput,
  pack: SportCopyPack = basketballPack,
): PostRevealCopy {
  return pack.build(input);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) return "" as any;
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

function lastName(n: string): string { return n.trim().split(/\s+/).pop() ?? n; }

function cap(s: string, max = 68): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max);
  return cut > 20 ? s.slice(0, cut) + "…" : s.slice(0, max - 1) + "…";
}

function statN(c: PostRevealRosterCard, key: string): number {
  const s = c.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

function ratio(c: PostRevealRosterCard): number {
  const p = Number(c.projectedFp ?? 0);
  return p > 0 ? c.actualFp / p : 1;
}

// ─── City + opponent ──────────────────────────────────────────────────────────

const CITY: Record<string, string> = {
  ATL:"Atlanta",BOS:"Boston",BKN:"Brooklyn",CHA:"Charlotte",CHI:"Chicago",
  CLE:"Cleveland",DAL:"Dallas",DEN:"Denver",DET:"Detroit",GSW:"Golden State",
  HOU:"Houston",IND:"Indiana",LAC:"LA",LAL:"LA",MEM:"Memphis",MIA:"Miami",
  MIL:"Milwaukee",MIN:"Minnesota",NOP:"New Orleans",NYK:"New York",OKC:"OKC",
  ORL:"Orlando",PHI:"Philly",PHX:"Phoenix",POR:"Portland",SAC:"Sacramento",
  SAS:"San Antonio",TOR:"Toronto",UTA:"Utah",WAS:"Washington",
};

function oppPhrase(c: PostRevealRosterCard, style: "against" | "in" | "hosting"): string {
  const city = CITY[c.opponent?.toUpperCase() ?? ""] ?? c.opponent ?? "";
  if (!city) return "";
  if (style === "against") return ` against ${city}`;
  if (style === "in") return c.homeAway === "A" ? ` in ${city}` : ` with ${city} in the building`;
  if (style === "hosting") return c.homeAway === "H" ? ` hosting ${city}` : ` on the road in ${city}`;
  return ` against ${city}`;
}

// ─── Player culture lookup ────────────────────────────────────────────────────

function lookupCulture(name: string): PlayerCulture | null {
  return PLAYER_CULTURE[lastName(name).toLowerCase()] ?? null;
}

function nameFor(c: PostRevealRosterCard, seed: number): string {
  const culture = lookupCulture(c.name);
  if (!culture || !culture.nicknames.length) return lastName(c.name);
  const opts = [...culture.nicknames, lastName(c.name), c.name.split(" ")[0] ?? lastName(c.name)];
  return opts[Math.abs(seed) % opts.length];
}

// ─── Headline selection ───────────────────────────────────────────────────────

function headlineScore(c: PostRevealRosterCard): number {
  const badgeFp = c.achievements.reduce((b, a) => Math.max(b, Math.abs(a.fp ?? 0)), 0);
  return (c.salary * 2.5) + (c.actualFp * 1.5) + (badgeFp * 4);
}

function selectSubject(roster: PostRevealRosterCard[]): PostRevealRosterCard | null {
  return [...roster].sort((a, b) => headlineScore(b) - headlineScore(a))[0] ?? null;
}

// ─── Near-miss culprit ────────────────────────────────────────────────────────

function findNearMissCulprit(roster: PostRevealRosterCard[], gap: number) {
  const tovCulprit = roster.find(c => statN(c, "turnovers") >= Math.ceil(gap)) ?? null;
  const underachiever = roster
    .filter(c => (c.projectedFp ?? 0) > 0)
    .sort((a, b) => ratio(a) - ratio(b))[0] ?? null;
  return { tovCulprit, underachiever };
}

const TIER_MULTIPLIERS: Record<string, string> = {
  ROOKIE: "0.5x", STARTER: "3x", ALL_STAR: "8x", MVP: "15x", GOAT: "50x",
};

const TIER_LABEL: Record<string, string> = {
  BUST:"Bust", ROOKIE:"Rookie", STARTER:"Starter",
  ALL_STAR:"All-Star", MVP:"MVP", GOAT:"G.O.A.T.",
};

// ─── Box score teasers ────────────────────────────────────────────────────────

const BOX_SCORE_TEASERS = [
  "That game is worth looking up.",
  "Tap the stats — this one has a story.",
  "The box score on this game is something.",
  "Check what happened in that game.",
  "Numbers like that don't happen randomly. Go see.",
  "That stat line has a different energy to it.",
  "Worth knowing which game this was.",
  "The game behind those numbers is worth five minutes.",
  "Tap in. That performance deserves documentation.",
  "The story behind those numbers is the real prize.",
  "That's a game that people who watched it remember.",
  "Check the box score. This one might ring a bell.",
];

function shouldShowTeaser(totalFp: number, c: PostRevealRosterCard): boolean {
  return (Math.floor(totalFp * 7) + Math.floor(c.actualFp * 3)) % 10 >= 4;
}

function meetsBoxScoreThreshold(c: PostRevealRosterCard): boolean {
  const badges = c.achievements.map(a => a.id);
  if (statN(c, "pts") >= 40) return true;
  if (statN(c, "reb") >= 15) return true;
  if (statN(c, "ast") >= 12) return true;
  if (badges.includes("QUAD_DBL") || badges.includes("MAESTRO")) return true;
  if (badges.includes("TRIPLE_DBL") && statN(c, "pts") >= 35) return true;
  if (ratio(c) >= 2.0) return true;
  if (statN(c, "stl") >= 5) return true;
  if (statN(c, "blk") >= 5) return true;
  return false;
}

// ─── Famous phrases ───────────────────────────────────────────────────────────

function famousPhrase(input: PostRevealCopyInput, subject: PostRevealRosterCard | null): string | null {
  const { isBust, streak, roster } = input;
  const badges = subject?.achievements.map(a => a.id) ?? [];
  const blk = subject ? statN(subject, "blk") : 0;
  const anchor = [...roster].sort((a, b) => b.salary - a.salary)[0];
  const anchorR = anchor ? ratio(anchor) : 1;
  const cheapOverperformer = roster.find(c => c.salary <= 15 && ratio(c) >= 1.5);
  const hasSAS = roster.some(c => (c.opponent ?? "").toUpperCase() === "SAS");

  if (roster.some(c => c.salary < 20 && ratio(c) >= 2.0) || input.winTier === "GOAT") {
    if ((Math.floor(input.totalFp * 3)) % 5 === 0) return "Booyah.";
  }
  if (streak >= 5) return "I GUARANTEE IT.";
  if (isBust && badges.includes("TURNOVER_MACHINE")) return "What a terribbble basketball game.";
  if (blk >= 5) return "Not in his house tonight.";
  if (blk >= 4) return "Lots of finger wagging tonight.";
  if (anchorR < 0.80 && cheapOverperformer) return "He serves justice, don't he?";
  if (!isBust && anchorR >= 0.95 && anchorR <= 1.05) {
    if ((Math.floor(input.totalFp * 7)) % 4 === 0) return "As cool as the other side of the pillow.";
  }
  if ((isBust || (input.nextTier && input.nextTierMin - input.totalFp <= 8)) && hasSAS) {
    return "Maybe too many churros tonight.";
  }
  return null;
}

// ─── GM voice ─────────────────────────────────────────────────────────────────

function gmVoice(input: PostRevealCopyInput, subject: PostRevealRosterCard, seed: number): string | null {
  const name = nameFor(subject, seed);
  const r = ratio(subject);
  const proj = Math.round(subject.projectedFp ?? 0);

  if (subject.wasHeld && r >= 1.25) return `Held ${name} and he delivered. That read paid off.`;
  if (subject.wasHeld && r <= 0.75) return `Held ${name} at $${subject.salary} and he left points behind. Tough call.`;
  if (!subject.wasHeld && r >= 1.6 && subject.salary <= 20) return `${name}'s avg is ${proj} FP. You drew the game where he went for ${Math.round(subject.actualFp)}. Didn't even hold him.`;
  if ((subject.cardTier === "GREEN" || subject.cardTier === "WHITE") && r >= 1.5) return `$${subject.salary} card doing $${Math.round(subject.salary * 3)} FP damage. The cap math worked out.`;

  // Near-miss with culprit
  const gap = input.nextTierMin > 0 ? input.nextTierMin - input.totalFp : 0;
  if (gap > 0 && gap <= 8 && input.nextTier) {
    const { tovCulprit } = findNearMissCulprit(input.roster, gap);
    if (tovCulprit) {
      const mult = TIER_MULTIPLIERS[input.nextTier] ?? "";
      const culpritName = nameFor(tovCulprit, seed + 3);
      return `If ${culpritName} had one fewer turnover that's ${TIER_LABEL[input.nextTier]} money — ${mult} payout.`;
    }
  }
  return null;
}

// ─── Line 1 pools ─────────────────────────────────────────────────────────────

const BUST_L1 = ["Ice cold from the jump. Nothing worked.", "The lineup went cold and stayed cold.", "Couldn't get to 155. That's a full collapse.", "That was rough from card one.", "Nothing fell tonight. The math was against us."];
const ROOKIE_L1 = ["Scraped to Rookie. Half pay but still standing.", "Rookie money. The lineup did just enough.", "155 and change. The floor held. Barely.", "Minimum cash. The draw could have been kinder."];
const STARTER_BARELY_L1 = ["Caught the Starter line. Ugly but it counts.", "Scraped into Starter. A win is a win.", "Starter by the thinnest margin. The FP cooperated at the last moment."];
const STARTER_L1 = ["Solid Starter. The lineup did its job.", "Starter territory. The FP added up right.", "175 and above. The lineup held its ground.", "Clean Starter. Nothing flashy, nothing wasted."];
const STARTER_DOM_L1 = ["Comfortable Starter. The lineup had room to spare.", "Easy Starter. Nobody had a bad night.", "Cruised to Starter. That was never in doubt."];
const ALLSTAR_L1 = ["All-Star territory. Not many lineups get here.", "195 FP. Somebody went above their line tonight.", "All-Star. This one was earned.", "Deep into All-Star. The draw was with us tonight."];
const MVP_L1 = ["MVP-tier. That's the top shelf.", "215 FP and above. The lineup was built right.", "MVP money. The draw backed it up.", "That's a rare night. MVP territory confirmed."];
const GOAT_L1 = ["I GUARANTEE IT. That lineup just hit G.O.A.T. 🐐", "235+ FP. This goes in the memory. 🐐", "That's not a normal night. That's a different conversation. 🐐", "The FP don't lie. G.O.A.T. tier confirmed. 🐐"];
const NM_TINY = ["{gap} FP from {next}. One bucket. That's it.", "That was right there. {gap} FP is a foul shot.", "{next} was one play away. {gap} FP."];
const NM_SMALL = ["{next} slipped away. {gap} FP short.", "{gap} FP from {next}. One good quarter from anybody.", "All the way to the edge and {gap} FP short. That stings."];
const NM_MED = ["{gap} FP from {next}. One card away.", "Close enough to feel it. Not close enough to have it.", "{next} was visible and then it wasn't. {gap} FP gap."];

// ─── Basketball pack ──────────────────────────────────────────────────────────

const basketballPack: SportCopyPack = {
  build(input: PostRevealCopyInput): PostRevealCopy {
    const { totalFp, winTier, nextTier, tierFloor, nextTierMin, roster, streak, prevStreak, isBust, handCount } = input;
    const seed = Math.floor(totalFp * 13) + streak * 7 + (isBust ? 3 : 0);
    const subject = selectSubject(roster);
    const seed2 = subject ? Math.floor(subject.actualFp * 17) + subject.salary * 3 : seed + 1;

    const tl = TIER_LABEL[winTier] ?? winTier;
    const margin = totalFp - tierFloor;
    const gap = nextTierMin > 0 ? nextTierMin - totalFp : 0;
    const isNearMiss = !isBust && nextTier != null && gap > 0 && gap <= 8;
    const barelyMade = !isBust && margin >= 0 && margin <= 5 && winTier !== "BUST";
    const dominant = !isBust && margin >= 15;

    function ret(p: string, s?: string): PostRevealCopy {
      return { primary: cap(p, 68), secondary: s ? cap(s, 68) : undefined };
    }

    // ── Line 1 ────────────────────────────────────────────────────────────
    let line1: string;
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier ?? "next tier";
      const NEXT_TIER_MULT: Record<string, string> = {
        ROOKIE: "0.5x", STARTER: "3x", ALL_STAR: "8x", MVP: "15x", GOAT: "50x",
      };
      const multLabel = nextTier ? (NEXT_TIER_MULT[nextTier] ?? "") : "";
      const multSuffix = multLabel ? ` — that's the ${multLabel} payout` : "";
      line1 = gap <= 2
        ? pick([`${gap.toFixed(1)} FP from ${nextLabel}${multSuffix}. One play.`, `${nextLabel} was one play away${multSuffix}. ${gap.toFixed(1)} FP.`], seed)
        : gap <= 5
        ? pick([`${gap.toFixed(1)} FP short of ${nextLabel}${multSuffix}. Stings.`, `${nextLabel} slipped away — ${gap.toFixed(1)} FP${multSuffix}.`], seed)
        : pick([`${gap.toFixed(1)} FP from ${nextLabel} ${E.NEAR_MISS}${multSuffix}.`, `That was right there — ${gap.toFixed(1)} short of ${nextLabel}${multSuffix}.`], seed);
    } else if (winTier === "GOAT") {
      line1 = pick(GOAT_L1, seed);
    } else if (winTier === "MVP") {
      line1 = pick(MVP_L1, seed);
    } else if (winTier === "ALL_STAR") {
      line1 = pick(ALLSTAR_L1, seed);
    } else if (winTier === "STARTER") {
      line1 = barelyMade ? pick(STARTER_BARELY_L1, seed) : dominant ? pick(STARTER_DOM_L1, seed) : pick(STARTER_L1, seed);
    } else if (winTier === "ROOKIE") {
      line1 = pick(ROOKIE_L1, seed);
    } else {
      line1 = pick(BUST_L1, seed);
    }

    // ── Line 2 — priority stack ───────────────────────────────────────────
    if (!subject) return ret(line1, "The lineup came up short across the board.");

    const culture = lookupCulture(subject.name);
    const name = nameFor(subject, seed2);
    const r = ratio(subject);
    const badges = subject.achievements.map(a => a.id);
    const opp = oppPhrase(subject, pick(["against", "in", "hosting"] as const, seed2));

    // 1. Famous phrase
    const famous = famousPhrase(input, subject);
    if (famous) return ret(line1, famous);

    // 2. TURNOVER_MACHINE / SLOPPY
    if (badges.includes("TURNOVER_MACHINE") || badges.includes("SLOPPY")) {
      const tov = statN(subject, "turnovers");
      const tovLine = culture?.turnovers?.length ? pick(culture.turnovers, seed2) : `${name} had ${tov} turnovers${opp}. That hurt.`;
      return ret(line1, tovLine);
    }

    // 3. Near-miss with culprit
    if (isNearMiss) {
      const gm = gmVoice(input, subject, seed2);
      if (gm) return ret(line1, gm);
      const { tovCulprit, underachiever } = findNearMissCulprit(roster, gap);
      if (tovCulprit) {
        const cn = nameFor(tovCulprit, seed2 + 5);
        return ret(line1, `${cn}'s turnovers were the difference. The gap was right there.`);
      }
      if (underachiever && r < 0.9) {
        const un = nameFor(underachiever, seed2 + 7);
        return ret(line1, `${un} left points behind. One better draw and that's a different tier.`);
      }
    }

    // 4. GM voice: cheap card overperformance
    if (subject.salary <= 18 && r >= 1.6) {
      const gm = gmVoice(input, subject, seed2);
      if (gm) return ret(line1, gm);
    }

    // 5. GM voice: held card significant over/underperform
    if (subject.wasHeld && (r >= 1.25 || r <= 0.75)) {
      const gm = gmVoice(input, subject, seed2);
      if (gm) return ret(line1, gm);
    }

    // 6. Rare badge + box score teaser
    const rareBadges = ["QUAD_DBL", "5X5", "GOD_MODE", "MAESTRO"];
    if (badges.some(b => rareBadges.includes(b))) {
      const badgeLabel = subject.achievements.find(a => rareBadges.includes(a.id))?.label ?? "";
      let hypeLine = culture?.overperform?.length ? pick(culture.overperform, seed2) : `${name} hit ${badgeLabel}${opp}. That's elite.`;
      if (meetsBoxScoreThreshold(subject) && shouldShowTeaser(totalFp, subject)) {
        hypeLine = pick(culture?.famousGameHint ?? BOX_SCORE_TEASERS, seed2);
      }
      return ret(line1, hypeLine);
    }

    // 7. Anchor significantly underperformed
    const anchor = [...roster].sort((a, b) => b.salary - a.salary)[0];
    if (anchor && ratio(anchor) < 0.75 && anchor.salary >= 40) {
      const an = nameFor(anchor, seed2);
      const underLine = culture && lookupCulture(anchor.name)?.underperform?.length
        ? pick(lookupCulture(anchor.name)!.underperform, seed2)
        : `${an} had an off night${opp}. The salary didn't deliver.`;
      return ret(line1, underLine);
    }

    // 8. Anchor significantly overperformed
    if (anchor && ratio(anchor) >= 1.35 && anchor.salary >= 40) {
      const an = nameFor(anchor, seed2);
      const overLine = culture && lookupCulture(anchor.name)?.overperform?.length
        ? pick(lookupCulture(anchor.name)!.overperform, seed2)
        : `${an} went above the line${opp}. The salary earned tonight.`;
      return ret(line1, overLine);
    }

    // 9. Near-miss generic
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier;
      return ret(line1, `${nextLabel} was right there. One better draw changes everything.`);
    }

    // 10. Team flavor
    const oppCode = (subject.opponent ?? "").toUpperCase();
    const tf = TEAM_FLAVOR[oppCode];
    if (tf) {
      const oppFlavor = culture?.opponentFlavor?.[oppCode];
      if (oppFlavor) return ret(line1, oppFlavor);
      return ret(line1, isBust ? tf.cold : tf.hype);
    }

    // 11. Common badge + culture
    const commonBadges = ["FIRE", "BEAST", "WIZARD", "TRIPLE_DBL", "GLASS", "DIME", "REJECTION", "THIEF", "DOUBLE_DBL", "BUCKET", "SWAT", "PICKPOCKET", "PURE"];
    const commonHit = badges.find(b => commonBadges.includes(b));
    if (commonHit) {
      const badgeLabel = subject.achievements.find(a => a.id === commonHit)?.label ?? "";
      if (r >= 1.2 && culture?.overperform?.length) return ret(line1, pick(culture.overperform, seed2));
      if (r <= 0.8 && culture?.underperform?.length) return ret(line1, pick(culture.underperform, seed2));
      return ret(line1, `${name} hit ${badgeLabel}${opp}. The FP reflected it.`);
    }

    // 12. High stats without badge
    const pts = statN(subject, "pts");
    const reb = statN(subject, "reb");
    const ast = statN(subject, "ast");
    if (pts >= 30) {
      if (culture?.overperform?.length) return ret(line1, pick(culture.overperform, seed2));
      return ret(line1, `${name} dropped ${pts}${opp}. That slot delivered.`);
    }
    if (reb >= 12) return ret(line1, `${name} grabbed ${reb} boards${opp}. The glass was his.`);
    if (ast >= 10) return ret(line1, `${name} dished ${ast} assists${opp}. The offense flowed through him.`);

    // 13. Player culture tier lines (gated by handCount)
    if (culture) {
      if (handCount >= 10 && culture.tier3.length) return ret(line1, pick(culture.tier3, seed2));
      if (handCount >= 3 && culture.tier2.length) return ret(line1, pick(culture.tier2, seed2));
      if (culture.tier1.length) return ret(line1, pick(culture.tier1, seed2));
      if (r >= 1.15 && culture.onPace.length) return ret(line1, pick(culture.onPace, seed2));
    }

    // 14. Fallback — honest stat observation
    if (r >= 1.2) return ret(line1, `${name} went above the projection${opp}. The draw was kind.`);
    if (r <= 0.8) return ret(line1, `${name} came in below the line${opp}. Not the game we needed.`);
    return ret(line1, `${name} delivered close to the average${opp}. The lineup held.`);
  },
};
