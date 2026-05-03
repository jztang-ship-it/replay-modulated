# Prelaunch handover — Replay IFS

> **Read this first** at the start of a new session to pick up where we left off.
> Last updated: 2026-05-03 (evening; supersedes earlier 2026-05-01 entries).

## TL;DR

You're prepping `replayifs.com` (NBA + MLB) for a Reddit launch. The 12-section prelaunch checklist is **~92% done**. Major code work is wrapped — no open code PRs. Remaining items are content/ops (OG images, Sentry DSN, soft launch with friends, content recordings, HANDOVER hygiene).

What's live on prod right now:
- Phase 2 GameView lift, all Section 1 + 2 + 3 + 4 hardening + meta tags + landing-page upgrade.
- Two reveal-pipeline bug fixes (negative FP for bad pitching, Team-FP-anchor, skip-preserves-tapped-FP).
- ProfileScreen anonymous-user fix (#38) — was a real launch blocker.
- Wordmark click → chooser + leaderboard single-empty-state (#39).
- Unified chooser landing + `/api/me` + `?signin`/`?play`/`?profile` query handoffs (#40, #42).
- Auth flow end-to-end cleanup — sign-in keeps user on landing, name pill replaces 👤, lifted Profile to App level, sticky skip-landing flag on Play IFS (#42).
- Google OAuth `redirectTo` cherry-picked into #42; Supabase Redirect URLs allowlist now includes apex + WWW + Vercel preview wildcards.
- Section 11 audit Gaps 1+2 (`score_submitted` + `leaderboard_viewed` analytics) shipped (#37). Gap 3 (chooser analytics) closed in #40.
- Lighthouse perf wins (#36): boot skeleton ("Replay IFS / Warming up") on first paint, 7 lazy-loaded modal chunks, Supabase preconnect, robots.txt + sitemap.xml at site root. NBA ~72 / MLB ~62 (target was 80; v1.1 work for further gains).

What's open and unmerged on GitHub:
- **PR #34** (`prelaunch/launch-docs`) — docs only (this update). Safe to merge anytime.
- **PR #35** (`maintenance` branch) — DO NOT MERGE; this is the maintenance-mode page meant for promote/demote via Vercel dashboard.

No code PRs outstanding.

---

## Checklist status

| # | Section | Status |
|---|---|---|
| 1 | Phase 2 merge | ✅ shipped |
| 2 | Supabase hardening | ✅ shipped (free tier; pooler N/A for our REST-only architecture) |
| 3 | OG / meta tags | ✅ tags shipped; PNG images deferred (drop into `chooser/public/og-*.png`) |
| 4 | Landing page upgrade | ✅ shipped (PR #33 + unified chooser in #40); perf in #36 |
| 5 | Maintenance mode page | ✅ branch + preview ready — promote-flow not yet tested |
| 6 | Real-device QA | ✅ iPhone Safari pass (with + without VPN); Android Chrome from China without VPN: works for one tester, didn't work for John's specific device — known acceptable limitation |
| 7 | Soft launch | ⏳ needs friend network |
| 8 | Content assets | ⏳ your phone (10–15 sec screen recordings per sport) |
| 9 | Reddit prep | 📝 drafts in `launch-assets/reddit-posts.md` |
| 10 | Twitter prep | 📝 drafts in `launch-assets/twitter-posts.md` (account TBC) |
| 11 | Monitoring | ⚠️ analytics shipped (#37); Sentry not installed |
| 12 | Launch day kit | ⏳ your hands |

---

## What shipped to prod (chronological)

| PR | Title | Notes |
|---|---|---|
| #28 | Forward post-cutover hotfixes (#26, #27) | Streak scoping + reveal-bar held-FP seed |
| #29 | Skip preserves tapped cards' FP | Tap card, hit Auto, gauge rebounds to 0 |
| #30 | Negative FP cards + Team-FP includes anchor | Walker -5 ER showing as 0; held-anchor missing |
| #31 | Section 2 — hand_log audit + rate limit + nickname cap + CHECK constraints | Required `004_hardening.sql` applied via dashboard |
| #32 | Section 3 — OG + Twitter Card meta tags | PNGs deferred |
| #33 | Section 4 — landing page upgrade | New copy, TO BEAT preview, How-it-works modal, footer |
| #38 | Restore sign-out block to ProfileScreen scope | Anonymous-user crash; was a real launch blocker mis-diagnosed earlier |
| #39 | Wordmark click + leaderboard empty-state | Tap "REPLAY IFS" → `/?pick=1`; leaderboard collapses skeleton + empty into one state |
| #40 | Unified chooser + `/api/me` + `?signin`/`?play` handoff | New chooser front door + sport-landing-as-marketing-only behavior |
| #41 | (Closed — superseded) | redirectTo for Google OAuth — cherry-picked into #42 |
| #42 | End-to-end sign-in flow cleanup | Lifted ProfileScreen + RegisterModal to App level; landing nickname pill; sticky skip-landing on Play IFS; Google `redirectTo` |
| #43 | Move debug bar to bottom of viewport | Cosmetic — was covering the nav header |
| #37 | Section 11 — score_submitted + leaderboard_viewed analytics | Closes audit gaps 1+2 |
| #36 | Lighthouse wins — preconnect, code-split, boot skeleton | NBA 61→72, MLB 51→62; FCP 6.4s→1.7s; robots.txt + sitemap.xml live |

After every merge: `phase-2/gameview-shared` was forwarded to match main. All open PRs were rebased on new main as part of each cleanup.

---

## Decision queue

### High-priority — content/ops, not code

1. **Soft launch with friends** (Section 7). 5–10 people willing to play one hand and report back. Test the actual Reddit-traffic moment in low stakes.

2. **OG image PNGs.** Three files: `chooser/public/og-{home,basketball,baseball}.png`, 1200×630, <300 KB each. Drop them in; build picks them up via `scripts/build-vercel.sh`. Without them, Reddit/Twitter previews show no image.

3. **Sentry install.** Needs your DSN. ~1 hour. Without it, you'll have analytics events but no error monitoring during launch.

### Medium-priority

4. **Content recordings** (Section 8). 10–15 sec screen capture of one hand per sport, for Reddit/Twitter posts.

5. **Maintenance promote-flow test.** Promote `maintenance` branch's preview to prod once in a low-stakes window, then promote main back. URL: `https://replay-n4aubf1gv-john-tangs-projects-1c51aca7.vercel.app`. Verifies the kill-switch works before you actually need it.

6. **Pre-launch SQL dump** ✅ DONE 2026-05-03 via GitHub Codespaces (John's home network blocks postgres protocol; Codespaces bypasses it). File saved to `~/Backups/`. Re-run before launch night for a fresh snapshot if you want.

7. **Twitter handle** — when you create the account, update bio + grab the handle for footer link.

### Cleanup before launch (not blockers)

8. **Remove `?debug=1` overlay** from `basketball/src/App.tsx` and `baseball/src/App.tsx`. Or leave it — gated behind a query param so invisible to normal traffic. My recommendation: leave it for the first week post-launch in case of weird user reports.

9. **Lighthouse perf gap** — sport pages at 72/62, target was 80. v1.1 work: bundle-split engine + lazy FTUE flow + defer JSON parsing.

### Nice-to-have

10. **Cookie-based Supabase auth** (v1.1) — would eliminate the chooser's localStorage token-read brittleness. Half-day refactor.

11. **Automated weekly backup** — replace today's manual SQL dump with a Vercel cron that runs `pg_dump` weekly. ~1 hour.

---

## Critical context for the next session

### Architecture notes
- **Hybrid storage:** leaderboard is **Vercel KV** (Upstash sorted sets), not Supabase. Section 2 hardening had to be re-mapped since the checklist assumed a Supabase `scores` table.
- **Anonymous auth:** every fresh visit triggers `supabase.auth.signInAnonymously()` immediately on AuthProvider mount. Free tier rate limit raised to 200/hour.
- **Build pipeline:** monorepo with chooser (static HTML, no Vite) + basketball (Vite + React 19) + baseball (Vite + React 18) + worldcup (untouched). `scripts/build-vercel.sh` assembles everything to `dist/`. `chooser/public/*` files copy to dist root (OG images go here).
- **Vercel Preview env vars:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were originally Production-only; Preview scope added in Section 2 verification. Don't accidentally remove that.
- **Two landing surfaces (post-#40/#42):**
  - **Chooser** at `replayifs.com/` — multi-sport front door. Static HTML in `chooser/index.html`. Personalization runs inline JS, calls `/api/me` for auth state, reads Supabase localStorage synchronously for Bucket D.
  - **Sport-specific flippable-card landing** at `/basketball/` and `/baseball/` — only shown to first-time direct-link visitors of that sport. `?play=1` from chooser bypasses; sticky `localStorage.replay_skip_landing_<sport>` keeps it bypassed thereafter.
- **`/api/me` endpoint:** validates Supabase JWT (`Authorization: Bearer <token>`), returns `{ isAnonymous, nickname, uid }`. Always 200, anonymous fallback. `Cache-Control: private, no-store`.
- **Google OAuth:** `signInGoogle()` and `linkGoogle()` pass explicit `redirectTo: window.location.origin + window.location.pathname`. Supabase Redirect URLs allowlist must include apex + WWW + Vercel preview wildcards (see "Supabase config" below).

### Supabase config (set in dashboard, NOT in code)
- **Site URL:** `https://replayifs.com`
- **Redirect URLs allowlist** (these four):
  ```
  https://replayifs.com/**
  https://*.replayifs.com/**
  https://*.vercel.app/**
  http://localhost:5173/**
  ```
- The `*.replayifs.com/**` line is critical — Vercel canonicalizes apex to www.replayifs.com, so the redirect comes back on the WWW host and the apex-only line wouldn't match.
- **Email confirmation:** check Authentication → Providers → Email → "Confirm email" toggle. If ON, new email sign-ups remain anonymous until they click the email link. If OFF, sign-up is immediately non-anonymous.

### Behaviors to NOT break
- **Returning-user auto-redirect** in `chooser/index.html`: `localStorage.replay_last_sport` triggers `window.location.replace('/' + last + '/')`. Bypass via `?pick=1`.
- **Wordmark click → `/?pick=1`** in three places: `shared/components/AppHeader.tsx`, `shared/components/LandingPage.tsx`, and the boot skeleton in `basketball/index.html` + `baseball/index.html` (post-#36).
- **`?play=1` skip + sticky flag** — chooser appends `?play=1` on sport-card click; `App.tsx` sets `localStorage.replay_skip_landing_<sport> = "1"` so direct revisits also skip the marketing landing. Both query params (`?play=1`, `?signin=1`, `?profile=1`) are stripped via `history.replaceState` after mount.
- **`?signin=1` and `?profile=1`** open the App-level RegisterModal/ProfileScreen, overlaying both landing and game views.
- **Sign in from FTUE landing keeps you on landing.** Auto-promote was attempted and reverted in #42 — don't re-add it.
- **Skip-preserves-tapped-FP** logic in `shared/hooks/useEmotionalReveal.ts:skipToEnd`. Tested in PR #29.
- **Negative-FP cards animate down** (Walker pitching outings). The `Math.max(0, ...)` floors were removed in PR #30 across `useEmotionalReveal.ts` + `CardFront.tsx` + `PlayerCardShell.tsx`. Don't re-add them.
- **Team-FP label uses `displayFp`** (frozen-aware), not raw `runningTotalFp`.
- **Audit verification on `hand_best`** at `api/leaderboard.ts`: looks up the hand_id in `hand_log` via Supabase service-role.
- **`/api/me` always returns 200** — bad/missing/expired token degrades to anonymous. The chooser depends on this for clean fallback.
- **Sign-out block belongs to ProfileScreen, not InviteFriendsSection** (re #38).
- **ProfileScreen zIndex = 9999** — must stay above FTUE chrome (zIndex 1100).
- **Boot skeleton in `<div id="root">`** is replaced by React on mount. Don't touch the static fallback content unless updating brand copy intentionally.

### Feature flags / conventions
- `localStorageNamespace: ""` for basketball, `"baseball"` for baseball (PR #26 fix). Don't unify.
- `nsKey(adapter, key)` is canonical for per-sport scoping. Use for `replaymod_streak`, `rm_best_hand`, `rm_best_tier`. Other keys (balance, hand_count, on_board_today) are intentionally raw.
- `_useReveal.ts` and `_useSharedGameState.ts` are private to `shared/views/GameView.tsx`.

### localStorage keys the chooser reads (sync, no auth call)
- `replay_last_sport` — last sport picked
- `replaymod_ftue_basketball` / `replaymod_ftue_baseball` — per-sport FTUE-done (`"1"`)
- `rm_best_hand` (basketball, raw) / `baseball_rm_best_hand` (baseball, namespaced) — personal bests
- `replay_skip_landing_basketball` / `replay_skip_landing_baseball` — sticky chooser-pick flag
- Supabase token at `sb-<project>-auth-token` — `user.is_anonymous` read synchronously for Bucket D, then `/api/me` validates server-side

If you rename any of these, the chooser breaks silently.

### Tests baseline
`npm test` from repo root: **8 failed | 241 passed**. The 8 failures are pre-existing (`detectTopGame` test-hook + `scoring` negative-baseFP). Documented in CLAUDE.md as non-blocking.

### Typecheck baseline
`cd basketball && npx tsc --noEmit` silent.
`cd baseball && npx tsc --noEmit` silent. (The 8 ProfileScreen errors in earlier handovers were a real bug; fixed in #38.)

### Build outputs (gzipped, post-#36)
- `dist/basketball/assets/index-*.js`: ~840 KB (down from 851)
- `dist/baseball/assets/index-*.js`: ~780 KB (down from 791)
- 6 lazy overlay chunks: ~2-5 KB each (loaded on demand)

The 2.7-3 MB raw bundle is the dominant launch-blocker for sport-page perf. v1.1 should bundle-visualize.

### Debug helpers shipped
- **`?debug=1` query param** on `/basketball/` or `/baseball/` shows a green-on-black bar at the bottom of the viewport with live auth + view + sticky-flag state. Useful for mobile debugging without USB DevTools. Pointer-events: none — taps pass through.

### SQL dump procedure
- John's home network (China + VPN) blocks postgres protocol on port 5432.
- Use **GitHub Codespaces** to run pg_dump from a clean network. Open repo in Codespace, `pg_dump -h db.hnhrpwwznzokkfagfumb.supabase.co -U postgres -d postgres -p 5432 --no-owner --no-acl -f /tmp/replayifs-prelaunch.sql`, download the file.
- Database password lives in Supabase dashboard → Settings → Database. Save in 1Password.
- For repeat backups, build `/api/admin/dump` endpoint or set up a Vercel cron (v1.1).

---

## How to pick up next

1. Start a fresh session, paste the prelaunch checklist again if needed (it lives only in our chat).
2. Read this file (`docs/launch/HANDOVER.md`) to ground.
3. Most likely next: knock out OG image PNGs (~10 min), then Sentry install (~1 hour, needs DSN), then start coordinating soft-launch friends.

---

## Branches alive on origin

- `main` — production. Current HEAD: `086e549` (Lighthouse wins, #36).
- `phase-2/gameview-shared` — long-lived working branch, in sync with main.
- `prelaunch/launch-docs` (PR #34) — this docs branch.
- `maintenance` (PR #35) — DO NOT MERGE.

No open code branches.

---

## What's NOT in this codebase that you might think is

- The prelaunch checklist itself (lives only in our chat).
- OG image PNGs (`chooser/public/og-*.png` — paths reserved, files don't exist).
- Sentry init (no DSN, no install).
- Twitter handle (account TBC).
- Cookie-based Supabase auth (v1.1).
- Automated SQL backup (manual via Codespaces today; cron in v1.1).
