# Cloudflare migration handoff — basketball beta

This document describes the complete deployable surface on the
`release/basketball-beta-cloudflare` branch. It intentionally contains no
secret values.

## Product scope

- Basketball-only controlled beta.
- Root landing page: `/`.
- Playable game: `/basketball/`.
- Free to play; no wagering economy or Boss entry point in the beta UI.
- The legacy `/api/share/card` endpoint is parked at
  `parked-api/share/card.ts` so the deploy stays within the former Vercel
  Hobby function limit. Restore or replace it deliberately if social OG-card
  generation is required.

## Build and data

- Current production-style build: `bash scripts/build-vercel.sh`.
- The canonical basketball source datasets are tracked under
  `basketball/public/data/`.
- `scripts/build-authority-data.mjs` generates 30 compressed season catalogs
  under ignored `server-data/basketball/` during the build.
- Do not copy `dist/`, `node_modules/`, or `server-data/` from a developer
  machine. Rebuild them from the tracked source.
- The current generated authority catalog is approximately 10 MB compressed.
  On Cloudflare, store or serve it through an appropriate asset/R2 strategy
  rather than assuming it can be bundled into a Worker.

## API surface to port

The beta currently exposes these 12 Vercel-style function routes:

- `/api/analytics`
- `/api/bonus-pool`
- `/api/challenge/create`
- `/api/challenge/:id`
- `/api/challenge/:id/attempt`
- `/api/challenge/:id/sender-hand`
- `/api/hand/resolve`
- `/api/headline`
- `/api/leaderboard`
- `/api/me`
- `/api/notifications`
- `/api/profile`

Cloudflare migration work:

1. Adapt `VercelRequest`/`VercelResponse` handlers to Workers or Pages
   Functions request/response handlers.
2. Replace `@vercel/functions` `waitUntil` usage with Cloudflare execution
   context `waitUntil`.
3. Replace or explicitly validate `@vercel/kv` usage. The underlying state is
   currently Upstash/Redis-compatible and must not be silently discarded.
4. Translate `vercel.json` rewrites, cache headers, and function file-inclusion
   behavior into Cloudflare routing and asset configuration.
5. Preserve dynamic challenge routes and the basketball SPA fallback.

## Runtime configuration

Transfer values through Cloudflare secrets/variables. Never commit secret
values to Git.

Server/runtime variables used by the API:

```text
AI_DAILY_REQUEST_LIMIT
COMMENTARY_API_KEY
DEEPSEEK_API_KEY
GROQ_API_KEY
HEADLINE_TIMEOUT_MS
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
UPSTASH_REDIS_REST_TOKEN
UPSTASH_REDIS_REST_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_URL
```

Client build variables:

```text
VITE_FEATURE_FEEDBACK_FORM
VITE_POSTHOG_HOST
VITE_POSTHOG_KEY
VITE_SENTRY_DSN
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_AUDIO_URL
VITE_SUPABASE_URL
```

Also preserve the configured headshot base URL used by the basketball build.

## External systems that are not contained in Git

- Supabase database contents and deployed schema state.
- Supabase authentication configuration and redirect URLs.
- Supabase Storage headshots and audio assets.
- Upstash/Redis leaderboard, analytics, rate-limit, and router state.
- PostHog and Sentry projects/configuration.
- DNS and domain assignments.
- Secret values currently configured in the hosting environment.

SQL migrations `001` through `020` are tracked in `supabase/migrations/`, but
their presence in Git does not prove that every migration has been applied to
the live Supabase project. Verify deployed schema state before cutover.

## Domain contract

- Internal: `dev.replayifs.com`
- Public beta: `beta.replayifs.com`
- Production: `replayifs.com` / `www.replayifs.com`

Do not send `*.vercel.app` or provider-generated preview URLs to testers. Invite
and share links must be generated from an explicit environment-specific branded
origin.

## Cutover verification

Before sending a branded link to testers:

1. Verify `/` and `/basketball/?play=1` anonymously on a real mobile browser.
2. Complete a full hand and confirm `/api/hand/resolve` succeeds.
3. Verify sign-in, profile, leaderboard, analytics, and challenge flows.
4. Confirm no Boss, wagering, coin, or payout language appears in beta mode.
5. Confirm Supabase and Redis writes reach the intended production resources.
6. Confirm cache headers and SPA fallbacks work on direct navigation and refresh.
