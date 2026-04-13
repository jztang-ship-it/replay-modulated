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
  /**
   * Optional override produced by the leaderboard awareness system
   * (see shared/utils/leaderboardContext.ts). When non-null, replaces the
   * secondary line for this hand only. Primary is never overridden — the
   * score/tier voice stays untouched.
   */
  leaderboardLine?: string | null;
}

export interface PostRevealCopy { primary: string; secondary?: string; }
export interface SportCopyPack { build(input: PostRevealCopyInput): PostRevealCopy; }

export function buildPostRevealCopy(
  input: PostRevealCopyInput,
  pack: SportCopyPack = basketballPack,
): PostRevealCopy {
  const copy = pack.build(input);
  // Leaderboard awareness override — replaces secondary only.
  // Primary (score/tier flavor) stays the voice of the hand.
  if (input.leaderboardLine && input.leaderboardLine.length > 0) {
    return { primary: copy.primary, secondary: input.leaderboardLine };
  }
  return copy;
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

function nameFor(c: PostRevealRosterCard, _seed: number): string {
  // Always use full name — never just first name or nickname alone.
  // Users need to know WHO is being talked about.
  return c.name;
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

  if (streak >= 15) return `${streak} wins in a row. That's a historic run.`;
  if (streak >= 10) return `${streak} straight wins. Keep going — this is something to talk about.`;
  if (streak >= 7) return `${streak} wins in a row. That kind of consistency is hard to do.`;
  if (isBust && badges.includes("TURNOVER_MACHINE")) return `${lastName(subject.name)} turned it over too many times. That's where this one went.`;
  if (blk >= 5 && subject.homeAway === "H") return "Not in his house tonight.";
  if (blk >= 5 && subject.homeAway === "A") return `${lastName(subject.name)} had 5 blocks on the road. Took over someone else's building.`;
  if (blk >= 4 && subject.homeAway === "H") return "Lots of finger wagging tonight.";
  if (anchor && anchor.salary >= 45 && anchorR < 0.75) {
    const an = nameFor(anchor, 0);
    return `${an} came in below the line tonight — the anchor didn't hold.`;
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

  if (subject.wasHeld && r >= 1.25) return `${name} delivered tonight — holding that card was the right call.`;
  if (subject.wasHeld && r <= 0.75) return `${name} didn't bring it tonight despite the hold. Tough break at $${subject.salary}.`;
  if (!subject.wasHeld && r >= 1.6 && subject.salary >= 45) return `${name} went well above the average tonight — that's the upside you pay for.`;
  if (!subject.wasHeld && r >= 1.6 && subject.salary < 45) return null; // Don't name cheap non-star overperformers

  // Near-miss with culprit
  const gap = input.nextTierMin > 0 ? input.nextTierMin - input.totalFp : 0;
  if (gap > 0 && gap <= 8 && input.nextTier) {
    const { tovCulprit } = findNearMissCulprit(input.roster, gap);
    if (tovCulprit) {
      const culpritName = nameFor(tovCulprit, seed + 3);
      const tov = statN(tovCulprit, "turnovers");
      return `${culpritName} had ${tov} turnovers. That's the gap.`;
    }
  }
  return null;
}

// ─── Line 1 pools ─────────────────────────────────────────────────────────────

const BUST_L1 = [
  "Nobody had a good night. Not one card pulled its weight.",
  "Cold from the jump. Never recovered.",
  "Too many quiet cards — the whole roster came up short.",
  "Rough from the first flip to the last.",
  "Flat across the board. This one didn't have it.",
  "Not enough from anyone to get this hand across the line.",
  "The roster never found its rhythm. Happens.",
  "Everyone underdelivered. That's a bad night across the board.",
  "Nothing clicked. Dead on arrival and never got going.",
  "Some nights the ball just doesn't bounce your way. This was one of them.",
  "Couldn't get any traction. The hand fell apart early and stayed there.",
  "A quiet night when you needed loud ones. Didn't get there.",
];
const ROOKIE_L1 = [
  "Barely got there, but you're walking away with something.",
  "Scraped across the line — not pretty, but the payout is real.",
  "Just enough to cash — the roster held together when it counted.",
  "Won it. The roster didn't dominate, but it didn't collapse either.",
  "Minimum to win is still a win. Take it and move on.",
  "Not the night you drew it up, but the hand got there.",
  "Fought for every point. The payout is small but it's real.",
  "Ugly win is still a win. These add up over time.",
  "Scraped through. The margin was thin but the result wasn't.",
  "A grinder of a hand. The roster found just enough.",
];
const STARTER_BARELY_L1 = [
  "Held on by the thinnest margin — one bad play away from nothing.",
  "Squeaked through, but a win is a win and the money counts.",
  "The hand held together just enough. Barely, but enough.",
  "Lived dangerously but survived. The roster dug deep.",
  "One card away from a very different result. Thankfully it held.",
  "Tight margin, but margins don't matter — only the result does.",
  "Scraped to the right side of the line. Close calls count.",
];
const STARTER_L1 = [
  "Solid hand — the roster delivered a clean, professional performance.",
  "Comfortable margin, nothing flashy — this is what a good roster looks like.",
  "Everything went according to plan. That doesn't happen by accident.",
  "Professional night. No drama, just a consistent return.",
  "The kind of hand that doesn't make headlines but cashes every time.",
  "Steady from start to finish. That's a well-built roster doing its job.",
  "Clean execution. Contributions across the board, nobody embarrassed themselves.",
  "No fireworks, no disasters. Just a roster that performed.",
];
const STARTER_DOM_L1 = [
  "Dominant — this hand was knocking on the door of something bigger.",
  "Comfortable margin with room to spare — the kind of hand you feel good about.",
  "Cruised through. The roster came through and then some.",
  "Comfortable win with something to spare. Could have been even bigger.",
  "The roster performed and then kept performing. Hard to argue with.",
  "Everything clicked tonight. That's a well-executed hand making it look easy.",
  "Dominant across the board. Gave yourself a real cushion.",
];
const ALLSTAR_L1 = [
  "That's a rare night. This hand earned a real return.",
  "Something special happened here — not many rosters put this together.",
  "Deep run. Hands like this don't come around every session.",
  "Big payout. This hand earned every dollar of it.",
  "Someone went way above their average and the whole hand benefited.",
  "Not a lot of rosters reach this level. This one did.",
  "High-level output across the board. The return reflects that.",
  "When a hand peaks like this, it's worth taking a second to appreciate it.",
  "The kind of night that makes you want to run it back immediately.",
];
const MVP_L1 = [
  "That's one of the best hands you can put together. Rare and real.",
  "Someone on this roster absolutely went off tonight — the whole hand felt it.",
  "This is what it looks like when a star card takes over a hand.",
  "MVP-level output. Very few rosters ever get here.",
  "When the anchor performs like this, everything else just falls into place.",
  "A standout night that carried this hand to a completely different level.",
  "Not many players can do what was done tonight. This hand had one of them.",
  "An elite performance from an elite player. The hand responded accordingly.",
];
const GOAT_L1 = [
  "The biggest night in the game. This hand was something you remember.",
  "Doesn't happen by accident — this roster hit a different level entirely.",
  "One of those hands that doesn't come around often. The payout reflects it.",
  "You don't see many nights like this. The ceiling was hit and then some.",
  "Peak performance. This is the kind of night the whole game is built around.",
  "The rarest of nights. This hand earned the top of the chart.",
  "That was something. The roster performed at a level most hands never reach.",
];

// ─── Basketball pack ──────────────────────────────────────────────────────────

const basketballPack: SportCopyPack = {
  build(input: PostRevealCopyInput): PostRevealCopy {
    const { totalFp, winTier, nextTier, tierFloor, nextTierMin, roster, streak, prevStreak, isBust, handCount } = input;
    const seed = Math.floor(totalFp * 13) + streak * 7 + (isBust ? 3 : 0);
    const subject = selectSubject(roster);
    const seed2 = subject ? Math.floor(subject.actualFp * 17) + subject.salary * 3 : seed + 1;

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
      line1 = gap <= 2
        ? pick([
            "One play away. That one stings.",
            "Right there. Couldn't grab it.",
            "One possession was all it needed.",
            "Literally one basket short. Painful.",
            "That close. Comes back around.",
            "Missed it by the smallest margin.",
          ], seed)
        : gap <= 5
        ? pick([
            "Came up just short. Stings.",
            "Almost got there — one card having a better night closes it.",
            "Slipped away at the end. Was right in reach.",
            "So close it hurts. One stronger performance and this cashes bigger.",
            "Just out of reach. The next level was right there.",
            "Was in range and couldn't close. Agonizing.",
          ], seed)
        : pick([
            "Close, but not close enough.",
            "The next level was right there — just short.",
            "Came up short. Another night.",
            "Was in range and couldn't close the gap.",
            "Needed a little more from someone. Didn't get it.",
            "Tantalizingly close. The gap was real but not huge.",
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
    if (!subject) return toneRet(line1, "Nobody stood out. The whole roster came up short.");

    const culture = lookupCulture(subject.name);
    const name = nameFor(subject, seed2);
    const r = ratio(subject);
    const badges = subject.achievements.map(a => a.id);
    const opp = oppPhrase(subject, pick(["against", "in", "hosting"] as const, seed2));

    // 1. Famous phrase
    const famous = famousPhrase(input, subject);
    if (famous) return toneRet(line1, famous);

    // 1b. Injury heuristic — low minutes + low FP on a high-salary player
    const subjectMins = statN(subject, "min") || statN(subject, "minutes") || statN(subject, "mp");
    const isLikelyInjury = subjectMins > 0 && subjectMins < 15 && subject.actualFp < 8 && subject.salary >= 30;
    if (isLikelyInjury) {
      return toneRet(line1, pick([
        `${name} left early — limited minutes hurt what this hand could've been.`,
        `${name} only played ${Math.round(subjectMins)} minutes. Hard to overcome that kind of absence.`,
        `${name} was in and out. At full strength this hand looks different.`,
      ], seed2));
    }

    // 2. TURNOVER_MACHINE / SLOPPY
    if (badges.includes("TURNOVER_MACHINE") || badges.includes("SLOPPY")) {
      const tov = statN(subject, "turnovers");
      const tovLine = culture?.turnovers?.length ? pick(culture.turnovers, seed2) : `${name} had ${tov} turnovers${opp}. Couldn't overcome it.`;
      return toneRet(line1, tovLine);
    }

    // 3. Near-miss with culprit — line 2 must connect to the gap
    if (isNearMiss) {
      const { tovCulprit, underachiever } = findNearMissCulprit(roster, gap);
      if (tovCulprit) {
        const cn = nameFor(tovCulprit, seed2 + 5);
        const tov = statN(tovCulprit, "turnovers");
        return toneRet(line1, pick([
          `${cn} had ${tov} turnovers. One back and this hand cashes bigger.`,
          `${tov} turnovers from ${cn}. That's where the gap came from.`,
          `One fewer giveaway from ${cn} and this is a different result.`,
        ], seed2));
      }
      if (underachiever) {
        const un = nameFor(underachiever, seed2 + 7);
        const proj = Math.round(underachiever.projectedFp ?? 0);
        const actual = Math.round(underachiever.actualFp);
        return toneRet(line1, pick([
          `${un} averages ${proj} and gave you ${actual}. That's your gap.`,
          `${un} came in ${proj - actual} below his average. That's the difference.`,
          `If ${un} hits his average, this hand pays out more. He didn't.`,
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
    if (anchor && ratio(anchor) < 0.75 && anchor.salary >= 45) {
      const an = nameFor(anchor, seed2);
      const underLine = culture && lookupCulture(anchor.name)?.underperform?.length
        ? pick(lookupCulture(anchor.name)!.underperform, seed2)
        : `${an} had an off night.`;
      return toneRet(line1, underLine);
    }

    // Register gate — on a bust, don't lead with good news
    if (isBust && subject) {
      // Only reference star players (RED/ORANGE/PURPLE) even on bust — never name bench players
      const starCards = roster.filter(c => {
        const t = String(c.cardTier ?? "").toUpperCase();
        return t === "RED" || t === "ORANGE" || t === "PURPLE";
      });
      const underStar = starCards.find(c => ratio(c) <= 0.7);
      const overStar = starCards.find(c => ratio(c) >= 1.2);
      if (underStar) {
        const n = nameFor(underStar, seed2);
        return toneRet(line1, `Even ${n} couldn't save this one — well below the line tonight.`);
      }
      if (overStar) {
        const n = nameFor(overStar, seed2);
        return toneRet(line1, `${n} did the work but nobody else showed up to help.`);
      }
      // If no star had a notable performance, fall through to culture/flavor lines
    }

    // 8. Anchor significantly overperformed
    if (anchor && ratio(anchor) >= 1.35 && anchor.salary >= 45) {
      const an = nameFor(anchor, seed2);
      const overLine = culture && lookupCulture(anchor.name)?.overperform?.length
        ? pick(lookupCulture(anchor.name)!.overperform, seed2)
        : `${an} went above the line.`;
      return toneRet(line1, overLine);
    }

    // 9. Near-miss generic
    if (isNearMiss) {
      return toneRet(line1, "One card away from a different night.");
    }

    // 11. Common badge + culture
    const commonBadges = ["FIRE", "BEAST", "WIZARD", "TRIPLE_DBL", "GLASS", "DIME", "REJECTION", "THIEF", "DOUBLE_DBL", "BUCKET", "SWAT", "PICKPOCKET", "PURE"];
    const commonHit = badges.find(b => commonBadges.includes(b));
    if (commonHit) {
      const badgeLabel = subject.achievements.find(a => a.id === commonHit)?.label ?? "";
      if (r >= 1.2 && culture?.overperform?.length) return toneRet(line1, pick(culture.overperform, seed2));
      if (r <= 0.8 && culture?.underperform?.length) return toneRet(line1, pick(culture.underperform, seed2));
      return toneRet(line1, `${name} hit ${badgeLabel}${opp}.`);
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
