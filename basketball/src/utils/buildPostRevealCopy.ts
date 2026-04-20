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
  sport?: string;
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

function cap(s: string, max = 140): string {
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

/**
 * Ensure a culture line mentions the player by name. If the line already contains
 * the player's full name, last name, or a known nickname, return it as-is.
 * Otherwise prepend "PlayerName — " so the reader always knows who it's about.
 */
function attributeCultureLine(line: string, card: PostRevealRosterCard): string {
  const lower = line.toLowerCase();
  const full = card.name.trim().toLowerCase();
  if (lower.includes(full)) return line;
  const last = lastName(card.name).toLowerCase();
  if (last.length >= 4 && lower.includes(last)) return line;
  const culture = lookupCulture(card.name);
  if (culture?.nicknames?.some(n => n.length >= 3 && lower.includes(n.toLowerCase()))) return line;
  return `${card.name} — ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

// ─── Headline selection ───────────────────────────────────────────────────────

function headlineScore(c: PostRevealRosterCard): number {
  const badgeFp = c.achievements.reduce((b, a) => Math.max(b, Math.abs(a.fp ?? 0)), 0);
  return (c.salary * 2.5) + (c.actualFp * 1.5) + (badgeFp * 4);
}

/** Only RED/ORANGE/PURPLE tier players can be named as the subject. */
function isNameable(c: PostRevealRosterCard): boolean {
  const t = (c.cardTier ?? "").toUpperCase();
  return t === "RED" || t === "ORANGE" || t === "PURPLE";
}

function selectSubject(roster: PostRevealRosterCard[]): PostRevealRosterCard | null {
  const nameable = roster.filter(isNameable);
  if (nameable.length > 0) {
    return [...nameable].sort((a, b) => headlineScore(b) - headlineScore(a))[0] ?? null;
  }
  // No RED/ORANGE player — return top performer but callers must not name them
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


// ─── Dormant-culture wiring (Phase 1) ────────────────────────────────────────

/** Exact date + opponent match against culture.signatureGames — highest priority. */
function signatureGameLine(subject: PostRevealRosterCard, culture: PlayerCulture | null): string | null {
  if (!culture?.signatureGames?.length) return null;
  if (!subject.gameDate || !subject.opponent) return null;
  const date = subject.gameDate.slice(0, 10); // "YYYY-MM-DD"
  const opp = subject.opponent.toUpperCase();
  const match = culture.signatureGames.find(g => g.date === date && g.opponent.toUpperCase() === opp);
  return match ? match.line : null;
}

/** Big-game threshold — 40+ pts, QUAD_DBL, 60+ pt scoring, or actualFp >= 65. */
function bigGameLine(subject: PostRevealRosterCard, culture: PlayerCulture | null, seed: number): string | null {
  if (!culture?.bigGame?.length) return null;
  const pts = statN(subject, "pts");
  const badges = subject.achievements.map(a => a.id);
  const isBig = pts >= 40 || subject.actualFp >= 65 || badges.includes("QUAD_DBL") || badges.includes("GOD_MODE");
  return isBig ? attributeCultureLine(pick(culture.bigGame, seed), subject) : null;
}

/** Quiet game on a star — low pts + low FP on a high-salary nameable player (non-injury). */
function quietGameLine(subject: PostRevealRosterCard, culture: PlayerCulture | null, seed: number): string | null {
  if (!culture?.quietGame?.length) return null;
  if (subject.salary < 30) return null;
  const pts = statN(subject, "pts");
  const mins = statN(subject, "min") || statN(subject, "minutes") || statN(subject, "mp");
  if (mins > 0 && mins < 20) return null; // let injury heuristic own short-minutes case
  const isQuiet = pts <= 10 && subject.actualFp < 18;
  return isQuiet ? attributeCultureLine(pick(culture.quietGame, seed), subject) : null;
}

/** Defensive standout — 4+ blk or 5+ stl. */
function defensiveLine(subject: PostRevealRosterCard, culture: PlayerCulture | null, seed: number): string | null {
  if (!culture?.defensive?.length) return null;
  const blk = statN(subject, "blk");
  const stl = statN(subject, "stl");
  const isDefensive = blk >= 4 || stl >= 5;
  return isDefensive ? attributeCultureLine(pick(culture.defensive, seed), subject) : null;
}

/** Opponent-specific flavor — fires when subject's opponent has a keyed reaction. */
function opponentFlavorLine(subject: PostRevealRosterCard, culture: PlayerCulture | null): string | null {
  if (!culture?.opponentFlavor) return null;
  if (!subject.opponent) return null;
  const opp = subject.opponent.toUpperCase();
  const line = culture.opponentFlavor[opp];
  return line ? attributeCultureLine(line, subject) : null;
}

/** Player-specific streak line — fires on wins with streak ≥ 3. */
function streakCultureLine(subject: PostRevealRosterCard, culture: PlayerCulture | null, streak: number, seed: number): string | null {
  if (!culture?.streakLines?.length) return null;
  if (streak < 3) return null;
  return attributeCultureLine(pick(culture.streakLines, seed), subject);
}

// ─── Box score teasers ────────────────────────────────────────────────────────

const BOX_SCORE_TEASERS = [
  "That game is worth looking up — the box score on this one has a real story in it, and the story is better than the number.",
  "Tap the stats. This isn't one of those nights a player stumbles into — somebody decided tonight was the night.",
  "The box score on this game is something. Numbers like that don't happen randomly, and whoever was in the building knew it.",
  "Check what happened here. Everyone who watched this in real time has a specific memory of when they realized it was happening.",
  "Numbers like that don't happen randomly. Go look — the rest of that line tells you what kind of night the other ten guys had.",
  "That stat line has a different energy. Some box scores are just numbers; this one is a small piece of history sitting in a database.",
  "Worth knowing which game this was. These performances don't get pulled at random — somebody was on a mission that night.",
  "The game behind those numbers is worth five minutes. Open it up, read the line, picture the building. It's better than most.",
  "Tap in. That performance deserves documentation — and somewhere out there, somebody is still telling a story about being there.",
  "The story behind those numbers is the real prize. Scores are temporary; games like this get remembered by everyone who saw them.",
  "That's a game people who watched it remember. The scoreboard told you the result; the box score tells you how it actually felt.",
  "Check the box score. This one might ring a bell — or if it doesn't, it should, and you have thirty seconds to fix that.",
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

  // Streak lines — only on wins. On bust, mention the streak ending if it was notable.
  if (!isBust && streak >= 15) return `${streak} wins in a row. That's a historic run.`;
  if (!isBust && streak >= 10) return `${streak} straight wins. Keep going — this is something to talk about.`;
  if (!isBust && streak >= 7) return `${streak} wins in a row. That kind of consistency is hard to do.`;
  if (isBust && input.prevStreak >= 7) return `The ${input.prevStreak}-win streak is done. It was a good run.`;
  if (isBust && badges.includes("TURNOVER_MACHINE")) return `${lastName(subject.name)} turned it over too many times. That's where this one went.`;
  if (blk >= 5 && subject.homeAway === "H") return "Not in his house tonight.";
  if (blk >= 5 && subject.homeAway === "A") return `${lastName(subject.name)} had 5 blocks on the road. Took over someone else's building.`;
  if (blk >= 4 && subject.homeAway === "H") return "Lots of finger wagging tonight.";
  const isBigWinFP = input.winTier === "ALL_STAR" || input.winTier === "MVP" || input.winTier === "LEGEND";
  if (!isBigWinFP && anchor && isNameable(anchor) && anchor.salary >= 45 && anchorR < 0.75) {
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
    if (tovCulprit && isNameable(tovCulprit)) {
      const culpritName = nameFor(tovCulprit, seed + 3);
      const tov = statN(tovCulprit, "turnovers");
      return `${culpritName} had ${tov} turnovers. That's the gap.`;
    }
    if (tovCulprit && !isNameable(tovCulprit)) {
      const tov = statN(tovCulprit, "turnovers");
      return `${tov} turnovers from the supporting cast. That's the gap.`;
    }
  }
  return null;
}

// ─── Line 1 pools ─────────────────────────────────────────────────────────────

const BUST_L1 = [
  "Nobody had a night. Not one card pulled its weight — whole roster checked out at the same time and the hand never had a pulse.",
  "Cold from the tip. Every card underwhelmed, nobody found a rhythm, and by the time anyone got going it was already written.",
  "Too many quiet cards. When five guys have five bad nights on the same slate, there's no spreadsheet fix for that.",
  "Rough from the first flip to the last. Not one performance gave you a moment to believe — the math was ugly before it was over.",
  "Flat across the board. No spark, no anchor, no unexpected hero — just five quiet lines adding up to a number you don't want to see.",
  "Not enough from anyone. One guy going off can save most hands; when nobody goes off, you get this exactly.",
  "The roster never found its rhythm. Happens — some nights there's no story, just five guys who couldn't get anything going together.",
  "Everyone underdelivered. Anchor, role players, the cheap upside guy — the whole slate came in below the line, simultaneously.",
  "Nothing clicked. DOA at the tip, stayed that way, nothing even flirted with being interesting.",
  "Some nights the ball doesn't bounce your way. This was one of those — quiet boxes up and down the roster, nothing to grab onto.",
  "Couldn't get traction. The hand was falling apart by the second card and never found a reason to pull itself back together.",
  "A quiet night when you needed loud ones. Cold streaks happen across the league; this one was synchronized across your roster.",
];
const ROOKIE_L1 = [
  "Barely got there — but you're walking away with something. Ugly wins spend the same as pretty ones. Don't overthink it.",
  "Scraped across the line. Not pretty, not memorable, but the payout is real and that's the entire point of showing up.",
  "Just enough to cash. The roster held together when it counted — even if 'counted' means barely held at all.",
  "Won it. The roster didn't dominate, but it didn't collapse either — the kind of night you forget by morning and that's fine.",
  "Minimum to win is still a win. Take it, reset, and try to build something more interesting next hand.",
  "Not the night you drew it up. The hand got there anyway — the ledger doesn't care how it happened.",
  "Fought for every point. The payout is small but it's real, and real beats pretty seven days a week in this game.",
  "Ugly wins count. They stack up over time and matter more than people who only remember the LEGEND hands think they do.",
  "Scraped through. The margin was thin but the result wasn't — green ink is green ink, regardless of how it got there.",
  "A grinder of a hand. The roster found just enough and called it a night. Not every win needs a highlight reel.",
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
  "Solid hand. Nobody stole the show, nobody blew it, and the line looks exactly the way it's supposed to — that's a well-assembled roster.",
  "Comfortable margin, nothing flashy. This is what a roster looks like when nobody's trying to be a hero — it just works.",
  "Everything went according to plan. Boring is a real skill; a hand that does exactly what it was drafted to do is a small kind of art.",
  "Professional night from top to bottom. No drama, no theatrics, no surprises — just a roster doing its job and a payout to match.",
  "The kind of hand that doesn't make headlines but cashes every time. Spread the contributions out, let everyone do their part, pocket it.",
  "Steady from start to finish. When every role player hits their number, you don't need a star — you just need the math to work.",
  "Clean execution through the slate. Contributions across the board, nobody embarrassed themselves, and the ledger gets a new green line.",
  "No fireworks, no disasters. Just a roster that performed the way rosters are supposed to perform when they're built correctly.",
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
  "That's a rare night. Somebody on this roster hit a different gear and dragged the whole hand along with them.",
  "Something special happened here. Most hands never find this level — this one did, and the payout is the reward for whatever just clicked.",
  "Deep run. Not every session delivers a night like this; when it does, you remember it for a minute before you reset and go again.",
  "Big payout earned, not given. This hand required somebody to go off and the supporting cast to show up — both happened.",
  "Someone went way above their average and the whole roster rode the wave. Stack salary, wait for variance to break right, cash.",
  "Not a lot of rosters reach this level. This one did, and the margin says it wasn't an accident either.",
  "High-level output across the board. Return reflects that — this is exactly what the game is designed to reward.",
  "When a hand peaks like this, it's worth a second to appreciate it before you press the button and see if you can do it twice.",
  "The kind of night that makes you want to run it back immediately. Careful — nights like this are not on a schedule.",
];
const MVP_L1 = [
  "That's one of the best hands you can put together. Rare, real, and the kind of line that looks different from every other win you've stacked.",
  "Someone on this roster absolutely went off, and the whole hand felt it. When a star does the job at this level, miracles elsewhere are optional.",
  "This is what it looks like when a star card takes over a hand. The anchor earned the salary tonight — that's what you pay for.",
  "MVP-level output. Very few rosters ever reach this floor; when one does, the ledger gets a green line with some real meat on it.",
  "When the anchor performs like this, everything else just falls into place. The math works, the payout is fat, nobody has questions.",
  "A standout night that carried this hand to a level most never see. Enjoy it — this is a very small window that closes on its own.",
  "Not many players can do what was done tonight. This hand had one of them, and the roster stayed out of his way while he worked.",
  "An elite performance from an elite player, and the supporting cast delivered enough to let it count. That's the formula when it works.",
];
const LEGEND_L1 = [
  "The biggest night in the game. This is the kind of result you remember, replay in your head, and tell someone about whether they asked or not.",
  "Doesn't happen by accident. Someone built this roster knowing what it could do, and tonight it did exactly that — at the ceiling.",
  "One of those hands that doesn't come around often. The payout reflects it; the story reflects it a little more.",
  "You don't see many nights like this. The ceiling was hit and then some — pure output, nothing left on the board.",
  "Peak performance. This is the kind of night the whole game is built around — rare, loud, and the reason people keep showing up.",
  "The rarest of nights. This hand earned the top of the chart and every dollar that comes with it. Bottle it.",
  "That was something. The roster performed at a level most hands never reach — take the number and remember what it felt like.",
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

    // ALL_STAR and above = "big win" tier. Near-misses at these levels should
    // still feel positive ("oh shucks, almost had the next level") not painful.
    const isBigWin = winTier === "ALL_STAR" || winTier === "MVP" || winTier === "LEGEND";

    // ── Line 1 ────────────────────────────────────────────────────────────
    let line1: string;
    if (isNearMiss && !isBigWin) {
      // ROOKIE/STARTER near-miss — negative framing is appropriate
      line1 = gap <= 2
        ? pick([
            "One play away. A single possession in a real game somewhere closes this gap — that's the margin, exactly.",
            "Right there. Couldn't grab it — one fewer turnover, one extra rebound, one different call, and this is a different result.",
            "One possession was all it needed. The next level was a rebound away and you can pick which play you want to blame.",
            "Literally one basket short. That's the kind of result that doesn't sting less because you understand the math.",
            "That close. Comes back around — probability doesn't care which specific hand pays out, just that one of them will.",
            "Missed it by the smallest possible margin. These are the hands you remember when you're counting what you left on the table.",
          ], seed)
        : gap <= 5
        ? pick([
            "Came up just short. Stings the way a two-point loss stings — mathematically the same as any other loss, emotionally not.",
            "Almost got there. One card having a slightly better night and this hand clicks up a whole tier.",
            "Slipped away at the end. Was right in reach and then wasn't — nobody fumbled it, it just didn't quite get there.",
            "So close it hurts. One stronger performance from any of five guys and this one cashes bigger instead of cashing like this.",
            "Just out of reach. The next level was right there on the board and the hand made a real run at it before coming up short.",
            "Was in range and couldn't close. Agonizing in the way only margin losses are — the result is fine, the feeling isn't.",
          ], seed)
        : pick([
            "Close, but not close enough — the next level was in view but the roster couldn't find the last piece to push it over.",
            "The next level was right there and you could see it. Just couldn't quite get the number to show up.",
            "Came up short. Another night — the game is long, and tier jumps are usually one card away, not two.",
            "Was in range and couldn't close the gap. Happens — you were one decent performance from a real bump.",
            "Needed a little more from someone specific. Didn't get it. That's the whole story of this hand in one sentence.",
            "Tantalizingly close. The gap was real but not huge — the kind of result you look at twice trying to find the one card that cost you.",
          ], seed);
    } else if (winTier === "LEGEND") {
      line1 = pick(LEGEND_L1, seed);
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
    // ALL_STAR+ near-misses stay positive (oh shucks), not near-miss register
    const toneRet = (isNearMiss && !isBigWin) ? retNearMiss : isBust ? retNegative : retPositive;

    // ── Line 2 — priority stack ───────────────────────────────────────────
    if (!subject) return toneRet(line1, "Nobody stood out. The whole roster came up short.");

    // ALL_STAR+ near-miss: line 2 = "oh shucks" positive acknowledgement
    if (isNearMiss && isBigWin) {
      const ohShucks = pick([
        "Almost had the next level too. So close.",
        "One more big play and this hand goes even higher. Can't be mad.",
        "Just missed the next tier — but what a night.",
        "A little more and this one goes to another level. Still a great hand.",
        "Inches from something even bigger. Take the win.",
        "The next level was right there. Still, this is a hand to feel good about.",
      ], seed);
      return retPositive(line1, ohShucks);
    }

    // If subject isn't nameable (not RED/ORANGE), skip name-based commentary
    if (!isNameable(subject)) {
      return toneRet(line1);
    }

    const culture = lookupCulture(subject.name);
    const name = nameFor(subject, seed2);
    const r = ratio(subject);
    const badges = subject.achievements.map(a => a.id);
    const opp = oppPhrase(subject, pick(["against", "in", "hosting"] as const, seed2));

    // 1. Famous phrase
    const famous = famousPhrase(input, subject);
    if (famous) return toneRet(line1, famous);

    // 1a. Signature game match — if the subject's gameDate+opponent matches a known
    // curated signature, use the pre-written line. Rare, but highest-delight hit.
    const sig = signatureGameLine(subject, culture);
    if (sig) return toneRet(line1, sig);

    // 1b. Injury heuristic — low minutes + low FP on a high-salary player (suppress on big wins — keep it positive)
    if (!isBigWin) {
      const subjectMins = statN(subject, "min") || statN(subject, "minutes") || statN(subject, "mp");
      const isLikelyInjury = subjectMins > 0 && subjectMins < 15 && subject.actualFp < 8 && subject.salary >= 30;
      if (isLikelyInjury) {
        return toneRet(line1, pick([
          `${name} left early — limited minutes hurt what this hand could've been.`,
          `${name} only played ${Math.round(subjectMins)} minutes. Hard to overcome that kind of absence.`,
          `${name} was in and out. At full strength this hand looks different.`,
        ], seed2));
      }
    }

    // 2. TURNOVER_MACHINE / SLOPPY (suppress on big wins — don't blame on a celebration)
    if (!isBigWin && (badges.includes("TURNOVER_MACHINE") || badges.includes("SLOPPY"))) {
      const tov = statN(subject, "turnovers");
      const tovLine = culture?.turnovers?.length ? attributeCultureLine(pick(culture.turnovers, seed2), subject) : `${name} had ${tov} turnovers${opp}. Couldn't overcome it.`;
      return toneRet(line1, tovLine);
    }

    // 2b. Defensive standout — 4+ blk or 5+ stl. Suppress on bust (don't celebrate while losing).
    if (!isBust) {
      const def = defensiveLine(subject, culture, seed2);
      if (def) return toneRet(line1, def);
    }

    // 3. Near-miss with culprit — line 2 must connect to the gap (only name RED/ORANGE players)
    if (isNearMiss) {
      const { tovCulprit, underachiever } = findNearMissCulprit(roster, gap);
      if (tovCulprit && isNameable(tovCulprit)) {
        const cn = nameFor(tovCulprit, seed2 + 5);
        const tov = statN(tovCulprit, "turnovers");
        return toneRet(line1, pick([
          `${cn} had ${tov} turnovers. One back and this hand cashes bigger.`,
          `${tov} turnovers from ${cn}. That's where the gap came from.`,
          `One fewer giveaway from ${cn} and this is a different result.`,
        ], seed2));
      }
      if (tovCulprit && !isNameable(tovCulprit)) {
        const tov = statN(tovCulprit, "turnovers");
        return toneRet(line1, `Too many turnovers from the supporting cast. ${tov} giveaways hurt.`);
      }
      if (underachiever && isNameable(underachiever)) {
        const un = nameFor(underachiever, seed2 + 7);
        const proj = Math.round(underachiever.projectedFp ?? 0);
        const actual = Math.round(underachiever.actualFp);
        return toneRet(line1, pick([
          `${un} averages ${proj} and gave you ${actual}. That's your gap.`,
          `${un} came in ${proj - actual} below his average. That's the difference.`,
          `If ${un} hits his average, this hand pays out more. He didn't.`,
        ], seed2));
      }
      if (underachiever && !isNameable(underachiever)) {
        return toneRet(line1, "The supporting cast came in under their averages. That's the gap.");
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

    // 5b. Big game — 40+ pts, 65+ FP, or elite badge. Culture-specific big-game voice.
    if (!isBust) {
      const big = bigGameLine(subject, culture, seed2);
      if (big) return toneRet(line1, big);
    }

    // 6. Rare badge + box score teaser (suppress on bust — don't celebrate while losing)
    const rareBadges = ["QUAD_DBL", "5X5", "GOD_MODE", "MAESTRO"];
    if (!isBust && badges.some(b => rareBadges.includes(b))) {
      const badgeLabel = subject.achievements.find(a => rareBadges.includes(a.id))?.label ?? "";
      let hypeLine = culture?.overperform?.length ? attributeCultureLine(pick(culture.overperform, seed2), subject) : `${name} hit ${badgeLabel}${opp}. That's elite.`;
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
      if (zeroCard && isNameable(zeroCard)) {
        const zn = nameFor(zeroCard, seed2);
        return toneRet(line1, `${zn} put up nothing. That's the problem.`);
      }
      if (zeroCard && !isNameable(zeroCard)) {
        return toneRet(line1, "Someone on the bench put up nothing. That's the problem.");
      }
      if (anchor && isNameable(anchor) && anchorRatio < 0.65) {
        const an = nameFor(anchor, seed2);
        const anchorCulture = lookupCulture(anchor.name);
        const underLine = anchorCulture?.underperform?.length
          ? attributeCultureLine(pick(anchorCulture.underperform, seed2), anchor)
          : `${an} went quiet at $${anchor.salary}. That's a problem.`;
        return toneRet(line1, underLine);
      }
    }

    // 6c. Quiet game on a star — low pts on a high-salary nameable player (non-injury)
    if (!isBigWin) {
      const quiet = quietGameLine(subject, culture, seed2);
      if (quiet) return toneRet(line1, quiet);
    }

    // 7. Anchor significantly underperformed (suppress on big wins — don't blame anyone)
    const anchor = [...roster].sort((a, b) => b.salary - a.salary)[0];
    if (!isBigWin && anchor && isNameable(anchor) && ratio(anchor) < 0.75 && anchor.salary >= 45) {
      const an = nameFor(anchor, seed2);
      const anchorCulture2 = lookupCulture(anchor.name);
      const underLine = anchorCulture2?.underperform?.length
        ? attributeCultureLine(pick(anchorCulture2.underperform, seed2), anchor)
        : `${an} had an off night.`;
      return toneRet(line1, underLine);
    }

    // Register gate — on a bust, don't lead with good news
    if (isBust && subject) {
      // Only reference nameable players (RED/ORANGE) — never name lower tiers
      const starCards = roster.filter(isNameable);
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
    if (anchor && isNameable(anchor) && ratio(anchor) >= 1.35 && anchor.salary >= 45) {
      const an = nameFor(anchor, seed2);
      const anchorCulture3 = lookupCulture(anchor.name);
      const overLine = anchorCulture3?.overperform?.length
        ? attributeCultureLine(pick(anchorCulture3.overperform, seed2), anchor)
        : `${an} went above the line.`;
      return toneRet(line1, overLine);
    }

    // 8b. Opponent-specific flavor — keyed on subject.opponent (rivalry / matchup beef)
    const oppFlavor = opponentFlavorLine(subject, culture);
    if (oppFlavor) return toneRet(line1, oppFlavor);

    // 9. Near-miss generic
    if (isNearMiss) {
      return toneRet(line1, "One card away from a different night.");
    }

    // 11. Common badge + culture
    const commonBadges = ["FIRE", "BEAST", "WIZARD", "TRIPLE_DBL", "GLASS", "DIME", "REJECTION", "THIEF", "DOUBLE_DBL", "BUCKET", "SWAT", "PICKPOCKET", "PURE"];
    const commonHit = badges.find(b => commonBadges.includes(b));
    if (commonHit) {
      const badgeLabel = subject.achievements.find(a => a.id === commonHit)?.label ?? "";
      if (r >= 1.2 && culture?.overperform?.length) return toneRet(line1, attributeCultureLine(pick(culture.overperform, seed2), subject));
      if (r <= 0.8 && culture?.underperform?.length) return toneRet(line1, attributeCultureLine(pick(culture.underperform, seed2), subject));
      return toneRet(line1, `${name} hit ${badgeLabel}${opp}.`);
    }

    // 12. High stats without badge
    const pts = statN(subject, "pts");
    const reb = statN(subject, "reb");
    const ast = statN(subject, "ast");
    if (pts >= 30) {
      if (culture?.overperform?.length) return toneRet(line1, attributeCultureLine(pick(culture.overperform, seed2), subject));
      return toneRet(line1, `${name} dropped ${pts}.`);
    }
    if (reb >= 12) return toneRet(line1, `${name} grabbed ${reb} boards.`);
    if (ast >= 10) return toneRet(line1, `${name} dished ${ast} assists.`);

    // 12b. Streak culture — player-specific streak commentary on wins with streak ≥ 3
    // (famousPhrase already handles streak ≥ 7 generically; this fills 3-6 with player voice)
    if (!isBust && streak >= 3 && streak < 7) {
      const streakLine = streakCultureLine(subject, culture, streak, seed2);
      if (streakLine) return toneRet(line1, streakLine);
    }

    // 13. Player culture tier lines (gated by handCount)
    if (culture) {
      if (handCount >= 10 && culture.tier3.length) return toneRet(line1, attributeCultureLine(pick(culture.tier3, seed2), subject));
      if (handCount >= 3 && culture.tier2.length) return toneRet(line1, attributeCultureLine(pick(culture.tier2, seed2), subject));
      if (culture.tier1.length) return toneRet(line1, attributeCultureLine(pick(culture.tier1, seed2), subject));
      if (r >= 1.15 && culture.onPace.length) return toneRet(line1, attributeCultureLine(pick(culture.onPace, seed2), subject));
    }

    // 14. Fallback — honest stat observation
    if (r >= 1.2) return toneRet(line1, `${name} outperformed his average.`);
    if (r <= 0.8) return toneRet(line1, `${name} came in below the line.`);
    return toneRet(line1, `${name} came in around his average.`);
  },
};
