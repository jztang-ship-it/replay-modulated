#!/usr/bin/env node
// scripts/check-unbound-symbols.mjs
//
// Pre-merge gate for the unbound-symbol class of bug. Runs tsc on the basketball
// project (whose tsconfig.app.json includes ../shared) and fails on any NEW
// non-test TS2304 "Cannot find name '<X>'" — an unbound symbol.
//
// Why this gate exists: `vite build` is esbuild (no type-check) and the round
// machine is unit-tested with SPY effects, so an unbound VALUE reference
// (logHandToDb) shipped — every hand threw a ReferenceError that boundedPersist's
// resilience try/catch swallowed (no handId, no hand_log row, entry_fee_skipped).
// The no-arg `tsc --noEmit` reported 0 because basketball/tsconfig.json is a
// solution config (files:[] + references) and compiles nothing without `-b`.
//
// The codebase carries pre-existing non-test errors (incl. a few TS2304), so a
// flat "0 errors" gate isn't viable; this gate is BASELINE-aware
// (scripts/unbound-symbols-baseline.json) — it breaks only on unbound symbols not
// already known. Adding a NEW unbound name (like logHandToDb) fails the build.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const BBALL = resolve(REPO, "basketball");

const baseline = JSON.parse(readFileSync(resolve(HERE, "unbound-symbols-baseline.json"), "utf8"));
const allow = new Set(baseline.allow.map((a) => `${a.file}|${a.symbol}`));

// tsc exits non-zero when errors exist — capture stdout from the thrown error.
let out = "";
try {
  out = execSync("npx tsc -b --noEmit", { cwd: BBALL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
}

const RE = /^(\S+?\.tsx?)\((\d+),\d+\): error TS2304: Cannot find name '([^']+)'/;
const found = new Map(); // "relpath|symbol" -> { rel, symbol, line }
for (const raw of out.split("\n")) {
  const m = RE.exec(raw.trim());
  if (!m) continue;
  const [, rawPath, line, symbol] = m;
  if (/\.test\.|__tests__/.test(rawPath)) continue; // tests use vitest globals — not app code
  const rel = relative(REPO, resolve(BBALL, rawPath)).replace(/\\/g, "/");
  found.set(`${rel}|${symbol}`, { rel, symbol, line });
}

const fresh = [...found.values()].filter((f) => !allow.has(`${f.rel}|${f.symbol}`));
if (fresh.length) {
  console.error("✗ NEW unbound symbol(s) (TS2304) — fix, or if genuinely intended add to scripts/unbound-symbols-baseline.json:");
  for (const f of fresh) console.error(`    ${f.rel}:${f.line} — Cannot find name '${f.symbol}'`);
  console.error("\nThis is the class that shipped the logHandToDb bug: esbuild ships unbound names; the spy-tested round machine never invokes the real wiring.");
  process.exit(1);
}
console.log(`✓ no new unbound symbols (${allow.size} baselined, ${found.size} present in source)`);
