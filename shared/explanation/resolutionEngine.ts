// shared/explanation/resolutionEngine.ts
//
// RD7.2 — Resolution Engine (pure function, no UI, no data load).
// See docs/rd7.2-explanation-spec.md (+ Tuning rounds 1 & 2). v1 scope:
// classes A1–A5 + C; Class B (allocation) GATED OFF; cap INVISIBLE.
//
// SELECTION (r1/r2): CONTRIBUTION selects WHO, PERCENTILE qualifies IF, and
// CAUSALITY + STAR-PROTAGONIST gate whether we may NAME it:
//   WIN  → top raw-FP scorer; A1 only if a held STAR caught fire; A3 if a
//          redraw/fade pick (star or non-star value hero) caught fire; a
//          held NON-star fire is not a decision → variance.
//   LOSS → named ONLY on a CLOSE loss (diffuse/blowout losses → variance):
//          A2/A4 a held/faded STAR bust; A5 a STAR who carried but it
//          "wasn't enough". A non-star is NEVER named as blame.
//
// FRAMING (r2, hard): win lines never carry loss words; loss lines never
// carry win words; ties get no credit/blame. Guard-tested.
//
// STRUCTURAL INVARIANT: Mike-comparison impossible by type — input carries
// no opponent cards/decisions; only `margin` + an optional luck `outlier`.

export type Outcome = "win" | "loss" | "tie";
export type AgencyLeaf = "A1" | "A2" | "A3" | "A4" | "A5";
// A1 conviction-paid (held star fire) · A2 conviction-failed (held star bust)
// A3 gamble/value-paid (redraw hero) · A4 gamble-failed (faded star bust)
// A5 "wasn't enough" (star carried a close loss)

export interface YourCardFact {
  name: string;
  tier: string;               // RED|ORANGE|PURPLE|BLUE|GREEN|WHITE
  salary: number;
  wasHeld: boolean;
  fp: number;                 // pool-comparable FP (actualFp − dailyBonus)
  percentile: number | null;
  poolMedian: number | null;
  nickname?: string | null;   // stars only (caller's lookupCulture); flavor only
  // RD7.11 — log fields for the Flavor slot (DESCRIPTION only, never causation).
  // Already on H2HCard; populated by explainH2HResult.toFact. All optional —
  // missing/sparse degrades to the FP line (graceful, never errors). statLine
  // is the real box line; gameInfo/achievements available for richer Flavor.
  statLine?: Record<string, number | string> | null;
  gameInfo?: { date?: string; opponent?: string; homeAway?: string } | null;
  achievements?: Array<{ id: string; icon: string; label: string; fp: number }> | null;
}

export interface OpponentOutlier { name: string; percentile: number; actualFp: number; swing: number; }

export interface ResolutionInput {
  yourCards: YourCardFact[];
  margin: number;             // yourTotal − opponentTotal
  opponentOutlier?: OpponentOutlier | null;
  // RD8 (flag-gated by the caller; absent → today's behavior, byte-identical):
  // the real opponent display name woven into variance copy in place of the
  // hardcoded "Mike" (§9 Step 2). Absent/blank → "Mike".
  opponentName?: string;
  // RD8 delta-once (§9 Step 3): when true, variance closers that restate the
  // margin are suppressed so the margin (and its idea) appears exactly once —
  // the cause/base line owns it. Absent → today's behavior (closers may repeat).
  deltaOnce?: boolean;
}

export interface Classification {
  register: "agency" | "variance";
  outcome: Outcome;
  leaf?: AgencyLeaf;
  decisive?: { name: string; wasHeld: boolean; fp: number; percentile: number; isStar: boolean };
  mikeBadBeat: boolean;
  capLoadBearing: boolean;
}

export const TUNING = {
  TIE_EPS: 1.5,
  TINY_MARGIN: 4.0,
  CLOSE_LOSS_MAX: 15,      // beyond this a loss is diffuse → variance/beatdown (never name)
  BLOWOUT_MARGIN: 25,
  HIGH_PCTILE: 75,
  LOW_PCTILE: 25,
  MARGIN_SHARE: 0.55,
  DOMINANCE_RATIO: 1.5,
  WASNT_ENOUGH_MIN_PCTILE: 55,
  WASNT_ENOUGH_SHARE: 0.30,
  WASNT_ENOUGH_DOMINANCE: 1.3,
  BADBEAT_MAX_MARGIN: 13,
  BADBEAT_WELL_PLAYED_MIN_PCTILE: 35,
  BADBEAT_MIKE_MIN_FP: 45,
  EXPENSIVE_SALARY: 58,
  MAX_CHARS: 200,
};

const STAR_TIERS = new Set(["RED", "ORANGE"]);
const isStar = (c: YourCardFact) => STAR_TIERS.has(String(c.tier).toUpperCase());

/** Mirrors shared/commentary/templateResolver.ts:13 (not exported there). */
export function lastName(n: string): string {
  const parts = n.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? n;
}

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

function outcomeOf(margin: number): Outcome {
  if (margin > TUNING.TIE_EPS) return "win";
  if (margin < -TUNING.TIE_EPS) return "loss";
  return "tie";
}

function badBeatEligible(input: ResolutionInput, outcome: Outcome, absM: number): boolean {
  if (outcome !== "loss" || absM > TUNING.BADBEAT_MAX_MARGIN) return false;
  for (const c of input.yourCards) {
    if (c.percentile == null) continue;
    if ((c.wasHeld || c.salary >= TUNING.EXPENSIVE_SALARY) && c.percentile < TUNING.BADBEAT_WELL_PLAYED_MIN_PCTILE) return false;
  }
  const o = input.opponentOutlier;
  return !!o && o.percentile >= TUNING.HIGH_PCTILE && o.actualFp >= TUNING.BADBEAT_MIKE_MIN_FP && o.swing >= TUNING.MARGIN_SHARE * absM;
}

export function classify(input: ResolutionInput): Classification {
  const outcome = outcomeOf(input.margin);
  const absM = Math.abs(input.margin);
  const variance = (): Classification => ({ register: "variance", outcome, mikeBadBeat: badBeatEligible(input, outcome, absM), capLoadBearing: false });
  if (outcome === "tie" || absM < TUNING.TINY_MARGIN) return variance();

  const known = input.yourCards.filter((c) => c.percentile != null && c.poolMedian != null);
  const dec = (c: YourCardFact, leaf: AgencyLeaf): Classification => ({
    register: "agency", outcome, leaf,
    decisive: { name: c.name, wasHeld: c.wasHeld, fp: c.fp, percentile: c.percentile!, isStar: isStar(c) },
    mikeBadBeat: false, capLoadBearing: false,
  });

  if (outcome === "win") {
    const byFp = [...known].sort((a, b) => b.fp - a.fp);
    const hero = byFp[0];
    if (!hero) return variance();
    const heroSwing = hero.fp - (hero.poolMedian as number);
    const firedSwings = known.filter((c) => c.percentile! >= TUNING.HIGH_PCTILE).map((c) => c.fp - (c.poolMedian as number)).sort((a, b) => b - a);
    const secondSwing = firedSwings[1] ?? 0;
    const fired = hero.percentile! >= TUNING.HIGH_PCTILE && heroSwing >= TUNING.MARGIN_SHARE * absM && heroSwing >= TUNING.DOMINANCE_RATIO * Math.max(secondSwing, 0.01);
    if (!fired) return variance();
    if (!hero.wasHeld) return dec(hero, "A3");          // redraw/value hero (star or non-star) — naming IS the point
    if (isStar(hero)) return dec(hero, "A1");           // held star caught fire
    return variance();                                  // held non-star fire = not a decision
  }

  // LOSS — name only on a CLOSE loss; otherwise diffuse → variance/beatdown.
  if (absM > TUNING.CLOSE_LOSS_MAX) return variance();

  // (a) a held/faded STAR bust that plausibly cost it.
  const starBusts = known.filter((c) => isStar(c)).map((c) => ({ c, short: (c.poolMedian as number) - c.fp })).sort((a, b) => b.short - a.short);
  const topBust = starBusts[0];
  const secondBust = starBusts[1]?.short ?? 0;
  if (topBust && topBust.c.percentile! <= TUNING.LOW_PCTILE && topBust.short >= TUNING.MARGIN_SHARE * absM && topBust.short >= TUNING.DOMINANCE_RATIO * Math.max(secondBust, 0.01)) {
    return dec(topBust.c, topBust.c.wasHeld ? "A2" : "A4");
  }

  // (b) "wasn't enough": a STAR carried most of your scoring but you fell short.
  const totalFp = input.yourCards.reduce((s, c) => s + c.fp, 0);
  const byScore = [...known].sort((a, b) => b.fp - a.fp);
  const top = byScore[0];
  const second = byScore[1];
  if (top && isStar(top) && top.percentile! >= TUNING.WASNT_ENOUGH_MIN_PCTILE && totalFp > 0 && top.fp / totalFp >= TUNING.WASNT_ENOUGH_SHARE && top.fp >= TUNING.WASNT_ENOUGH_DOMINANCE * (second?.fp ?? 0.01)) {
    return dec(top, "A5");
  }

  return variance();
}

// ── Narration ──────────────────────────────────────────────────────────────
// RD7.11 — the FLAVOR slot carries commentary-grade SUBSTANCE from the REAL box
// line (DESCRIPTION only, never causation). Recognition + Cause are RD7.2-
// unchanged; classification is untouched. Generation order stays Recognition →
// Cause → Flavor → cultural-tag. The box line REPLACES the bland FP scalar in
// the agency clauses ("went for 41-12-9", not "dropped 41"); FP is the graceful
// fallback when no box line is available.
//
// Renderability: a leaf has a no-nickname variant set always, and a nickname
// tail appended ONLY when the anchor is a star with a nickname.

/** Parse a stat value to a finite number, or null. */
function statNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Basketball-shaped descriptive box line ("41-12-9" / "41 points"), or null.
 *  Null for sparse/absent statLine OR a non-basketball stat shape with no
 *  recognized scoring key — the caller then degrades to the FP scalar. THIS IS
 *  ALSO THE CROSS-SPORT SAFETY: baseball/football statLines (different keys)
 *  return null here → today's FP line, zero regression. Per-sport box-line
 *  formatting is a documented follow-up (RD7.11 doc D2). DESCRIPTION only —
 *  pure scoreboard, never a half-triple ("41-undefined-9") or phantom stat. */
function formatBoxLine(statLine?: Record<string, number | string> | null): string | null {
  if (!statLine || typeof statLine !== "object") return null;
  const pts = statNum(statLine.pts ?? statLine.points ?? statLine.PTS);
  if (pts == null) return null;
  const reb = statNum(statLine.reb ?? statLine.rebounds ?? statLine.trb ?? statLine.REB);
  const ast = statNum(statLine.ast ?? statLine.assists ?? statLine.AST);
  if (reb != null && ast != null) return `${pts}-${reb}-${ast}`;     // classic triple
  return `${pts} ${pts === 1 ? "point" : "points"}`;                 // points-only (no half-triple)
}

/** At most ONE accent: a genuinely standout stat (high thresholds → honest),
 *  else the opponent if present. "" when nothing sharpens the line. */
function boxAccent(c?: YourCardFact | null): string {
  const s = c?.statLine;
  if (s && typeof s === "object") {
    const blk = statNum(s.blk ?? s.blocks);
    const threes = statNum(s.threes ?? s.fg3 ?? s.tpm);
    const stl = statNum(s.stl ?? s.steals);
    if (blk != null && blk >= 5) return `${blk} blocks`;
    if (threes != null && threes >= 7) return `${threes} threes`;
    if (stl != null && stl >= 5) return `${stl} steals`;
  }
  const opp = c?.gameInfo?.opponent?.trim();
  if (opp) return `vs ${opp}`;
  return "";
}

/** The stat token woven into a clause: box line (+ optional accent, hash-gated
 *  for variety so repeats differ), or the FP scalar when no box line exists
 *  (graceful degrade = today's line). */
function statToken(full: YourCardFact | undefined, fp: number, key: string): string {
  const box = formatBoxLine(full?.statLine);
  if (!box) return `${fp}`;
  const acc = boxAccent(full);
  if (acc && stableHash(key + "|acc") % 2 === 0) {
    return acc.startsWith("vs ") ? `${box} ${acc}` : `${box}, ${acc}`;
  }
  return box;
}

const WIN_TEMPLATES: Record<"A1" | "A3", Array<(l: string, s: string) => string>> = {
  A1: [
    (l, s) => `${l} went for ${s} — holding him was the call.`,
    (l, s) => `You held ${l}, and he went for ${s}. The hold won it.`,
    (l, s) => `${s} from ${l} — the hold that won it.`,
    (l, s) => `${l}'s ${s} — exactly why you held him.`,
  ],
  A3: [
    (l, s) => `Your ${l} pickup went for ${s} — the redraw that won it.`,
    (l, s) => `${s} off the ${l} swap — great call.`,
    (l, s) => `${l} off the redraw for ${s} — the swap that won it.`,
    (l, s) => `The ${l} redraw paid off — ${s}.`,
  ],
};
const LOSS_TEMPLATES: Record<"A2" | "A4" | "A5", Array<(l: string, s: string) => string>> = {
  A2: [
    (l, s) => `${l} managed just ${s} — holding him is what cost you.`,
    (l, s) => `You stuck with ${l} and got ${s}. That's the loss.`,
    (l, s) => `Just ${s} from ${l} — the hold that sank it.`,
  ],
  A4: [
    (l, s) => `Your ${l} redraw came up empty at ${s} — that gamble cost you.`,
    (l, s) => `The ${l} swap flopped at ${s} — it sank you.`,
    (l, s) => `Just ${s} from the ${l} pickup — the gamble that sank it.`,
  ],
  A5: [
    (l, s) => `${l} went for ${s}, but it wasn't enough — the rest couldn't keep up.`,
    (l, s) => `${s} from ${l} carried you to the edge, but the cast fell short.`,
    (l, s) => `${l} did his part (${s}) — the rest of the slate didn't.`,
  ],
};

function pick<T>(arr: T[], key: string): T { return arr[stableHash(key) % arr.length]; }

function renderAgency(cls: Classification, input: ResolutionInput): string {
  const d = cls.decisive!;
  const l = lastName(d.name);
  const fp = Math.round(d.fp);
  const key = `${d.name}|${cls.leaf}|${input.margin.toFixed(0)}`;
  const leaf = cls.leaf!;
  const full = input.yourCards.find((c) => c.name === d.name);
  // FLAVOR: the real box line replaces the FP scalar (degrades to FP when no
  // statLine). DESCRIPTION only — woven into the SAME Recognition+Cause clause,
  // which is byte-unchanged from RD7.2 apart from the stat token.
  const s = statToken(full, fp, key);
  if (leaf === "A1" || leaf === "A3") {
    const base = pick(WIN_TEMPLATES[leaf], key)(l, s);
    const nick = d.isStar ? full?.nickname?.trim() : null; // star + nickname only
    const tail = nick ? ` Classic ${nick}.` : "";
    return tail && base.length + tail.length <= TUNING.MAX_CHARS ? base + tail : base;
  }
  const base = pick(LOSS_TEMPLATES[leaf], key)(l, s);
  // Flavor only on the bust leaves (A2/A4), star + nickname; A5 stays clean (sympathetic).
  const nick = (leaf === "A2" || leaf === "A4") && d.isStar ? full?.nickname?.trim() : null;
  const tail = nick ? ` Not ${nick}'s night.` : "";
  return tail && base.length + tail.length <= TUNING.MAX_CHARS ? base + tail : base;
}

const BEATDOWN_LOSS = [
  (m: string, opp: string) => `${opp}'s slate ran hot top to bottom — nothing to second-guess.`,
  (m: string, opp: string) => `Lost by ${m} — ${opp}'s whole board went off. Not your night.`,
  (m: string, opp: string) => `A ${m}-point beatdown — ${opp} caught fire across the slate.`,
  (m: string, opp: string) => `${opp}'s slate overwhelmed yours by ${m} — no single call to fix.`,
];
const BLOWOUT_WIN = [
  (m: string, opp: string) => `You ran them off the floor — by ${m}.`,
  (m: string, opp: string) => `A ${m}-point demolition — your whole board showed up.`,
  (m: string, opp: string) => `Wire to wire — you buried ${opp} by ${m}.`,
  (m: string, opp: string) => `Total control, ${m} clear — nothing close about it.`,
];
const MID_LOSS = [
  (m: string) => `Lost by ${m} — no single call swung it; the slate just landed cold.`,
  (m: string) => `Down ${m} — the rest of your board couldn't keep up. No one call to blame.`,
];
const MID_WIN = [
  (m: string) => `You edged it by ${m} — no single call decided it, the slate leaned your way.`,
  (m: string) => `Up ${m} — a team win, no single hero. The board carried it.`,
];

// RD8 — luck-line retirement (closes spec §8.3, unconditional). On a variance
// loss where you played it right, variance is described as a property of the
// SLATE / BOARD / GAME / MATH — NEVER a specific opponent card. The old line
// ("…caught a monster <Card> pull") spotlighted the opponent's pull, the exact
// place the constitution says not to send the eye. No card is ever named here.
const VARIANCE_SLATE = [
  `The slate leaned his way.`,
  `The board ran hot.`,
  `A coin-flip landed against you.`,
  `The math broke his way tonight.`,
  `The slate never really turned.`,
  `The board stayed cold.`,
];

// RD7.11/RD7.12-c — descriptive variance closer. RD7.11 added ONE shape
// ("[name]'s [stat] [ranking]"); RD7.12-investigate-2 found it fired on 100% of
// variance hands → rhythmic sameness. RD7.12-c diversifies into MIXED structures
// (card-naming, margin-focused, slate/no-card) per polarity, so the variance
// path no longer ends every line the same way. All honest: description /
// variance-humility only, never agency, Mike stays scoreboard. "" when no card
// has a usable box line (fill / non-basketball / sparse) → bare base line stands.
// Each closer is tagged `usesMargin` so RD8 delta-once (§9 Step 3) can drop the
// margin-restating variants — the base/cause line already owns the number.
type Closer = { usesMargin: boolean; f: (l: string, s: string, m: string) => string };
const WIN_CLOSERS: Closer[] = [
  { usesMargin: false, f: (l, s) => `${l}'s ${s} led the box score.` },        // card-naming
  { usesMargin: false, f: (l, s) => `${s} from ${l} stood out.` },             // card-naming, diff verb
  { usesMargin: true,  f: (_l, _s, m) => `Up ${m} on balance — no single hot hand.` }, // no card, margin
  { usesMargin: true,  f: (_l, _s, m) => `Decided by ${m}, spread across the board.` }, // no card, margin
  { usesMargin: false, f: (l, s) => `A team effort — ${s} from ${l} the headline.` },   // card-naming, diff shape
];
const LOSS_CLOSERS: Closer[] = [
  { usesMargin: false, f: (l, s) => `${l}'s ${s} topped a board that fell short.` },     // card-naming
  { usesMargin: true,  f: (l, s, m) => `${s} from ${l}, but the slate came up ${m} short.` }, // card + margin
  { usesMargin: true,  f: (_l, _s, m) => `Lost by ${m} with no single line to point to.` },   // no card, margin
  { usesMargin: true,  f: (_l, _s, m) => `${m} short — the board just ran cold.` },           // no card, margin
  { usesMargin: false, f: (l, s) => `${l} (${s}) led it; the rest stayed quiet.` },          // card-naming, diff shape
];
function varianceCloser(input: ResolutionInput, key: string, outcome: Outcome): string {
  const withBox = input.yourCards
    .map((c) => ({ c, box: formatBoxLine(c.statLine) }))
    .filter((x) => x.box != null)
    .sort((a, b) => b.c.fp - a.c.fp);
  const top = withBox[0];
  if (!top) return "";
  const m = Math.abs(input.margin).toFixed(1);
  let pool = outcome === "win" ? WIN_CLOSERS : LOSS_CLOSERS;
  // Delta-once: drop margin-restating closers so the number appears exactly once.
  if (input.deltaOnce) {
    const marginFree = pool.filter((c) => !c.usesMargin);
    if (marginFree.length) pool = marginFree;
  }
  return " " + pick(pool, key + "|closer").f(lastName(top.c.name), top.box as string, m);
}

function renderVariance(cls: Classification, input: ResolutionInput): string {
  const absM = Math.abs(input.margin);
  const m = absM.toFixed(1);
  const key = `${cls.outcome}|${Math.round(input.margin)}`;
  // RD8 Step 2: the real opponent name (flag-gated upstream); absent → "Mike".
  const opp = input.opponentName?.trim() || "Mike";
  // Append the diversified closer only when it fits MAX_CHARS. Skipped on tie /
  // tiny-margin / bad-beat (those are about the coin-flip or the opponent).
  const withCloser = (base: string): string => {
    const r = varianceCloser(input, key, cls.outcome);
    return r && base.length + r.length <= TUNING.MAX_CHARS ? base + r : base;
  };
  if (cls.outcome === "tie") return `Dead even — the math couldn't separate you.`;
  if (cls.outcome === "win") {
    if (absM >= TUNING.BLOWOUT_MARGIN) return withCloser(pick(BLOWOUT_WIN, key)(m, opp));
    if (absM < TUNING.TINY_MARGIN) return `Razor-thin — the logs fell your way. No single call won this one.`;
    return withCloser(pick(MID_WIN, key)(m));
  }
  // RD8 — luck line retired: validate the process ("you played it right") but
  // attribute the variance to the slate/board/math, never the opponent's card.
  if (cls.mikeBadBeat && input.opponentOutlier) return `Lost by ${m} — you played it right. ${pick(VARIANCE_SLATE, key)}`;
  // RD7.12-c — BIG LOSS (beatdown, |margin| >= BLOWOUT_MARGIN): NO card-naming
  // consolation tail. The honest end is the variance-humility base line; "but
  // X's stat was your high mark" undercut it and read as a consolation prize.
  if (absM >= TUNING.BLOWOUT_MARGIN) return pick(BEATDOWN_LOSS, key)(m, opp);
  if (absM < TUNING.TINY_MARGIN) return `Lost by ${m} — no single decision swung it; a coin-flip that landed cold.`;
  return withCloser(pick(MID_LOSS, key)(m));
}

export function render(cls: Classification, input: ResolutionInput): string {
  return cls.register === "agency" ? renderAgency(cls, input) : renderVariance(cls, input);
}

export function explainResolution(input: ResolutionInput): { text: string; classification: Classification } {
  const classification = classify(input);
  return { text: render(classification, input), classification };
}

// ── RD7.12 — LLM Flavor support (NEW exports; no render/classify change) ─────
// These feed the LLM-Flavor pipeline. They do NOT touch classify()/render() —
// the deterministic line (the fallback floor + the honesty-critical Recognition
// + Cause) is byte-unchanged, locked by the RD7.12 frozen-output test.

/** Margin bucket gating LLM Flavor. `beatdown` is hard-suppressed upstream
 *  (zero model call); `tie` has no notable line to author. */
export function flavorMarginBucket(margin: number): "win" | "close-loss" | "beatdown" | "tie" {
  if (Math.abs(margin) <= TUNING.TIE_EPS) return "tie";
  if (margin > TUNING.TIE_EPS) return "win";
  return Math.abs(margin) >= TUNING.BLOWOUT_MARGIN ? "beatdown" : "close-loss";
}

/** Box-line values for Flavor facts + numeric grounding. null when there's no
 *  recognized scoring key (non-basketball / sparse) → caller skips the LLM and
 *  the deterministic line stands. Same key resolution as formatBoxLine. */
export function extractFlavorBox(
  statLine?: Record<string, number | string> | null,
): { pts: number; reb?: number; ast?: number; stl?: number; blk?: number; threes?: number } | null {
  if (!statLine || typeof statLine !== "object") return null;
  const pts = statNum(statLine.pts ?? statLine.points ?? statLine.PTS);
  if (pts == null) return null;
  const box: { pts: number; reb?: number; ast?: number; stl?: number; blk?: number; threes?: number } = { pts };
  const reb = statNum(statLine.reb ?? statLine.rebounds ?? statLine.trb ?? statLine.REB);
  const ast = statNum(statLine.ast ?? statLine.assists ?? statLine.AST);
  const stl = statNum(statLine.stl ?? statLine.steals);
  const blk = statNum(statLine.blk ?? statLine.blocks);
  const threes = statNum(statLine.threes ?? statLine.fg3 ?? statLine.tpm);
  if (reb != null) box.reb = reb;
  if (ast != null) box.ast = ast;
  if (stl != null) box.stl = stl;
  if (blk != null) box.blk = blk;
  if (threes != null) box.threes = threes;
  return box;
}

/** RD7.12-b — the bucket+classification gate for calling the LLM. Eval-driven
 *  (RD7.12-eval, 200 hands): the LLM voice is strong on wins/star lines but FLAT
 *  on unremarkable close-losses, where the deterministic line is better because
 *  it carries the humble cause the LLM firewall strips, and where all the
 *  staleness clustered. So call the model ONLY where it earns its keep:
 *    WIN                              → LLM (vivid description wins here)
 *    CLOSE-LOSS + AGENCY-classified   → LLM (a real card/decision to narrate)
 *    CLOSE-LOSS + VARIANCE-classified → deterministic (humble cause, honest + better)
 *    BEATDOWN / TIE                   → deterministic (already suppressed)
 *  Reuses the engine's EXISTING RD7.2 agency/variance register — no new heuristic. */
export function shouldAuthorFlavor(margin: number, register: "agency" | "variance"): boolean {
  const bucket = flavorMarginBucket(margin);
  if (bucket === "win") return true;
  if (bucket === "close-loss") return register === "agency";
  return false; // beatdown / tie
}

/** The card whose box line the Flavor describes: the decisive card (agency) or
 *  the top scorer (variance). null when none has a usable box line. */
export function selectFlavorCard(cls: Classification, input: ResolutionInput): YourCardFact | null {
  if (cls.decisive) {
    const d = input.yourCards.find((c) => c.name === cls.decisive!.name);
    if (d && extractFlavorBox(d.statLine)) return d;
  }
  const withBox = input.yourCards
    .filter((c) => extractFlavorBox(c.statLine))
    .sort((a, b) => b.fp - a.fp);
  return withBox[0] ?? null;
}
