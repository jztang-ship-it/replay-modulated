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
// Layout A/B restructure: ab_transition beat is ~300ms (design-lock §9,
// AB_TRANSITION_DURATION_MS in H2HRecipientPlay.tsx).
const AB_TRANSITION_DURATION_MS = 300;
const COLUMN_FLIP_INTERSTITIAL_MS = 150;
// Layout A/B restructure: settle-pause bumped 800 → 1000ms per
// design-lock §9 (replaces the prior VS / Ready-Set-Go beat).
const PRE_REVEAL_HOLD_MS = 1000;
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

  // ── Initial state: Layout A composition (deal_in auto-advance) ──
  // Layout A/B restructure (design-lock §1): pre_deal is killed. The
  // playing root mounts; the loading → deal_in auto-advance fires
  // inside the useEffect chain that React commits during the first
  // render. By the time the playing-root selector resolves and the
  // attribute is read, we should be in deal_in (the cascade is firing).
  await page.waitForSelector("[data-h2h-recipient-play]", { timeout: 5000 });
  const playStateInitial = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  // pre_deal is killed (design-lock §1). The cascade can have already
  // fired by the time the selector resolves; what's load-bearing here is
  // that we're NOT in pre_deal — any Layout A sub-state is fine.
  const layoutAStates = ["loading", "deal_in", "hold_select"];
  record(
    `initial: playing root mounted in a Layout A state (NOT pre_deal) (got "${playStateInitial}")`,
    layoutAStates.includes(playStateInitial),
  );
  record(`initial: NO "Deal" CTA (pre_deal killed)`,
    (await page.locator("[data-h2h-play-cta][data-cta-label='Deal']").count()) === 0,
  );

  // Framed-board presence — top, bottom, hero zones all present
  // throughout Layout A.
  const topZoneCount_s1 = await page.locator(`[data-h2h-board-zone="top"]`).count();
  const bottomZoneCount_s1 = await page.locator(`[data-h2h-board-zone="bottom"]`).count();
  const heroZoneCount_s1 = await page.locator(`[data-h2h-board-zone="hero"]`).count();
  record("Layout A framed board: top zone present", topZoneCount_s1 >= 1);
  record("Layout A framed board: bottom zone present", bottomZoneCount_s1 >= 1);
  record("Layout A framed board: hero region present", heroZoneCount_s1 >= 1);

  // Labels — opponent name top, literal "YOU" bottom (design-lock §5).
  const topLabel_s1 = (await page.locator(`[data-h2h-board-zone-label="top"]`).first().textContent())?.trim().toUpperCase() ?? "";
  const bottomLabel_s1 = (await page.locator(`[data-h2h-board-zone-label="bottom"]`).first().textContent())?.trim().toUpperCase() ?? "";
  record(`Layout A top label contains "${CHALLENGER_NAME.toUpperCase()}"`, topLabel_s1.includes(CHALLENGER_NAME.toUpperCase()), `label="${topLabel_s1}"`);
  record(`Layout A bottom label is literal "YOU" (design-lock §5)`, bottomLabel_s1 === "YOU", `label="${bottomLabel_s1}"`);

  // Opponent strip is ABSENT in Layout A (collapsed wrapper).
  const topStripCollapsed_init = await page
    .locator(`[data-h2h-play-top-strip]`)
    .getAttribute("data-h2h-play-top-strip-collapsed");
  record(`Layout A: opponent strip wrapper is collapsed`, topStripCollapsed_init === "true");

  // Capture top/bottom/hero zone rects at initial Layout A entry.
  // (No longer used for the obsolete S1↔S4 no-shift assertion — kept
  // for diagnostic logging in failure cases.)
  void await page.locator(`[data-h2h-board-zone="top"]`).boundingBox();
  void await page.locator(`[data-h2h-board-zone="bottom"]`).boundingBox();
  void await page.locator(`[data-h2h-board-zone="hero"]`).boundingBox();

  // ── hold_select (Layout A) after auto-cascade ──
  await page.waitForTimeout(DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 2));
  // Settle hold_select transitions — the hero floor + collapsed-strip
  // animations are scoped to Layout A budgeting; the bottom strip's
  // flex-positioned y races the absolute-positioned front-face's
  // reported y until the transitions complete.
  await page.waitForTimeout(COLUMN_FLIP_DURATION_MS + 100);
  const playStateAfterDeal = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`hold_select reached after auto-cascade (got "${playStateAfterDeal}")`, playStateAfterDeal === "hold_select");

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

  // ── Bug-1 baseline: capture strip Y at hold_select PRE-Draw ─────
  // Used by the post-Draw and mid-flip assertions below to confirm
  // the recipient mini-strip is FROZEN at its hold_select Y through
  // hold_select → redraw_running → your_redraw_flip. The deliberate
  // slide fires only at ab_transition (asserted further down).
  const stripHoldSelectRect = await page
    .locator("[data-h2h-play-bottom-strip]")
    .boundingBox();

  // ── Draw → your_redraw_flip pass (Layout A/B restructure §3 step 2) ─
  await page.click("[data-h2h-play-cta][data-cta-label='Draw']");
  // Bug-1 immediate sample: strip Y at the FIRST commit after Draw.
  // State is typically redraw_running for a microtask then transitions
  // to your_redraw_flip on the next React batch (real-browser fires the
  // first column timer at delay=0). Either state is Layout A and must
  // hold the strip at hold_select Y.
  await page.waitForTimeout(20);
  const postDrawSnap = await page.evaluate(() => {
    const root = document.querySelector("[data-h2h-recipient-play]");
    const strip = document.querySelector("[data-h2h-play-bottom-strip]");
    const r = strip?.getBoundingClientRect();
    return {
      state: root?.getAttribute("data-playing-state"),
      stripTop: r?.top ?? null,
      stripBottom: r?.bottom ?? null,
    };
  });
  record(
    `Bug-1 frozen-strip: hold_select → ${postDrawSnap.state} strip Y UNCHANGED ±1px (no jump on Draw)`,
    stripHoldSelectRect != null &&
      postDrawSnap.stripTop != null &&
      Math.abs(stripHoldSelectRect.y - postDrawSnap.stripTop) <= 1,
    `hs.top=${stripHoldSelectRect?.y} post.top=${postDrawSnap.stripTop} state="${postDrawSnap.state}"`,
  );

  const totalColumnFlipMs = ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
  // Mid-pass: the opponent strip MUST remain collapsed (Layout A
  // invariant — design-lock §3 step 2 isolates your-flip from
  // opponent-appear). Sample halfway through.
  const midWaitMs = Math.floor(totalColumnFlipMs / 2);
  // We already burned 20ms on the post-Draw sample above; account for
  // that so the mid-pass sample lands at the same relative point in
  // the column-flip window.
  await page.waitForTimeout(midWaitMs - 20);
  const mid = await page.evaluate(() => {
    const root = document.querySelector("[data-h2h-recipient-play]");
    const wrapper = document.querySelector("[data-h2h-play-top-strip]");
    const strip = document.querySelector("[data-h2h-play-bottom-strip]");
    const stripRect = strip?.getBoundingClientRect();
    return {
      state: root?.getAttribute("data-playing-state"),
      collapsed: wrapper?.getAttribute("data-h2h-play-top-strip-collapsed"),
      stripOpacity: wrapper ? getComputedStyle(wrapper).opacity : null,
      stripTop: stripRect?.top ?? null,
      stripBottom: stripRect?.bottom ?? null,
    };
  });
  record(
    `your_redraw_flip mid-pass: state IS your_redraw_flip`,
    mid.state === "your_redraw_flip",
    `state="${mid.state}"`,
  );
  record(
    `your_redraw_flip mid-pass: opponent strip STAYS collapsed (no flip / no appear)`,
    mid.collapsed === "true" && parseFloat(mid.stripOpacity ?? "1") < 0.1,
    `collapsed=${mid.collapsed} opacity=${mid.stripOpacity}`,
  );
  // Bug-1 mid-flip sample: strip Y still pinned to hold_select Y.
  record(
    `Bug-1 frozen-strip: mid your_redraw_flip strip Y UNCHANGED ±1px vs hold_select`,
    stripHoldSelectRect != null &&
      mid.stripTop != null &&
      Math.abs(stripHoldSelectRect.y - mid.stripTop) <= 1,
    `hs.top=${stripHoldSelectRect?.y} mid.top=${mid.stripTop}`,
  );
  // Walk from mid-pass to end-of-your_redraw_flip / start-of-ab_transition.
  // Total wait since Draw click = midWaitMs + (totalColumnFlipMs - midWaitMs)
  //                              = totalColumnFlipMs.
  await page.waitForTimeout(totalColumnFlipMs - midWaitMs);
  // Sample LATE in the 300ms ab_transition window so the CSS
  // height/opacity transition on the opponent-strip wrapper has
  // played out — the "end-state" of the transition, not the start.
  await page.waitForTimeout(AB_TRANSITION_DURATION_MS - 50);

  // ── ab_transition end-state snapshot (design-lock §3 step 3) ─────
  // At ~250ms into the 300ms beat: opponent strip wrapper is no
  // longer marked collapsed and its CSS transitions are essentially
  // complete (height near 80px, opacity near 1). The hero region's
  // min-height transition has also nearly completed (recipient strip
  // slid down naturally as the hero expanded). Both empty hero slots
  // are rendering ([data-h2h-play-settle-hero-slot]).
  const abSnap = await page.evaluate(() => {
    const root = document.querySelector("[data-h2h-recipient-play]");
    const wrapper = document.querySelector("[data-h2h-play-top-strip]");
    const settleHero = document.querySelector("[data-h2h-play-settle-hero]");
    const opSlot = document.querySelector('[data-h2h-play-settle-hero-slot="opponent"]');
    const youSlot = document.querySelector('[data-h2h-play-settle-hero-slot="you"]');
    const cs = wrapper ? getComputedStyle(wrapper) : null;
    const topZone = document.querySelector('[data-h2h-board-zone="top"]');
    const bottomZone = document.querySelector('[data-h2h-board-zone="bottom"]');
    const heroZone = document.querySelector('[data-h2h-board-zone="hero"]');
    return {
      state: root?.getAttribute("data-playing-state"),
      wrapperCollapsed: wrapper?.getAttribute("data-h2h-play-top-strip-collapsed"),
      wrapperOpacity: cs ? parseFloat(cs.opacity) : 0,
      wrapperHeight: cs ? parseFloat(cs.height) : 0,
      settleHeroMounted: !!settleHero,
      opSlotMounted: !!opSlot,
      youSlotMounted: !!youSlot,
      topZoneRect: topZone?.getBoundingClientRect().toJSON(),
      bottomZoneRect: bottomZone?.getBoundingClientRect().toJSON(),
      heroZoneRect: heroZone?.getBoundingClientRect().toJSON(),
    };
  });
  // Sample is inside ab_transition OR has just transitioned into
  // handoff_resolving (settle-pause) — both render the empty-hero
  // composition. The end-state spec is identical between the two.
  record(
    `ab_transition end-state: state IS ab_transition or handoff_resolving`,
    abSnap.state === "ab_transition" || abSnap.state === "handoff_resolving",
    `state="${abSnap.state}"`,
  );
  record(
    `ab_transition end-state: opponent strip wrapper uncollapsed (collapsed=null, opacity=1, height>0)`,
    abSnap.wrapperCollapsed === null && abSnap.wrapperOpacity > 0.9 && abSnap.wrapperHeight > 0,
    `collapsed=${abSnap.wrapperCollapsed} opacity=${abSnap.wrapperOpacity} h=${abSnap.wrapperHeight}`,
  );
  record(
    `ab_transition end-state: settle-hero (two empty slots) rendering`,
    abSnap.settleHeroMounted && abSnap.opSlotMounted && abSnap.youSlotMounted,
    `settle=${abSnap.settleHeroMounted} op=${abSnap.opSlotMounted} you=${abSnap.youSlotMounted}`,
  );
  // Top zone must be above bottom zone (Layout B Y-order sanity).
  if (abSnap.topZoneRect && abSnap.bottomZoneRect) {
    record(
      `ab_transition end-state: top zone above bottom zone (Y-ordering)`,
      abSnap.topZoneRect.y + abSnap.topZoneRect.height <= abSnap.bottomZoneRect.y,
      `top.bottom=${abSnap.topZoneRect.y + abSnap.topZoneRect.height} bottom.top=${abSnap.bottomZoneRect.y}`,
    );
  }
  // Bug-1 complement: the slide is the INTENDED motion. Confirm the
  // recipient strip actually moved (slid DOWN) at ab_transition — so
  // the no-jump rule above didn't accidentally freeze the strip
  // through the transition too.
  const abStripRect = await page
    .locator("[data-h2h-play-bottom-strip]")
    .boundingBox();
  if (stripHoldSelectRect != null && abStripRect != null) {
    record(
      `Bug-1 complement: strip MOVES (slides down) at ab_transition (intended motion preserved)`,
      abStripRect.y - stripHoldSelectRect.y > 20,
      `hs.top=${stripHoldSelectRect.y} ab.top=${abStripRect.y} Δ=${abStripRect.y - stripHoldSelectRect.y}`,
    );
  }

  // ── handoff_resolving settle-pause snapshot (design-lock §3 step 4) ─
  // Wait into the 1000ms hold (post-AB_TRANSITION). Sample at +200ms
  // into the settle-pause — well inside the 1000ms window and before
  // the arc composite crossfade.
  await page.waitForTimeout(AB_TRANSITION_DURATION_MS + 200);
  const settleSnap = await page.evaluate(() => {
    const root = document.querySelector("[data-h2h-recipient-play]");
    const settle = document.querySelector("[data-h2h-play-settle-hero]");
    const opSlot = document.querySelector('[data-h2h-play-settle-hero-slot="opponent"]');
    const youSlot = document.querySelector('[data-h2h-play-settle-hero-slot="you"]');
    const headline = document.querySelector("[data-h2h-play-headline]");
    const vs = document.querySelector("[data-h2h-play-vs]");
    const wrapper = document.querySelector("[data-h2h-play-top-strip]");
    const cs = wrapper ? getComputedStyle(wrapper) : null;
    // Bottom-strip cells: all 6 face-up.
    const bottomCells = Array.from(document.querySelectorAll("[data-h2h-play-bottom-cell]"));
    const bottomFaceUpCount = bottomCells.filter((c) => c.getAttribute("data-face-up") === "true").length;
    // Top-strip cells: 6 face-up.
    const topCells = Array.from(document.querySelectorAll("[data-h2h-play-top-cell]"));
    const topFaceUpCount = topCells.filter((c) => c.getAttribute("data-face-up") === "true").length;
    return {
      state: root?.getAttribute("data-playing-state"),
      settleMounted: !!settle,
      opSlotMounted: !!opSlot,
      youSlotMounted: !!youSlot,
      headlineMounted: !!headline,
      vsMounted: !!vs,
      wrapperOpacity: cs ? parseFloat(cs.opacity) : 0,
      bottomFaceUpCount,
      topFaceUpCount,
    };
  });
  record(
    `settle-pause: state IS handoff_resolving`,
    settleSnap.state === "handoff_resolving",
    `state="${settleSnap.state}"`,
  );
  record(
    `settle-pause: VS treatment is KILLED (no [data-h2h-play-vs])`,
    settleSnap.vsMounted === false,
  );
  record(
    `settle-pause: empty-hero composition rendered (opponent + you slots)`,
    settleSnap.settleMounted && settleSnap.opSlotMounted && settleSnap.youSlotMounted,
    `settle=${settleSnap.settleMounted} op=${settleSnap.opSlotMounted} you=${settleSnap.youSlotMounted}`,
  );
  record(
    `settle-pause: headline div NOT mounted (empty stillness)`,
    settleSnap.headlineMounted === false,
  );
  record(
    `settle-pause: Layout B composed — opponent strip face-up + your strip all 6 face-up`,
    settleSnap.wrapperOpacity > 0.9 &&
      settleSnap.bottomFaceUpCount === ROSTER_SIZE &&
      settleSnap.topFaceUpCount === ROSTER_SIZE,
    `op=${settleSnap.wrapperOpacity} bot=${settleSnap.bottomFaceUpCount} top=${settleSnap.topFaceUpCount}`,
  );

  // ── arc: Fix C2 single canvas continuity ──
  // Finish the rest of the settle-pause + composite crossfade. The
  // 200ms we waited above + the remainder of PRE_REVEAL_HOLD_MS (1000)
  // + the ARC_COMPOSITE_CROSSFADE_MS (250) + buffer.
  await page.waitForTimeout(PRE_REVEAL_HOLD_MS - 200 + ARC_COMPOSITE_CROSSFADE_MS + 200);

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

  // Note (design-lock §3 / §5): the prior S1↔S4 no-shift assertion is
  // OBSOLETE under the Layout A/B restructure. Layout A and Layout B
  // have intentionally different bottom-strip Y positions by design
  // (the recipient strip "slides down" via the hero region's expansion
  // from the Layout A small floor back to the Layout B full floor —
  // §3 step 3). Layout B containment is asserted by the multi-viewport
  // sweep below (§5a no-scroll above floor / §5b pinned-scroll below).
  void topLabel_s1; void bottomLabel_s1;

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

  // Layout A/B restructure: pre_deal is killed. The cascade
  // auto-fires on mount (loading → deal_in auto-advance + scheduled
  // cascade timers); no Deal-click. Wait through the cascade into
  // hold_select.
  await page.waitForTimeout(DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 2));
  await page.waitForTimeout(COLUMN_FLIP_DURATION_MS + 100);
  const stateAtHoldSelect = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  record(`${vp.label}: hold_select reached after auto-cascade`, stateAtHoldSelect === "hold_select", `state="${stateAtHoldSelect}"`);
  if (stateAtHoldSelect !== "hold_select") {
    await page.close();
    return;
  }

  // ── §5a/§5b containment sweep across hold_select tap states ──
  for (const ts of HS_TAP_STATES) {
    if (ts.tapSelector) {
      await page.locator(ts.tapSelector).click();
      await page.waitForTimeout(50);
    }
    await assertContainmentOrReachability(page, vp, `${vp.label} ${ts.id} ${ts.label}`);
  }

  // ── Layout-B containment sweep (design-lock §6 / §8) ─────────────
  // The lock extends the §5a/§5b containment rule to Layout B —
  // settle-pause AND reveal/arc. Layout B is denser (two strips +
  // empty hero composition, then the battlefield grid + scores +
  // result headline + CTAs). The img-5 CTA-clip is fixed by these
  // assertions: the recipient strip + CTA must be contained-or-
  // reachable on tight viewports.
  //
  // From hold_select with held={2,5} (HS-4 final state), tap Draw to
  // drive into Layout B. Wait through redraw_running → your_redraw_flip
  // → ab_transition into the handoff_resolving settle-pause.
  await page.click("[data-h2h-play-cta][data-cta-label='Draw']");
  // your_redraw_flip pass + ab_transition + a small buffer to land
  // inside the settle-pause hold (1000ms).
  await page.waitForTimeout(
    ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS) +
      AB_TRANSITION_DURATION_MS + 100,
  );
  const settleState = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  if (settleState === "handoff_resolving") {
    await assertContainmentOrReachability(
      page,
      vp,
      `${vp.label} B-settle (handoff_resolving)`,
      { layoutBExpected: true },
    );
  } else {
    record(
      `${vp.label} B-settle: reached handoff_resolving for Layout B containment check`,
      false,
      `state="${settleState}"`,
    );
  }

  // arc state — finish out the settle-pause + composite crossfade.
  await page.waitForTimeout(PRE_REVEAL_HOLD_MS + ARC_COMPOSITE_CROSSFADE_MS + 200);
  const arcStateSweep = await page.locator("[data-h2h-recipient-play]").getAttribute("data-playing-state");
  if (arcStateSweep === "arc") {
    // Arc composites the reveal shell over the playing inner. Per
    // design-lock §6: Layout B follows the same containment-or-
    // reachability rule as Layout A (§5a fits without scroll OR §5b
    // engages scroll-fallback with the CTA pinned). The img-5 CTA-clip
    // guard fails when the reveal's recipient strip / CTA is BELOW the
    // viewport AND the scroll-fallback isn't engaged on the reveal
    // shell's inner column.
    //
    // The reveal renders its own H2HBoardShell. It exposes its own
    // [data-h2h-board-inner] inside [data-h2h-recipient-reveal]. We
    // measure containment against the viewport AND, if the strip/CTA
    // overflow, accept the failure ONLY IF the reveal-shell's inner
    // is scrollable AND the strip/CTA become reachable via scroll —
    // matching the §5b rule applied to Layout B.
    const arcMeasure = await page.evaluate(() => {
      const reveal = document.querySelector("[data-h2h-recipient-reveal]");
      if (!reveal) return { ok: false, reason: "no reveal mounted" };
      // The reveal shell's inner — scope to the reveal subtree so we
      // don't pick up the playing shell's inner (which sits beneath).
      const inner = reveal.querySelector("[data-h2h-board-inner]");
      const innerInfo = inner
        ? {
            scrollHeight: inner.scrollHeight,
            clientHeight: inner.clientHeight,
            overflowingY: inner.scrollHeight - inner.clientHeight > 1,
          }
        : null;
      const strip = reveal.querySelector('[data-h2h-hand-strip][data-side="recipient"]')
        ?? reveal.querySelector('[data-h2h-board-zone="bottom"]');
      const cta = reveal.querySelector('[data-h2h-overlay-cta]')
        ?? reveal.querySelector('[data-h2h-play-cta]');
      const stripRect = strip?.getBoundingClientRect();
      const ctaRect = cta?.getBoundingClientRect();
      return {
        ok: true,
        innerInfo,
        stripBottom: stripRect ? stripRect.y + stripRect.height : null,
        ctaBottom: ctaRect ? ctaRect.y + ctaRect.height : null,
        ctaPresent: !!cta,
        stripPresent: !!strip,
      };
    });
    if (arcMeasure.ok && arcMeasure.stripPresent) {
      const fits = arcMeasure.stripBottom !== null && arcMeasure.stripBottom <= vp.height + 1;
      const scrollable = arcMeasure.innerInfo?.overflowingY === true;
      record(
        `${vp.label} B-arc: reveal recipient strip contained-or-scrollable (img-5 CTA-clip guard, §6)`,
        fits || scrollable,
        `stripBottom=${arcMeasure.stripBottom} vh=${vp.height} scrollable=${scrollable}`,
      );
    }
    if (arcMeasure.ok && arcMeasure.ctaPresent) {
      const fits = arcMeasure.ctaBottom !== null && arcMeasure.ctaBottom <= vp.height + 1;
      const scrollable = arcMeasure.innerInfo?.overflowingY === true;
      record(
        `${vp.label} B-arc: reveal CTA contained-or-scrollable (img-5 CTA-clip guard, §6)`,
        fits || scrollable,
        `ctaBottom=${arcMeasure.ctaBottom} vh=${vp.height} scrollable=${scrollable}`,
      );
    }
  } else {
    record(`${vp.label} B-arc: reached arc state for Layout B containment check`,
      false,
      `state="${arcStateSweep}"`,
    );
  }

  await page.close();
}

/** Containment-or-reachability assertion shared by Layout A and B sweeps.
 *  Mirrors the prior §5a (no-scroll, all-contained) / §5b (scroll
 *  engaged, CTA sticky-pinned, strip reachable) split. */
async function assertContainmentOrReachability(page, vp, stateLabel, opts = {}) {
  const rects = await captureHoldSelectRects(page);
  const ctaBottom = rects.cta ? rects.cta.y + rects.cta.height : null;
  const stripBottom = rects.bottomStrip ? rects.bottomStrip.y + rects.bottomStrip.height : null;
  const topZoneTop = rects.topZone ? rects.topZone.y : null;
  const scrollable = rects.innerInfo?.overflowingY === true;
  const fitLabel = scrollable ? "§5b scroll fallback" : "§5a no-scroll fit";
  const tag = `${stateLabel} ${fitLabel}`;

  if (!scrollable) {
    record(
      `${tag}: recipient-strip.bottom <= vh`,
      stripBottom !== null && stripBottom <= vp.height + 1,
      `stripBottom=${Math.round(stripBottom)} vh=${vp.height}`,
    );
    record(
      `${tag}: CTA.bottom <= vh`,
      ctaBottom !== null && ctaBottom <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottom)} vh=${vp.height}`,
    );
    record(
      `${tag}: top-zone.top >= 0`,
      topZoneTop !== null && topZoneTop >= -1,
      `topZoneTop=${Math.round(topZoneTop)}`,
    );
    record(
      `${tag}: inner does NOT scroll`,
      !scrollable,
      `scrollH=${rects.innerInfo?.scrollHeight} clientH=${rects.innerInfo?.clientHeight}`,
    );
  } else {
    await scrollInnerTo(page, "top");
    const rectsAtTop = await captureHoldSelectRects(page);
    const ctaBottomTop = rectsAtTop.cta ? rectsAtTop.cta.y + rectsAtTop.cta.height : null;
    record(
      `${tag}: CTA pinned (bottom <= vh) at scrollTop=0`,
      ctaBottomTop !== null && ctaBottomTop <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottomTop)} vh=${vp.height}`,
    );

    await scrollInnerTo(page, "bottom");
    const rectsAtBottom = await captureHoldSelectRects(page);
    const ctaBottomBottom = rectsAtBottom.cta ? rectsAtBottom.cta.y + rectsAtBottom.cta.height : null;
    record(
      `${tag}: CTA pinned (bottom <= vh) at scrollTop=max`,
      ctaBottomBottom !== null && ctaBottomBottom <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottomBottom)} vh=${vp.height}`,
    );

    const stripReachable = await page.evaluate(() => {
      const strip = document.querySelector('[data-h2h-play-bottom-strip]');
      if (!strip) return { ok: false, reason: "strip not in DOM" };
      strip.scrollIntoView({ block: "center", behavior: "instant" });
      const r = strip.getBoundingClientRect();
      return { ok: r.top >= -1 && r.bottom <= window.innerHeight + 1, top: r.top, bottom: r.bottom, vh: window.innerHeight };
    });
    record(
      `${tag}: bottom strip reachable in scroll`,
      stripReachable.ok,
      JSON.stringify(stripReachable),
    );

    await scrollInnerTo(page, "top");
  }
  void opts;
}

// ── Results-overlay viewport sweep (Bug 2 + Bug 3 guard) ────────────
//
// The post-reveal RESULTS overlay (H2HResultsOverlay) is a SEPARATE
// hand-rolled full-screen container (NOT an H2HBoardShell consumer).
// The play harness's arc-state check above operates on the arc shell
// itself; the overlay below the arc was never asserted strictly. The
// recon flagged this as the source of the prior CTA-clip leak.
//
// This sweep drives the standalone reveal mock with ?overlay=1, which
// skips the arc and renders the overlay at its end-state. For each
// viewport + safe-area tuple we assert STRICT §5a/§5b:
//   §5a (fits without scroll): bottomStrip.bottom <= vh AND
//        CTA.bottom <= vh AND inner does NOT scroll.
//   §5b (overflows): CTA pinned (bottom <= vh) at scrollTop=0 AND at
//        scrollTop=max; bottom strip reachable via scrollIntoView.
// Plus Bug 3 regression-guard: the overlay's recipient bottom-zone
// label reads literal "YOU".

const RESULTS_OVERLAY_URL =
  `${ORIGIN}/basketball/dev/h2h-reveal-mock?overlay=1&variant=WIN`;

async function injectOverlaySafeArea(page, safeTop, safeBottom) {
  // The overlay container reads env(safe-area-inset-*) directly in
  // its paddingTop/paddingBottom. We inject the same replacement the
  // play harness does, scoped to the overlay's container marker.
  await page.addStyleTag({
    content: `
      [data-h2h-results-overlay] {
        padding-top: ${safeTop + OUTER_PAD_EXTRA_PX}px !important;
        padding-bottom: ${safeBottom + OUTER_PAD_EXTRA_PX}px !important;
      }
    `,
  });
  await page.waitForTimeout(40);
}

async function captureOverlayRects(page) {
  return page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const inner = document.querySelector("[data-h2h-overlay-inner]");
    const innerInfo = inner
      ? {
          scrollTop: inner.scrollTop,
          scrollHeight: inner.scrollHeight,
          clientHeight: inner.clientHeight,
          overflowingY: inner.scrollHeight - inner.clientHeight > 1,
        }
      : null;
    return {
      topZone: get("[data-h2h-overlay-zone='opponent']"),
      bottomZone: get("[data-h2h-overlay-zone='user']"),
      bottomStrip: get("[data-h2h-overlay-zone='user'] [data-h2h-overlay-strip]"),
      cta: get("[data-h2h-overlay-primary-cta]"),
      reserved: get("[data-h2h-overlay-reserved]"),
      innerInfo,
    };
  });
}

async function scrollOverlayInnerTo(page, where /* "top" | "bottom" */) {
  await page.evaluate((target) => {
    const inner = document.querySelector("[data-h2h-overlay-inner]");
    if (!inner) return;
    inner.scrollTo({
      top: target === "bottom" ? inner.scrollHeight : 0,
      behavior: "instant",
    });
  }, where);
  await page.waitForTimeout(30);
}

async function runResultsOverlayViewportSweep(browser, vp) {
  const tag = `[overlay-sweep ${vp.label}]`;
  console.log(`\n${tag} starting`);
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on("pageerror", (err) => console.error(`${tag}[pageerror]`, err.message));

  try {
    await page.goto(RESULTS_OVERLAY_URL, { waitUntil: "networkidle", timeout: 30000 });
  } catch (err) {
    console.error(`${tag} FAIL — could not load ${RESULTS_OVERLAY_URL}: ${err.message}`);
    await page.close();
    record(`${vp.label} overlay: page load`, false, err.message);
    return;
  }
  await page.waitForSelector("[data-h2h-results-overlay]", { timeout: 10000 });
  await injectOverlaySafeArea(page, vp.safeTop, vp.safeBottom);
  // Settle the overlay's crossfade-in (350ms) so opacity/layout is at rest.
  await page.waitForTimeout(400);

  // Bug 3 regression-guard: the overlay's recipient bottom-zone label
  // reads literal "YOU" (not the generated nickname). Page-evaluated
  // (not page.locator) so the assertion REPORTS the missing-element
  // case as a failure instead of hanging on Playwright's auto-wait;
  // pre-fix the data-attr didn't exist on the overlay's ZoneHeader, so
  // the harness must surface that as a fail, not a timeout.
  const bottomLabel = await page.evaluate(() => {
    const el = document.querySelector("[data-h2h-overlay-zone-label='bottom']");
    return el ? (el.textContent ?? "").trim() : null;
  });
  record(
    `${vp.label} overlay Bug-3: recipient label is literal "YOU"`,
    bottomLabel === "YOU",
    `label="${bottomLabel}"`,
  );

  // Strict §5a / §5b assertion against the overlay.
  const rects = await captureOverlayRects(page);
  const ctaBottom = rects.cta ? rects.cta.y + rects.cta.height : null;
  const stripBottom = rects.bottomStrip ? rects.bottomStrip.y + rects.bottomStrip.height : null;
  const topZoneTop = rects.topZone ? rects.topZone.y : null;
  const scrollable = rects.innerInfo?.overflowingY === true;
  const fitLabel = scrollable ? "§5b scroll fallback" : "§5a no-scroll fit";
  const stateTag = `${vp.label} overlay ${fitLabel}`;

  if (!scrollable) {
    record(
      `${stateTag}: bottom strip bottom <= vh`,
      stripBottom !== null && stripBottom <= vp.height + 1,
      `stripBottom=${Math.round(stripBottom)} vh=${vp.height}`,
    );
    record(
      `${stateTag}: CTA.bottom <= vh`,
      ctaBottom !== null && ctaBottom <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottom)} vh=${vp.height}`,
    );
    record(
      `${stateTag}: top-zone.top >= 0`,
      topZoneTop !== null && topZoneTop >= -1,
      `topZoneTop=${Math.round(topZoneTop)}`,
    );
    record(
      `${stateTag}: inner does NOT scroll`,
      !scrollable,
      `scrollH=${rects.innerInfo?.scrollHeight} clientH=${rects.innerInfo?.clientHeight}`,
    );
  } else {
    await scrollOverlayInnerTo(page, "top");
    const rectsAtTop = await captureOverlayRects(page);
    const ctaBottomTop = rectsAtTop.cta ? rectsAtTop.cta.y + rectsAtTop.cta.height : null;
    record(
      `${stateTag}: CTA pinned (bottom <= vh) at scrollTop=0`,
      ctaBottomTop !== null && ctaBottomTop <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottomTop)} vh=${vp.height}`,
    );

    await scrollOverlayInnerTo(page, "bottom");
    const rectsAtBottom = await captureOverlayRects(page);
    const ctaBottomBottom = rectsAtBottom.cta ? rectsAtBottom.cta.y + rectsAtBottom.cta.height : null;
    record(
      `${stateTag}: CTA pinned (bottom <= vh) at scrollTop=max`,
      ctaBottomBottom !== null && ctaBottomBottom <= vp.height + 1,
      `ctaBottom=${Math.round(ctaBottomBottom)} vh=${vp.height}`,
    );

    // Bottom strip reachable via scrollIntoView.
    const stripReachable = await page.evaluate(() => {
      const strip = document.querySelector("[data-h2h-overlay-zone='user'] [data-h2h-overlay-strip]")
        ?? document.querySelector("[data-h2h-overlay-strip]");
      if (!strip) return { ok: false, reason: "strip not in DOM" };
      strip.scrollIntoView({ block: "center", behavior: "instant" });
      const r = strip.getBoundingClientRect();
      return { ok: r.top >= -1 && r.bottom <= window.innerHeight + 1, top: r.top, bottom: r.bottom, vh: window.innerHeight };
    });
    record(
      `${stateTag}: bottom strip reachable via scrollIntoView`,
      stripReachable.ok,
      JSON.stringify(stripReachable),
    );

    await scrollOverlayInnerTo(page, "top");
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
    // Results-overlay strict §5a/§5b sweep + Bug 3 label guard.
    for (const vp of HS_SWEEP_VIEWPORTS) {
      await runResultsOverlayViewportSweep(browser, vp);
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
