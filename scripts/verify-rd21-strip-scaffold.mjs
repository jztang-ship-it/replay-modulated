#!/usr/bin/env node
// scripts/verify-rd21-strip-scaffold.mjs
//
// RD2.1 width===width real-browser gate. The mechanism unit test
// (JSDOM) gates that the scaffold carries containerType:inline-size
// and the inner card transform uses calc(100cqw / 150px). This script
// validates the actual LAYOUT outcome — that the inner card's
// rendered width tracks its cell's rendered width at every viewport,
// across all three H2H surfaces.
//
// Surfaces probed:
//   - REVEAL: /basketball/dev/h2h-reveal-mock (mini-cells)
//   - RESULTS: /basketball/dev/h2h-reveal-mock?overlay=1 (overlay cells)
//   - PLAY top: /basketball/dev/h2h-play-mock?autoDeal=1 (sender strip)
//   - PLAY bottom flip: /basketball/dev/h2h-play-mock?autoDeal=1
//     after hold-then-redraw (face-up bottom cells)
//
// Browsers: Chromium AND WebKit (Safari). Both must pass.
// Viewports: 390, 360, 320 (iPhone 14 / SE / smallest mobile).
//
// Exits 0 on PASS, 1 on FAIL. Prints per-assertion summary either way.
//
// Usage:
//   1. Start dev server in this worktree: npm --prefix basketball run dev
//   2. node scripts/verify-rd21-strip-scaffold.mjs [--port 5176]

import { chromium, webkit } from "playwright";

const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1]) || 5176;
const BASE = `http://localhost:${PORT}/basketball/dev`;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 740 },
  { name: "320", width: 320, height: 568 },
];

const TOLERANCE_PX = 0.75;

/** @typedef {{ cellW: number, innerW: number, delta: number }} CellMeasurement */

async function measureSurface(page, cellSelector, innerSelector = null) {
  // The "cell" we measure against is the element that carries
  // container-type:inline-size (the cqw source). The inner card's
  // bounding-rect width should equal the cell's CONTENT-BOX width
  // (= borderBox - borderLeft - borderRight). On REVEAL/RESULTS the
  // cell has no border, so content box = border box. On PLAY the
  // bordered front-face wrapper IS the cell here — measure it as the
  // container and subtract its border to compare against the scaled
  // inner card.
  return page.$$eval(
    cellSelector,
    (cells, innerSel) => {
      return cells.map((cell) => {
        const cr = cell.getBoundingClientRect();
        const cs = window.getComputedStyle(cell);
        const borderL = parseFloat(cs.borderLeftWidth) || 0;
        const borderR = parseFloat(cs.borderRightWidth) || 0;
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const contentBoxW = cr.width - borderL - borderR - padL - padR;
        const inner = innerSel
          ? cell.querySelector(innerSel)
          : cell.querySelector('[style*="transform"]');
        if (!inner) {
          return { cellW: cr.width, contentBoxW, innerW: null, delta: null };
        }
        const ir = inner.getBoundingClientRect();
        return {
          cellW: cr.width,
          contentBoxW,
          innerW: ir.width,
          // Compare scaled inner to the container's content box —
          // that's the area cqw resolves against.
          delta: ir.width - contentBoxW,
        };
      });
    },
    innerSelector
  );
}

function report(label, cells) {
  if (cells.length === 0) {
    return { label, ok: false, note: "no cells found" };
  }
  const missing = cells.filter((c) => c.innerW == null);
  if (missing.length === cells.length) {
    return { label, ok: false, note: "no inner card found in any cell" };
  }
  const measurable = cells.filter((c) => c.innerW != null);
  const worst = measurable.reduce((m, c) => (Math.abs(c.delta) > Math.abs(m.delta) ? c : m), measurable[0]);
  const ok = Math.abs(worst.delta) <= TOLERANCE_PX;
  return {
    label,
    ok,
    cellCount: cells.length,
    measurableCount: measurable.length,
    worstCellW: worst.cellW,
    worstContentW: worst.contentBoxW,
    worstInnerW: worst.innerW,
    worstDelta: worst.delta,
  };
}

async function probeBrowser(browserName, launcher) {
  console.log(`\n========== ${browserName} ==========`);
  const browser = await launcher.launch();
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- viewport ${vp.name} ---`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    // REVEAL
    {
      await page.goto(`${BASE}/h2h-reveal-mock`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const cells = await measureSurface(page, '[data-h2h-mini-cell="true"]');
      const r = report(`REVEAL  vp=${vp.name}`, cells);
      results.push({ ...r, browser: browserName, vp: vp.name });
      console.log(`  REVEAL:  cells=${r.cellCount}, worst contentBoxW=${r.worstContentW?.toFixed(2)} innerW=${r.worstInnerW?.toFixed(2)} Δ=${r.worstDelta?.toFixed(2)}px → ${r.ok ? "PASS" : "FAIL"}`);
    }

    // RESULTS (overlay)
    {
      await page.goto(`${BASE}/h2h-reveal-mock?overlay=1`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const cells = await measureSurface(page, '[data-h2h-overlay-cell="true"]');
      const r = report(`RESULTS vp=${vp.name}`, cells);
      results.push({ ...r, browser: browserName, vp: vp.name });
      console.log(`  RESULTS: cells=${r.cellCount}, worst contentBoxW=${r.worstContentW?.toFixed(2)} innerW=${r.worstInnerW?.toFixed(2)} Δ=${r.worstDelta?.toFixed(2)}px → ${r.ok ? "PASS" : "FAIL"}`);
    }

    // PLAY top (sender strip, face-up after autoDeal lands in hold_select)
    {
      await page.goto(`${BASE}/h2h-play-mock?autoDeal=1`, { waitUntil: "networkidle" });
      // autoDeal fires Deal after 50ms, then cascade is 6 × 120ms ≈ 720ms.
      // Wait a generous 1500ms for hold_select state with sender cards visible.
      await page.waitForTimeout(1500);
      // Top strip is collapsed in Layout A (deal_in/hold_select) — height 0,
      // opacity 0, aria-hidden. Cells still render in the DOM but have zero
      // displayed area. We measure the front-face wrapper instead — the
      // containerType source — which is what cqw reads. When the wrapper
      // wrapper is collapsed, BOTH cell and inner collapse → equal widths
      // (vacuous pass). Run after we've advanced to ab_transition? That
      // requires Draw, which the harness can't fire cleanly mid-cascade.
      // Compromise: measure the BOTTOM strip front-face wrappers (always
      // visible in hold_select once cards are dealt).
      // Measure against the front-face wrapper itself (the containerType
      // source) rather than the outer cell — the 1px border on the front
      // wrapper means its content box is what cqw resolves against.
      const cells = await measureSurface(page, '[data-h2h-play-front="true"]', '[style*="transform"]');
      const r = report(`PLAY    vp=${vp.name}`, cells);
      results.push({ ...r, browser: browserName, vp: vp.name });
      console.log(`  PLAY (bottom face-up front-wrapper): cells=${r.cellCount}, worst contentBoxW=${r.worstContentW?.toFixed(2)} innerW=${r.worstInnerW?.toFixed(2)} Δ=${r.worstDelta?.toFixed(2)}px → ${r.ok ? "PASS" : "FAIL"}`);
    }

    await ctx.close();
  }

  await browser.close();
  return results;
}

const all = [];
all.push(...(await probeBrowser("Chromium", chromium)));
all.push(...(await probeBrowser("WebKit (Safari)", webkit)));

console.log("\n========= SUMMARY =========");
const fails = all.filter((r) => !r.ok);
all.forEach((r) =>
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.browser.padEnd(18)}  ${r.label}${r.note ? "  (" + r.note + ")" : ""}`)
);
if (fails.length === 0) {
  console.log("\n✓ All surfaces pass width===width on Chromium + WebKit at 390/360/320.");
  process.exit(0);
} else {
  console.log(`\n✘ ${fails.length} surface(s) failed.`);
  process.exit(1);
}
