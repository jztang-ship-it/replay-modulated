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
}

export interface OpponentOutlier { name: string; percentile: number; actualFp: number; swing: number; }

export interface ResolutionInput {
  yourCards: YourCardFact[];
  margin: number;             // yourTotal − opponentTotal
  opponentOutlier?: OpponentOutlier | null;
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
// Renderability filtering: a leaf has a no-nickname variant set always, and a
// nickname tail appended ONLY when the anchor is a star with a nickname.

const WIN_TEMPLATES: Record<"A1" | "A3", Array<(l: string, fp: number) => string>> = {
  A1: [
    (l, f) => `${l} dropped ${f} — holding him was the call.`,
    (l, f) => `You held ${l}, and he went for ${f}. The hold won it.`,
    (l, f) => `${f} from ${l} — the hold that won it.`,
  ],
  A3: [
    (l, f) => `Your ${l} pickup went for ${f} — the redraw that won it.`,
    (l, f) => `${f} off the ${l} swap — great call.`,
    (l, f) => `${l} off the redraw for ${f} — the swap that won it.`,
  ],
};
const LOSS_TEMPLATES: Record<"A2" | "A4" | "A5", Array<(l: string, fp: number) => string>> = {
  A2: [
    (l, f) => `${l} managed just ${f} — holding him is what cost you.`,
    (l, f) => `You stuck with ${l} and got ${f}. That's the loss.`,
    (l, f) => `Just ${f} from ${l} — the hold that sank it.`,
  ],
  A4: [
    (l, f) => `Your ${l} redraw came up empty at ${f} — that gamble cost you.`,
    (l, f) => `The ${l} swap flopped at ${f} — it sank you.`,
    (l, f) => `Just ${f} from the ${l} pickup — the gamble that sank it.`,
  ],
  A5: [
    (l, f) => `${l} went for ${f}, but it wasn't enough — the rest couldn't keep up.`,
    (l, f) => `${f} from ${l} carried you to the edge, but the cast fell short.`,
    (l, f) => `${l} did his part (${f}) — the rest of the slate didn't.`,
  ],
};

function pick<T>(arr: T[], key: string): T { return arr[stableHash(key) % arr.length]; }

function renderAgency(cls: Classification, input: ResolutionInput): string {
  const d = cls.decisive!;
  const l = lastName(d.name);
  const fp = Math.round(d.fp);
  const key = `${d.name}|${cls.leaf}|${input.margin.toFixed(0)}`;
  const leaf = cls.leaf!;
  if (leaf === "A1" || leaf === "A3") {
    const base = pick(WIN_TEMPLATES[leaf], key)(l, fp);
    const full = input.yourCards.find((c) => c.name === d.name);
    const nick = d.isStar ? full?.nickname?.trim() : null; // star + nickname only
    const tail = nick ? ` Classic ${nick}.` : "";
    return tail && base.length + tail.length <= TUNING.MAX_CHARS ? base + tail : base;
  }
  const base = pick(LOSS_TEMPLATES[leaf], key)(l, fp);
  const full = input.yourCards.find((c) => c.name === d.name);
  // Flavor only on the bust leaves (A2/A4), star + nickname; A5 stays clean (sympathetic).
  const nick = (leaf === "A2" || leaf === "A4") && d.isStar ? full?.nickname?.trim() : null;
  const tail = nick ? ` Not ${nick}'s night.` : "";
  return tail && base.length + tail.length <= TUNING.MAX_CHARS ? base + tail : base;
}

const BEATDOWN_LOSS = [
  (m: string) => `Mike's slate ran hot top to bottom — nothing to second-guess.`,
  (m: string) => `Lost by ${m} — Mike's whole board went off. Not your night.`,
  (m: string) => `A ${m}-point beatdown — Mike caught fire across the slate.`,
  (m: string) => `Mike's slate overwhelmed yours by ${m} — no single call to fix.`,
];
const BLOWOUT_WIN = [
  (m: string) => `You ran them off the floor — by ${m}.`,
  (m: string) => `A ${m}-point demolition — your whole board showed up.`,
  (m: string) => `Wire to wire — you buried Mike by ${m}.`,
  (m: string) => `Total control, ${m} clear — nothing close about it.`,
];
const MID_LOSS = [
  (m: string) => `Lost by ${m} — no single call swung it; the slate just landed cold.`,
  (m: string) => `Down ${m} — the rest of your board couldn't keep up. No one call to blame.`,
];
const MID_WIN = [
  (m: string) => `You edged it by ${m} — no single call decided it, the slate leaned your way.`,
  (m: string) => `Up ${m} — a team win, no single hero. The board carried it.`,
];

function renderVariance(cls: Classification, input: ResolutionInput): string {
  const absM = Math.abs(input.margin);
  const m = absM.toFixed(1);
  const key = `${cls.outcome}|${Math.round(input.margin)}`;
  if (cls.outcome === "tie") return `Dead even — the math couldn't separate you.`;
  if (cls.outcome === "win") {
    if (absM >= TUNING.BLOWOUT_MARGIN) return pick(BLOWOUT_WIN, key)(m);
    if (absM < TUNING.TINY_MARGIN) return `Razor-thin — the logs fell your way. No single call won this one.`;
    return pick(MID_WIN, key)(m);
  }
  if (cls.mikeBadBeat && input.opponentOutlier) return `Lost by ${m} — you played it right. Mike just caught a monster ${lastName(input.opponentOutlier.name)} pull.`;
  if (absM >= TUNING.BLOWOUT_MARGIN) return pick(BEATDOWN_LOSS, key)(m);
  if (absM < TUNING.TINY_MARGIN) return `Lost by ${m} — no single decision swung it; a coin-flip that landed cold.`;
  return pick(MID_LOSS, key)(m);
}

export function render(cls: Classification, input: ResolutionInput): string {
  return cls.register === "agency" ? renderAgency(cls, input) : renderVariance(cls, input);
}

export function explainResolution(input: ResolutionInput): { text: string; classification: Classification } {
  const classification = classify(input);
  return { text: render(classification, input), classification };
}
