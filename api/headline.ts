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
import { buildVoiceContract } from "../shared/commentary/voiceContract.js";
import { routeCommentary } from "./_lib/router/llmRouter.js";
import type { RouterConfig, PayoutTier } from "./_lib/router/types.js";

// ── Knobs ──────────────────────────────────────────────────────────────────

/** Hard server-side cap on the entire generation step. 2.5s sits between
 *  the ~600ms Haiku-warm typical and the 10s Vercel Hobby function
 *  ceiling. The timeout race exists so a model API hang doesn't blow
 *  the function — it's a defense, not a deadline. */
const HEADLINE_TIMEOUT_MS = 2500;

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

/** Tokens we explicitly allow even though they'd otherwise match the
 *  3-letter-uppercase team-code regex in the validator. FP is a stat
 *  abbreviation; MVP / DPOY / ROY are award acronyms; ESPN / NBA / NFL /
 *  MLB are league/network names. None imply a team affiliation, so
 *  they're safe even when not in the facts. */
const TEAM_TOKEN_WHITELIST: ReadonlySet<string> = new Set([
  "FP", "MVP", "DPOY", "ROY", "ESPN", "NBA", "NFL", "MLB", "GOAT",
]);

/** Default tier when the facts didn't carry one. Used as the routing
 *  key by llmRouter (KV namespace splits decisions per tier) — STARTER
 *  is the most common hand result and a neutral fallback. */
const DEFAULT_TIER: PayoutTier = "STARTER";

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

  // Not-in-facts team/opponent rejection. Collect every 3-letter
  // ALL-CAPS token; reject if any is NOT in the allowed set (anchor's
  // own team OR the opponent) and NOT a whitelisted non-team token.
  const allowed = new Set<string>();
  if (facts.anchor?.team) allowed.add(facts.anchor.team.toUpperCase());
  if (facts.anchor?.opponent) allowed.add(facts.anchor.opponent.toUpperCase());

  const teamTokens = text.match(/\b[A-Z]{3,4}\b/g) ?? [];
  for (const t of teamTokens) {
    if (TEAM_TOKEN_WHITELIST.has(t)) continue;
    if (!allowed.has(t)) return { ok: false, reason: `team_not_in_facts:${t}` };
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
    return res.status(200).json({ headline: null, reason: "generator_error" });
  }

  if (raw === null) {
    return res.status(200).json({ headline: null, reason: "timeout" });
  }
  if (raw.trim() === APOLOGY_SENTINEL) {
    // Don't drop the backgroundWork promise — let it finish so any
    // partial grading still lands.
    if (generated?.backgroundWork) waitUntil(generated.backgroundWork);
    return res.status(200).json({ headline: null, reason: "apology_sentinel" });
  }

  const v = validateHeadline(raw, facts);

  // Pass the background grading promise to waitUntil REGARDLESS of
  // validation outcome — grading is async telemetry, useful even when
  // the line itself was rejected (we still want the model's score for
  // routing decisions).
  if (generated?.backgroundWork) waitUntil(generated.backgroundWork);

  if (!v.ok) {
    return res.status(200).json({ headline: null, reason: `validation:${v.reason}` });
  }

  return res.status(200).json({ headline: v.headline, source: "router" });
}
