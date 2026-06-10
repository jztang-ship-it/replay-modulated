// scripts/rd5-1-glass.mjs
//
// RD5.1 glass-verify screenshots. Hits the basketball dev mock route at
// /basketball/dev/challenge-landing-mock?case=<key> for the four trigger
// cases the directive calls out (choke + big_score or rare_pull + default,
// plus miss for completeness), at recipient (fresh) and owner
// (alreadyAttempted) framings. Output: ~/Desktop/replaymod-handoff/2026-
// 06-10-rd5-1-glass/.
//
// Targets http://localhost:5173 by default; override with DEV_URL env var
// if the worktree's vite port differs.

import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";

const DEV_URL = process.env.DEV_URL ?? "http://localhost:5173";
const outDir = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "replaymod-handoff",
  "2026-06-10-rd5-1-glass",
);
mkdirSync(outDir, { recursive: true });

const cases = [
  { key: "choke",     label: "choke"     },
  { key: "miss",      label: "miss"      },
  { key: "big_score", label: "big_score" },
  { key: "rare_pull", label: "rare_pull" },
  { key: "default",   label: "default"   },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 414, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

for (const c of cases) {
  const url = `${DEV_URL}/basketball/dev/challenge-landing-mock?case=${c.key}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const file = path.join(outDir, `rd5-1-${c.label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  // Sanity-read the headline + CTA so the log proves what was rendered.
  const headline = await page.locator("[data-testid=take-headline]").textContent();
  const cta = await page.locator("[data-testid=accept-cta]").textContent();
  const seal = (await page.locator("[data-testid=landing-badge]").count()) > 0
    ? await page.locator("[data-testid=landing-badge]").textContent()
    : "(no seal)";
  const target = (await page.locator("[data-testid=target-line]").count()) > 0
    ? await page.locator("[data-testid=target-line]").textContent()
    : "(no target line)";
  console.log(`${c.label.padEnd(10)}  HEAD="${headline}"  SEAL=${seal}  TARGET=${target}  CTA=${cta}`);
}

await browser.close();
console.log(`\nDone. PNGs in: ${outDir}`);
