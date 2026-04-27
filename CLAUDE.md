# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

A multi-app monorepo deployed as a single Vercel project:

- `basketball/`, `baseball/`, `worldcup/` — independent Vite + React SPAs, each with its own `package.json` and `node_modules`. Each has a different `vite.config.ts` `base` (`/basketball/`, `/baseball/`) that controls the prod URL.
- `chooser/index.html` — static sport-selector landing page; copied to `dist/index.html` at the site root by the build script.
- `api/` — Vercel serverless functions (Node, `@vercel/node`). Auto-detected by Vercel because `vercel.json` has no `builds` array. `api/_lib/` and `api/_disabled/` are skipped by Vercel's auto-routing (underscore prefix).
- `shared/` — sport-agnostic infrastructure layer. Imported by every sport SPA via the `@shared` Vite alias (`@shared` → `../shared`). Has its own `node_modules`.
- `supabase/migrations/` — numbered SQL migrations (`001_*.sql` …).
- `docs/superpowers/{plans,specs}/` — dated design docs (`YYYY-MM-DD-<slug>.md`). Specs come before plans; new design work follows the same dating convention.

The root `package.json` (name `ireplay-engine`) holds the **api function deps + the test runner only**. It does *not* drive the SPA builds.

## Build, dev, test

```bash
# Vercel build (also reproduces the prod layout locally)
bash scripts/build-vercel.sh   # → dist/index.html + dist/basketball/ + dist/baseball/

# Dev (default = basketball)
npm run dev                    # alias for dev:basketball
npm run dev:basketball
npm run dev:baseball
npm run dev:worldcup

# Tests (vitest, from repo root — covers api/_lib, api/__tests__, shared/**/__tests__)
npm test                       # one-shot
npm run test:watch
npx vitest run <path>          # single file
npx vitest run -t "<name>"     # by test name

# Lint (per sport — no root lint script)
npm --prefix basketball run lint
npm --prefix worldcup run lint
npm --prefix worldcup run typecheck

# Win-tier simulators
npx ts-node shared/tools/runSimulator.ts basketball 10000
npx ts-node shared/tools/runSimulator.ts worldcup 10000
```

## Things that bite

- **Sport `node_modules` are independent.** Installing at the root does not install for `basketball/` or `baseball/`. The Vercel build script does each install separately; locally you have to do the same. React versions have drifted (basketball on 19, baseball on 18) — verify before assuming.
- **`vite.config.ts` dedupes `react`/`react-dom`** so imports from `../shared` resolve to the sport's own copy. Don't remove the `dedupe` block — Vercel monorepo builds break without it.
- **Vite dev proxies `/api` to a deployed Vercel preview**, not a local backend (see `basketball/vite.config.ts`). Editing `api/*.ts` and running `npm run dev` will hit the *deployed* code, not your changes. Use `vercel dev` or push to a preview to exercise api edits.
- **`api/_disabled/`** holds retired endpoints (e.g. `jackpot.ts`, `bonus-pool.ts`). Underscore prefix keeps them out of Vercel's auto-routing. Don't reactivate without checking — some are deprecated by terminology choice, not bugs.
- **Server-side commentary** lives in `shared/commentary/` but is invoked from `api/hand/`. Tests for both go under `shared/commentary/__tests__/` and `api/__tests__/`.
- **Multi-LLM router** (`api/_lib/router/`) is shared infra also used by an external project. Treat it as a stable interface.

## Env var split

`VITE_*` vars are public — Vite inlines them into the SPA bundle at build time. Bare names (`SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_*`) are server-only and consumed by `/api/*` functions. See `.env.example` for the canonical list. Both must be set in the Vercel dashboard for prod.

## Feature flags

Runtime flags live in `shared/featureFlags.ts`, gated by `VITE_FEATURE_*` env vars (default off). Pattern: ship behind a flag, flip in Vercel when ready. Current flags include `topGames` and `VITE_FEATURE_FEEDBACK_FORM`.
