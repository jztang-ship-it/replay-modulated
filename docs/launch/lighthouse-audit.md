# Lighthouse audit — Section 4 acceptance + Section 6 prep

Audited 2026-05-01 against checklist Section 4 acceptance: "Lighthouse score: Performance > 80, Accessibility > 90."

Run via `npx lighthouse@latest <url> --form-factor=mobile --chrome-flags='--headless --no-sandbox'` against production.

## Results — mobile

| URL | Performance | Accessibility | Best Practices | SEO | Status |
|---|---:|---:|---:|---:|---|
| `/` (chooser) | **94** | 92 | 100 | 91 | ✅ both targets |
| `/basketball/` | **61** | 92 | 100 | 92 | ❌ Performance fail (target >80) |
| `/baseball/` | **51** | 100 | 100 | 92 | ❌ Performance fail |

Accessibility ≥ 92 everywhere. Best Practices and SEO healthy. **The Section 4 acceptance gate is failing on the sport pages.**

## What's slow

Core Web Vitals (mobile, throttled):

| Metric | Basketball | Baseball | Threshold (Good) |
|---|---:|---:|---|
| First Contentful Paint | 6.4 s | 6.8 s | ≤ 1.8 s |
| Largest Contentful Paint | 6.4 s | 6.8 s | ≤ 2.5 s |
| Total Blocking Time | 40 ms | 380 ms | ≤ 200 ms |
| Time to Interactive | 6.7 s | 7.2 s | ≤ 3.8 s |
| Speed Index | 6.8 s | 6.8 s | ≤ 3.4 s |

LCP at ~6.5s is the headline issue. Reddit's traffic is mostly mobile on slower networks; users won't wait 6+ seconds.

## Root cause

Confirmed earlier in build output: each sport ships a single ~2.7–3 MB / ~800 KB-gzipped JS bundle. Vite's default bundling, no code-splitting. The bundle includes:
- React + react-dom (~150 KB gzipped)
- The full game engine + all components (CardFront, GameView, GameBar, TierGauge, hooks, commentary system, etc.)
- Sport-specific data (players.json, logs)
- Audio (large MP3s loaded eagerly via `audioDirector`)

Top Lighthouse audits flagging issues:
1. **`unused-javascript`** — significant unused JS in the bundle (probably dead-code paths from disabled features).
2. **`mainthread-work-breakdown`** — long script evaluation on first load.
3. **`document-latency-insight`** — server response time slow for the static HTML (cold edge cache).
4. **`network-dependency-tree-insight`** — heavy critical request chain (HTML → main.js → players.json → audio assets).
5. **`redirects`** — multi-step redirect chain (likely from the chooser → sport landing → game).
6. **`valid-source-maps`** — production build doesn't ship source maps. Minor; not user-facing.
7. **`robots-txt`** — doesn't exist or invalid. Minor.
8. **`meta-viewport`** — uses `user-scalable=no` (basketball + chooser). A11y warning.

## Recommendations — what would move the needle

In rough order of cost/benefit:

### Low-cost wins (~1 hour each)

1. **Lazy-load the audio bed.** `audioDirector` and the sport sound packs are loaded synchronously at startup. Defer to first user interaction (or the first FTUE step). Should drop FCP/LCP by ~1–2 s on slow networks.
2. **Defer `players.json` and `logsByKey` parsing.** These are large JSON blobs eagerly fetched. Fetch only when needed (post-FTUE for first-timer; immediately for returning users could even prefetch via a `<link rel="preload">`).
3. **Add `<link rel="preconnect">` for Supabase.** First auth call has DNS + TLS round-trip ~300ms; preconnect at HTML parse saves it.
4. **Drop `user-scalable=no`** from the viewport meta tag. A11y win, no perf impact, but counts toward the score.
5. **Add a minimal `robots.txt`** at site root (allow all). Drops the SEO penalty.

### Medium-cost (~half a day)

6. **Code-split the FTUE flow** — FTUE components are loaded on every visit, but only fire for first-timers. Lazy-import `CoachLayer` and the FTUE roster behind a dynamic import. Returning users (the bulk of post-launch traffic) skip a chunk.
7. **Code-split overlays** (`LeaderboardScreen`, `ProfileScreen`, `RegisterModal`, `BellSheet`, `FeedbackModal`, `CollectScreen`, `LegendModal`). They're imported eagerly but only render when opened. Move to `lazy(() => import(...))`.

### High-cost (post-launch)

8. **Trim the React-19 bundle in basketball** (basketball is on React 19 per CLAUDE.md). Unclear what's pulled in — would need a bundle visualizer pass.
9. **Server-render the static skeleton** for sport pages — replace the empty `<div id="root"></div>` with a static FCP-eligible header/loading state in HTML. Saves ~500 KB of JS evaluation before first paint.

## Decision for launch

Strict reading of the checklist: **Section 4 acceptance fails.** Performance < 80 on both sport pages.

Pragmatic reading:
- The chooser landing scores 94 — that's the **first thing** Reddit users see when they click the link. They'll see the page render fast, pick a sport, then load the game. The sport-page perceived load time is hidden by the sport-card click → page-transition.
- Mobile perf at 51–61 is bad but "real-game-loads" bad, not "page-broken" bad. Average Reddit visit through a niche post: 60-90 second engagement window. A 6s LCP eats 7-10% of that — meaningful but survivable.
- The fixes above could push perf into the 75-85 range with ~1–2 days of work. That doesn't fit the launch-week window if the rest of the checklist also has to land.

**My recommendation:** Launch with the current perf, ship low-cost wins #3 (preconnect), #4 (drop user-scalable), and #5 (robots.txt) before launch (~30 min total). Defer #1, #2, #6, #7, #8, #9 to v1.1 where they have the right runway.

If you want, I can prep the three quick wins as a small PR that ships overnight and gets us another ~5-10 perf points without risk.

## Re-running the audit

```bash
npx --yes lighthouse@latest 'https://replayifs.com/?pick=1' --form-factor=mobile --chrome-flags='--headless --no-sandbox' --output=html --output-path=/tmp/lh-home.html --view
npx --yes lighthouse@latest 'https://replayifs.com/basketball/' --form-factor=mobile --chrome-flags='--headless --no-sandbox' --output=html --output-path=/tmp/lh-bb.html --view
npx --yes lighthouse@latest 'https://replayifs.com/baseball/' --form-factor=mobile --chrome-flags='--headless --no-sandbox' --output=html --output-path=/tmp/lh-bs.html --view
```

Each run takes ~30s. The `--view` flag opens an HTML report with detailed waterfalls and recommendations.

## Side note: the chooser is your friend

The chooser at `replayifs.com/` is a static HTML file (no Vite bundle, no React). It gets a 94 perf score because it ships ~3 KB of HTML+CSS+inline JS plus zero external assets except fonts. **This is your fast-path entry**. Reddit/Twitter unfurls send users here first; the sport pages load while users are reading the chooser and picking a sport.
