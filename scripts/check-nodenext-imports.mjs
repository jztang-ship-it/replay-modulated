#!/usr/bin/env node
// scripts/check-nodenext-imports.mjs
//
// Guard against NodeNext ESM runtime import violations that BUNDLERS tolerate
// but the Vercel @vercel/node runtime rejects — the class of bug behind the
// /api/leaderboard 500 (Phase 2-mount hotfix, 2026-06-21). Tests (esbuild/
// vitest) and the SPA build (vite) all resolve these fine, so they never catch
// them; only the runtime resolver does. This makes the failure visible in CI.
//
// Two violation classes, both seen in the hotfix:
//   1. extensionless RELATIVE imports   (import x from "./y"      → needs ".js")
//   2. JSON imports without an attribute (import j from "./z.json" → needs
//                                         `with { type: "json" }`)
//
// Scope: the NodeNext runtime graph ONLY — api/** (every function is NodeNext at
// runtime) plus the explicit non-api files those functions import (the boss
// chain). NOT all of basketball/src/tools or shared/ — those are SPA-bundled
// (vite/esbuild) and legitimately use extensionless imports; flagging them would
// be false positives. If the api runtime graph grows to import more non-api
// files, add them to RUNTIME_GRAPH_FILES (the mandatory preview-deploy gate is
// the backstop — see § Phase 2-mount).
//
// Exit 1 on any violation. Wire as `npm run check:nodenext` (pre-deploy / CI).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["api"];
// Non-api files pulled into the api runtime graph (the boss chain).
const RUNTIME_GRAPH_FILES = [
  "basketball/src/tools/bossContract.ts",
  "basketball/src/tools/bossGenerator.ts",
  "basketball/src/tools/bossData.ts",
  "basketball/src/adapters/fantasyPoints.ts",
  "basketball/src/adapters/badges.ts",
  "basketball/src/adapters/basketballConfig.ts",
  "shared/utils/dailyRotation.ts",
  "shared/utils/seededRng.ts",
];

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    // __tests__ run under vitest (bundler), never deployed as functions.
    if (s.isDirectory()) { if (e !== "__tests__") out.push(...walk(p)); }
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e) && !/\.d\.ts$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

const files = [...ROOTS.flatMap(walk), ...RUNTIME_GRAPH_FILES];
const violations = [];

// Matches `from "<spec>"` and `import "<spec>"`, capturing the specifier and any
// trailing import attribute (`with { ... }` / `assert { ... }`) on the line.
const IMPORT_RE = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']\s*\)?\s*(with|assert)?/g;

for (const file of files) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // Skip pure type imports — erased at compile, no runtime resolution.
    if (/^\s*import\s+type\b/.test(line)) return;
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(line)) !== null) {
      const spec = m[1];
      const attr = m[2];
      if (!spec.startsWith(".")) continue; // only relative specifiers
      const ext = extname(spec);
      if (spec.endsWith(".json")) {
        if (!attr) violations.push(`${file}:${i + 1}  JSON import without \`with { type: "json" }\`: "${spec}"`);
      } else if (!ext) {
        violations.push(`${file}:${i + 1}  extensionless relative import (NodeNext needs ".js"): "${spec}"`);
      }
    }
  });
}

if (violations.length) {
  console.error("NodeNext import violations (bundlers tolerate these; the Vercel runtime does NOT):\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} violation(s). Add the .js extension / json attribute. See scripts/check-nodenext-imports.mjs.`);
  process.exit(1);
}
console.log(`check:nodenext — ${files.length} files scanned, no violations.`);
