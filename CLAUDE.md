# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

A multi-app monorepo deployed as a single Vercel project:

- `basketball/`, `baseball/`, `worldcup/` — independent Vite + React SPAs, each with its own `package.json` and `node_modules`. Each has a different `vite.config.ts` `base` (`/basketball/`, `/baseball/`) that controls the prod URL.
- `chooser/index.html` — static sport-selector landing page; copied to `dist/index.html` at the site root by the build script.
- `api/` — Vercel serverless functions (Node, `@vercel/node`). Auto-detected by Vercel because `vercel.json` has no `builds` array. `api/_lib/` is skipped by Vercel's auto-routing (underscore prefix).
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
- **Server-side commentary** lives in `shared/commentary/` but is invoked from `api/hand/`. Tests for both go under `shared/commentary/__tests__/` and `api/__tests__/`.
- **Multi-LLM router** (`api/_lib/router/`) is shared infra also used by an external project. Treat it as a stable interface.

## Env var split

`VITE_*` vars are public — Vite inlines them into the SPA bundle at build time. Bare names (`SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_*`) are server-only and consumed by `/api/*` functions. See `.env.example` for the canonical list. Both must be set in the Vercel dashboard for prod.

## Feature flags

Runtime flags live in `shared/featureFlags.ts`, gated by `VITE_FEATURE_*` env vars (default off). Pattern: ship behind a flag, flip in Vercel when ready. Current flags include `topGames` and `VITE_FEATURE_FEEDBACK_FORM`.

## Sport-agnostic architecture (read this before adding code)

**Basketball is the canonical reference.** Every other sport must follow basketball's structure. When basketball and baseball look different at the user-facing layer for any reason other than the sport itself (different stats, different roster shape, different rules), that's a bug — not a feature.

### The principle

> Sport-agnostic by default. Anything without a sport-specific *reason* to differ lives in `shared/`. Sport-specific code only exists in `{sport}/src/` when the substance — formulas, layout, components — actually differs.

### Decision tree (use this every PR)

```
1. Is the BEHAVIOR identical across sports?
   YES → shared/. Done.
   NO  → step 2.

2. Is the only difference DATA (numbers, weights, lists, colors)?
   YES → behavior in shared/, data on SportAdapter. Done.
   NO  → step 3.

3. Is the only difference a VISUAL bit (a stat tile, a position pill, a badge icon)?
   YES → component in shared/, sport bit comes via render-prop / SportAdapter slot. Done.
   NO  → step 4.

4. Behavior genuinely differs by sport.
   → Lives in {sport}/. Exposed via SportAdapter so shared code can call it.
```

If you find yourself copying a file from `basketball/` to `baseball/` and changing it slightly, **stop**. That's the warning sign. Promote to `shared/`, expose the differing bit through `SportAdapter`.

### The SportAdapter contract

`shared/adapters/SportAdapter.ts` defines the abstract base. Every sport extends it (`basketball/src/adapters/SportAdapter.ts`, `baseball/src/adapters/SportAdapter.ts`, etc.). TypeScript catches missing members at compile time. Adding a new sport means writing one adapter file — that's the whole cost.

The adapter exposes everything sport-specific:

- **Identity:** `sportKey`, `displayName`, `salaryCap`, `rosterSize`, `positions`, `rosterSlots`
- **Economy:** `economyConfig`, `tierFromSalary`, `winTiers`, `getWinThresholds`
- **Math:** `computeFantasyPoints`, `computeFantasyPointsDetailed`, `computeBadges`
- **Display:** `displayPosition`, `normalizePosition`, `normalizeTier`, `isPitcherPosition` (or sport-equivalent), `formatStatLine`
- **Validation:** `isValidPosition`, `isValidStatCategory`, `isValidRoster`, `getPositionLimits`
- **Components:** `CardComponent` (one card renderer), `LandingHero` (landing page card slot)
- **Data:** `getPlayers()`, `getLogsByKey()`, `getTodaysStars()`, `buildBonusPool()`, `getDailyBonusMapNow()`
- **FTUE:** `ftueRoster`, `ftueDrawnRoster`, `ftueTextConfig`
- **Branding:** `headshotUrl(id)`, `sportLabel`, `teamFlavor`, `playerCulture`
- **Audio:** `soundPack` — registered at module-load via `setSoundPack()`
- **Records:** `recordSources` — registered at module-load via `registerRecordSources()`

If you need to add something sport-specific, **add it to the adapter, not to the sport's view files**.

### Canonical (shared-only) files

These files exist exactly once, under `shared/`. If you find a copy in `{sport}/src/`, that's drift — promote.

- `shared/views/GameView.tsx` ✓ (sport wrappers pass a `GameAdapter`)
- `shared/components/LandingPage.tsx` ✓ (sport wrappers pass a `LandingAdapter`)
- `shared/components/GameBar.tsx` ✓
- `shared/components/CoachLayer.tsx` ✓ (FTUE state machine)
- `shared/components/CardFront.tsx`, `PlayerCardShell.tsx` ✓
- `shared/utils/payoutLogic.ts` ✓ (streak math, win-tier math)
- `shared/utils/dailyBonus.ts`, `dailyBonusPool.ts` ✓
- `shared/utils/audioDirector.ts`, `soundPack.ts` ✓
- `shared/engines/dataEngine.ts`, `resolveEngine.ts`, `rosterEngine.ts`, `economyEngine.ts` ✓
- `shared/commentary/*` ✓ (templated commentary system)
- `shared/hooks/useFTUE.ts`, `useEmotionalReveal.ts` ✓
- `shared/data/recordDetector.ts` ✓

The `{sport}/src/{file}.ts` files for these names should be either thin wrappers (re-exports + sport config wiring) or not exist at all.

### Legitimate sport-specific files

These have a real reason to differ — keep per-sport:

- `{sport}/src/components/AthleteCard.tsx` / `BaseballCard.tsx` — different stat tiles, different hero. Both call `<CardFront>` from shared.
- `{sport}/src/components/LandingPage.tsx` — thin shim that builds a `LandingAdapter` (demo card list, headshot URL, card component, grid layout, optional audio bed and game-log resolver) and passes it to `@shared/components/LandingPage`.
- `{sport}/src/adapters/SportAdapter.ts` — implements the contract.
- `{sport}/src/adapters/{sport}Config.ts` — the data the adapter wraps.
- `{sport}/src/adapters/ftueRoster.ts` — sport-specific FTUE roster (different players).
- `{sport}/src/utils/playerCulture.ts`, `teamFlavor.ts` — sport-specific data.
- `{sport}/src/utils/soundPack.ts` — sport-specific audio assets list.
- `{sport}/src/main.tsx`, `App.tsx`, `vite.config.ts` — entry points.

### Migration status (where we are)

**Already shared correctly:** GameView (canonical), LandingPage, GameBar, CoachLayer (FTUE state machine), CardFront, PlayerCardShell, all engines, all utils for streak/bonus/audio/records, the commentary system.

**Drifted, awaiting promotion:** None as of Phase 2 cutover.

**Recently lifted:**

- `GameView.tsx` ✓ Phase 2 (shipped 2026-04-29) — shared component takes a `GameAdapter`. Per-sport wrappers are now ~80–215 line shims (basketball 156, baseball 216 vs. 2458/2185 before). Supporting hooks: `_useSharedGameState.ts`, `_useReveal.ts`, `_gameViewHelpers.tsx`. Adapter contract in `shared/views/GameAdapter.ts`. Plan: `docs/superpowers/plans/2026-04-29-gameview-shared-phase-2-implementation.md`.
- `LandingPage.tsx` ✓ Phase 1 (shipped earlier) — shared component takes a `LandingAdapter`. Per-sport files are now ~80–140 line shims (basketball 79, baseball 137 vs. 335/374 before).

**Phase-2 follow-ups (open, non-blocking):** baseball `SportConfig` structural alignment with shared, `GeneratedCard.gameInfo.homeAway` narrowing, `AthleteCard` Props tightening, `RegisterNudge` dead-code deletion, `PostHandSheet` adapter slot decision. Tracked in PR review notes; can be picked up in a regular cleanup pass.

### Drift prevention (not all in place yet)

Eventually we want all of these. Today only the first one is enforced by tooling:

1. **TypeScript compile check on `SportAdapter`** — if a sport doesn't implement a required member, the build fails. ✓ (today)
2. **ESLint `no-cross-sport-imports`** — `basketball/` cannot import `baseball/`, etc.
3. **ESLint `no-duplicate-canonical-files`** — files like `GameView.tsx`, `LandingPage.tsx` cannot exist outside `shared/views/` (with a temporary exemption during the migration).
4. **CI parity snapshot test** — render `<GameView adapter={basketball}>` and `<GameView adapter={baseball}>` in the same state, assert structural HTML matches modulo sport-specific text.
5. **PR template item** — *"If this change adds code to a `{sport}/` directory, justify why it can't live in `shared/`. Link the SportAdapter member it surfaces through."*

### Quick examples

| Concern | Where it goes | Why |
|---|---|---|
| Streak bonus math (3-win = 1.3x) | `shared/utils/payoutLogic.ts` | Identical logic and numbers across sports |
| Salary cap value ($250 vs $180) | `adapter.salaryCap` | Different number, identical use |
| Card front layout | `shared/components/CardFront.tsx` + sport-specific `<Hero>` slot | Most of the layout is shared |
| Stat tiles on card back | sport-specific component | Real layout difference per sport |
| FTUE step sequence (deal → hold → draw → reveal → flip → final) | `shared/components/CoachLayer.tsx` | Same flow |
| FTUE coach text content | `adapter.ftueTextConfig` | Sport-specific copy |
| Daily-bonus picker logic | `shared/utils/dailyBonus.ts` | Identical algorithm |
| Daily-bonus eligible player list | `adapter.buildBonusPool()` | Different player set |
| Audio bed sound | `adapter.soundPack` (registered) | Different audio asset; no asset → silence |
| Win tier slam animation | `shared/views/GameView.tsx` (target) | Identical animation, different threshold values
