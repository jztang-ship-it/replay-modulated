#!/usr/bin/env node
// scripts/screenshot-landing-v2.mjs
//
// Localhost visual loop — captures the V2 challenge landing at
// iPhone-14 portrait (390×844) by default; pass --width=N for a custom
// viewport. Mirrors verify-h2h-play-layout.mjs (same playwright dep).
//
// Usage:
//   1. cd basketball && npm run dev
//   2. node scripts/screenshot-landing-v2.mjs              # 390 wide
//      node scripts/screenshot-landing-v2.mjs --width=1024
//   Outputs to scripts/.landing-v2-screenshots/<width>/<case>.png
//
// Phase 2c update — the lock requires verification at 360/390/768/1024.
// 400ms post-render wait is plenty for the 2c in-flow badge (no
// animation to settle); kept above the 2b thud's 480ms only because
// the previous 2b-fix iteration tuned it there.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const widthArg = args.find(a => a.startsWith("--width="));
const WIDTH = widthArg ? parseInt(widthArg.slice("--width=".length), 10) : 390;
const HEIGHT = WIDTH >= 768 ? 768 : 844;

const OUT_DIR = resolve(__dirname, ".landing-v2-screenshots", `${WIDTH}`);
mkdirSync(OUT_DIR, { recursive: true });

const ORIGIN = process.env.LANDING_V2_ORIGIN ?? "http://localhost:5173";
const VIEWPORT = { width: WIDTH, height: HEIGHT };
const CASES = [
  "choke",                // Phase 2d: anchor-DELIVERED ("EMBIID WASN'T THE PROBLEM")
  "choke_anchor_tanked",  // Phase 2d: anchor-TANKED ("EVEN EMBIID COULDN'T SAVE IT")
  "miss",
  "big_score",
  "rare_pull",
  "default",
  "legacy_choke",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

console.log(`capturing at ${WIDTH}×${HEIGHT}`);
for (const caseKey of CASES) {
  const page = await ctx.newPage();
  const url = `${ORIGIN}/basketball/dev/challenge-landing-mock?case=${caseKey}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='challenge-take-card-landing']", { timeout: 5000 });
  await page.waitForTimeout(400);
  const out = resolve(OUT_DIR, `${caseKey}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`captured ${caseKey} → ${out}`);
  await page.close();
}

await browser.close();
console.log("done");
