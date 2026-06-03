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
  "choke",                       // Phase 2d: anchor-DELIVERED, synthetic ID → 2d fallback take
  "choke_anchor_tanked",         // Phase 2d: anchor-TANKED, synthetic ID → 2d fallback take
  "choke_culture_rich",          // Phase 2e: Kobe DELIVERED + Kidd TANKED → culture-vindicated ("MAMBA …")
  "choke_generic_no_culture",    // Phase 2e: MID-zone + no culture → generic take + "HELD THE STARS." prefix
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

// Phase 2e see-it comparison captures — culture-rich anchor with the
// two see-it-decision toggles flipped, so the user can compare ON/OFF
// for the optional supporting culture line AND with/without the
// DENZEL'S LINE block. The block is removed via DOM mutation (no
// shipped prop for hiding it; this is a one-off screenshot test).
const SEE_IT_CAPTURES = [
  // Culture-rich 2×2 (Kobe anchor — take NAMES the anchor via nickname)
  {
    name: "choke_culture_rich__cultureLine_ON__block_ON",
    caseKey: "choke_culture_rich",
    showCultureLine: true,
    hideHeldList: false,
  },
  {
    name: "choke_culture_rich__cultureLine_OFF__block_OFF",
    caseKey: "choke_culture_rich",
    showCultureLine: false,
    hideHeldList: true,
  },
  {
    name: "choke_culture_rich__cultureLine_ON__block_OFF",
    caseKey: "choke_culture_rich",
    showCultureLine: true,
    hideHeldList: true,
  },
  // Generic-no-culture 2×2 (synthetic IDs, MID ratios — take is GENERIC,
  // names no one). Tests the hypothesis that block-OFF reads "naked" on
  // the generic path. Note: showCultureLine has NO visual effect here
  // (no anchorCulture → no knownFor to render); the dimension is
  // captured for matrix symmetry, not behavioral comparison.
  {
    name: "choke_generic_no_culture__cultureLine_ON__block_ON",
    caseKey: "choke_generic_no_culture",
    showCultureLine: true,
    hideHeldList: false,
  },
  {
    name: "choke_generic_no_culture__cultureLine_OFF__block_OFF",
    caseKey: "choke_generic_no_culture",
    showCultureLine: false,
    hideHeldList: true,
  },
  {
    name: "choke_generic_no_culture__cultureLine_ON__block_OFF",
    caseKey: "choke_generic_no_culture",
    showCultureLine: true,
    hideHeldList: true,
  },
];

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

for (const cap of SEE_IT_CAPTURES) {
  const page = await ctx.newPage();
  const params = new URLSearchParams({ case: cap.caseKey });
  if (cap.showCultureLine) params.set("showCultureLine", "1");
  const url = `${ORIGIN}/basketball/dev/challenge-landing-mock?${params.toString()}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='challenge-take-card-landing']", { timeout: 5000 });
  if (cap.hideHeldList) {
    // DOM mutation: remove the DENZEL'S LINE block client-side. No
    // shipped prop for hiding it (block is part of the V2 layout
    // contract). Cut-test is a one-off see-it screenshot.
    await page.evaluate(() => {
      document.querySelector("[data-testid='held-list']")?.remove();
    });
  }
  await page.waitForTimeout(400);
  const out = resolve(OUT_DIR, `${cap.name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`captured ${cap.name} → ${out}`);
  await page.close();
}

await browser.close();
console.log("done");
