// api/headline.ts
//
// Phase 3 step 2 (lock: docs/challenge-landing-v2-phase3-authored-voice-
// engine-lock.md). The challenge headline endpoint with LIVE generation.
// Step 1 built the failure/validation plumbing around a stub; this swap
// replaces the stub with a real routeCommentary call composing
// VOICE_CONTRACT + the POSTed facts. Every guard around the call is
// unchanged — they now guard real model output.
//
// Wire contract (POST):
//   request:  { facts: CommentaryFacts }
//   response: 200 { headline: string|null, source?: "router", reason?: string }
//             400 { error: "..." }   // body shape rejected
//             405 { error: "POST required" }
//
// The client treats headline:null the same as a network failure:
// fall back to today's chadShareTrashTalk bank pick. Create is NEVER
// blocked on the headline (lock §"Fallback").
//
// Auth: NONE in v1. The OAuth-resume side-channel needs to call this
// before the user has a session. Rate-limiting (per-IP via Upstash KV;
// the router's KV namespace is already wired) is the separate fast-
// follow that closes the abuse window — NOT part of this commit.
//
// IMPORTANT — bundle hygiene: this file imports VOICE_CONTRACT but NOT
// the full commentaryFacts builder. The types live in a pure-types
// module (commentaryFactsTypes.ts) so the typecheck does not traverse
// selectCommentary → playerCulture.ts (8000+ lines). The facts arrive
// over the wire as JSON; the client (shared/commentary/commentaryFacts.ts)
// owns the build.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import type {
  CommentaryFacts,
  CommentaryWinTier,
} from "../shared/commentary/commentaryFactsTypes.js";
import { buildVoiceContract, buildUserPrompt } from "../shared/commentary/voiceContract.js";
import { routeCommentary } from "./_lib/router/llmRouter.js";
import type { RouterConfig, PayoutTier } from "./_lib/router/types.js";
// RD7.12 — Flavor sub-route lives here (folded in to stay under the Vercel
// Hobby 12-serverless-function cap; see § RD7.12 doc). Same routeCommentary
// path; a DIFFERENT prompt + the fail-closed honesty validator.
import { validateFlavor, type FlavorFacts } from "../shared/explanation/flavorValidator.js";
import { buildFlavorSystemPrompt, buildFlavorUserPrompt } from "../shared/explanation/flavorPrompt.js";

// ── Knobs ──────────────────────────────────────────────────────────────────

/** Hard server-side cap on the entire generation step. 2.5s sits between
 *  the ~600ms Haiku-warm typical and the 10s Vercel Hobby function
 *  ceiling. The timeout race exists so a model API hang doesn't blow
 *  the function — it's a defense, not a deadline.
 *
 *  Overridable via HEADLINE_TIMEOUT_MS env var so the smoke harness can
 *  set a more generous budget (e.g. 8000ms) without changing the
 *  production UX target. Production never sets this var; falls through
 *  to the 2.5s default. */
const HEADLINE_TIMEOUT_MS = Number(process.env.HEADLINE_TIMEOUT_MS) || 2500;

/** Hard ceiling on the rendered headline. The lock targets ~60-110 chars
 *  ("ESPN / newspaper headline" register); 160 leaves enough headroom
 *  for confident sportswriter phrasing without inviting paragraphs. */
const HEADLINE_MAX_LENGTH = 160;

/** The llmRouter's hard-coded last-resort string when every model
 *  errored. Per recon §1: routeCommentary NEVER throws and NEVER returns
 *  null — when all primaries fail, it returns this literal. Detecting it
 *  here is the only way to surface "all upstream failed" to the caller. */
const APOLOGY_SENTINEL = "Off night. The numbers don't lie.";

/** §3 personal-life denylist. SEED list — expanded as curation lands and
 *  the prompt produces lines that need explicit gating. Phase 2e's same
 *  policy (lock §"Change 2"): NEVER personal life, marriages, legal /
 *  criminal, substance use, even where §3's league-penalty exception
 *  would technically permit it.
 *
 *  Matched as case-insensitive substring (word-boundary'd inside the
 *  validator for short tokens so "diet" doesn't trip "died"). */
const PHRASE_DENYLIST: readonly string[] = [
  "arrest", "indictment", "lawsuit", "court date",
  "rape", "assault", "battery", "domestic", "dui",
  "rehab", "overdose", "addiction", "substance",
  "divorce", "custody", "affair", "mistress",
  "died", "death", "fatal", "suicide",
  "cancer", "tumor", "diagnosed",
  "racist", "homophobic", "slur",
  "bankruptcy", "bankrupt",
];

/** Known NBA team codes (3-letter, current + common historical). The
 *  validator's purpose is to catch the model INVENTING a team identity
 *  that isn't in facts — "Lakers stumble against MILWAUKEE" when the
 *  facts said nothing about Milwaukee. Phase 3.3 writes headlines in
 *  ALL-CAPS hand-subject register, so the previous `[A-Z]{3,5}` regex
 *  tripped on every common English word ("YOU," "HELD," "THIS," etc.).
 *
 *  Inverting the check: only trip when the matched token IS a known
 *  team code AND is NOT in the facts' allowed set. Non-team uppercase
 *  words (pronouns, prepositions, verbs, player names) are silently
 *  ignored — the team-not-in-facts guard remains as strict as before
 *  for ACTUAL team-name invention.
 *
 *  Set includes: current 30 NBA teams + historical codes the model is
 *  likely to reach for on retro seasons (NJN, SEA, VAN, NOH, KCK, BAL,
 *  CHO, NOP, BRK). When the facts already carry a team via
 *  anchor.team / anchor.opponent, that team is allowed even if it's
 *  in this set. */
const NBA_TEAM_CODES: ReadonlySet<string> = new Set([
  // Current 30 teams
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
  // Historical / alt codes the model may reach for on retro seasons
  "NJN", "SEA", "VAN", "NOH", "KCK", "BAL", "CHO", "BRK", "WSB", "NJN",
  // Common alternate-style team abbreviations
  "GS", "NO", "NY", "LA",
]);

/** Pull short ALL-CAPS tokens from anchor.name + anchor.nicknames so
 *  the validator allows player references the prompt is expected to
 *  write. (Belt-and-suspenders: even after the team-code inversion
 *  above, an anchor named "DEN" or similar would otherwise trip on the
 *  team-code set. Adding the anchor's name tokens to the allowed set
 *  handles that edge case.) */
function extractAnchorTokens(facts: CommentaryFacts): Set<string> {
  const out = new Set<string>();
  if (!facts.anchor) return out;
  const candidates: string[] = [];
  if (facts.anchor.name) candidates.push(facts.anchor.name);
  for (const n of facts.anchor.nicknames ?? []) candidates.push(n);
  for (const candidate of candidates) {
    for (const token of candidate.split(/\s+|[-—_'"]/)) {
      const t = token.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (t.length >= 3 && t.length <= 5) out.add(t);
    }
  }
  return out;
}

/** Default tier when the facts didn't carry one. Used as the routing
 *  key by llmRouter (KV namespace splits decisions per tier) — STARTER
 *  is the most common hand result and a neutral fallback. */
const DEFAULT_TIER: PayoutTier = "STARTER";

// ── Phase 4 Pass 2 numeric grounding (lock §1) ─────────────────────────────
// Reject lines that cite a number not grounded in the rendered fact block.
// Allowed set = digit literals parsed from buildUserPrompt(facts) — the
// SAME string the model received. Parsing the rendered block (not the raw
// facts) means stat-trim (Pass 1) is inherited automatically: a `threes`
// value present on raw facts but stripped from the prompt does NOT enter
// the allowed set, so a line citing it gets rejected. Governing principle
// per lock: BIAS TOWARD PERMISSIVENESS — a false reject resurrects the
// bank-pick fallback (the robotic voice this project exists to kill).

/** 0-19 cardinal words. ≤ 12 are STANDALONE-excluded (idiomatic in
 *  headlines: "one decision short," "give it a second"). Hyphenated
 *  pairs and compound forms (with hundred/thousand) are always checked. */
const CARDINAL_ONES_TO_NINETEEN: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const CARDINAL_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
/** Ordinal words: never extracted as cardinals. */
const ORDINAL_WORDS: ReadonlySet<string> = new Set([
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
  "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
  "nineteenth", "twentieth", "thirtieth", "fortieth", "fiftieth",
  "sixtieth", "seventieth", "eightieth", "ninetieth", "hundredth", "thousandth",
]);
/** Idioms / franchise-embedded numbers. Empty at landing per lock §1
 *  rule (C); add entries only when a real false-reject is observed. */
const NUMERIC_IDIOM_SKIPLIST: ReadonlySet<string> = new Set<string>([]);

interface ExtractedNumber {
  /** Numeric value, compared against the allowed set. */
  value: number;
  /** Source representation as written, for the reason string. */
  display: string;
  /** Decimal places in the displayed form — drives tolerance precision. */
  decimals: number;
}

/** Parse one token as a 0-99 cardinal atom. Returns null for non-cardinals
 *  including ambiguous hyphenations like "all-star" / "t-mac". */
function parseSubHundredAtom(token: string): number | null {
  if (token.includes("-")) {
    const [a, b] = token.split("-");
    const tens = CARDINAL_TENS[a];
    const ones = CARDINAL_ONES_TO_NINETEEN[b];
    if (tens != null && ones != null && ones >= 1 && ones <= 9) return tens + ones;
    return null;
  }
  if (token in CARDINAL_ONES_TO_NINETEEN) return CARDINAL_ONES_TO_NINETEEN[token];
  if (token in CARDINAL_TENS) return CARDINAL_TENS[token];
  return null;
}

/** Tokenize a headline. Lowercased; punctuation stripped; hyphens kept
 *  inside words ("thirty-eight" stays a single token, "all-star" too). */
function tokenizeHeadline(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()"'`]+/)
    .map(t => t.replace(/[^\w-]/g, ""))
    .filter(t => t.length > 0);
}

/** Walk tokens; emit spelled-cardinal expressions per lock §1 rules
 *  (A)/(B)/(C). Handles standalone words, hyphenated pairs, and the
 *  hundred/thousand compounds the lock explicitly cites ("two hundred
 *  forty-five" → 245). Standalone ≤ 12 are skipped (rule C). */
function extractSpelledCardinals(tokens: string[]): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (ORDINAL_WORDS.has(tokens[i]) || NUMERIC_IDIOM_SKIPLIST.has(tokens[i])) {
      i++; continue;
    }
    const startToken = tokens[i];
    let total = 0;
    let pending = 0;
    let lastWasScale = false;
    let parsed = 0;
    let didAdvance = false;
    while (i < tokens.length) {
      const t = tokens[i];
      if (ORDINAL_WORDS.has(t)) break;
      const atom = parseSubHundredAtom(t);
      if (atom != null) {
        if (pending !== 0 && !lastWasScale) break; // two atoms in a row, no scale separator → new span
        pending += atom;
        lastWasScale = false;
        i++; parsed++; didAdvance = true;
        continue;
      }
      if (t === "hundred") {
        pending = (pending === 0 ? 1 : pending) * 100;
        lastWasScale = true;
        i++; parsed++; didAdvance = true;
        continue;
      }
      if (t === "thousand") {
        total += (pending === 0 ? 1 : pending) * 1000;
        pending = 0;
        lastWasScale = true;
        i++; parsed++; didAdvance = true;
        continue;
      }
      break;
    }
    total += pending;
    if (parsed > 0 && total > 0) {
      // Standalone = single sub-99 ATOM that's not a hyphenated pair.
      // A hyphenated "thirty-eight" is compound (always checked) even
      // though parsed=1 (it's one token). A bare "seven" is standalone.
      const isHyphenated = startToken.includes("-");
      const standalone = parsed === 1 && !isHyphenated;
      if (standalone && total <= 12) continue; // rule (C)
      out.push({ value: total, display: startToken, decimals: 0 });
    } else if (!didAdvance) {
      i++;
    }
  }
  return out;
}

/** Find every digit-number literal in the headline (ints + decimals).
 *  Skips numeric ordinals (1st / 2nd / 3rd / 4th / ... / 99th). */
function extractDigitNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  const RE = /-?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    const afterIdx = m.index + m[0].length;
    const after = text.slice(afterIdx, afterIdx + 2);
    if (/^(st|nd|rd|th)/i.test(after)) continue;
    const dotIdx = m[0].indexOf(".");
    const decimals = dotIdx >= 0 ? m[0].length - dotIdx - 1 : 0;
    out.push({ value: parseFloat(m[0]), display: m[0], decimals });
  }
  return out;
}

/** Allowed set: every digit literal that appears in the rendered user
 *  prompt. Parsing the rendered string (not the raw facts) is deliberate
 *  — it inherits the Pass-1 stat-trim invariant. */
function extractAllowedNumbers(userPrompt: string): number[] {
  const out: number[] = [];
  const RE = /-?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(userPrompt)) !== null) {
    out.push(parseFloat(m[0]));
  }
  return out;
}

/** Permissive match per lock §1: N matches F if N == F exactly, or if F
 *  is within one unit at N's displayed precision (so 65 and 66 both match
 *  65.3; 245 and 246 both match 245.8). The unit-at-precision rule is
 *  the permissive reading of "rounded OR truncated to N's displayed
 *  precision" — covers both the worked examples in the lock and the
 *  general "bias toward permissiveness" stance. */
function numberMatchesAllowed(n: ExtractedNumber, allowed: readonly number[]): boolean {
  const unit = Math.pow(10, -n.decimals);
  for (const f of allowed) {
    if (n.value === f) return true;
    if (Math.abs(n.value - f) < unit) return true;
  }
  return false;
}

// ── Validators ─────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true; headline: string }
  | { ok: false; reason: string };

/** Run all output guards in order; return { ok:false, reason } on first
 *  fail so the response carries a single diagnostic. Operates on the
 *  facts wire shape so this file has no runtime dep on commentaryFacts.ts. */
export function validateHeadline(
  rawText: string,
  facts: CommentaryFacts,
): ValidationResult {
  const text = String(rawText ?? "").trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > HEADLINE_MAX_LENGTH) {
    return { ok: false, reason: `length>${HEADLINE_MAX_LENGTH}` };
  }
  if (/\{\w+\}/.test(text)) return { ok: false, reason: "stray_template_token" };
  if (text === APOLOGY_SENTINEL) {
    return { ok: false, reason: "apology_sentinel" };
  }

  // §3 / banned-phrase denylist. Word-boundary match avoids "diet" →
  // "died" style false positives.
  const lc = text.toLowerCase();
  for (const phrase of PHRASE_DENYLIST) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lc)) return { ok: false, reason: `denylist:${phrase}` };
  }

  // Not-in-facts team-INVENTION rejection. Phase 3.3 inversion: only
  // trip on tokens that are actually KNOWN NBA team codes — the prior
  // `[A-Z]{3,5}` heuristic was too greedy for the all-caps headline
  // register the new VOICE_CONTRACT produces (rejected "YOU," "HELD,"
  // "THIS" as if they were team codes). The guard's PURPOSE is
  // unchanged: stop the model from naming a team that isn't in facts.
  const allowed = new Set<string>();
  if (facts.anchor?.team) allowed.add(facts.anchor.team.toUpperCase());
  if (facts.anchor?.opponent) allowed.add(facts.anchor.opponent.toUpperCase());
  for (const t of extractAnchorTokens(facts)) allowed.add(t);

  const upperTokens = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  for (const t of upperTokens) {
    if (!NBA_TEAM_CODES.has(t)) continue;
    if (allowed.has(t)) continue;
    return { ok: false, reason: `team_not_in_facts:${t}` };
  }

  // §7 — Numeric stat-grounding (Phase 4 Pass 2 pre-merge lock §1).
  // The allowed set is digit literals from the rendered user prompt;
  // we re-render via buildUserPrompt because it is pure + deterministic
  // and guarantees we check against the same string the model saw.
  // Bias is toward permissiveness — false rejects fall back to the
  // bank pick (the robotic voice this work exists to retire).
  const userPrompt = buildUserPrompt(facts);
  const allowedNumbers = extractAllowedNumbers(userPrompt);
  const tokens = tokenizeHeadline(text);
  const headlineNumbers: ExtractedNumber[] = [
    ...extractDigitNumbers(text),
    ...extractSpelledCardinals(tokens),
  ];
  for (const n of headlineNumbers) {
    if (numberMatchesAllowed(n, allowedNumbers)) continue;
    console.warn(
      `[api/headline] validation:number_not_in_facts:${n.display} ` +
      `allowed=[${allowedNumbers.join(",")}] raw=${JSON.stringify(text)}`,
    );
    return { ok: false, reason: `number_not_in_facts:${n.display}` };
  }

  return { ok: true, headline: text };
}

// ── Live generation (step 2) ───────────────────────────────────────────────

/** Build the RouterConfig from process.env. The keys' provenance:
 *    COMMENTARY_API_KEY — HISTORICAL NAME, value IS the Anthropic API
 *    key (rename commit 938df9b kept the value, swapped the env-var
 *    label). Don't be misled by the name.
 *    GROQ_API_KEY       — Groq's OpenAI-compatible endpoint key. Drives
 *    the background grader + the cross-checker challenger round.
 *    DEEPSEEK_API_KEY   — DeepSeek's OpenAI-compatible endpoint key.
 *    Used as the secondary challenger on cycles where it's drawn.
 *
 *  Throws when the Anthropic key is missing — without it the router
 *  can't even ship the apology sentinel. The handler catches the throw
 *  and returns headline:null. */
function buildRouterConfig(): RouterConfig {
  const anthropicApiKey = process.env.COMMENTARY_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("COMMENTARY_API_KEY not configured (this is the Anthropic key)");
  }
  return {
    namespace: "replaymod",
    defaultPrimary: "claude-haiku-4-5",
    anthropicApiKey,
    groqApiKey: process.env.GROQ_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    patchWindowMs: 1500,
  };
}

/** Map CommentaryWinTier → PayoutTier. The strings are the same set
 *  today; the cast is structural. Defaults to STARTER when absent — see
 *  DEFAULT_TIER comment. */
function tierFromFacts(facts: CommentaryFacts): PayoutTier {
  if (facts.winTier) return facts.winTier as PayoutTier;
  return DEFAULT_TIER;
}

/** Phase 3 step 2 generation: compose VOICE_CONTRACT, call route
 *  Commentary, return the model's commentary plus the optional
 *  background-grading promise. routeCommentary swallows model errors
 *  internally and returns the apology-sentinel on full failure — the
 *  caller (handler / harness) detects the sentinel and treats it as a
 *  null headline. */
export interface GenerateHeadlineResult {
  /** Raw model output. May be the apology sentinel — caller must check. */
  raw: string;
  /** Grading promise — pass to waitUntil() in the handler, await in
   *  the harness, ignore in tests. */
  backgroundWork?: Promise<void>;
  /** Which model the router used (telemetry only — not part of the
   *  client-visible response). */
  modelUsed?: string;
}

export async function generateHeadline(facts: CommentaryFacts): Promise<GenerateHeadlineResult> {
  const { system, user } = buildVoiceContract(facts);
  const tier = tierFromFacts(facts);
  const config = buildRouterConfig();
  const result = await routeCommentary(system, user, tier, config);
  return {
    raw: result.commentary,
    backgroundWork: result.backgroundWork,
    modelUsed: result.modelUsed,
  };
}

/** Promise.race against a fixed timeout. Returns the promise's value or
 *  null if the timeout fires first. Always clears the timer to avoid
 *  keeping the Vercel function alive past the response. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    handle = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (handle !== undefined) clearTimeout(handle);
  }) as Promise<T | null>;
}

// ── Input shape validation ─────────────────────────────────────────────────

function isValidFactsBody(body: any): body is { facts: CommentaryFacts } {
  if (!body || typeof body !== "object") return false;
  const f = body.facts;
  if (!f || typeof f !== "object") return false;
  if (typeof f.surface !== "string") return false;
  if (typeof f.sport !== "string") return false;
  if (typeof f.season !== "string") return false;
  if (typeof f.trigger !== "string") return false;
  if (typeof f.verdict !== "string") return false;
  return true;
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // RD7.12 — Flavor sub-route, discriminated by body.kind. Folded into this
  // function (not a separate /api/flavor) because Hobby caps at 12 functions
  // and this is the 13th. Returns { flavor: string|null } (the headline path
  // returns { headline }), so the two responses never collide.
  if ((req.body as { kind?: string })?.kind === "flavor") {
    return handleFlavor(req, res);
  }

  if (!isValidFactsBody(req.body)) {
    return res.status(400).json({ error: "Missing or malformed facts" });
  }

  const facts = req.body.facts;

  // Phase 3 v1 hard rule: venue MUST NOT appear on CommentaryFacts.
  // A client that smuggles one in is rejected outright — keeps the
  // anti-anachronism contract enforceable at the network boundary.
  if ((facts.anchor as any)?.venue !== undefined) {
    return res.status(400).json({ error: "venue not permitted in v1" });
  }

  // default trigger should not reach this endpoint (buildCommentaryFacts
  // returns kind:"skip"); if a client POSTs anyway, treat as 400 so the
  // misuse is visible.
  if (facts.trigger === "default") {
    return res.status(400).json({ error: "default trigger does not use /api/headline" });
  }

  // Live generation surrounded by REAL failure plumbing:
  //   1. Promise.race against HEADLINE_TIMEOUT_MS — null on timeout.
  //   2. Apology-sentinel detection — treats the llmRouter's
  //      "Off night..." fallback as a failure, not a result.
  //   3. Output validators — length, denylist, stray tokens, team check.
  //   4. waitUntil(backgroundWork) — Vercel keeps the function alive
  //      past response so background grading lands in KV. Skipped when
  //      the generator threw (env not configured, etc.) since there
  //      would be no work to wait for.
  //   Any failure → return { headline: null, reason } so the client
  //   falls back to the bank pick.
  let generated: GenerateHeadlineResult | null = null;
  let raw: string | null;
  try {
    const generation = generateHeadline(facts);
    const result = await withTimeout(generation, HEADLINE_TIMEOUT_MS);
    if (result === null) {
      raw = null;
    } else {
      generated = result;
      raw = result.raw;
    }
  } catch (err) {
    console.error("[api/headline] generator threw:", err instanceof Error ? err.message : err);
    console.log("[api/headline] null reason=generator_error");
    return res.status(200).json({ headline: null, reason: "generator_error" });
  }

  if (raw === null) {
    console.log("[api/headline] null reason=timeout");
    return res.status(200).json({ headline: null, reason: "timeout" });
  }
  if (raw.trim() === APOLOGY_SENTINEL) {
    // Don't drop the backgroundWork promise — let it finish so any
    // partial grading still lands.
    if (generated?.backgroundWork) waitUntil(generated.backgroundWork);
    console.log("[api/headline] null reason=apology_sentinel");
    return res.status(200).json({ headline: null, reason: "apology_sentinel" });
  }

  const v = validateHeadline(raw, facts);

  // Pass the background grading promise to waitUntil REGARDLESS of
  // validation outcome — grading is async telemetry, useful even when
  // the line itself was rejected (we still want the model's score for
  // routing decisions).
  if (generated?.backgroundWork) waitUntil(generated.backgroundWork);

  if (!v.ok) {
    // Phase 3 diagnostic (lock: docs/challenge-landing-v2-phase3.2-...md).
    // The reason field is already on the JSON body; Vercel access logs
    // record only the status, not the body. This console.log surfaces
    // WHICH null-path fired in the function logs so the next prod test
    // tells us whether the validator, timeout, or sentinel is the cause
    // of the bank-pick fallback persisting on real choke rows. The raw
    // model output is included so a team-not-in-facts rejection shows
    // exactly which team code the model reached for.
    console.log(`[api/headline] null reason=validation:${v.reason} raw=${JSON.stringify(raw)}`);
    return res.status(200).json({ headline: null, reason: `validation:${v.reason}` });
  }

  return res.status(200).json({ headline: v.headline, source: "router" });
}

// ── RD7.12 Flavor sub-route ─────────────────────────────────────────────────
// Authors ONE descriptive color line from firewalled box-line facts, validated
// FAIL-CLOSED before it can return. Same never-block contract as the headline
// path: any failure → { flavor: null } and the client falls back to the
// deterministic RD7.11 line. The model is given ONLY stats + nickname + outcome
// tone (never the user's decision); beatdown losses never reach here (the
// client only POSTs win / close-loss facts).

/** Structural guard on the POSTed Flavor facts (fail closed on bad shape). */
function isFlavorFacts(x: unknown): x is FlavorFacts {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  if (f.outcome !== "win" && f.outcome !== "close-loss") return false; // beatdown never posted
  const p = f.player as Record<string, unknown> | undefined;
  if (!p || typeof p.last !== "string" || p.last.trim().length === 0) return false;
  const b = f.box as Record<string, unknown> | undefined;
  if (!b || typeof b.pts !== "number") return false;
  return true;
}

async function generateFlavor(facts: FlavorFacts): Promise<{ raw: string; backgroundWork?: Promise<void> }> {
  const system = buildFlavorSystemPrompt();
  const user = buildFlavorUserPrompt(facts);
  const config = buildRouterConfig();
  const result = await routeCommentary(system, user, DEFAULT_TIER, config);
  return { raw: result.commentary, backgroundWork: result.backgroundWork };
}

async function handleFlavor(req: VercelRequest, res: VercelResponse) {
  const facts = (req.body as { facts?: unknown })?.facts;
  if (!isFlavorFacts(facts)) return res.status(400).json({ error: "Missing or malformed flavor facts" });

  let gen: { raw: string; backgroundWork?: Promise<void> } | null = null;
  try {
    gen = await withTimeout(generateFlavor(facts), HEADLINE_TIMEOUT_MS);
  } catch (err) {
    console.error("[api/flavor] generator threw:", err instanceof Error ? err.message : err);
    return res.status(200).json({ flavor: null, reason: "generator_error" });
  }
  if (!gen) return res.status(200).json({ flavor: null, reason: "timeout" });
  if (gen.backgroundWork) waitUntil(gen.backgroundWork);

  // FAIL CLOSED — display only on a full validation pass; else null → fallback.
  const v = validateFlavor(gen.raw, facts);
  if (!v.ok) {
    console.log(`[api/flavor] null reason=validation:${v.reason} raw=${JSON.stringify(gen.raw)}`);
    return res.status(200).json({ flavor: null, reason: `flavor_validation:${v.reason}` });
  }
  return res.status(200).json({ flavor: v.line, source: "router" });
}
