# Analytics Audit — Section 11

Audited 2026-05-01 against the Section 11 checklist requirement:

> "At minimum these events tracked: page_view, sport_selected, game_started, game_completed, score_submitted, leaderboard_viewed"

## Current state

The codebase already has a robust analytics pipeline at `shared/analytics/analytics.ts` — events go to BOTH a Vercel KV `/api/analytics` endpoint AND PostHog (when `VITE_POSTHOG_KEY` is set). The `track(product, feature, action, props)` helper is the single entry point.

Per-call sites discovered:
- **Auth flows** — `shared/auth/AuthProvider.tsx`: `signin_success`, `signup_email`, `signin_email`, `signin_google`, `link_google`, `signout`, plus failure variants.
- **Inbox flows** — `shared/inbox/*`: `opened`, `message_read`, `feedback_modal_opened`, `feedback_submitted`, `cta_clicked`, `survey_answered`.
- **Engagement** — `shared/engagement/*`: `task_collected`, `task_completed`, `streak_started`, `streak_extended`, `streak_busted`, `collect_screen_opened`, `leaderboard_task_tapped`.
- **Gameplay** — `shared/analytics/useGameAnalytics.ts` (via `gameAnalytics.*`):
  - `app_opened` (fires on each sport game's mount)
  - `hand_dealt`, `card_held`, `hand_resolved`, `hand_won`, `hand_lost`, `so_close`
  - `redraw_used`, `ftue_completed`, `session_end`
- **Reveal moments** — `shared/views/_useReveal.ts`: `top_game_revealed`.
- **GameBar** — `shared/components/GameBar.tsx`: `multiplier_selected`.
- **Profile / referral** — `shared/components/ProfileScreen.tsx`: `share_tapped`, `code_copied`.
- **Nav** — `shared/views/GameView.tsx`: `bell_clicked`, `signup_modal_shown`.

## Mapping vs. checklist

| Required event | Tracked today? | Mapping / gap |
|---|---|---|
| **page_view** | ⚠️ partial | `system/app_opened` fires when each sport game mounts (via `useGameAnalytics`). The **chooser landing** (`replayifs.com/`) has no tracking — it's a static HTML page, doesn't import the analytics module. |
| **sport_selected** | ❌ missing | The chooser sport-card click navigates to `/basketball/` or `/baseball/` but fires no event. |
| **game_started** | ✅ proxied | `gameplay/hand_dealt` fires per hand. Hand = "game" in our model. |
| **game_completed** | ✅ | `gameplay/hand_resolved` + the explicit `hand_won` / `hand_lost` twins. |
| **score_submitted** | ❌ missing | Score submits to leaderboard via `submitToLeaderboard("hand_best", …)` but no analytics event fires for "score went to leaderboard." |
| **leaderboard_viewed** | ❌ missing | `setShowLeaderboard(true)` fires from a handful of call sites — none track. |

## Gaps and recommended fixes

### Gap 1 — `score_submitted`

**Location:** `shared/views/_useReveal.ts:473` (where `submitToLeaderboard("hand_best", …)` is called inside the post-reveal pendingBalanceUpdateRef).

**Fix (small, low-risk):**
```ts
// after line 473 (the hand_best submit)
track("gameplay", "score_submitted", {
  sport: adapter.sportKey,
  score: parseFloat(totalFp.toFixed(1)),
  tier: tier ?? "BUST",
  hand_id: handIdForAudit,
  hand_number: handCount,
});
```

### Gap 2 — `leaderboard_viewed`

**Location:** any place that calls `setShowLeaderboard(true)` — there are 3 call sites in `shared/views/GameView.tsx` (lines 1947, 2045, 2136). Easiest place to centralize: when the LeaderboardScreen actually mounts.

**Fix option A (per-call-site, more accurate trigger context):**
```ts
// in each setShowLeaderboard(true) caller:
setShowLeaderboard(true);
track("leaderboard", "viewed", { source: "gamebar_trophy" /* or "post_hand", "profile", etc. */ });
```

**Fix option B (single mount tracker, simpler):**
Wrap the `<LeaderboardScreen ... />` in a small useEffect that fires `track("leaderboard", "viewed", { source: leaderboardSource })` when `showLeaderboard` flips true. Requires hoisting the source state, but easier to maintain.

### Gap 3 — `sport_selected` and chooser `page_view`

**Location:** `chooser/index.html`. This is a static HTML file — no Vite, no React, no `@shared/analytics` import. Adding tracking requires either:

**Option A — inline a tiny analytics fetch (recommended):**
```html
<script>
  // Tiny analytics: fire-and-forget POST to /api/analytics. Mirrors the
  // event shape the React analytics module emits.
  function trackChoose(action, props) {
    var uid = (function () {
      try {
        var existing = localStorage.getItem('rm_uid');
        if (existing) return existing;
        var fresh = 'u_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
        localStorage.setItem('rm_uid', fresh);
        return fresh;
      } catch (_) { return 'u_anonymous'; }
    })();
    var sid = (function () {
      try {
        var existing = localStorage.getItem('rm_sid');
        if (existing) return existing;
        var fresh = 's_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
        localStorage.setItem('rm_sid', fresh);
        return fresh;
      } catch (_) { return 's_anonymous'; }
    })();
    try {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          userId: uid, sessionId: sid,
          product: 'chooser', feature: 'nav', action: action,
          props: props || {}, timestamp: Date.now(),
          platform: 'web', appVersion: '1.0.0',
        }]),
        keepalive: true,
      });
    } catch (_) {}
  }
  trackChoose('page_view', { url: location.pathname });
  // Then in the existing card-click handler:
  // trackChoose('sport_selected', { sport: sport });
</script>
```

**Option B — defer to v1.1 (recommended for launch).** Sport-selected behavior is captured implicitly by `system/app_opened` firing on the destination sport's mount. We'd lose the funnel step "chose basketball but bounced before it loaded" but that's a small analytics gap, not a launch blocker.

## Recommendation

Ship gaps 1 + 2 as a small follow-up PR. Skip gap 3 (chooser tracking) for v1 — the analytics signal is **good enough** to monitor launch:
- Funnel start: `system/app_opened` (sport game mounted)
- Funnel mid: `gameplay/hand_dealt` (hand started)
- Funnel end: `gameplay/hand_resolved`, `hand_won`, `hand_lost`
- Engagement: `gameplay/streak_extended`, `gameplay/redraw_used`
- Auth lift: `auth/signup_email`, `auth/account_linked_from_anon`

Reddit post → conversion → retention can be measured from these alone. Filling in `sport_selected` + chooser `page_view` would be nice-to-have for the chooser-page bounce rate metric, but won't block the v1 reading.

## Sentry / error monitoring (separate from event tracking)

The checklist also requires error monitoring. **Status: not installed.** Recommended: `npm install @sentry/react` in basketball + baseball, init with the DSN in `main.tsx`. Needs:
- A Sentry project DSN (you create at sentry.io).
- The DSN added to Vercel env vars (`VITE_SENTRY_DSN`).
- A throw-test from a deployed page to confirm reports arrive.

Estimated work: ~1 hour. Out of scope for autonomous overnight execution (needs your DSN). Tracked for your morning queue.
