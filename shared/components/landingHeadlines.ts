// shared/components/landingHeadlines.ts
//
// RD5.1 — Decision-frame challenge landing: voiced copy bank + seeded
// selection. Spec of record: docs/rd5-1-headline-system-spec.md.
//
// What changed vs v3 (the all-caps templated single-line per trigger):
//   - Each trigger now draws from a weighted variant bank instead of
//     emitting a single hard-coded line.
//   - Each variant carries voice (bar / analyst / copy), per-line
//     weight, optional `named` flag, optional stance (for the respect
//     pool only), and a stable `key` for analytics correlation.
//   - Selection is seeded by the challenge ID so a given challenge
//     always renders the same variant across refreshes; different
//     challenges vary.
//   - CTAs are per-variant (the previous fixed per-trigger CTAs are
//     retired). Headlines stay sentence-case in source; the CTA + h1
//     CSS rules continue to handle uppercase rendering.
//   - big_score AND rare_pull both draw from the shared "respect"
//     pool with a stance split (70% respectful / 30% disrespectful) —
//     the trigger only determines the SEAL, not the headline pool.
//   - Stamps + colors continue to mirror TierGauge.tsx (v3 contract
//     unchanged).
//
// The module is pure — no React, no DOM, no analytics calls. The
// caller emits the selected `variantKey` to analytics.

import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";
import type { WinTierKey } from "@shared/utils/payoutLogic";

// ── Bank shape ───────────────────────────────────────────────────────────

export type Voice = "bar" | "analyst" | "copy";
export type Stance = "respect" | "disrespect";

export interface BankVariant {
  /** Headline template. May contain `{name1}` / `{name2}` (named lines
   *  only); substituted at selection time with last names from the
   *  held-card list. */
  headline: string;
  /** Per-line CTA, sentence-case in source; CSS upper-cases on render. */
  cta: string;
  /** Voice register. Used for choke + miss selection; tagged on respect
   *  + default lines for forward compatibility but NOT consulted in
   *  selection on those triggers. */
  voice: Voice;
  /** Relative frequency within the line's voice/stance pool. */
  weight: number;
  /** Choke only: line requires substituted player names — eligible
   *  only when 1-2 named held cards are available (the {nameN} token
   *  needs satisfying). */
  named?: boolean;
  /** Respect pool only: marks line as respectful or disrespectful for
   *  the 70/30 stance split. */
  stance?: Stance;
  /** Stable analytics key — never changes across edits. */
  key: string;
}

// ── Banks (spec §the bank) ──────────────────────────────────────────────
//
// Order is meaningful only for documentation — selection is purely
// weight-driven. Templates use `{name1}` for the first held player's
// last name and `{name2}` for the second. The substituter falls back
// to first-name slot for `{name}`.

const CHOKE_BANK: readonly BankVariant[] = [
  { voice: "bar", weight: 3, named: true, key: "choke_bar_embiidvuc",  headline: "{name1} and {name2}? Really?",                                cta: "You keeping them too?" },
  { voice: "bar", weight: 3,             key: "choke_bar_holds",       headline: "Those were the holds?",                                         cta: "Fix it." },
  { voice: "bar", weight: 5,             key: "choke_bar_tipoff",      headline: "This looked smarter before tipoff.",                            cta: "Show him what smart looks like." },
  { voice: "bar", weight: 3,             key: "choke_bar_honest",      headline: "Be honest. You were holding him too.",                          cta: "Still think that's the move?" },
  { voice: "bar", weight: 3,             key: "choke_bar_yesterday",   headline: "Everybody loved this hand yesterday.",                          cta: "Love it now?" },
  { voice: "bar", weight: 3,             key: "choke_bar_fiveminutes", headline: "This looked like a winner for about five minutes.",             cta: "Can you actually win with it?" },
  { voice: "bar", weight: 3,             key: "choke_bar_talkedinto",  headline: "Somebody talked themselves into this.",                         cta: "Don't make the same mistake." },
  { voice: "bar", weight: 3,             key: "choke_bar_name",        headline: "He trusted the name.",                                          cta: "Would you?" },
  { voice: "bar", weight: 3, named: true, key: "choke_bar_vucecon",    headline: "{name1}. In this economy?",                                     cta: "Do better." },
  { voice: "bar", weight: 3,             key: "choke_bar_squint",      headline: "You don't have to squint to find the problem.",                 cta: "Fix it." },
  { voice: "analyst", weight: 3,         key: "choke_anly_warnings",   headline: "The warning signs were all there.",                             cta: "Would you have ignored them?" },
  { voice: "analyst", weight: 3,         key: "choke_anly_jersey",     headline: "The jersey carried more weight than the stats.",                cta: "Pick with your head." },
  { voice: "analyst", weight: 3,         key: "choke_anly_confident",  headline: "Everybody thinks they're right until the games start.",         cta: "Still feeling confident?" },
  { voice: "analyst", weight: 3,         key: "choke_anly_betluck",    headline: "Bad bet or bad luck?",                                          cta: "You decide. Then beat it." },
  { voice: "copy",    weight: 2,         key: "choke_copy_milk",       headline: "This hand aged like milk.",                                     cta: "Build one that ages better." },
];

const MISS_BANK: readonly BankVariant[] = [
  { voice: "bar",     weight: 3, key: "miss_bar_mistake",     headline: "You can see the mistake, can't you?",        cta: "Fix it." },
  { voice: "bar",     weight: 3, key: "miss_bar_95",          headline: "He got 95% of the way there.",               cta: "Get the other 5%." },
  { voice: "bar",     weight: 3, key: "miss_bar_bother",      headline: "This one's gonna bother him.",               cta: "Finish it." },
  { voice: "bar",     weight: 3, key: "miss_bar_hurts",       headline: "So close it hurts.",                         cta: "Finish the job." },
  { voice: "bar",     weight: 3, key: "miss_bar_closer",      headline: "He was closer than he realizes.",            cta: "Get all the way there." },
  { voice: "analyst", weight: 5, key: "miss_anly_onehold",    headline: "One hold changed the whole story.",          cta: "Which one?" },
  { voice: "analyst", weight: 3, key: "miss_anly_staring",    headline: "The answer was staring him in the face.",    cta: "Do you see it?" },
  { voice: "analyst", weight: 3, key: "miss_anly_fixfront",   headline: "The fix is right in front of you.",          cta: "Take it." },
  { voice: "analyst", weight: 3, key: "miss_anly_onedecision", headline: "One better decision changes everything.",   cta: "Make it." },
  { voice: "copy",    weight: 2, key: "miss_copy_unfinished", headline: "This hand is unfinished business.",          cta: "Finish it." },
];

const RESPECT_BANK: readonly BankVariant[] = [
  // Respectful (70%)
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_goodluck",   headline: "Yeah, good luck with this one.",       cta: "You're gonna need it." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_nasty",      headline: "That's a nasty number.",                cta: "Beat it." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_nailed",     headline: "He might actually have nailed it.",     cta: "Prove he didn't." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_survive",    headline: "Not many hands survive this test.",     cta: "Take it anyway." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_nuts",       headline: "He found the nuts.",                    cta: "Can you?" },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_heater",     headline: "This is what a heater looks like.",     cta: "Bring your own." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_scoreboard", headline: "The scoreboard isn't lying.",           cta: "Do something about it." },
  { voice: "bar", weight: 3, stance: "respect", key: "resp_r_deserve",    headline: "Some scores deserve respect.",          cta: "This one deserves competition." },
  // Disrespectful (30%)
  { voice: "bar", weight: 5, stance: "disrespect", key: "resp_d_scared",      headline: "That's the score we're supposed to be scared of?", cta: "Prove me wrong." },
  { voice: "bar", weight: 3, stance: "disrespect", key: "resp_d_sentthis",    headline: "He really sent this out?",                          cta: "Beat it." },
  { voice: "bar", weight: 3, stance: "disrespect", key: "resp_d_besthand",    headline: "That's your best hand?",                            cta: "Let's see mine." },
  { voice: "bar", weight: 3, stance: "disrespect", key: "resp_d_thinkswins",  headline: "He thinks this wins.",                              cta: "Does it?" },
  { voice: "bar", weight: 3, stance: "disrespect", key: "resp_d_credit",      headline: "He wants credit for that?",                         cta: "Earn yours." },
  { voice: "bar", weight: 3, stance: "disrespect", key: "resp_d_impressed",   headline: "We're impressed by this now?",                      cta: "Show me something better." },
];

const DEFAULT_BANK: readonly BankVariant[] = [
  { voice: "bar", weight: 3, key: "def_board",  headline: "He's on the board.",            cta: "Knock him off." },
  { voice: "bar", weight: 3, key: "def_number", headline: "He set a number.",              cta: "Beat it." },
  { voice: "bar", weight: 3, key: "def_picks",  headline: "He made his picks.",            cta: "Make better ones." },
  { voice: "bar", weight: 3, key: "def_talk",   headline: "Beat this and talk your talk.", cta: "Go ahead." },
];

/** Read-only access for tests + future tooling. */
export const BANKS = {
  choke: CHOKE_BANK,
  miss: MISS_BANK,
  respect: RESPECT_BANK,
  default: DEFAULT_BANK,
} as const;

// ── Name listing + substitution ─────────────────────────────────────────

function lastName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

/** Substitutes `{name1}` / `{name2}` / `{name}` in a template with held
 *  players' LAST names (title case; CSS upper-cases for render). */
export function substituteNames(template: string, heldNames: readonly string[]): string {
  const n1 = heldNames[0] ? lastName(heldNames[0]) : "";
  const n2 = heldNames[1] ? lastName(heldNames[1]) : "";
  return template
    .replace(/\{name1\}/g, n1)
    .replace(/\{name2\}/g, n2)
    .replace(/\{name\}/g, n1);
}

// ── Seal — labels + colors mirror TierGauge.tsx (unchanged v3 contract)──

export interface SealVisual {
  label: string;
  background: string;
  color: string;
}

const WIN_TIER_COLOR: Record<WinTierKey, string> = {
  LEGEND:   "#EF4444",
  MVP:      "#FB923C",
  ALL_STAR: "#C084FC",
  STARTER:  "#3B82F6",
  ROOKIE:   "#22C55E",
  BUST:     "#6B7280",
};
const WIN_TIER_LABEL: Record<WinTierKey, string> = {
  LEGEND: "LEGEND", MVP: "MVP", ALL_STAR: "ALL-STAR",
  STARTER: "STARTER", ROOKIE: "ROOKIE", BUST: "BUST",
};
const RARE_PULL_TIER_LABEL: Record<string, string> = {
  record: "RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

function formatMissTier(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ").trim().toUpperCase();
}

export interface ResolveSealArgs {
  trigger: TakeCardTrigger;
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
  winTier?: WinTierKey | null;
}

export function resolveSeal(args: ResolveSealArgs): SealVisual | null {
  switch (args.trigger) {
    case "choke":
      return {
        label: "CHOKE",
        background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)",
        color: "#fff5f5",
      };
    case "miss": {
      const prefix = formatMissTier(args.missTier);
      return {
        label: prefix ? `${prefix} MISS` : "MISS",
        background: "linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%)",
        color: "#3a2000",
      };
    }
    case "big_score": {
      const eligible: ReadonlySet<WinTierKey> = new Set<WinTierKey>(["ALL_STAR", "MVP", "LEGEND"]);
      const tier: WinTierKey = (args.winTier && eligible.has(args.winTier)) ? args.winTier : "ALL_STAR";
      return { label: WIN_TIER_LABEL[tier], background: WIN_TIER_COLOR[tier], color: "#070A12" };
    }
    case "rare_pull": {
      const key = args.topGameTier ?? "";
      const label = RARE_PULL_TIER_LABEL[key] ?? "RARE PULL";
      return {
        label,
        background: "linear-gradient(135deg, #7FFF00 0%, #5BBE00 100%)",
        color: "#070A12",
      };
    }
    case "default":
    default:
      return null;
  }
}

// ── Seeded RNG ──────────────────────────────────────────────────────────
//
// FNV-1a 32-bit hash → mulberry32 PRNG. The same challenge ID always
// produces the same variant; different IDs vary. The hash is consistent
// with the existing `stableSeedFromId` pattern in ChallengeTakeCardLanding.tsx
// (which seeds the optional culture-line gate off the same scheme).

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG; deterministic 32-bit. Returns a function that yields
 *  a new [0,1) float on each call. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromChallengeId(challengeId: string): () => number {
  return mulberry32(fnv1a32(challengeId));
}

// ── Weighted pick utility ───────────────────────────────────────────────

function pickByWeight<T>(items: readonly T[], weightOf: (it: T) => number, rng: () => number): T {
  let total = 0;
  for (const it of items) total += weightOf(it);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (const it of items) {
    const w = weightOf(it);
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}

// ── Voice + stance selection ────────────────────────────────────────────

const VOICE_WEIGHT: Record<Voice, number> = { bar: 0.70, analyst: 0.25, copy: 0.05 };
const STANCE_WEIGHT: Record<Stance, number> = { respect: 0.70, disrespect: 0.30 };

/** Pick a voice from the available set using VOICE_WEIGHT, renormalized
 *  over the voices that actually have eligible lines. */
function pickVoice(available: ReadonlySet<Voice>, rng: () => number): Voice {
  const candidates = (["bar", "analyst", "copy"] as Voice[]).filter(v => available.has(v));
  if (candidates.length === 1) return candidates[0];
  return pickByWeight(candidates, v => VOICE_WEIGHT[v], rng);
}

/** Choke + miss: voice-then-weighted-line selection. */
function pickVoiceWeighted(pool: readonly BankVariant[], rng: () => number): BankVariant {
  const byVoice = new Map<Voice, BankVariant[]>();
  for (const v of pool) {
    const arr = byVoice.get(v.voice) ?? [];
    arr.push(v);
    byVoice.set(v.voice, arr);
  }
  const voice = pickVoice(new Set(byVoice.keys()), rng);
  return pickByWeight(byVoice.get(voice)!, v => v.weight, rng);
}

/** Respect: stance-then-weighted-line selection. */
function pickStanceWeighted(pool: readonly BankVariant[], rng: () => number): BankVariant {
  const byStance = new Map<Stance, BankVariant[]>();
  for (const v of pool) {
    if (!v.stance) continue; // defensive — respect bank entries should all carry stance
    const arr = byStance.get(v.stance) ?? [];
    arr.push(v);
    byStance.set(v.stance, arr);
  }
  const available = (["respect", "disrespect"] as Stance[]).filter(s => byStance.has(s));
  const stance: Stance = available.length === 1
    ? available[0]
    : pickByWeight(available, s => STANCE_WEIGHT[s], rng);
  return pickByWeight(byStance.get(stance)!, v => v.weight, rng);
}

// ── Choke named-line eligibility ────────────────────────────────────────

/** Filters the choke bank to the lines that can fire given the held set:
 *  - 3+ held → generic only (named excluded per spec).
 *  - 1-2 held → named lines eligible iff their `{nameN}` templates can be
 *    satisfied (a {name2} line needs 2 held; {name1}/{name} needs 1).
 *  - 0 held → generic only (no names to substitute). */
export function eligibleChokeLines(heldNamesList: readonly string[]): readonly BankVariant[] {
  const n = heldNamesList.length;
  if (n === 0 || n >= 3) return CHOKE_BANK.filter(v => !v.named);
  return CHOKE_BANK.filter(v => {
    if (!v.named) return true;
    if (v.headline.includes("{name2}") && n < 2) return false;
    if ((v.headline.includes("{name1}") || v.headline.includes("{name}")) && n < 1) return false;
    return true;
  });
}

// ── Public API ──────────────────────────────────────────────────────────

export interface LandingHeadlineOutput {
  /** Final headline string with any {nameN} placeholders substituted. */
  headline: string;
  /** Final CTA string. CSS handles uppercase on render. */
  ctaLabel: string;
  /** Seal (trigger-keyed; null for `default`). */
  seal: SealVisual | null;
  /** Stable analytics key for the picked variant — emit to analytics
   *  on render so per-line acceptance rates can be measured later. */
  variantKey: string;
}

export interface PickHeadlineArgs {
  trigger: TakeCardTrigger;
  challengerName: string;
  heldNamesList: readonly string[];
  /** Seeds the RNG; a given challenge always renders the same variant. */
  challengeId: string;
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
  winTier?: WinTierKey | null;
}

export function pickHeadlineAndCta(args: PickHeadlineArgs): LandingHeadlineOutput {
  const rng = rngFromChallengeId(args.challengeId);
  let variant: BankVariant;
  switch (args.trigger) {
    case "choke": {
      const pool = eligibleChokeLines(args.heldNamesList);
      variant = pickVoiceWeighted(pool, rng);
      break;
    }
    case "miss":
      variant = pickVoiceWeighted(MISS_BANK, rng);
      break;
    case "big_score":
    case "rare_pull":
      // Both pull from the shared respect pool — the trigger only
      // determines the seal, not the line.
      variant = pickStanceWeighted(RESPECT_BANK, rng);
      break;
    case "default":
    default:
      variant = pickByWeight(DEFAULT_BANK, v => v.weight, rng);
      break;
  }

  const headline = substituteNames(variant.headline, args.heldNamesList);
  return {
    headline,
    ctaLabel: variant.cta,
    variantKey: variant.key,
    seal: resolveSeal({
      trigger: args.trigger,
      missTier: args.missTier,
      topGameTier: args.topGameTier,
      winTier: args.winTier,
    }),
  };
}

// ── Dynamic no-duplication guardrail (unchanged from v3) ────────────────

const STEM_INFLECTIONS: Record<string, readonly string[]> = {
  CHOKE: ["choke", "choked", "choking"],
  MISS:  ["miss", "missed", "missing"],
};

export function forbiddenTokensFromSeal(seal: SealVisual | null): string[] {
  if (!seal) return [];
  const out = new Set<string>();
  for (const raw of seal.label.split(/[\s-]+/)) {
    const t = raw.trim().toLowerCase();
    if (t.length === 0) continue;
    const upper = t.toUpperCase();
    if (STEM_INFLECTIONS[upper]) {
      for (const inf of STEM_INFLECTIONS[upper]) out.add(inf);
    } else {
      out.add(t);
    }
  }
  return Array.from(out);
}

export interface HeadlineDuplicationResult {
  hit: boolean;
  word?: string;
}

export function headlineContainsSealVocabulary(
  headline: string,
  seal: SealVisual | null,
): HeadlineDuplicationResult {
  const tokens = forbiddenTokensFromSeal(seal);
  for (const w of tokens) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(headline)) return { hit: true, word: w };
  }
  return { hit: false };
}

// ── Legacy exports (kept for callers that imported FALLBACK_CTA pre-bank) ─

export const FALLBACK_CTA = "ACCEPT CHALLENGE";
