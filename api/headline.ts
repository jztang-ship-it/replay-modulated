// api/headline.ts
//
// Phase 3 step 1 (lock: docs/challenge-landing-v2-phase3-authored-voice-
// engine-lock.md). The challenge headline endpoint — generator STUBBED,
// failure/validation plumbing REAL. Step 2 swaps generateHeadlineStub()
// for a real routeCommentary call composing VOICE_CONTRACT + facts; the
// timeout/sentinel/validator pipeline downstream is built now so that
// swap is a one-function change.
//
// Wire contract (POST):
//   request:  { facts: CommentaryFacts }
//   response: 200 { headline: string|null, source?: "stub", reason?: string }
//             400 { error: "..." }   // body shape rejected
//             405 { error: "POST required" }
//
// The client treats headline:null the same as a network failure:
// fall back to today's chadShareTrashTalk bank pick. Create is NEVER
// blocked on the headline (lock §"Fallback").
//
// Auth: NONE in v1. The endpoint runs a stubbed generator with zero
// cost; the OAuth-resume side-channel needs to call it before the user
// has a session (per the lock's "settle before writePending" rule).
// Step 2 introduces real model calls — when it does, rate-limiting
// (per-IP via Upstash KV; the router's KV namespace is already wired)
// closes the abuse window without re-introducing the auth wall here.
//
// IMPORTANT — bundle hygiene: this file deliberately does NOT import
// from `shared/commentary/commentaryFacts` or `selectCommentary`. Those
// modules transitively pull in `basketball/src/utils/playerCulture.ts`
// (8000+ lines) into the serverless bundle. The facts arrive over the
// wire as JSON; the body type below is a structural mirror. The client
// owns the build via `shared/commentary/commentaryFacts.ts`.

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ── Local mirror of CommentaryFacts (wire shape only — no runtime coupling) ─

type AnchorTruthVerdict = "credited" | "blamed" | "neutral";

type CommentarySurface = "challenge_headline" | "post_hand";

type CommentaryTrigger = "choke" | "miss" | "big_score" | "rare_pull" | "default";

interface TopGameReasonWire {
  category: string;
  label: string;
  value: number;
  rank?: number;
}

interface CommentaryFactsAnchorWire {
  name: string;
  basePlayerId: string;
  nicknames: string[];
  knownFor: string;
  tier: string;
  team: string;
  statLine: Record<string, number | string>;
  opponent: string;
  homeAway: "H" | "A" | "";
  date: string;
  topReason?: TopGameReasonWire;
}

interface CommentaryFactsWire {
  surface: CommentarySurface;
  sport: string;
  season: string;
  trigger: CommentaryTrigger;
  verdict: AnchorTruthVerdict;
  anchor?: CommentaryFactsAnchorWire;
  nearMissGap?: number;
  nearMissNextTier?: string;
}

// ── Knobs ──────────────────────────────────────────────────────────────────

/** Hard server-side cap on the entire generation step (including any
 *  network call to a model in step 2). Step 1 stubs generation but
 *  exercises the race so the plumbing is proved. 2.5s sits between the
 *  ~600ms Haiku-warm typical and the 10s Vercel Hobby function ceiling. */
const HEADLINE_TIMEOUT_MS = 2500;

/** Hard ceiling on the rendered headline. The lock targets ~60-110 chars
 *  ("ESPN / newspaper headline" register); 160 leaves enough headroom
 *  for the step-2 voice without inviting bank-style paragraphs. */
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
  // Phase 3 step 1 only: the stubbed generator emits "[STUB]" as a
  // recognizable marker. Removed when step 2 replaces the stub with a
  // real model call. Listed here so the validator doesn't flag the
  // marker token itself as a stray team code.
  "STUB",
]);

// ── Validators ─────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true; headline: string }
  | { ok: false; reason: string };

/** Run all output guards in order; return { ok:false, reason } on first
 *  fail so the response carries a single diagnostic. */
export function validateHeadline(
  rawText: string,
  facts: CommentaryFactsWire,
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

// ── Stubbed generation (step 1) ────────────────────────────────────────────

/** Returns a fixed, recognizable string so the whole pipeline is provable
 *  before any model is in the loop. Step 2 replaces with a real
 *  routeCommentary call composing VOICE_CONTRACT + per-sport voice pack
 *  + the facts; the timeout/sentinel/validator scaffolding around it
 *  stays unchanged. */
export async function generateHeadlineStub(facts: CommentaryFactsWire): Promise<string> {
  const name = facts.anchor?.name ?? "no-anchor";
  return `[STUB] ${name} · ${facts.trigger} · ${facts.verdict}`;
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

function isValidFactsBody(body: any): body is { facts: CommentaryFactsWire } {
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

  // Generator — stubbed. Surrounded by REAL failure plumbing:
  //   1. Promise.race against HEADLINE_TIMEOUT_MS — null on timeout.
  //   2. Apology-sentinel detection — treats the llmRouter's
  //      "Off night..." fallback as a failure, not a result.
  //   3. Output validators — length, denylist, stray tokens, team check.
  //   Any failure → return { headline: null, reason }.
  let raw: string | null;
  try {
    raw = await withTimeout(generateHeadlineStub(facts), HEADLINE_TIMEOUT_MS);
  } catch (err) {
    console.error("[api/headline] generator threw:", err instanceof Error ? err.message : err);
    return res.status(200).json({ headline: null, reason: "generator_error" });
  }

  if (raw === null) {
    return res.status(200).json({ headline: null, reason: "timeout" });
  }
  if (raw.trim() === APOLOGY_SENTINEL) {
    return res.status(200).json({ headline: null, reason: "apology_sentinel" });
  }

  const v = validateHeadline(raw, facts);
  if (!v.ok) {
    return res.status(200).json({ headline: null, reason: `validation:${v.reason}` });
  }

  return res.status(200).json({ headline: v.headline, source: "stub" });
}
