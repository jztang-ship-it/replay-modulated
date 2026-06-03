#!/usr/bin/env node
// scripts/smoke-headline.mjs
//
// Phase 3 step 2 local-smoke + eval harness. Runs the api/headline
// handler against every fixture in basketball/src/dev/headlineMock
// Fixture.ts and prints, per fixture: the model's headline + the
// Groq grader's six-criterion composite score.
//
// Usage:
//   npm run smoke:headline
//   (resolves to: node --import tsx --env-file=.env.local scripts/smoke-headline.mjs)
//
// Env keys read at runtime (loaded by --env-file):
//   COMMENTARY_API_KEY  — Anthropic key (historical name, see api/headline.ts)
//   GROQ_API_KEY        — Groq key; required for grader scores. Without
//                         it the harness prints headlines only and skips
//                         the composite line.
//   DEEPSEEK_API_KEY    — optional fallback / challenger
//
// Why not vercel dev: the worktree's vite proxy at basketball/vite.
// config.ts forwards /api/* to the DEPLOYED main-branch preview URL —
// so localhost POSTs for unmerged endpoints hit prod (404 sin1:: edge
// IDs). This harness sidesteps the proxy by invoking the handler in-
// process. The tradeoff is that the dev visual route (/basketball/dev/
// headline-mock) still 404s until either step 2 merges OR the dev
// command issue is fixed (separate fast-follow).

import path from "node:path";

// Harness-only: clear KV env so the router's KV path is skipped
// (makeKV() returns null) and the in-process loop doesn't stall on
// Upstash network egress from local. Production / Vercel keep their
// env vars and use KV normally. Done BEFORE importing the handler so
// the KV client never constructs.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const handlerMod = await import(path.join(repoRoot, "api/headline.ts"));
const fixturesMod = await import(path.join(repoRoot, "basketball/src/dev/headlineMockFixture.ts"));
const graderMod = await import(path.join(repoRoot, "api/_lib/router/grader.ts"));

const handler = handlerMod.default;
const fixtures = fixturesMod.HEADLINE_MOCK_FIXTURES;
const { gradeCommentary } = graderMod;

// ── Fixture order: primary five first, retro adversarial after ───────────

const CASES = [
  // Primary five — the production-shape gates from step 1
  "rare_pull",
  "choke_credited",
  "choke_neutral",
  "big_score",
  "miss",
  // Retro adversarial set — anti-anachronism + verdict discipline
  "retro_shaq_0001",
  "retro_jordan_9596",
  "retro_arenas_0607",
  "retro_kobe_neutral_0708",
];

// ── In-process req/res shim ──────────────────────────────────────────────

function makeReqRes(body) {
  const req = {
    method: "POST",
    headers: {},
    body,
    query: {},
  };
  const res = {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(p) { this.payload = p; return this; },
  };
  return { req, res };
}

// ── Roster summary builder for the grader ────────────────────────────────
// The grader's "Roster summary:" line is its accuracy + cultural-truth
// anchor. We synthesize a one-line summary from the facts so the
// grader's context line is honest (vs. the original llmRouter caller
// which built it from the user prompt's numbered list).

function buildRosterSummary(facts) {
  const a = facts.anchor;
  if (!a) {
    return `${facts.trigger} hand, no anchor; verdict=${facts.verdict}`
      + (facts.nearMissGap != null ? `, ${facts.nearMissGap} FP short of ${facts.nearMissNextTier ?? "next tier"}` : "");
  }
  const stats = formatStats(a.statLine);
  const ha = a.homeAway === "H" ? "vs" : a.homeAway === "A" ? "at" : "vs";
  return `${a.name} (${a.team}) ${ha} ${a.opponent || "?"} on ${a.date}: ${stats}`;
}

function formatStats(statLine) {
  if (!statLine) return "no stats";
  const order = ["pts", "reb", "ast", "stl", "blk", "to", "threes"];
  const parts = [];
  for (const k of order) {
    const v = statLine[k];
    if (v == null) continue;
    parts.push(`${v} ${k}`);
  }
  return parts.join("/") || "no stats";
}

// ── Grader call wrapper ──────────────────────────────────────────────────

async function gradeIfPossible(headline, tier, rosterSummary) {
  if (!process.env.GROQ_API_KEY) return null;
  if (!headline) return null;
  try {
    return await gradeCommentary(
      headline,
      tier ?? "STARTER",
      rosterSummary,
      [],
      process.env.GROQ_API_KEY,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function formatGrade(grade) {
  if (!grade) return "(no grade — set GROQ_API_KEY to enable)";
  if (grade.error) return `(grader error: ${grade.error})`;
  return [
    `composite=${grade.composite.toFixed(2)}`,
    `human=${grade.humanness}`,
    `vibe=${grade.nbaVibe}`,
    `clarity=${grade.clarity}`,
    `accuracy=${grade.accuracy}`,
    `nonRedundancy=${grade.nonRedundancy}`,
    `culturalTruth=${grade.culturalTruth}`,
  ].join(" · ");
}

// ── Main loop ────────────────────────────────────────────────────────────

if (!process.env.COMMENTARY_API_KEY) {
  console.log("warning: COMMENTARY_API_KEY not set — handler will return generator_error on every fixture");
}
if (!process.env.GROQ_API_KEY) {
  console.log("note: GROQ_API_KEY not set — composite scores will be skipped");
}

for (const key of CASES) {
  const fx = fixtures[key];
  if (!fx) {
    console.log(`──── case=${key} (NOT FOUND) ────\n`);
    continue;
  }

  console.log(`──── case=${key} ────`);
  console.log(`label:    ${fx.label}`);
  if (fx.evalHint) console.log(`evalHint: ${fx.evalHint}`);
  console.log(`bankPick: ${fx.bankPick}`);

  const { req, res } = makeReqRes({ facts: fx.facts });
  const start = Date.now();
  await handler(req, res);
  const ms = Date.now() - start;

  const headline = res.payload?.headline ?? null;
  const reason = res.payload?.reason;
  const source = res.payload?.source;

  console.log(`status:   ${res.statusCode} (${ms}ms)`);
  if (headline) {
    console.log(`headline: ${headline}    [source=${source}]`);
  } else {
    console.log(`headline: (null)    [reason=${reason}] → client falls back to bankPick`);
  }

  // Grader — score only the headlines that survived the validator;
  // skipping bank-fallback nulls because grading them would compare
  // the model's failure to itself.
  const rosterSummary = buildRosterSummary(fx.facts);
  const grade = await gradeIfPossible(headline, fx.facts.winTier, rosterSummary);
  console.log(`grade:    ${formatGrade(grade)}`);
  console.log("");
}
