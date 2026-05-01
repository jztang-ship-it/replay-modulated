# Prelaunch handover — Replay IFS

> **Read this first** at the start of a new session to pick up where we left off.
> Last updated: 2026-05-01 (afternoon; supersedes the earlier 2026-05-01 entry).

## TL;DR

You're prepping `replayifs.com` (NBA + MLB) for a Saturday Reddit launch. The 12-section prelaunch checklist is roughly **80% done**. Today shipped three live fixes (#38, #39, #40) plus a unified chooser landing — major UX work the original handover didn't anticipate. **You're not blocked on me — the next moves are mostly your hands** (real-device QA, soft-launch friend network, content recordings, OG image PNGs, optional Sentry install).

What's live on prod right now:
- Phase 2 GameView lift (shipped pre-checklist).
- All Section 1 + 2 + 3 + 4 hardening + meta tags + landing-page upgrade.
- Two reveal-pipeline bug fixes (negative FP for bad pitching, Team-FP-anchor mismatch, skip-preserves-tapped-FP).
- Post-cutover hotfixes (#26, #27).
- **Profile screen fix (#38)** — anonymous-user crash on tap-avatar. Was launch-blocker.
- **Wordmark click + leaderboard empty-state stability (#39)** — tap "REPLAY IFS" returns to chooser; leaderboard no longer flickers between skeleton and "No entries yet."
- **Unified chooser landing (#40)** — chooser at `/` now uses sport-landing typography (gold "Prove it" headline + sub-tagline), gets a sign-in icon, light personalization buckets (A/B/C/D) keyed off `/api/me` + localStorage signals. Picking a sport from the chooser skips the per-sport flippable-card landing and goes straight to FTUE; that landing is now marketing-direct-link only.

What's open and unmerged on GitHub:
- **PR #34** (`prelaunch/launch-docs`) — docs only, includes this update. Safe to merge anytime.
- **PR #35** (`maintenance` branch) — DO NOT MERGE; this is the maintenance-mode page meant for promote/demote via Vercel dashboard.
- **PR #36** (`prelaunch/section-4-perf`) — Lighthouse perf wins (+11 perf points). Rebased on new main. Needs visual smoke on a real device before merging.
- **PR #37** (`prelaunch/analytics-gaps`) — `score_submitted` + `leaderboard_viewed` analytics (Section 11 audit gaps 1 + 2). Rebased on new main. Safe to merge.

---

## Checklist status

| # | Section | Status |
|---|---|---|
| 1 | Phase 2 merge | ✅ shipped |
| 2 | Supabase hardening | ✅ shipped (free tier; pooler skipped — N/A for our REST-only architecture) |
| 3 | OG / meta tags | ✅ shipped (image PNGs deferred — drop into `chooser/public/og-{home,basketball,baseball}.png`) |
| 4 | Landing page upgrade | ✅ shipped (PR #33 + unified chooser in #40) — perf wins in PR #36 unmerged |
| 5 | Maintenance mode page | ✅ branch + preview ready — **promote-flow not yet tested** |
| 6 | Real-device QA | ⏳ your phone (HARD GATE — 30-second test rules everything) |
| 7 | Soft launch | ⏳ needs friend network + final deploy approval |
| 8 | Content assets | ⏳ your phone (10-15 sec screen recordings per sport) |
| 9 | Reddit prep | 📝 drafts in `launch-assets/reddit-posts.md` |
| 10 | Twitter prep | 📝 drafts in `launch-assets/twitter-posts.md` (account TBC) |
| 11 | Monitoring | ⚠️ analytics gaps 1+2 ready in PR #37 (unmerged); gap 3 closed in #40; Sentry not installed |
| 12 | Launch day kit | ⏳ your hands |

---

## What shipped to prod (chronological)

This week's PRs that touched production:

| PR | Branch | Title | Notes |
|---|---|---|---|
| #28 | `phase-2/gameview-shared` → main | Forward post-cutover hotfixes (#26, #27) | Streak scoping + reveal-bar held-FP seed |
| #29 | `fix/skip-preserves-tapped-fp` | Skip preserves tapped cards' FP | Bug: tap card, hit Auto, gauge rebounds to 0 |
| #30 | `fix/negative-fp-and-team-fp-anchor` | Negative FP cards + Team-FP includes anchor | Walker -5 ER showing as 0; held-anchor missing from team-FP label |
| #31 | `prelaunch/section-2-hardening` | Section 2 — hand_log audit + rate limit + nickname cap + CHECK constraints | Required `supabase/migrations/004_hardening.sql` applied via dashboard |
| #32 | `prelaunch/section-3-og-meta` | Section 3 — OG + Twitter Card meta tags | PNGs deferred |
| #33 | `prelaunch/section-4-landing` | Section 4 — landing page upgrade | New copy, TO BEAT preview, How-it-works modal, footer |
| #38 | `fix/profile-anonymous-crash` | Restore sign-out block to ProfileScreen scope | Was a real launch blocker mis-diagnosed as "non-blocking tsconfig drift" |
| #39 | `fix/wordmark-clickable` | Wordmark click + leaderboard empty-state | Tap "REPLAY IFS" → `/?pick=1`; leaderboard collapses skeleton + empty into one state |
| #40 | `prelaunch/unified-landing` | Unified chooser + `/api/me` + `?signin`/`?play` handoff | New chooser front door + sport-landing-as-marketing-only behavior |

After every merge: `phase-2/gameview-shared` was forwarded to match main (long-lived working branch convention). All open PRs were rebased on new main as part of #38/#39/#40 cleanup.

---

## Decision queue (your morning)

### High-priority

1. **PR #36 perf wins** — open, unmerged. Rebased on new main, so its preview now also includes the unified-landing + ProfileScreen fix + leaderboard-empty fix. Smoke-test the latest preview URL on a real iPhone (check the PR for the freshest URL — force-push generated a new one). Watch for: brand skeleton flashing in/out cleanly on first load, lazy modals opening within ~100ms on first tap. If clean → merge. If anything flashes weird → file a comment and we revert.

2. **PR #37 analytics gaps** — open, rebased. Pure additive (3 `track()` calls, no behavior change). Safe to merge whenever; gives launch better funnel coverage.

3. **Section 6 — real-device QA**. The 30-second test on iPhone Safari + Android Chrome. **Hard gate** per the checklist. Do this AFTER #36 lands so you're testing the final perf state.

### Medium-priority

4. **OG image PNGs** — when you've got them, drop into `chooser/public/og-home.png`, `og-basketball.png`, `og-baseball.png` (1200×630, <300 KB each). Build picks them up automatically — see `scripts/build-vercel.sh`.

5. **Lighthouse perf gap** — sport pages at 72/62 prod after PR #36 merge, target is 80. Three options in `docs/launch/lighthouse-audit.md`. My read: ship as-is, fix in v1.1.

6. **Twitter handle** — when you create the account, update bio + grab the handle for footer link. Drafts in `launch-assets/twitter-posts.md`.

7. **Sentry install** — needs your DSN. ~1 hour of work. See `docs/launch/analytics-audit.md`.

### Nice-to-have

8. **Maintenance promote-flow test** — promote `maintenance` branch's preview to prod once in a low-stakes window, then promote main back. URL saved: `https://replay-n4aubf1gv-john-tangs-projects-1c51aca7.vercel.app`. Section 5 acceptance.

9. **Pre-launch SQL dump** — Supabase free tier has no PITR. Take a manual dump before launch day.

10. **Cookie-based Supabase auth (v1.1)** — would eliminate the chooser's localStorage token-read brittleness in `/api/me` integration. Half-day refactor; not on launch path.

---

## Critical context for the next session

### Architecture notes
- **Hybrid storage**: leaderboard is **Vercel KV** (Upstash sorted sets), not Supabase. Section 2 hardening had to be re-mapped since the checklist assumed a Supabase `scores` table.
- **Anonymous auth**: every fresh visit triggers `supabase.auth.signInAnonymously()` immediately on AuthProvider mount. Free tier rate limit raised to 200/hour — borderline OK for v1 launch, will saturate briefly during a Reddit hug. Path 2 (defer anon sign-up to first hand) is on the v1.1 list if 200/hr proves insufficient.
- **Build pipeline**: monorepo with chooser (static HTML, no Vite) + basketball (Vite + React 19) + baseball (Vite + React 18) + worldcup (untouched). `scripts/build-vercel.sh` assembles everything to `dist/`. `chooser/public/*` files copy to dist root (added in Section 3 for OG images).
- **Vercel Preview env vars** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were originally Production-only; we added Preview scope in Section 2 verification so future preview deploys exercise the full Supabase path. Don't accidentally remove that.
- **Two landing surfaces (post-#40)**:
  - **Chooser** at `replayifs.com/` — multi-sport front door. Static HTML in `chooser/index.html`. Personalization runs inline JS, calls `/api/me` for auth state.
  - **Sport-specific flippable-card landing** at `/basketball/` and `/baseball/` — only shown to first-time direct-link visitors of that sport. `?play=1` from the chooser bypasses it; sticky `localStorage.replay_skip_landing_<sport>` keeps it bypassed thereafter.

### Behaviors to NOT break
- **Returning-user auto-redirect** in `chooser/index.html`: `localStorage.replay_last_sport` triggers `window.location.replace('/' + last + '/')`. Bypass via `?pick=1`.
- **Wordmark click → `/?pick=1`** in three places: `shared/components/AppHeader.tsx`, `shared/components/LandingPage.tsx`, and (eventually) the boot skeleton in `basketball/index.html` + `baseball/index.html` once #36 merges.
- **`?play=1` skip + sticky flag** — the chooser appends `?play=1` on sport-card click; basketball/baseball `App.tsx` sets `localStorage.replay_skip_landing_<sport> = "1"` so direct revisits also skip the marketing landing. Both query params (`?play=1`, `?signin=1`) are stripped via `history.replaceState` after mount so refresh is clean.
- **Skip-preserves-tapped-FP** logic in `shared/hooks/useEmotionalReveal.ts:skipToEnd`. Tested in PR #29.
- **Negative-FP cards animate down** (Walker pitching outings). The `Math.max(0, ...)` floors were removed in PR #30 across `useEmotionalReveal.ts` + `CardFront.tsx` + `PlayerCardShell.tsx`. Don't re-add them.
- **Team-FP label uses `displayFp`** (frozen-aware) at `shared/views/GameView.tsx`, not the raw `runningTotalFp`. Held-anchor's contribution lands in the spring; don't switch back.
- **Audit verification on `hand_best`** at `api/leaderboard.ts`: looks up the hand_id in `hand_log` via Supabase service-role. Skipped for `u_*` local-fallback uids; production has the env vars to fire it.
- **`/api/me` always returns 200** — bad/missing/expired token degrades to anonymous. The chooser depends on this for clean Bucket A/B/C fallback when localStorage token-read fails.
- **Sign-out block belongs to ProfileScreen, not InviteFriendsSection**. The bug fixed in #38 was a misplaced JSX block. If you find yourself moving JSX between those two functions, double-check what scope the variables come from.

### Feature flags / conventions
- `localStorageNamespace: ""` for basketball, `"baseball"` for baseball (PR #26 fix). Don't unify them.
- `nsKey(adapter, key)` is the canonical way to scope a localStorage key per-sport. Use it for `replaymod_streak`, `rm_best_hand`, `rm_best_tier`. Other keys (balance, hand_count, on_board_today) are intentionally raw.
- `_useReveal.ts` and `_useSharedGameState.ts` are private to `shared/views/GameView.tsx`. Not for direct external use.

### localStorage keys the chooser reads
The chooser is static HTML with no React. To bucket users (A/B/C/D), it reads:
- `replay_last_sport` — last sport picked (sets too on card click)
- `replaymod_ftue_basketball` / `replaymod_ftue_baseball` — per-sport FTUE-done flag (`"1"`)
- `rm_best_hand` (basketball, raw) / `baseball_rm_best_hand` (baseball, namespaced) — personal bests
- `replay_skip_landing_basketball` / `replay_skip_landing_baseball` — sticky chooser-pick flag
- Supabase token at `sb-<project>-auth-token` — used to call `/api/me` for Bucket D detection

If you rename any of these, the chooser breaks silently.

### Tests baseline
`npm test` from repo root: **8 failed | 241 passed**. The 8 failures are pre-existing (`detectTopGame` test-hook + `scoring` negative-baseFP). Documented in CLAUDE.md as non-blocking. Any **new** failure during your work is a regression.

### Typecheck baseline
`cd basketball && npx tsc --noEmit` silent.
`cd baseball && npx tsc --noEmit` silent (the 8 ProfileScreen errors the previous handover called "non-blocking tsconfig drift" were a real bug — fixed in PR #38).

### Build outputs (gzipped)
- `dist/basketball/assets/index-*.js`: ~840 KB
- `dist/baseball/assets/index-*.js`: ~780 KB
- 6 lazy overlay chunks: ~2-5 KB each (loaded on demand)

The 2.7-3 MB raw bundle is the dominant launch-blocker for sport-page perf. v1.1 should bundle-visualize to find what's pullable.

---

## How to pick up next

1. Start a fresh session, paste the prelaunch checklist again if needed (it's not in any file in the repo — only in our chat history).
2. Read this file (`docs/launch/HANDOVER.md`) to ground.
3. The next conversation should probably start with smoke-testing PR #36 on a real device, then deciding the perf gap question, then merging #37 (analytics gaps), then moving to Section 6.

---

## Branches alive on origin

- `main` — production. Current HEAD: `d43327f` (unified chooser, #40).
- `phase-2/gameview-shared` — long-lived working branch, in sync with main.
- `prelaunch/launch-docs` (PR #34) — overnight + afternoon docs work.
- `maintenance` (PR #35) — DO NOT MERGE.
- `prelaunch/section-4-perf` (PR #36) — perf wins, rebased on new main, awaiting smoke.
- `prelaunch/analytics-gaps` (PR #37) — score_submitted + leaderboard_viewed events, rebased.

---

## What's NOT in this codebase that you might think is

- The prelaunch checklist itself (lives only in our chat).
- Any OG image PNGs (`chooser/public/og-*.png` — paths reserved, files don't exist).
- Sentry init (no DSN, no install).
- Twitter handle (account TBC).
- Robots.txt + sitemap.xml — exist on the PR #36 branch but not on main yet. Once #36 merges, they'll be live at `replayifs.com/robots.txt` and `/sitemap.xml`.
- Cookie-based Supabase auth (v1.1).
- `?profile=1` handler in sport apps — deferred from #40; Bucket D users tap nickname → bounces to sport, but profile doesn't auto-open. Workaround: navigate to profile from the in-game header.
