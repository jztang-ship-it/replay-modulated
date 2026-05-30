#!/usr/bin/env node
// scripts/verify-h2h-play-layout.mjs
//
// Real-browser bounding-box verification for the H2HRecipientPlay
// rework (CLAUDE.md "Visual / layout changes" rule). Walks the
// state machine on the dev mock route + asserts:
//
//   1. Each bottom-strip cell's `[data-h2h-play-front]` (rendered
//      AthleteCard at strip scale) has a non-zero bounding rect AND
//      that rect falls inside the cell's rect. This is the regression
//      that produced the empty-strip live bug — JSDOM couldn't catch it.
//   2. Each top-strip cell that has a sender card flipped face-up at
//      column-pass end also has a non-zero front-face rect inside the
//      cell.
//   3. At state.kind === "arc", the playing-mode root
//      [data-h2h-recipient-play] STAYS mounted (Fix C2 single-canvas
//      continuity) and [data-h2h-recipient-reveal] is a DESCENDANT of
//      it, not a sibling/replacement.
//
// Usage:
//   1. Start the basketball dev server:
//        npm run dev
//   2. Run this script:
//        node scripts/verify-h2h-play-layout.mjs
//
// Exits 0 on PASS, 1 on FAIL. Prints a per-assertion summary either way.

import { chromium } from "playwright";

const BASE_URL = process.env.H2H_PLAY_BASE_URL ?? "http://localhost:5173/basketball/dev/h2h-play-mock";
const VIEWPORT = { width: 390, height: 844 }; // iPhone 14 portrait

// Layout timing constants — match shared/components/H2HRecipientPlay.tsx.
const DEAL_CASCADE_INTERVAL_MS = 120;
const COLUMN_FLIP_DURATION_MS = 250;
const COLUMN_FLIP_INTERSTITIAL_MS = 150;
const PRE_REVEAL_HOLD_MS = 800;
const ROSTER_SIZE = 6;

const failures = [];
const passes = [];

function record(label, ok, detail = "") {
  if (ok) {
    passes.push(label);
    console.log(`  ✓ ${label}`);
  } else {
    failures.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

/** rectContains(outer, inner): does outer contain inner, with a small
 *  pixel tolerance for sub-pixel rendering rounding? Playwright's
 *  boundingBox() returns {x, y, width, height} — we derive
 *  left/top/right/bottom from those. */
function rectContains(outer, inner, tolerancePx = 1) {
  if (!outer || !inner) return false;
  if (inner.width <= 0 || inner.height <= 0) return false;
  const outerLeft = outer.x, outerTop = outer.y;
  const outerRight = outer.x + outer.width, outerBottom = outer.y + outer.height;
  const innerLeft = inner.x, innerTop = inner.y;
  const innerRight = inner.x + inner.width, innerBottom = inner.y + inner.height;
  return (
    innerLeft >= outerLeft - tolerancePx &&
    innerTop >= outerTop - tolerancePx &&
    innerRight <= outerRight + tolerancePx &&
    innerBottom <= outerBottom + tolerancePx
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (err) => {
    console.error("[browser-error]", err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser-console]", msg.text());
  });

  console.log(`\nVisual-layout verification — ${BASE_URL}\n`);

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  } catch (err) {
    console.error(`\nFAIL — could not load ${BASE_URL}`);
    console.error("Is the dev server running?  npm run dev");
    console.error("Underlying error:", err.message);
    await browser.close();
    process.exit(2);
  }

  // ── Pre-deal: confirm playing root mounted + 6 empty bottom cells ──
  await page.waitForSelector("[data-h2h-recipient-play]", { timeout: 5000 });
  const playStateInitial = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state-1: playing root mounted in pre_deal state (got "${playStateInitial}")`, playStateInitial === "pre_deal");

  // ── Deal: tap Deal CTA, wait for cascade ──
  await page.click("[data-h2h-play-cta][data-cta-label='Deal']");
  await page.waitForTimeout(DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 2));

  const playStateAfterDeal = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state-2 → hold_select reached after cascade (got "${playStateAfterDeal}")`, playStateAfterDeal === "hold_select");

  // ── Fix B regression-lock: bottom-strip front faces are INSIDE their cells ──
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-bottom-cell="${i}"]`);
    const frontHandle = cellHandle.locator("[data-h2h-play-front]");
    const cellRect = await cellHandle.boundingBox();
    const frontRect = await frontHandle.boundingBox();
    const ok = rectContains(cellRect, frontRect);
    const detail = ok ? "" :
      `cell=${cellRect ? `(${cellRect.x},${cellRect.y},${cellRect.width}x${cellRect.height})` : "null"} ` +
      `front=${frontRect ? `(${frontRect.x},${frontRect.y},${frontRect.width}x${frontRect.height})` : "null"}`;
    record(`bottom cell ${i} front-face rect inside cell rect`, ok, detail);
  }

  // Also assert the rendered card (renderer subtree) is non-zero +
  // inside the cell — this is the exact failure mode that surfaced
  // live (scale + transformOrigin pushed the renderer off-cell while
  // JSDOM tests stayed green).
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-bottom-cell="${i}"]`);
    const cardHandle = cellHandle.locator("[data-h2h-play-front] > div").first();
    const cellRect = await cellHandle.boundingBox();
    const cardRect = await cardHandle.boundingBox();
    const ok = rectContains(cellRect, cardRect);
    const detail = ok ? "" :
      `cell=${cellRect ? `(${cellRect.x},${cellRect.y},${cellRect.width}x${cellRect.height})` : "null"} ` +
      `card=${cardRect ? `(${cardRect.x},${cardRect.y},${cardRect.width}x${cardRect.height})` : "null"}`;
    record(`bottom cell ${i} rendered card rect inside cell rect (Fix B regression-lock)`, ok, detail);
  }

  // ── Walk to column-flip end → assert top-strip front faces inside cells ──
  await page.click("[data-h2h-play-cta][data-cta-label='Draw']");
  const totalColumnFlipMs = ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
  // Wait through redraw promise + full column-flip pass + handoff hold.
  await page.waitForTimeout(totalColumnFlipMs + 100);

  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-top-cell="${i}"]`);
    const frontHandle = cellHandle.locator("[data-h2h-play-top-front]");
    const cellRect = await cellHandle.boundingBox();
    const frontCount = await frontHandle.count();
    if (frontCount === 0) {
      // No front face means cell is still face-down; skip — column-flip
      // pass should have completed all 6.
      record(`top cell ${i} sender face mounted at column-pass end`, false, "no [data-h2h-play-top-front] mounted");
      continue;
    }
    const frontRect = await frontHandle.boundingBox();
    const ok = rectContains(cellRect, frontRect);
    const detail = ok ? "" :
      `cell=${cellRect ? `(${cellRect.x},${cellRect.y},${cellRect.width}x${cellRect.height})` : "null"} ` +
      `front=${frontRect ? `(${frontRect.x},${frontRect.y},${frontRect.width}x${frontRect.height})` : "null"}`;
    record(`top cell ${i} sender face rect inside cell rect`, ok, detail);
  }

  // ── Wait for handoff to arc, then verify Fix C2 single canvas ──
  await page.waitForTimeout(PRE_REVEAL_HOLD_MS + 500);

  const playStateArc = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state="arc" reached (got "${playStateArc}")`, playStateArc === "arc");

  // Fix C2 single-canvas regression-lock:
  //   - playing root STAYS mounted (no unmount-and-swap)
  //   - reveal root is a DESCENDANT of playing root (composited inside)
  const playingMounted = (await page.locator("[data-h2h-recipient-play]").count()) === 1;
  record("Fix C2: playing canvas root STAYS mounted at arc state", playingMounted);

  const revealDescendant = await page.locator("[data-h2h-recipient-play] [data-h2h-recipient-reveal]").count();
  record("Fix C2: reveal mounted as descendant of playing root (single canvas)", revealDescendant >= 1);

  // Sibling-mount regression check: there should be NO reveal that is
  // a sibling/cousin of the playing root.
  const revealSibling = await page.evaluate(() => {
    const playing = document.querySelector("[data-h2h-recipient-play]");
    const allReveals = Array.from(document.querySelectorAll("[data-h2h-recipient-reveal]"));
    return allReveals.filter((r) => !playing?.contains(r)).length;
  });
  record("Fix C2: no reveal mounted OUTSIDE the playing root", revealSibling === 0);

  // Playing-inner subtree faded out (opacity 0).
  const innerOpacity = await page.locator("[data-h2h-play-inner]").evaluate((el) => getComputedStyle(el).opacity);
  record("playing inner content faded to opacity 0", parseFloat(innerOpacity) === 0, `opacity=${innerOpacity}`);

  await browser.close();

  console.log(`\n${passes.length} passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  ✗ ${f.label}${f.detail ? "\n      " + f.detail : ""}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFAIL — script error:", err);
  process.exit(2);
});
