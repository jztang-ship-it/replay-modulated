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

function lastName(n: string): string {
  const parts = n.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts[parts.length - 1] ?? n;
}

function cap(s: string, max = 95): string {
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
  const cheapOverperformer = roster.find(c => c.salary <= 20 && ratio(c) >= 1.6);
  const hasSAS = subject != null && (subject.opponent ?? "").toUpperCase() === "SAS";

  if (streak >= 7) return `${streak} in a row. I GUARANTEE IT.`;
  if (isBust && badges.includes("TURNOVER_MACHINE")) return `${lastName(subject.name)} turned it over too many times. That's where this one went.`;
  if (blk >= 5 && subject.homeAway === "H") return "Not in his house tonight.";
  if (blk >= 5 && subject.homeAway === "A") return `${lastName(subject.name)} had 5 blocks on the road. Took over someone else's building.`;
  if (blk >= 4 && subject.homeAway === "H") return "Lots of finger wagging tonight.";
  if (anchor && anchor.salary >= 40 && anchorR < 0.75 && cheapOverperformer && cheapOverperformer.salary <= 20) {
    const cheapName = lastName(cheapOverperformer.name);
    return `${cheapName} at $${cheapOverperformer.salary} outplayed the anchor.`;
  }
  if (!isBust && anchorR >= 0.95 && anchorR <= 1.05) {
    if ((Math.floor(input.totalFp * 7)) % 4 === 0) return "As cool as the other side of the pillow.";
  }
  if (hasSAS && (Math.floor(input.totalFp * 11)) % 8 === 0) {
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
  if (!subject.wasHeld && r >= 1.6 && subject.salary <= 20) return `${name}: ${Math.round(subject.actualFp)} FP on a ${proj} avg.`;
  if ((subject.cardTier === "GREEN" || subject.cardTier === "WHITE") && r >= 1.5) return `$${subject.salary} card doing $${Math.round(subject.salary * 3)} FP damage. The cap math worked out.`;

  // Near-miss with culprit
  const gap = input.nextTierMin > 0 ? input.nextTierMin - input.totalFp : 0;
  if (gap > 0 && gap <= 8 && input.nextTier) {
    const { tovCulprit } = findNearMissCulprit(input.roster, gap);
    if (tovCulprit) {
      const mult = TIER_MULTIPLIERS[input.nextTier] ?? "";
      const culpritName = nameFor(tovCulprit, seed + 3);
      return `${culpritName}'s TOs cost you ${TIER_LABEL[input.nextTier]}.`;
    }
  }
  return null;
}

// ─── Line 1 pools ─────────────────────────────────────────────────────────────

const BUST_L1 = [
  "Nobody showed up. Every card fell short.",
  "Cold from the jump. Never recovered.",
  "Couldn't get to 155. Too many quiet cards.",
  "Rough from the first flip to the last.",
  "Every card underdelivered. Full bust.",
  "Fell short of 155. Not one bright spot.",
  "Nothing clicked. Zero momentum.",
  "Full bust. Nobody had their night.",
  "Short across the board. Never found it.",
  "155 was the target. Nobody got close.",
];
const ROOKIE_L1 = [
  "Scraped to Rookie. Half pay, still here.",
  "Made it to 155. Not pretty but it counts.",
  "Rookie payout. Somebody showed up.",
  "Minimum cash. Just enough to avoid zero.",
  "155 and change. Somebody saved this hand.",
  "Barely cleared Rookie. One card away.",
];
const STARTER_BARELY_L1 = [
  "Caught the Starter line. Ugly but it counts.",
  "Scraped into Starter. A win is a win.",
  "Right on the edge of Starter. Barely.",
  "175 by the skin of it. Close call.",
  "Just made Starter. The roster held.",
];
const STARTER_L1 = [
  "Solid Starter. Nobody had a disaster.",
  "Made it to Starter. Consistent roster.",
  "175 and above. The hand came through.",
  "Clean Starter. No stars, no disasters.",
  "Starter territory. The roster held.",
  "Three times the entry. Hand delivered.",
];
const STARTER_DOM_L1 = [
  "Comfortable Starter. Room to spare.",
  "Easy Starter. Nobody had a bad night.",
  "Cruised to 175. Never really in doubt.",
  "Dominant Starter. Everyone contributed.",
  "Starter with margin. That's how it goes.",
];
const ALLSTAR_L1 = [
  "All-Star. Not many rosters get here.",
  "195 FP. Somebody had a real night.",
  "All-Star territory. Hand came through.",
  "Deep into All-Star. Everything clicked.",
  "Eight times the entry. Hand earned it.",
  "All-Star. Someone went above average.",
];
const MVP_L1 = [
  "MVP territory. That's a rare hand.",
  "215 FP. Someone went off tonight.",
  "MVP money. Something special here.",
  "Fifteen times payout. Hand was built right.",
  "Rare night. MVP doesn't happen by accident.",
  "215 and above. The lineup peaked.",
];
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
      return { primary: cap(p), secondary: s ? cap(s) : undefined };
    }

    // Tone helpers — call these instead of ret() when tone matters
    function retPositive(p: string, s?: string): PostRevealCopy {
      // Line 1 is positive — line 2 should explain WHY it worked or build on it
      return { primary: cap(p), secondary: s ? cap(s) : undefined };
    }
    function retNegative(p: string, s?: string): PostRevealCopy {
      // Line 1 is negative — line 2 should name who failed or what the cost was
      return { primary: cap(p), secondary: s ? cap(s) : undefined };
    }
    function retNearMiss(p: string, s?: string): PostRevealCopy {
      // Line 1 is near-miss — line 2 MUST name the specific gap and culprit
      return { primary: cap(p), secondary: s ? cap(s) : undefined };
    }

    // ── Line 1 ────────────────────────────────────────────────────────────
    let line1: string;
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier ?? "next tier";
      const NEXT_TIER_MULT: Record<string, string> = {
        ROOKIE: "0.5x", STARTER: "3x", ALL_STAR: "8x", MVP: "15x", GOAT: "50x",
      };
      const multLabel = nextTier ? (NEXT_TIER_MULT[nextTier] ?? "") : "";
      const multSuffix = multLabel ? ` (${multLabel})` : "";
      line1 = gap <= 2
        ? pick([
            `${nextLabel} by one play. ${gap.toFixed(1)} FP${multSuffix}.`,
            `${gap.toFixed(1)} FP from ${nextLabel}${multSuffix}.`,
            `One possession from ${nextLabel}${multSuffix}.`,
          ], seed)
        : gap <= 5
        ? pick([
            `${gap.toFixed(1)} short of ${nextLabel}${multSuffix}.`,
            `${nextLabel} slipped away. ${gap.toFixed(1)} FP${multSuffix}.`,
            `Came up ${gap.toFixed(1)} short${multSuffix}. Stings.`,
          ], seed)
        : pick([
            `${gap.toFixed(1)} from ${nextLabel}${multSuffix}. Close.`,
            `${gap.toFixed(1)} short of ${nextLabel}${multSuffix}.`,
            `${nextLabel} was right there${multSuffix}.`,
          ], seed);
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

    // Tone routing — select the right ret variant based on line 1's register
    const toneRet = isNearMiss ? retNearMiss : isBust ? retNegative : retPositive;

    // ── Line 2 — priority stack ───────────────────────────────────────────
    if (!subject) return toneRet(line1, "The lineup came up short across the board.");

    const culture = lookupCulture(subject.name);
    const name = nameFor(subject, seed2);
    const r = ratio(subject);
    const badges = subject.achievements.map(a => a.id);
    const opp = oppPhrase(subject, pick(["against", "in", "hosting"] as const, seed2));

    // 1. Famous phrase
    const famous = famousPhrase(input, subject);
    if (famous) return toneRet(line1, famous);

    // 2. TURNOVER_MACHINE / SLOPPY
    if (badges.includes("TURNOVER_MACHINE") || badges.includes("SLOPPY")) {
      const tov = statN(subject, "turnovers");
      const tovLine = culture?.turnovers?.length ? pick(culture.turnovers, seed2) : `${name} had ${tov} turnovers${opp}. Couldn't overcome it.`;
      return toneRet(line1, tovLine);
    }

    // 3. Near-miss with culprit — line 2 must connect to the gap
    if (isNearMiss) {
      const { tovCulprit, underachiever } = findNearMissCulprit(roster, gap);
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier ?? "next tier";
      if (tovCulprit) {
        const cn = nameFor(tovCulprit, seed2 + 5);
        const tov = statN(tovCulprit, "turnovers");
        const fpFromTov = (tov * 1.0).toFixed(1);
        return toneRet(line1, pick([
          `${cn} had ${tov} turnovers. One back and you're cashing ${nextLabel}.`,
          `${tov} turnovers from ${cn}. That's the gap right there.`,
          `One fewer giveaway from ${cn} and that hand pays ${nextLabel}.`,
        ], seed2));
      }
      if (underachiever) {
        const un = nameFor(underachiever, seed2 + 7);
        const proj = Math.round(underachiever.projectedFp ?? 0);
        const actual = Math.round(underachiever.actualFp);
        return toneRet(line1, pick([
          `${un} averages ${proj}. Gave you ${actual}. That's your ${nextLabel} gap.`,
          `${un} came in ${proj - actual} below his average. That's the difference.`,
          `If ${un} hits his average, you're in ${nextLabel}. He didn't.`,
        ], seed2));
      }
      const gm = gmVoice(input, subject, seed2);
      if (gm) return toneRet(line1, gm);
    }

    // 4. GM voice: cheap card overperformance
    if (subject.salary <= 18 && r >= 1.6) {
      const gm = gmVoice(input, subject, seed2);
      if (gm) return toneRet(line1, gm);
    }

    // 5. GM voice: held card significant over/underperform
    if (subject.wasHeld && (r >= 1.25 || r <= 0.75)) {
      const gm = gmVoice(input, subject, seed2);
      if (gm) return toneRet(line1, gm);
    }

    // 6. Rare badge + box score teaser (suppress on bust — don't celebrate while losing)
    const rareBadges = ["QUAD_DBL", "5X5", "GOD_MODE", "MAESTRO"];
    if (!isBust && badges.some(b => rareBadges.includes(b))) {
      const badgeLabel = subject.achievements.find(a => rareBadges.includes(a.id))?.label ?? "";
      let hypeLine = culture?.overperform?.length ? pick(culture.overperform, seed2) : `${name} hit ${badgeLabel}${opp}. That's elite.`;
      if (meetsBoxScoreThreshold(subject) && shouldShowTeaser(totalFp, subject)) {
        hypeLine = pick(culture?.famousGameHint ?? BOX_SCORE_TEASERS, seed2);
      }
      return toneRet(line1, hypeLine);
    }

    // 6b. Bust hand — lead with who failed, not who succeeded
    if (isBust) {
      const anchor = [...roster].sort((a, b) => b.salary - a.salary)[0];
      const anchorRatio = anchor ? ratio(anchor) : 1;
      const zeroCard = roster.find(c => c.actualFp <= 1.0);
      if (zeroCard) {
        const zn = nameFor(zeroCard, seed2);
        return toneRet(line1, `${zn} put up nothing. That's the problem.`);
      }
      if (anchor && anchorRatio < 0.65) {
        const an = nameFor(anchor, seed2);
        const culture = lookupCulture(anchor.name);
        const underLine = culture?.underperform?.length
          ? pick(culture.underperform, seed2)
          : `${an} went quiet at $${anchor.salary}. That's a problem.`;
        return toneRet(line1, underLine);
      }
    }

    // 7. Anchor significantly underperformed
    const anchor = [...roster].sort((a, b) => b.salary - a.salary)[0];
    if (anchor && ratio(anchor) < 0.75 && anchor.salary >= 40) {
      const an = nameFor(anchor, seed2);
      const underLine = culture && lookupCulture(anchor.name)?.underperform?.length
        ? pick(lookupCulture(anchor.name)!.underperform, seed2)
        : `${an} had an off night.`;
      return toneRet(line1, underLine);
    }

    // Register gate — on a bust, don't lead with good news
    if (isBust && subject) {
      const bestCard = [...roster].sort((a, b) => ratio(b) - ratio(a))[0];
      const worstCard = [...roster].sort((a, b) => ratio(a) - ratio(b))[0];
      const worstName = nameFor(worstCard, seed2);
      const worstOpp = oppPhrase(worstCard, "against");
      const worstR = ratio(worstCard);
      if (worstR <= 0.6) {
        return toneRet(line1, `${worstName}: ${Math.round(worstCard.actualFp)} FP on a ${Math.round(worstCard.projectedFp ?? 0)} average. The gap.`);
      }
      // If nobody had a catastrophic night, fall through to culture/flavor lines
    }

    // 8. Anchor significantly overperformed
    if (anchor && ratio(anchor) >= 1.35 && anchor.salary >= 40) {
      const an = nameFor(anchor, seed2);
      const overLine = culture && lookupCulture(anchor.name)?.overperform?.length
        ? pick(lookupCulture(anchor.name)!.overperform, seed2)
        : `${an} went above the line.`;
      return toneRet(line1, overLine);
    }

    // 9. Near-miss generic
    if (isNearMiss) {
      const nextLabel = TIER_LABEL[nextTier!] ?? nextTier;
      return toneRet(line1, `${nextLabel} was right there. One card away from a different night.`);
    }

    // 11. Common badge + culture
    const commonBadges = ["FIRE", "BEAST", "WIZARD", "TRIPLE_DBL", "GLASS", "DIME", "REJECTION", "THIEF", "DOUBLE_DBL", "BUCKET", "SWAT", "PICKPOCKET", "PURE"];
    const commonHit = badges.find(b => commonBadges.includes(b));
    if (commonHit) {
      const badgeLabel = subject.achievements.find(a => a.id === commonHit)?.label ?? "";
      if (r >= 1.2 && culture?.overperform?.length) return toneRet(line1, pick(culture.overperform, seed2));
      if (r <= 0.8 && culture?.underperform?.length) return toneRet(line1, pick(culture.underperform, seed2));
      return toneRet(line1, `${name} hit ${badgeLabel}${opp}. The FP reflected it.`);
    }

    // 12. High stats without badge
    const pts = statN(subject, "pts");
    const reb = statN(subject, "reb");
    const ast = statN(subject, "ast");
    if (pts >= 30) {
      if (culture?.overperform?.length) return toneRet(line1, pick(culture.overperform, seed2));
      return toneRet(line1, `${name} dropped ${pts}.`);
    }
    if (reb >= 12) return toneRet(line1, `${name} grabbed ${reb} boards.`);
    if (ast >= 10) return toneRet(line1, `${name} dished ${ast} assists.`);

    // 13. Player culture tier lines (gated by handCount)
    if (culture) {
      if (handCount >= 10 && culture.tier3.length) return toneRet(line1, pick(culture.tier3, seed2));
      if (handCount >= 3 && culture.tier2.length) return toneRet(line1, pick(culture.tier2, seed2));
      if (culture.tier1.length) return toneRet(line1, pick(culture.tier1, seed2));
      if (r >= 1.15 && culture.onPace.length) return toneRet(line1, pick(culture.onPace, seed2));
    }

    // 14. Fallback — honest stat observation
    if (r >= 1.2) return toneRet(line1, `${name} outperformed his average.`);
    if (r <= 0.8) return toneRet(line1, `${name} came in below the line.`);
    return toneRet(line1, `${name} came in around his average.`);
  },
};
