#!/usr/bin/env node
// scripts/smoke-headline.mjs
//
// Phase 3 step 1 local-smoke harness. Runs the api/headline handler
// against every fixture in basketball/src/dev/headlineMockFixture.ts
// and prints the raw response body for each.
//
// Usage:
//   node scripts/smoke-headline.mjs
//
// Why not vercel dev: the worktree's vite proxy at basketball/vite.config.ts
// forwards /api/* to the DEPLOYED main-branch preview URL — so localhost
// POSTs for unmerged endpoints hit prod (404 sin1:: edge IDs). This
// harness sidesteps the proxy by invoking the handler in-process.

import path from "node:path";

// tsx hook is registered via `node --import tsx`. This file resolves the
// TS sources directly via tsx's ESM loader once that flag is set.

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const handlerMod = await import(path.join(repoRoot, "api/headline.ts"));
const fixturesMod = await import(path.join(repoRoot, "basketball/src/dev/headlineMockFixture.ts"));

const handler = handlerMod.default;
const fixtures = fixturesMod.HEADLINE_MOCK_FIXTURES;

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

const CASES = ["rare_pull", "choke_credited", "choke_neutral", "big_score", "miss"];

for (const key of CASES) {
  const fx = fixtures[key];
  const { req, res } = makeReqRes({ facts: fx.facts });
  await handler(req, res);
  const body = JSON.stringify(res.payload);
  console.log(`──── case=${key} (${fx.label}) ────`);
  console.log(`status: ${res.statusCode}`);
  console.log(`body:   ${body}`);
  console.log("");
}
