#!/usr/bin/env node
// scripts/verify-h2h-play-layout.mjs
//
// Real-browser bounding-box verification for the H2H playing-mode
// rework (CLAUDE.md "Visual / layout changes" rule).
//
// Modes:
//   (default)        — full verification: reveal-baseline check + play harness.
//   --baseline       — capture reveal-mock rects+labels to
//                      scripts/.h2h-reveal-baseline.json (PRE-EXTRACTION
//                      truth, used as the post-extraction baseline).
//   --play-only      — skip reveal-baseline check; only run play harness.
//
// Usage:
//   1. Start dev server: npm run dev
//   2. Run: node scripts/verify-h2h-play-layout.mjs [--baseline|--play-only]
//
// Exits 0 on PASS, 1 on FAIL. Prints a per-assertion summary either way.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, ".h2h-reveal-baseline.json");

const args = process.argv.slice(2);
const MODE_BASELINE = args.includes("--baseline");
const MODE_PLAY_ONLY = args.includes("--play-only");
const CHALLENGER_NAME = "Mike";

const ORIGIN = process.env.H2H_PLAY_ORIGIN ?? "http://localhost:5173";
const REVEAL_URL = `${ORIGIN}/basketball/dev/h2h-reveal-mock`;
const PLAY_URL = `${ORIGIN}/basketball/dev/h2h-play-mock?challengerName=${encodeURIComponent(CHALLENGER_NAME)}`;
const VIEWPORT = { width: 390, height: 844 }; // iPhone 14 portrait (control)

// hold_select vertical-budget fix (docs/holdselect-vertical-budget-
// design-lock.md §5/§6, 2026-06-01). The pre-fix regression on da5af3b
// passed at 390×844 alone — its only viewport — so the harness saw a
// green layout while the bottom strip + CTA were off-screen on every
// URL-bar-visible or webview iOS variant.
//
// Sweep: each viewport models a real iOS rendering scenario. safeTop /
// safeBottom replace the shell's two `calc(env(safe-area-inset-*) + 20px)`
// paddings — env() is a CSS function, not a custom property, so we
// inject at the consumer (#18 pass).
const HS_SWEEP_VIEWPORTS = [
  { label: "390×844 iPhone 14 (control, no URL bar)", width: 390, height: 844, safeTop: 47, safeBottom: 34 },
  { label: "390×700 iPhone 14 + URL bar",             width: 390, height: 700, safeTop: 47, safeBottom: 34 },
  { label: "390×664 iPhone 14 mid-scroll",            width: 390, height: 664, safeTop: 47, safeBottom: 34 },
  { label: "360×590 iPhone XR + URL bar",             width: 360, height: 590, safeTop: 44, safeBottom: 34 },
  { label: "320×520 iPhone SE 1g + URL bar",          width: 320, height: 520, safeTop: 20, safeBottom:  0 },
  { label: "390×580 in-app webview (~90 top chrome)", width: 390, height: 580, safeTop: 90, safeBottom:  0 },
];

const OUTER_PAD_EXTRA_PX = 20; // matches the shell's "+ 20px" budget.

// Layout timing constants — match shared/components/H2HRecipientPlay.tsx.
const DEAL_CASCADE_INTERVAL_MS = 120;
const COLUMN_FLIP_DURATION_MS = 250;
const COLUMN_FLIP_INTERSTITIAL_MS = 150;
const PRE_REVEAL_HOLD_MS = 800;
const ARC_COMPOSITE_CROSSFADE_MS = 250;
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

/** rectMatches(a, b, tolerance): same rect within tolerance px. */
function rectMatches(a, b, tolerancePx = 1) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= tolerancePx &&
    Math.abs(a.y - b.y) <= tolerancePx &&
    Math.abs(a.width - b.width) <= tolerancePx &&
    Math.abs(a.height - b.height) <= tolerancePx
  );
}

function fmtRect(r) {
  return r ? `(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)})` : "null";
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (err) => console.error("[browser-error]", err.message));
  return page;
}

async function loadAndWaitForReveal(page) {
  await page.goto(REVEAL_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(`[data-h2h-board-zone="top"]`, { timeout: 5000 });
  await page.waitForSelector(`[data-h2h-board-zone="bottom"]`, { timeout: 5000 });
  await page.waitForSelector(`[data-h2h-board-zone="hero"]`, { timeout: 5000 });
  // The reveal mock route is the static-end-state arc (no entrance
  // animation); let one frame settle.
  await page.waitForTimeout(100);
}

async function captureRevealRects(page) {
  const topRect = await page.locator(`[data-h2h-board-zone="top"]`).boundingBox();
  const bottomRect = await page.locator(`[data-h2h-board-zone="bottom"]`).boundingBox();
  const heroRect = await page.locator(`[data-h2h-board-zone="hero"]`).boundingBox();
  // Target the ZoneHeader spans directly (data-h2h-board-zone-label)
  // so the captured text is JUST the label, not the entire zone's
  // textContent (which would include strip-cell text too).
  const topLabel = (await page.locator(`[data-h2h-board-zone-label="top"]`).first().textContent())?.trim() ?? "";
  const bottomLabel = (await page.locator(`[data-h2h-board-zone-label="bottom"]`).first().textContent())?.trim() ?? "";
  return { topRect, bottomRect, heroRect, topLabel, bottomLabel };
}

// ── --baseline mode: capture reveal rects + labels to disk ─────────

async function runBaselineCapture(browser) {
  console.log(`\nCapturing reveal baseline — ${REVEAL_URL}\n`);
  const page = await newPage(browser);
  try {
    await loadAndWaitForReveal(page);
  } catch (err) {
    console.error(`\nFAIL — could not load reveal mock at ${REVEAL_URL}`);
    console.error("Is the dev server running?  npm run dev");
    console.error("Underlying error:", err.message);
    throw err;
  }
  const captured = await captureRevealRects(page);
  // Strip text down to the first identifiable label tokens — the
  // baseline targets identity, not exact whitespace.
  const baseline = {
    capturedAt: new Date().toISOString(),
    sourceUrl: REVEAL_URL,
    viewport: VIEWPORT,
    revealZones: {
      top: captured.topRect,
      bottom: captured.bottomRect,
      hero: captured.heroRect,
    },
    // Reveal mock uses h2hMockFixture names — capture them as identity
    // strings so post-extraction can verify the label text survives.
    labels: {
      topContains: "MIKE", // SENDER_HAND.displayName
      bottomContains: "YOU", // RECIPIENT_HAND.displayName
    },
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`Baseline written: ${BASELINE_PATH}`);
  console.log(`  top    = ${fmtRect(captured.topRect)}`);
  console.log(`  bottom = ${fmtRect(captured.bottomRect)}`);
  console.log(`  hero   = ${fmtRect(captured.heroRect)}`);
  console.log(`  topLabel    contains "${captured.topLabel}"`);
  console.log(`  bottomLabel contains "${captured.bottomLabel}"`);
}

// ── default mode: full verification (reveal-baseline + play harness) ─

async function runRevealBaselineCheck(browser) {
  console.log(`\nVerifying reveal surface against baseline — ${REVEAL_URL}\n`);
  if (!existsSync(BASELINE_PATH)) {
    record("reveal-baseline file exists", false, `${BASELINE_PATH} missing — run --baseline first`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const page = await newPage(browser);
  await loadAndWaitForReveal(page);
  const live = await captureRevealRects(page);

  record(
    "#14 reveal top zone rect matches baseline (±1px)",
    rectMatches(baseline.revealZones.top, live.topRect),
    `baseline=${fmtRect(baseline.revealZones.top)} live=${fmtRect(live.topRect)}`,
  );
  record(
    "#14 reveal bottom zone rect matches baseline (±1px)",
    rectMatches(baseline.revealZones.bottom, live.bottomRect),
    `baseline=${fmtRect(baseline.revealZones.bottom)} live=${fmtRect(live.bottomRect)}`,
  );
  record(
    "#14 reveal hero region rect matches baseline (±1px)",
    rectMatches(baseline.revealZones.hero, live.heroRect),
    `baseline=${fmtRect(baseline.revealZones.hero)} live=${fmtRect(live.heroRect)}`,
  );
  record(
    `#14 reveal top label contains "${baseline.labels.topContains}"`,
    live.topLabel.toUpperCase().includes(baseline.labels.topContains.toUpperCase()),
    `label="${live.topLabel}"`,
  );
  record(
    `#14 reveal bottom label contains "${baseline.labels.bottomContains}"`,
    live.bottomLabel.toUpperCase().includes(baseline.labels.bottomContains.toUpperCase()),
    `label="${live.bottomLabel}"`,
  );
  await page.close();
}

async function runPlayHarness(browser) {
  console.log(`\nVerifying play surface — ${PLAY_URL}\n`);
  const page = await newPage(browser);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser-console]", msg.text());
  });

  try {
    await page.goto(PLAY_URL, { waitUntil: "networkidle", timeout: 30000 });
  } catch (err) {
    console.error(`\nFAIL — could not load ${PLAY_URL}`);
    console.error("Is the dev server running?  npm run dev");
    console.error("Underlying error:", err.message);
    throw err;
  }

  // ── State 1 (pre_deal): playing root + framed board + labels ──
  await page.waitForSelector("[data-h2h-recipient-play]", { timeout: 5000 });
  const playStateInitial = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state-1: playing root mounted in pre_deal state (got "${playStateInitial}")`, playStateInitial === "pre_deal");

  // Framed-board presence — top, bottom, hero zones all present at S1.
  const topZoneCount_s1 = await page.locator(`[data-h2h-board-zone="top"]`).count();
  const bottomZoneCount_s1 = await page.locator(`[data-h2h-board-zone="bottom"]`).count();
  const heroZoneCount_s1 = await page.locator(`[data-h2h-board-zone="hero"]`).count();
  record("S1 framed board: top zone present", topZoneCount_s1 >= 1);
  record("S1 framed board: bottom zone present", bottomZoneCount_s1 >= 1);
  record("S1 framed board: hero region present", heroZoneCount_s1 >= 1);

  // Labels at S1 — opponent name (challengerName) top, recipient (nickname) bottom.
  // Target the ZoneHeader spans by data-h2h-board-zone-label so we capture
  // just the label, not the whole zone's textContent.
  const topLabel_s1 = (await page.locator(`[data-h2h-board-zone-label="top"]`).first().textContent())?.trim().toUpperCase() ?? "";
  const bottomLabel_s1 = (await page.locator(`[data-h2h-board-zone-label="bottom"]`).first().textContent())?.trim().toUpperCase() ?? "";
  record(`S1 top label contains "${CHALLENGER_NAME.toUpperCase()}"`, topLabel_s1.includes(CHALLENGER_NAME.toUpperCase()), `label="${topLabel_s1}"`);
  // Bottom label is recipient identity; default fallback "YOU" when no nickname set.
  record("S1 bottom label present (non-empty)", bottomLabel_s1.length > 0, `label="${bottomLabel_s1}"`);

  // Capture top/bottom/hero zone rects at end of S1 for the S3→S4 no-shift check below.
  const topRect_s1 = await page.locator(`[data-h2h-board-zone="top"]`).boundingBox();
  const bottomRect_s1 = await page.locator(`[data-h2h-board-zone="bottom"]`).boundingBox();
  const heroRect_s1 = await page.locator(`[data-h2h-board-zone="hero"]`).boundingBox();

  // ── State 2 (deal_in → hold_select) ──
  await page.click("[data-h2h-play-cta][data-cta-label='Deal']");
  await page.waitForTimeout(DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 2));
  // Settle hold_select transitions (top-strip 80→0; hero floor 377→205;
  // opacity 1→0) — all 250ms. The bottom strip moves up as hero
  // collapses; cell-rect assertions must measure after the transition
  // ends or the cell's flex-positioned y races the absolute-positioned
  // front-face's reported y.
  await page.waitForTimeout(COLUMN_FLIP_DURATION_MS + 100);
  const playStateAfterDeal = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state-2 → hold_select reached after cascade (got "${playStateAfterDeal}")`, playStateAfterDeal === "hold_select");

  // Fix B regression-lock: bottom cells' front faces inside their cells.
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-bottom-cell="${i}"]`);
    const frontHandle = cellHandle.locator("[data-h2h-play-front]");
    const cellRect = await cellHandle.boundingBox();
    const frontRect = await frontHandle.boundingBox();
    record(`bottom cell ${i} front-face rect inside cell rect`, rectContains(cellRect, frontRect), `cell=${fmtRect(cellRect)} front=${fmtRect(frontRect)}`);
  }
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-bottom-cell="${i}"]`);
    const cardHandle = cellHandle.locator("[data-h2h-play-front] > div").first();
    const cellRect = await cellHandle.boundingBox();
    const cardRect = await cardHandle.boundingBox();
    record(`bottom cell ${i} rendered card rect inside cell rect (Fix B regression-lock)`, rectContains(cellRect, cardRect), `cell=${fmtRect(cellRect)} card=${fmtRect(cardRect)}`);
  }

  // Cells-inside-zone (new) — bottom cells inside the bottom-zone container.
  const bottomZoneRect_s2 = await page.locator(`[data-h2h-board-zone="bottom"]`).boundingBox();
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellRect = await page.locator(`[data-h2h-play-bottom-cell="${i}"]`).boundingBox();
    record(`S2 bottom cell ${i} inside bottom zone`, rectContains(bottomZoneRect_s2, cellRect), `zone=${fmtRect(bottomZoneRect_s2)} cell=${fmtRect(cellRect)}`);
  }

  // ── H badge regression-lock (Bug 1 / Fix 1 / Fix 2) ──
  // The H badge is the corner triangle + "H" span CardFront renders
  // when isLocked=true (shared/components/CardFront.tsx:873-883). In
  // the real browser we query by the SVG polygon fill which CardFront
  // emits exclusively for the H indicator.
  //   Pre-tap (hold_select): 0 H badges across the bottom strip.
  //   Post-tap on slot N: exactly 1 H badge, located inside cell N.
  const hBadgeSelectorBottom = `[data-h2h-play-bottom-cell] svg polygon[fill="#F5C850"]`;
  const hBadgeCountPreTap = await page.locator(hBadgeSelectorBottom).count();
  record(
    `H badge count == 0 on bottom strip at hold_select pre-tap (Bug 1 / Fix 2 regression-lock)`,
    hBadgeCountPreTap === 0,
    `count=${hBadgeCountPreTap}`,
  );

  // Phase 5c S3 — recipient contextual intro presence. Mirrors the VS
  // check pattern below. Pre-tap (hold_select, held.size === 0,
  // intro not yet dismissed): Stage 1 paragraph mounts in heroSlot;
  // existing instructional headline is displaced.
  const stage1Snap = await page.evaluate(() => {
    const stage1 = document.querySelector('[data-h2h-play-intro="stage1"]');
    const stage2 = document.querySelector('[data-h2h-play-intro="stage2"]');
    const headline = document.querySelector("[data-h2h-play-headline]");
    return {
      stage1Mounted: !!stage1,
      stage1NonEmpty: (stage1?.textContent ?? "").trim().length > 0,
      stage2Mounted: !!stage2,
      headlineMounted: !!headline,
    };
  });
  record(
    `S3 Stage 1: [data-h2h-play-intro="stage1"] mounted at hold_select pre-tap`,
    stage1Snap.stage1Mounted === true,
  );
  record(
    `S3 Stage 1: paragraph has non-empty text content`,
    stage1Snap.stage1NonEmpty === true,
  );
  record(
    `S3 Stage 1: Stage 2 element NOT mounted pre-tap`,
    stage1Snap.stage2Mounted === false,
  );
  record(
    `S3 Stage 1: existing instructional headline displaced`,
    stage1Snap.headlineMounted === false,
  );

  // Polish #11 (docs/11-preview-then-hold-design-lock.md §3): tap on a
  // non-previewed cell sets preview; tap again on the same cell holds.
  // So confirming hold of slot 2 requires TWO taps.
  await page.locator(`[data-h2h-play-bottom-cell="2"]`).click();
  await page.waitForTimeout(50); // React commit (preview-only)
  await page.locator(`[data-h2h-play-bottom-cell="2"]`).click();
  await page.waitForTimeout(50); // React commit (hold)
  const hBadgeCountAfterTap = await page.locator(hBadgeSelectorBottom).count();
  record(
    `H badge count == 1 on bottom strip after tap-tap on slot 2 (Polish #11 preview-then-hold)`,
    hBadgeCountAfterTap === 1,
    `count=${hBadgeCountAfterTap}`,
  );

  // Phase 5c S3 — Stage 1 → Stage 2 swap on first hold-tap. held.size
  // is now 1; Stage 1 collapses, Stage 2 (deal nudge) takes its place.
  const stage2Snap = await page.evaluate(() => {
    const stage1 = document.querySelector('[data-h2h-play-intro="stage1"]');
    const stage2 = document.querySelector('[data-h2h-play-intro="stage2"]');
    return {
      stage1Mounted: !!stage1,
      stage2Mounted: !!stage2,
      stage2NonEmpty: (stage2?.textContent ?? "").trim().length > 0,
    };
  });
  record(
    `S3 Stage 2: [data-h2h-play-intro="stage2"] mounted after first hold-tap`,
    stage2Snap.stage2Mounted === true,
  );
  record(
    `S3 Stage 2: Stage 1 element collapsed after first hold-tap`,
    stage2Snap.stage1Mounted === false,
  );
  record(
    `S3 Stage 2: deal nudge has non-empty text content`,
    stage2Snap.stage2NonEmpty === true,
  );
  const hBadgeInsideCell2 = await page
    .locator(`[data-h2h-play-bottom-cell="2"] svg polygon[fill="#F5C850"]`)
    .count();
  record(
    `H badge is inside cell 2 specifically (Fix 1 regression-lock)`,
    hBadgeInsideCell2 === 1,
    `count_in_cell_2=${hBadgeInsideCell2}`,
  );
  // Untap → 0 badges. Under #11, slot 2 is currently previewed AND held,
  // so a single tap on it unholds (it's the already-previewed card).
  await page.locator(`[data-h2h-play-bottom-cell="2"]`).click();
  await page.waitForTimeout(50);
  const hBadgeCountAfterUntap = await page.locator(hBadgeSelectorBottom).count();
  record(
    `H badge count == 0 after untap on slot 2 (Polish #11 third-tap unholds)`,
    hBadgeCountAfterUntap === 0,
    `count=${hBadgeCountAfterUntap}`,
  );

  // ── Hold 2 cards before Draw — pin C/D fixed (badges + score at reveal). ──
  // After the untap above the state is: previewedSlotIndex=2, held=∅.
  //   Step 1: tap slot 2 → slot 2 is the already-previewed cell, not held
  //           → flips to held. State: previewed=2, held={2}.
  //   Step 2: tap slot 5 → slot 5 not previewed → moves preview to 5.
  //   Step 3: tap slot 5 again → slot 5 is now the previewed cell, not
  //           held → flips to held. State: previewed=5, held={2,5}.
  await page.locator(`[data-h2h-play-bottom-cell="2"]`).click();
  await page.waitForTimeout(20);
  await page.locator(`[data-h2h-play-bottom-cell="5"]`).click();
  await page.waitForTimeout(20);
  await page.locator(`[data-h2h-play-bottom-cell="5"]`).click();
  await page.waitForTimeout(50);
  const hBadgeCountTwoHeld = await page.locator(hBadgeSelectorBottom).count();
  record(
    `H badge count == 2 after holding slots 2 and 5 (multi-hold tap)`,
    hBadgeCountTwoHeld === 2,
    `count=${hBadgeCountTwoHeld}`,
  );

  // ── State 3: tap Draw → column-flip pass ──
  await page.click("[data-h2h-play-cta][data-cta-label='Draw']");
  const totalColumnFlipMs = ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
  await page.waitForTimeout(totalColumnFlipMs + 100);

  // Sender faces inside top-zone cells at column-pass end.
  const topZoneRect_s3 = await page.locator(`[data-h2h-board-zone="top"]`).boundingBox();
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const cellHandle = page.locator(`[data-h2h-play-top-cell="${i}"]`);
    const frontHandle = cellHandle.locator("[data-h2h-play-top-front]");
    const cellRect = await cellHandle.boundingBox();
    const frontCount = await frontHandle.count();
    if (frontCount === 0) {
      record(`top cell ${i} sender face mounted at column-pass end`, false, "no [data-h2h-play-top-front] mounted");
      continue;
    }
    const frontRect = await frontHandle.boundingBox();
    record(`top cell ${i} sender face rect inside cell rect`, rectContains(cellRect, frontRect), `cell=${fmtRect(cellRect)} front=${fmtRect(frontRect)}`);
    record(`top cell ${i} inside top zone`, rectContains(topZoneRect_s3, cellRect));
  }

  // Capture rects at end of S3 (just before handoff_resolving → arc) for the
  // no-shift check.
  const topRect_s3 = await page.locator(`[data-h2h-board-zone="top"]`).boundingBox();
  const bottomRect_s3 = await page.locator(`[data-h2h-board-zone="bottom"]`).boundingBox();
  const heroRect_s3 = await page.locator(`[data-h2h-board-zone="hero"]`).boundingBox();
  const topLabel_s3 = (await page.locator(`[data-h2h-board-zone-label="top"]`).first().textContent())?.trim().toUpperCase() ?? "";
  const bottomLabel_s3 = (await page.locator(`[data-h2h-board-zone-label="bottom"]`).first().textContent())?.trim().toUpperCase() ?? "";

  // ── Mid handoff_resolving (#3 VS treatment) ─────────────────────
  // The 800ms pre-reveal hold opens with state="handoff_resolving" and
  // the playing-mode hero zone showing the VS treatment (weight-900 "VS"
  // + "Comparing…" sub-label) IN PLACE of the prior "Calculating…" copy.
  // Sample atomically ~300ms into the beat — well inside the 800ms
  // window and BEFORE the arc-composite crossfade starts. Asserts:
  //   (a) state IS handoff_resolving (we're in the right window)
  //   (b) [data-h2h-play-vs] is present with text "VSComparing…"
  //   (c) the VS glyph reads "VS" and is rendered with size ≥ 40px +
  //       opacity ≥ 0.9 (no rendered-but-invisible regressions)
  //   (d) the VS block has a non-zero bounding box (not collapsed)
  //   (e) the headline div is NOT mounted (lifted-out structure: VS is
  //       a sibling, not a child of the headline wrapper)
  await page.waitForTimeout(300);
  const vsSnap = await page.evaluate(() => {
    const root = document.querySelector("[data-h2h-recipient-play]");
    const vs = document.querySelector("[data-h2h-play-vs]");
    const glyph = document.querySelector("[data-h2h-play-vs-glyph]");
    const sub = document.querySelector("[data-h2h-play-vs-sub]");
    const headline = document.querySelector("[data-h2h-play-headline]");
    const vsRect = vs?.getBoundingClientRect();
    const glyphCs = glyph ? getComputedStyle(glyph) : null;
    return {
      state: root?.getAttribute("data-playing-state"),
      vsPresent: !!vs,
      vsText: vs?.textContent ?? null,
      vsBoxWidth: vsRect?.width ?? 0,
      vsBoxHeight: vsRect?.height ?? 0,
      glyphText: glyph?.textContent ?? null,
      glyphFontSize: glyphCs ? parseFloat(glyphCs.fontSize) : 0,
      glyphFontWeight: glyphCs?.fontWeight ?? null,
      glyphOpacity: glyphCs ? parseFloat(glyphCs.opacity) : 0,
      glyphVisibility: glyphCs?.visibility ?? null,
      subText: sub?.textContent ?? null,
      headlineMounted: !!headline,
    };
  });
  record(
    `#3 VS: state is "handoff_resolving" during pre-reveal beat`,
    vsSnap.state === "handoff_resolving",
    `state="${vsSnap.state}"`,
  );
  record(
    `#3 VS: [data-h2h-play-vs] element present`,
    vsSnap.vsPresent === true,
  );
  record(
    `#3 VS: text content = "VSComparing…"`,
    vsSnap.vsText === "VSComparing…",
    `text="${vsSnap.vsText}"`,
  );
  record(
    `#3 VS: glyph text === "VS"`,
    vsSnap.glyphText === "VS",
    `glyph="${vsSnap.glyphText}"`,
  );
  record(
    `#3 VS: glyph fontSize >= 40px (catches collapse-to-inherited-22)`,
    vsSnap.glyphFontSize >= 40,
    `fontSize=${vsSnap.glyphFontSize}`,
  );
  record(
    `#3 VS: glyph computed visibility=visible + opacity >= 0.9`,
    vsSnap.glyphVisibility === "visible" && vsSnap.glyphOpacity >= 0.9,
    `visibility="${vsSnap.glyphVisibility}" opacity=${vsSnap.glyphOpacity}`,
  );
  record(
    `#3 VS: bounding box width >= 60px AND height >= 60px (not collapsed)`,
    vsSnap.vsBoxWidth >= 60 && vsSnap.vsBoxHeight >= 60,
    `w=${vsSnap.vsBoxWidth} h=${vsSnap.vsBoxHeight}`,
  );
  record(
    `#3 VS: sub-label "Comparing…" present`,
    vsSnap.subText === "Comparing…",
    `sub="${vsSnap.subText}"`,
  );
  record(
    `#3 VS: headline div NOT mounted during handoff_resolving (VS is a sibling)`,
    vsSnap.headlineMounted === false,
    `headlineMounted=${vsSnap.headlineMounted}`,
  );

  // ── State 4 (arc): Fix C2 single canvas + S3→S4 no-shift ──
  // Already 300ms into handoff_resolving — finish the remaining hold +
  // composite crossfade window so the arc has fully landed.
  await page.waitForTimeout(PRE_REVEAL_HOLD_MS - 300 + ARC_COMPOSITE_CROSSFADE_MS + 200);

  const playStateArc = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`state="arc" reached (got "${playStateArc}")`, playStateArc === "arc");

  const playingMounted = (await page.locator("[data-h2h-recipient-play]").count()) === 1;
  record("Fix C2: playing canvas root STAYS mounted at arc state", playingMounted);

  const revealDescendant = await page.locator("[data-h2h-recipient-play] [data-h2h-recipient-reveal]").count();
  record("Fix C2: reveal mounted as descendant of playing root (single canvas)", revealDescendant >= 1);

  const revealSibling = await page.evaluate(() => {
    const playing = document.querySelector("[data-h2h-recipient-play]");
    const allReveals = Array.from(document.querySelectorAll("[data-h2h-recipient-reveal]"));
    return allReveals.filter((r) => !playing?.contains(r)).length;
  });
  record("Fix C2: no reveal mounted OUTSIDE the playing root", revealSibling === 0);

  const innerOpacity = await page.locator("[data-h2h-play-inner]").evaluate((el) => getComputedStyle(el).opacity);
  record("playing inner content faded to opacity 0", parseFloat(innerOpacity) === 0, `opacity=${innerOpacity}`);

  // S3→S4 NO LAYOUT SHIFT — top/bottom/hero zone rects unchanged.
  // After arc-composite, the reveal's zones are descendants of the playing
  // root; the reveal's reduced markers + the playing canvas's markers
  // coexist. Query the OUTERMOST [data-h2h-board-zone] hits which belong
  // to the still-mounted playing shell (those are the ones whose rect we
  // captured in S3 above) — locator.first() will resolve to the first match
  // in DOM order which is the playing-shell zone.
  const topRect_arc = await page.locator(`[data-h2h-board-zone="top"]`).first().boundingBox();
  const bottomRect_arc = await page.locator(`[data-h2h-board-zone="bottom"]`).first().boundingBox();
  const heroRect_arc = await page.locator(`[data-h2h-board-zone="hero"]`).first().boundingBox();
  const topLabel_arc = (await page.locator(`[data-h2h-board-zone-label="top"]`).first().textContent())?.trim().toUpperCase() ?? "";
  const bottomLabel_arc = (await page.locator(`[data-h2h-board-zone-label="bottom"]`).first().textContent())?.trim().toUpperCase() ?? "";

  // hold_select vertical-budget fix (lock §4 invariant, 2026-06-01):
  // the "no-shift across hold_select ↔ reveal" rule from doc EDIT B2
  // was a load-bearing contract for #11 and earlier. After the budget
  // fix, hold_select INTENTIONALLY compresses (collapsed opponent
  // strip, reduced hero floor, fluid intro budget) to fit the recipient
  // strip + CTA on real iOS viewports. The compression unwinds (via
  // the shell's min-height transition synced to COLUMN_FLIP_DURATION_MS)
  // as state transitions out of hold_select, so by the time S4 (arc)
  // is reached the layout is fully restored. The new invariant is
  // S1 (pre_deal) ↔ S4 (arc): both share the un-compressed layout, so
  // zone rects must match across them.
  //
  // S1↔S3 and S3↔S4 zone-equality assertions are intentionally NOT
  // asserted post-fix because S3 (hold_select) is by-design smaller.
  record(`S1↔S4 top zone rect unchanged ±1px`, rectMatches(topRect_s1, topRect_arc), `s1=${fmtRect(topRect_s1)} arc=${fmtRect(topRect_arc)}`);
  record(`S1↔S4 bottom zone rect unchanged ±1px`, rectMatches(bottomRect_s1, bottomRect_arc), `s1=${fmtRect(bottomRect_s1)} arc=${fmtRect(bottomRect_arc)}`);
  record(`S1↔S4 hero region rect unchanged ±1px`, rectMatches(heroRect_s1, heroRect_arc), `s1=${fmtRect(heroRect_s1)} arc=${fmtRect(heroRect_arc)}`);
  record(`S1↔S4 top label unchanged`, topLabel_s1 === topLabel_arc, `s1="${topLabel_s1}" arc="${topLabel_arc}"`);
  record(`S1↔S4 bottom label unchanged`, bottomLabel_s1 === bottomLabel_arc, `s1="${bottomLabel_s1}" arc="${bottomLabel_arc}"`);

  // Suppress unused-variable warning for the S3-zone captures (kept
  // for future diagnostic logging).
  void topRect_s3; void bottomRect_s3; void heroRect_s3;
  void topLabel_s3; void bottomLabel_s3;

  // ── C/D regression-locks (post-FIX 1/2) — reveal-side end-state ──
  // Wait long enough for the full per-matchup reveal arc to complete.
  // Six matchups × ~600ms each, plus end-hold buffer. The harness used
  // ~6s of holds before reaching here, so the arc may already be near
  // end-state; we poll for the recipient TeamScore reading > 0 with a
  // generous timeout.
  await page.waitForFunction(
    () => {
      const reveals = document.querySelectorAll(`[data-h2h-recipient-reveal] [data-h2h-team-score]`);
      if (reveals.length < 2) return false;
      // Recipient score = second [data-h2h-team-score] inside the reveal.
      const recipientEl = reveals[1];
      const display = recipientEl.getAttribute("data-h2h-team-score-display");
      const n = parseFloat(display ?? "0");
      return Number.isFinite(n) && n > 0;
    },
    {},
    { timeout: 15000 },
  ).then(
    () => {
      // C/D regression-lock #1: recipient score > 0 at state="arc" end.
      record(`C/D: recipient TeamScore > 0 at reveal end-state`, true);
    },
    () => {
      // Failure path — still capture what we can for diagnostics.
      record(
        `C/D: recipient TeamScore > 0 at reveal end-state`,
        false,
        `recipient score never exceeded 0 within timeout`,
      );
    },
  );

  // C/D regression-lock #2: ≥2 H badges in the recipient's reveal strip
  // (we held slots 2 and 5 before Draw — both should be HOLD at reveal).
  // Target the bottom zone INSIDE the reveal (recipient's strip) so we
  // don't conflate with the top (sender) strip's wasHeld badges, which
  // come from a different data path.
  const revealRecipientHBadgeCount = await page
    .locator(`[data-h2h-recipient-reveal] [data-h2h-board-zone="bottom"] svg polygon[fill="#F5C850"]`)
    .count();
  record(
    `C/D: ≥2 H badges on recipient reveal strip (2 cards were held pre-Draw)`,
    revealRecipientHBadgeCount >= 2,
    `count=${revealRecipientHBadgeCount}`,
  );

  // ── #4 regression-lock (2026-05-30): strip LAYOUT = slotIndex, not revealOrder ──
  // We held slots 2 and 5 pre-Draw. With the strip-sort fix, the H-badged
  // cells must remain at DOM-positions 2 and 5 in the recipient reveal
  // strip — NOT clustered at the rightmost positions (which would happen
  // if revealOrder drove spatial layout: held cards go last in time, so
  // a `[...revealOrder]` spread placed them at indices 4 and 5).
  //
  // Strategy: walk the recipient strip's mini-cells in DOM order, record
  // which contain an H-badge polygon, and check rect.x ordering. Asserts:
  //   (a) H-badge cells at DOM-indices {2, 5} (slotIndex layout), NOT
  //       DOM-indices {4, 5} (revealOrder layout).
  //   (b) Cell rect.x strictly increases left-to-right (sanity: no
  //       cells overlap, layout is a horizontal strip).
  const recipientMiniCells = await page
    .locator(`[data-h2h-recipient-reveal] [data-h2h-hand-strip][data-side="recipient"] [data-h2h-mini-cell="true"]`)
    .all();
  const cellInfo = [];
  for (const cell of recipientMiniCells) {
    const rect = await cell.boundingBox();
    const hBadgeCount = await cell.locator(`svg polygon[fill="#F5C850"]`).count();
    cellInfo.push({ rect, hasHBadge: hBadgeCount > 0 });
  }
  record(
    `#4: recipient reveal strip mounts exactly ${ROSTER_SIZE} mini-cells`,
    cellInfo.length === ROSTER_SIZE,
    `count=${cellInfo.length}`,
  );
  const heldDomIndices = cellInfo
    .map((info, i) => (info.hasHBadge ? i : -1))
    .filter((i) => i >= 0);
  record(
    `#4: held cells at DOM-indices {2, 5} (slotIndex layout) — NOT {4, 5} (revealOrder layout)`,
    heldDomIndices.length === 2 && heldDomIndices[0] === 2 && heldDomIndices[1] === 5,
    `got DOM-indices=${JSON.stringify(heldDomIndices)}`,
  );
  // Sanity: strictly-increasing rect.x left-to-right.
  let strictlyIncreasing = true;
  for (let i = 1; i < cellInfo.length; i++) {
    if (!cellInfo[i].rect || !cellInfo[i - 1].rect) { strictlyIncreasing = false; break; }
    if (cellInfo[i].rect.x <= cellInfo[i - 1].rect.x) { strictlyIncreasing = false; break; }
  }
  record(
    `#4: recipient strip cells render in strict left-to-right order`,
    strictlyIncreasing,
    `xs=${JSON.stringify(cellInfo.map((c) => c.rect ? Math.round(c.rect.x) : null))}`,
  );
  // The two held cells' rect.x positions should match their slotIndex
  // positions on the strip (cell-2.x and cell-5.x), not be shoved to
  // the right two slots.
  if (cellInfo.length === ROSTER_SIZE) {
    const heldXs = heldDomIndices.map((i) => cellInfo[i].rect?.x ?? null);
    const slot2x = cellInfo[2].rect?.x ?? null;
    const slot5x = cellInfo[5].rect?.x ?? null;
    record(
      `#4: held-cell rect.x positions == slot2/slot5 cell rect.x (±1px)`,
      heldXs.length === 2 &&
        slot2x != null && slot5x != null &&
        Math.abs(heldXs[0] - slot2x) <= 1 &&
        Math.abs(heldXs[1] - slot5x) <= 1,
      `heldXs=${JSON.stringify(heldXs)} slot2x=${slot2x} slot5x=${slot5x}`,
    );
  }

  await page.close();
}

// ── hold_select vertical-budget viewport sweep (lock §5 + §6) ────────
//
// For each (viewport, safe-area) tuple, drive the surface into
// hold_select and step through the tap states (preview / first-hold /
// move / multi-hold / unhold). After each step capture rects and assert
// either §5a (above the comfortable floor: no scroll, recipient strip +
// CTA contained within the viewport) or §5b (at/below the floor:
// CTA pinned sticky + bottom strip reachable via scroll).
//
// Adaptation is automatic: §5a vs §5b is decided per-state by reading
// whether the inner column is scrollable. No hard pixel threshold; the
// floor falls where the fluid sizing's lower bound runs out of room.

const HS_TAP_STATES = [
  { id: "HS-0", label: "baseline (post-deal)",            tapSelector: null },
  { id: "HS-1", label: "preview (tap slot 2)",            tapSelector: '[data-h2h-play-bottom-cell="2"]' },
  { id: "HS-2", label: "first-hold (tap slot 2 again)",   tapSelector: '[data-h2h-play-bottom-cell="2"]' },
  { id: "HS-3", label: "move (tap slot 5)",               tapSelector: '[data-h2h-play-bottom-cell="5"]' },
  { id: "HS-4", label: "multi-hold (tap slot 5 again)",   tapSelector: '[data-h2h-play-bottom-cell="5"]' },
  { id: "HS-5", label: "unhold (tap slot 5 a third time)",tapSelector: '[data-h2h-play-bottom-cell="5"]' },
];

async function injectSafeArea(page, safeTop, safeBottom) {
  // The shell uses calc(env(safe-area-inset-*, 0px) + 20px) for top
  // and bottom paddings. env() is a CSS function with no JS-overridable
  // hook; we replace the consumer's padding directly.
  await page.addStyleTag({
    content: `
      [data-h2h-board-shell] {
        padding-top: ${safeTop + OUTER_PAD_EXTRA_PX}px !important;
        padding-bottom: ${safeBottom + OUTER_PAD_EXTRA_PX}px !important;
      }
    `,
  });
  await page.waitForTimeout(30);
}

async function captureHoldSelectRects(page) {
  return page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const inner = document.querySelector("[data-h2h-board-inner]");
    const innerInfo = inner
      ? {
          scrollTop: inner.scrollTop,
          scrollHeight: inner.scrollHeight,
          clientHeight: inner.clientHeight,
          overflowingY: inner.scrollHeight - inner.clientHeight > 1,
        }
      : null;
    return {
      topZone: get('[data-h2h-board-zone="top"]'),
      topStrip: get('[data-h2h-play-top-strip]'),
      bottomZone: get('[data-h2h-board-zone="bottom"]'),
      bottomStrip: get('[data-h2h-play-bottom-strip]'),
      cta: get('[data-h2h-play-cta]'),
      previewEmpty: get('[data-h2h-play-preview="empty"]'),
      previewCard: get('[data-h2h-play-preview="card"]'),
      hero: get('[data-h2h-board-zone="hero"]'),
      innerInfo,
    };
  });
}

async function scrollInnerTo(page, where /* "top" | "bottom" */) {
  await page.evaluate((target) => {
    const inner = document.querySelector("[data-h2h-board-inner]");
    if (!inner) return;
    inner.scrollTo({
      top: target === "bottom" ? inner.scrollHeight : 0,
      behavior: "instant",
    });
  }, where);
  await page.waitForTimeout(30);
}

async function runHoldSelectViewportSweep(browser, vp) {
  const tag = `[sweep ${vp.label}]`;
  console.log(`\n${tag} starting`);
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on("pageerror", (err) => console.error(`${tag}[pageerror]`, err.message));

  try {
    await page.goto(PLAY_URL, { waitUntil: "networkidle", timeout: 30000 });
  } catch (err) {
    console.error(`${tag} FAIL — could not load ${PLAY_URL}: ${err.message}`);
    await page.close();
    record(`${vp.label}: page load`, false, err.message);
    return;
  }
  await page.waitForSelector("[data-h2h-recipient-play]", { timeout: 10000 });

  // Inject the iOS safe-area-inset values this device class would
  // report. The pre-fix da5af3b layout depends on safe-area being 0
  // (Playwright default); injecting realistic values reproduces the
  // real-device overflow that the bug exhibits.
  await injectSafeArea(page, vp.safeTop, vp.safeBottom);

  // Drive deal cascade → hold_select.
  await page.click("[data-h2h-play-cta][data-cta-label='Deal']");
  await page.waitForTimeout(DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 2));
  // Settle the hold_select transitions (top-strip height 80→0; hero
  // floor full→reduced; opacity 1→0). All three animate over
  // COLUMN_FLIP_DURATION_MS = 250ms; add a small buffer so the layout
  // is fully at rest before HS-0 captures rects.
  await page.waitForTimeout(COLUMN_FLIP_DURATION_MS + 100);
  const stateAtHoldSelect = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`${vp.label}: hold_select reached after deal cascade`, stateAtHoldSelect === "hold_select", `state="${stateAtHoldSelect}"`);
  if (stateAtHoldSelect !== "hold_select") {
    await page.close();
    return;
  }

  // Step through the 6 tap states; assert §5a (no-scroll fit) or §5b
  // (scroll fallback) per state.
  for (const ts of HS_TAP_STATES) {
    if (ts.tapSelector) {
      await page.locator(ts.tapSelector).click();
      await page.waitForTimeout(50);
    }
    const rects = await captureHoldSelectRects(page);
    const ctaBottom = rects.cta ? rects.cta.y + rects.cta.height : null;
    const stripBottom = rects.bottomStrip ? rects.bottomStrip.y + rects.bottomStrip.height : null;
    const topZoneTop = rects.topZone ? rects.topZone.y : null;
    const scrollable = rects.innerInfo?.overflowingY === true;
    const fitLabel = scrollable ? "§5b scroll fallback" : "§5a no-scroll fit";
    const stateLabel = `${vp.label} ${ts.id} ${ts.label} ${fitLabel}`;

    if (!scrollable) {
      // §5a: content fits without scroll. All three containment + the
      // no-scroll assertion must hold.
      record(
        `${stateLabel}: recipient-strip.bottom <= vh`,
        stripBottom !== null && stripBottom <= vp.height + 1,
        `stripBottom=${Math.round(stripBottom)} vh=${vp.height}`,
      );
      record(
        `${stateLabel}: CTA.bottom <= vh`,
        ctaBottom !== null && ctaBottom <= vp.height + 1,
        `ctaBottom=${Math.round(ctaBottom)} vh=${vp.height}`,
      );
      record(
        `${stateLabel}: top-zone.top >= 0`,
        topZoneTop !== null && topZoneTop >= -1,
        `topZoneTop=${Math.round(topZoneTop)}`,
      );
      record(
        `${stateLabel}: inner does NOT scroll`,
        !scrollable,
        `scrollH=${rects.innerInfo?.scrollHeight} clientH=${rects.innerInfo?.clientHeight}`,
      );
    } else {
      // §5b: content exceeds inner height; scroll engages. CTA must
      // remain pinned (sticky bottom 0) at scrollTop=0 AND at
      // scrollTop=max. Recipient strip must be reachable in the scroll.
      await scrollInnerTo(page, "top");
      const rectsAtTop = await captureHoldSelectRects(page);
      const ctaBottomTop = rectsAtTop.cta ? rectsAtTop.cta.y + rectsAtTop.cta.height : null;
      record(
        `${stateLabel}: CTA pinned (bottom <= vh) at scrollTop=0`,
        ctaBottomTop !== null && ctaBottomTop <= vp.height + 1,
        `ctaBottom=${Math.round(ctaBottomTop)} vh=${vp.height}`,
      );

      await scrollInnerTo(page, "bottom");
      const rectsAtBottom = await captureHoldSelectRects(page);
      const ctaBottomBottom = rectsAtBottom.cta ? rectsAtBottom.cta.y + rectsAtBottom.cta.height : null;
      record(
        `${stateLabel}: CTA pinned (bottom <= vh) at scrollTop=max`,
        ctaBottomBottom !== null && ctaBottomBottom <= vp.height + 1,
        `ctaBottom=${Math.round(ctaBottomBottom)} vh=${vp.height}`,
      );

      // Recipient strip reachable: scroll it into view and assert it
      // lands fully on-screen at that scroll position.
      const stripReachable = await page.evaluate(() => {
        const strip = document.querySelector('[data-h2h-play-bottom-strip]');
        if (!strip) return { ok: false, reason: "strip not in DOM" };
        strip.scrollIntoView({ block: "center", behavior: "instant" });
        const r = strip.getBoundingClientRect();
        return { ok: r.top >= -1 && r.bottom <= window.innerHeight + 1, top: r.top, bottom: r.bottom, vh: window.innerHeight };
      });
      record(
        `${stateLabel}: bottom strip reachable in scroll`,
        stripReachable.ok,
        JSON.stringify(stripReachable),
      );

      await scrollInnerTo(page, "top");
    }
  }
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (MODE_BASELINE) {
      await runBaselineCapture(browser);
      console.log("\nDone (baseline capture mode).");
      process.exit(0);
    }
    if (!MODE_PLAY_ONLY) {
      await runRevealBaselineCheck(browser);
    }
    await runPlayHarness(browser);
    // Multi-viewport hold_select sweep (lock §5/§6). Runs across the
    // device-class matrix with safe-area injection per viewport.
    for (const vp of HS_SWEEP_VIEWPORTS) {
      await runHoldSelectViewportSweep(browser, vp);
    }
  } finally {
    await browser.close();
  }
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
