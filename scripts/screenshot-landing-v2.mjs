#!/usr/bin/env node
// scripts/screenshot-landing-v2.mjs
//
// Phase 2b localhost visual loop — captures the V2 challenge landing
// at iPhone-14 portrait (390×844) for the six fixture cases. Mirrors
// the verify-h2h-play-layout.mjs convention (same viewport, same
// playwright dep).
//
// Usage:
//   1. cd basketball && npm run dev
//   2. node scripts/screenshot-landing-v2.mjs
//   Outputs go to scripts/.landing-v2-screenshots/<case>.png

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, ".landing-v2-screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const ORIGIN = process.env.LANDING_V2_ORIGIN ?? "http://localhost:5173";
const VIEWPORT = { width: 390, height: 844 }; // iPhone 14 portrait
const CASES = ["choke", "miss", "big_score", "rare_pull", "default", "legacy_choke"];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

for (const caseKey of CASES) {
  const page = await ctx.newPage();
  const url = `${ORIGIN}/basketball/dev/challenge-landing-mock?case=${caseKey}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='challenge-take-card-landing']", { timeout: 5000 });
  // Give the layout one paint to settle (font fallback etc.).
  await page.waitForTimeout(150);
  const out = resolve(OUT_DIR, `${caseKey}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`captured ${caseKey} → ${out}`);
  await page.close();
}

await browser.close();
console.log("done");
