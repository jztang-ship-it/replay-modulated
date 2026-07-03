/**
 * shared/crowd/verdict.ts — the VERDICT renderer (Stage 2 "the verdict").
 *
 * Turns a resolved hand into the contested claim: the most notable HELD call,
 * scored against the room. Pure + sport-agnostic: it takes each held card's
 * resolved FP and the room's ownership (0..1) — ownership is supplied by the
 * caller from the frozen crowd model. This module imports NEITHER the crowd model
 * NOR the value model; it only reads the numbers it's handed.
 *
 * ── The two ways this renderer could LIE (both guarded) ──────────────────────
 * 1. FABRICATED DISSENT — never dress chalk (a high-owned hold) up as a bold
 *    call. If the standout hold was one the room was WITH you on, we say so
 *    (`chalk-hit`). A truthful "you agreed with the room and it worked" is valid;
 *    a fake "you fought the room" is corrupt.
 * 2. LUCK LAUNDERED AS JUDGMENT — a faded pick that hit is a "read" ONLY because
 *    the crowd is orthogonal to value (phase 2). So the beat credits the CALL, not
 *    the player's genius. We state the observable — you held, the room faded, here
 *    is the result — and stop. No skill/process narration.
 *
 * Tone priority: contrarian-hit > contrarian-miss > chalk-hit > hand-level.
 * The verdict headlines your DIVERGENCE from the room; a bold call (win or lose)
 * outranks riding consensus, and misses are surfaced honestly rather than buried.
 */

export type VerdictTone = "contrarian-hit" | "contrarian-miss" | "chalk-hit" | "hand-level";

/** One resolved card handed to the verdict. `ownership` ∈ [0,1] is the room's
 *  backing from the crowd model; `fade = 1 - ownership`. Value-free. */
export interface VerdictCard {
  id: string;
  name: string;
  wasHeld: boolean;
  fp: number;
  /** room ownership 0..1 (from the frozen crowd model). */
  ownership: number;
}

export interface VerdictInput {
  cards: VerdictCard[];
  totalFp: number;
  /** tier label (BUST / ROOKIE / STARTER / …) — colors the beat, never the pick. */
  tier?: string;
}

export interface Verdict {
  /** the held player the verdict is about — absent for `hand-level`. */
  player?: string;
  /** fade% of that player (0..100), rounded. 0 when there's no player. */
  fadePct: number;
  /** that player's resolved FP, rounded. 0 when there's no player. */
  fpDelivered: number;
  tone: VerdictTone;
  line: string;
}

/** Tunable thresholds. Defaults chosen against the real ownership range
 *  (~0.25–0.69 → fade ~0.31–0.75) and individual-game FP. Copy/feel gets a
 *  device-glass pass in phase 4; these are the honest defaults. */
export interface VerdictConfig {
  /** fade at/above this = a genuine fade (the room was OFF him). Below = chalk. */
  fadeChalk: number;
  /** FP at/above this = the hold "produced" / went off. */
  fpMeaningful: number;
  /** FP at/below this = the hold busted. */
  fpBust: number;
}

export const DEFAULT_VERDICT_CONFIG: VerdictConfig = {
  fadeChalk: 0.55, // ownership ≤ 0.45 counts as faded
  fpMeaningful: 30,
  fpBust: 12,
};

const fadeOf = (c: VerdictCard) => 1 - c.ownership;
const r0 = (x: number) => Math.round(x);
const pct = (fade: number) => Math.round(fade * 100);

/** argmax with an explicit, deterministic comparator (returns the "greater" one). */
function best<T>(xs: T[], better: (a: T, b: T) => boolean): T {
  return xs.reduce((acc, x) => (better(x, acc) ? x : acc));
}

function line(tone: VerdictTone, o: { name?: string; fadePct: number; fp: number; total: number; tier?: string }): string {
  switch (tone) {
    case "contrarian-hit":
      // observable only: you held, the room faded, here's the number.
      return `You held ${o.name}. ${o.fadePct}% of the room faded him. He went for ${o.fp}.`;
    case "contrarian-miss":
      // the losing kind of call — surfaced, not hidden.
      return `You backed ${o.name} against the room — ${o.fadePct}% faded him. He didn't land (${o.fp}).`;
    case "chalk-hit":
      // honest chalk: the room was WITH you. No fake dissent.
      return `The room was on ${o.name} too. You just rode him for ${o.fp}.`;
    case "hand-level": {
      const t = (o.tier ?? "").toUpperCase();
      const tail = t === "BUST" || !t ? "Off night." : `A ${o.tier} board.`;
      return `You built a ${o.total}. ${tail}`;
    }
  }
}

/**
 * Resolve a hand into its verdict. Pure. Only HELD cards are eligible — the
 * verdict is about a call you MADE, not a card that rerolled into your lineup.
 */
export function computeVerdict(input: VerdictInput, cfg: VerdictConfig = DEFAULT_VERDICT_CONFIG): Verdict {
  const total = r0(input.totalFp);
  const handLevel = (): Verdict => ({ fadePct: 0, fpDelivered: 0, tone: "hand-level", line: line("hand-level", { fadePct: 0, fp: 0, total, tier: input.tier }) });

  const held = input.cards.filter((c) => c.wasHeld);
  if (held.length === 0) return handLevel();

  const faded = held.filter((c) => fadeOf(c) >= cfg.fadeChalk); // the room was OFF these; you held anyway

  // 1. CONTRARIAN-HIT — a faded hold that produced. Selected by contrarian-right
  //    = fade × FP (tiebreak: higher FP, then lower ownership = higher fade).
  const hits = faded.filter((c) => c.fp >= cfg.fpMeaningful);
  if (hits.length) {
    const v = best(hits, (a, b) => {
      const sa = fadeOf(a) * a.fp, sb = fadeOf(b) * b.fp;
      return sa !== sb ? sa > sb : a.fp !== b.fp ? a.fp > b.fp : a.ownership < b.ownership;
    });
    return { player: v.name, fadePct: pct(fadeOf(v)), fpDelivered: r0(v.fp), tone: "contrarian-hit", line: line("contrarian-hit", { name: v.name, fadePct: pct(fadeOf(v)), fp: r0(v.fp), total, tier: input.tier }) };
  }

  // 2. CONTRARIAN-MISS — a faded hold that busted. The boldest failed call:
  //    most-faded (tiebreak: worse bust = lower FP, then higher fade).
  const busts = faded.filter((c) => c.fp <= cfg.fpBust);
  if (busts.length) {
    const v = best(busts, (a, b) => {
      const fa = fadeOf(a), fb = fadeOf(b);
      return fa !== fb ? fa > fb : a.fp !== b.fp ? a.fp < b.fp : a.ownership < b.ownership;
    });
    return { player: v.name, fadePct: pct(fadeOf(v)), fpDelivered: r0(v.fp), tone: "contrarian-miss", line: line("contrarian-miss", { name: v.name, fadePct: pct(fadeOf(v)), fp: r0(v.fp), total, tier: input.tier }) };
  }

  // 3. CHALK-HIT — no bold call stood out, but you rode a high-owned hold to a big
  //    game. Honest consensus (tiebreak: highest FP, then higher ownership = more chalk).
  const chalkHits = held.filter((c) => fadeOf(c) < cfg.fadeChalk && c.fp >= cfg.fpMeaningful);
  if (chalkHits.length) {
    const v = best(chalkHits, (a, b) => (a.fp !== b.fp ? a.fp > b.fp : a.ownership > b.ownership));
    return { player: v.name, fadePct: pct(fadeOf(v)), fpDelivered: r0(v.fp), tone: "chalk-hit", line: line("chalk-hit", { name: v.name, fadePct: pct(fadeOf(v)), fp: r0(v.fp), total, tier: input.tier }) };
  }

  // 4. HAND-LEVEL — nothing notable among the holds. Honest, quiet.
  return handLevel();
}
