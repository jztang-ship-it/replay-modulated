// _recon-roundsnap.mjs — boss-winscreen-cta round-to-round chrome stability.
//
// The gap no other harness covered: across reveal ROUNDS (2/3 ↔ 3/3), do the
// board zones (top / hero / bottom) move? Uses the canonical mount
// (/dev/boss-claim-mock → BossClaimMockRoute → the REAL H2HRecipientReveal) held
// on the reveal surface via ?state=reveal, parametrized by ?round=N.
//
// We can't drive a live in-app round-2→round-3 remount from the mock (the round
// counter is play-loop state, H2HRecipientPlay.tsx:1607), so this measures the
// next-best deterministic thing: render the reveal surface at round 2/3 and at
// 3/3 and diff the zone rects. Only the RoundSignage TEXT changes between them
// (it rides BELOW the bottom strip), so the zones must read dY:0 dH:0.
//
//   PORT=5173 node scripts/_recon-roundsnap.mjs
import { chromium } from "playwright";

const PORT = process.env.PORT ?? "5173";
const b = await chromium.launch();
const REVEAL = '[data-h2h-board-surface="reveal"]';

function zoneRects(page) {
  return page.evaluate((REVEAL) => {
    const z = (zone) => {
      const e = document.querySelector(`${REVEAL} [data-h2h-board-zone="${zone}"]`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { y: Math.round(r.y), h: Math.round(r.height) };
    };
    return { top: z("top"), hero: z("hero"), bottom: z("bottom") };
  }, REVEAL);
}

for (const w of [390, 430]) {
  const out = {};
  const snaps = {};
  for (const round of [2, 3]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 } });
    await p.goto(
      `http://localhost:${PORT}/basketball/dev/boss-claim-mock?state=reveal&round=${round}`,
      { waitUntil: "networkidle", timeout: 45000 },
    );
    await p.waitForSelector(REVEAL, { timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(500);
    // assert we are actually on reveal, not results (the hold worked)
    const onResults = await p.$('[data-h2h-board-surface="results-overlay"]');
    const sig = await p.evaluate(() => {
      const e = document.querySelector('[data-h2h-round-signage], [data-testid="round-signage"]');
      return e ? e.textContent : null;
    });
    snaps[round] = await zoneRects(p);
    snaps[round]._heldOnReveal = !onResults;
    snaps[round]._signage = sig;
    await p.close();
  }
  const d = (a, c) => (a && c ? { dY: c.y - a.y, dH: c.h - a.h } : null);
  for (const zone of ["top", "hero", "bottom"]) {
    out[zone] = d(snaps[2][zone], snaps[3][zone]);
  }
  console.log(`@${w}: heldOnReveal(2,3)=${snaps[2]._heldOnReveal},${snaps[3]._heldOnReveal} signage(2,3)=${snaps[2]._signage},${snaps[3]._signage}`);
  console.log(`@${w} round 2→3 zone delta:`, JSON.stringify(out));
}
await b.close();
