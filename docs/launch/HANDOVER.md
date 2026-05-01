# Prelaunch handover — Replay IFS

> **Read this first** at the start of a new session to pick up where we left off.
> Last updated: 2026-05-01.

## TL;DR

You're prepping `replayifs.com` (NBA + MLB) for a Saturday Reddit launch. The 12-section prelaunch checklist is roughly 70% done. **You're not blocked on me — the next moves are mostly your hands** (real-device QA, soft-launch friend network, content recordings, OG image PNGs, optional Sentry install).

What's live on prod right now:
- Phase 2 GameView lift (shipped pre-checklist).
- All Section 1 + 2 + 3 + 4 hardening + meta tags + landing-page upgrade.
- Two reveal-pipeline bug fixes (negative FP for bad pitching, Team-FP-anchor mismatch, skip-preserves-tapped-FP).
- Post-cutover hotfixes (#26, #27).

What's open and unmerged on GitHub:
- **PR #34** (`prelaunch/launch-docs`) — docs only, safe to merge anytime.
- **PR #35** (`maintenance` branch) — DO NOT MERGE; this is the maintenance-mode page meant for promote/demote via Vercel dashboard.
- **PR #36** (`prelaunch/section-4-perf`) — Lighthouse perf wins (+11 perf points). Needs visual smoke on a real device before merging.

---

## Checklist status

| # | Section | Status |
|---|---|---|
| 1 | Phase 2 merge | ✅ shipped |
| 2 | Supabase hardening | ✅ shipped (free tier; pooler skipped — N/A for our REST-only architecture) |
| 3 | OG / meta tags | ✅ shipped (image PNGs deferred — drop into `chooser/public/og-{home,basketball,baseball}.png`) |
| 4 | Landing page upgrade | ✅ shipped (PR #33) — perf wins in PR #36 unmerged |
| 5 | Maintenance mode page | ✅ branch + preview ready — **promote-flow not yet tested** |
| 6 | Real-device QA | ⏳ your phone (HARD GATE — 30-second test rules everything) |
| 7 | Soft launch | ⏳ needs friend network + final deploy approval |
| 8 | Content assets | ⏳ your phone (10-15 sec screen recordings per sport) |
| 9 | Reddit prep | 📝 drafts in `launch-assets/reddit-posts.md` |
| 10 | Twitter prep | 📝 drafts in `launch-assets/twitter-posts.md` (account TBC) |
| 11 | Monitoring | 📝 audit in `docs/launch/analytics-audit.md`; Sentry not installed |
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

After every merge: `phase-2/gameview-shared` was forwarded to match main (long-lived working branch convention).

---

## Decision queue (your morning)

### High-priority

1. **PR #36 perf wins** — open, unmerged. Smoke-test the preview URL [`https://replay-jtnqqh826-john-tangs-projects-1c51aca7.vercel.app`](https://replay-jtnqqh826-john-tangs-projects-1c51aca7.vercel.app) on a real iPhone. Watch for: brand skeleton flashing in/out cleanly on first load, lazy modals opening within ~100ms on first tap. If clean → merge. If anything flashes weird → file a comment and we revert.

2. **Section 6 — real-device QA**. The 30-second test on iPhone Safari + Android Chrome. **Hard gate** per the checklist. Outcome determines whether to launch Saturday.

### Medium-priority

3. **OG image PNGs** — when you've got them (any tool), drop into `chooser/public/og-home.png`, `og-basketball.png`, `og-baseball.png` (1200×630, <300 KB each). Build picks them up automatically — see `scripts/build-vercel.sh`.

4. **Lighthouse perf gap** — sport pages at 72/62 prod after PR #36 merge, target is 80. Three options in `docs/launch/lighthouse-audit.md`. My read: ship as-is, fix in v1.1.

5. **Twitter handle** — when you create the account, update bio + grab the handle for footer link. Drafts in `launch-assets/twitter-posts.md`.

6. **Sentry install** — needs your DSN. ~1 hour of work. See `docs/launch/analytics-audit.md`.

### Nice-to-have

7. **Analytics gaps** — `score_submitted` + `leaderboard_viewed` events missing. ~15 min PR. See `docs/launch/analytics-audit.md` gaps 1 + 2.

8. **Maintenance promote-flow test** — promote `maintenance` branch's preview to prod once in a low-stakes window, then promote main back. URL saved: `https://replay-n4aubf1gv-john-tangs-projects-1c51aca7.vercel.app`. Section 5 acceptance.

9. **Pre-launch SQL dump** — Supabase free tier has no PITR. Take a manual dump before launch day.

---

## Critical context for the next session

### Architecture notes
- **Hybrid storage**: leaderboard is **Vercel KV** (Upstash sorted sets), not Supabase. Section 2 hardening had to be re-mapped since the checklist assumed a Supabase `scores` table.
- **Anonymous auth**: every fresh visit triggers `supabase.auth.signInAnonymously()` immediately on AuthProvider mount. Free tier rate limit raised to 200/hour — borderline OK for v1 launch, will saturate briefly during a Reddit hug. Path 2 (defer anon sign-up to first hand) is on the v1.1 list if 200/hr proves insufficient.
- **Build pipeline**: monorepo with chooser (static HTML, no Vite) + basketball (Vite + React 19) + baseball (Vite + React 18) + worldcup (untouched). `scripts/build-vercel.sh` assembles everything to `dist/`. `chooser/public/*` files copy to dist root (added in Section 3 for OG images).
- **Vercel Preview env vars** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were originally Production-only; we added Preview scope in Section 2 verification so future preview deploys exercise the full Supabase path. Don't accidentally remove that.

### Behaviors to NOT break
- **Returning-user auto-redirect** in `chooser/index.html`: `localStorage.replay_last_sport` triggers `window.location.replace('/' + last + '/')`. Bypass via `?pick=1`.
- **Skip-preserves-tapped-FP** logic in `shared/hooks/useEmotionalReveal.ts:skipToEnd`. Tested in PR #29.
- **Negative-FP cards animate down** (Walker pitching outings). The `Math.max(0, ...)` floors were removed in PR #30 across `useEmotionalReveal.ts` + `CardFront.tsx` + `PlayerCardShell.tsx`. Don't re-add them.
- **Team-FP label uses `displayFp`** (frozen-aware) at `shared/views/GameView.tsx:1732`, not the raw `runningTotalFp`. Held-anchor's contribution lands in the spring; don't switch back.
- **Audit verification on `hand_best`** at `api/leaderboard.ts`: looks up the hand_id in `hand_log` via Supabase service-role. Skipped for `u_*` local-fallback uids; production has the env vars to fire it.

### Feature flags / conventions
- `localStorageNamespace: ""` for basketball, `"baseball"` for baseball (PR #26 fix). Don't unify them.
- `nsKey(adapter, key)` is the canonical way to scope a localStorage key per-sport. Use it for `replaymod_streak`, `rm_best_hand`, `rm_best_tier`. Other keys (balance, hand_count, on_board_today) are intentionally raw.
- `_useReveal.ts` and `_useSharedGameState.ts` are private to `shared/views/GameView.tsx`. Not for direct external use.

### Tests baseline
`npm test` from repo root: **8 failed | 241 passed**. The 8 failures are pre-existing (`detectTopGame` test-hook + `scoring` negative-baseFP). Documented in CLAUDE.md as non-blocking. Any **new** failure during your work is a regression.

### Typecheck baseline
`cd basketball && npx tsc --noEmit` silent. `cd baseball && npx tsc --noEmit` reports 8 errors in `shared/components/ProfileScreen.tsx:463-490` (`isAnonymous`, `user`, `handleSignOut`, `signingOut` undefined) — pre-existing tsconfig drift, documented as non-blocking. Filter them with `grep -v ProfileScreen`.

### Build outputs (gzipped)
- `dist/basketball/assets/index-*.js`: ~840 KB
- `dist/baseball/assets/index-*.js`: ~780 KB
- 6 lazy overlay chunks: ~2-5 KB each (loaded on demand)

The 2.7-3 MB raw bundle is the dominant launch-blocker for sport-page perf. v1.1 should bundle-visualize to find what's pullable.

---

## How to pick up next

1. Start a fresh session, paste the prelaunch checklist again if needed (it's not in any file in the repo — only in our chat history).
2. Read this file (`docs/launch/HANDOVER.md`) to ground.
3. The next conversation should probably start with smoke-testing PR #36 on a real device, then deciding the perf gap question, then moving to Section 6.

---

## Branches alive on origin

- `main` — production. Current HEAD: `41e58fd` (Section 4 landing).
- `phase-2/gameview-shared` — long-lived working branch, in sync with main.
- `prelaunch/launch-docs` (PR #34) — overnight docs work.
- `maintenance` (PR #35) — DO NOT MERGE.
- `prelaunch/section-4-perf` (PR #36) — perf wins, awaiting smoke.

---

## What's NOT in this codebase that you might think is

- The prelaunch checklist itself (lives only in our chat).
- Any OG image PNGs (`chooser/public/og-*.png` — paths reserved, files don't exist).
- Sentry init (no DSN, no install).
- Twitter handle (account TBC).
- Robots.txt referenced sitemap.xml — wait, those exist now (Section 4 perf, PR #36 unmerged).

Once PR #36 merges, robots.txt + sitemap.xml will be live at `replayifs.com/robots.txt` and `/sitemap.xml`.
