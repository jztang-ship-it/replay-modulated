# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Process discipline (READ BEFORE ANY CODE WORK)

**This section is non-negotiable and overrides any general-purpose workflow assumptions, including those introduced by third-party Claude Code frameworks (SuperClaude personas, slash-command workflows, etc.). When a framework's default behavior conflicts with the rules below, these rules win.**

### The two source-of-truth docs

- **This file (`CLAUDE.md`)** — process rules, vocabulary, session rituals. Stable across features. Auto-loaded by Claude Code at session start.
- **`docs/replaymod-design-decisions.md`** — feature design state. What's locked, what's pending, what shipped. Updated mid-session whenever a decision is locked; consolidated at session end. **Read this in full before doing any feature work.** It contains LOCKED decisions that must not be re-litigated, OPEN questions that need resolution before related code, and the current build sequence.

If a feature is mentioned in conversation but not described in `docs/replaymod-design-decisions.md`, the design is not yet locked. Surface the gap; do not invent the design.

### Session-start ritual (run before any work)

Every Claude Code session starts with these five checks. Report each result before proceeding to the user's task.

1. **`pwd`** — confirm working directory. Stamps work must run in `.claude/worktrees/feat-team-stamps`. Main work in `/Users/john/Desktop/ReplayMod/basketball/`. The `feat+achievements-and-challenges` worktree is unrelated and must not be touched for non-achievements work.
2. **`git branch --show-current`** — confirm branch matches the feature. If the worktree and branch don't match expectations, stop and surface the mismatch.
3. **`git log origin/main..main --oneline`** — confirm local-vs-remote state. **Do not trust the design doc's "current state" section over what git actually says.** The doc can drift; git can't.
4. **`git status`** — confirm working tree state. Uncommitted changes from a previous session should be surfaced, not silently inherited.
5. **Cross-worktree scan via registry** — `docs/worktree-registry.md` is the single source of truth for worktree state. At session start, run `git worktree list` and compare to the registry:
   - **New worktree not in registry?** Add an entry before proceeding with the user's task. Don't operate on undocumented worktrees.
   - **Worktree in registry?** If its `last reviewed` date is more than 7 days old OR you're about to do anything destructive (merge, branch delete, worktree remove, force-push), refresh its entry: re-run `git status --short`, `git log main..<branch> --oneline | wc -l`, `git stash list`, and update the entry. Watch especially for divergence in `docs/` and `CLAUDE.md` — parallel evolution across worktrees is the highest-frequency source of mid-merge surprise.
   - **About to delete a branch or worktree?** Read the entry's "What it carries" and "Equivalence on main" sections. If equivalence is unverified, verify before deletion. SHA divergence is not the same as work divergence — a branch with N unique commits can still have zero unique work if those commits were re-landed on main via PR-squash or cherry-pick. The registry's "archive-candidate" vs "active-parked" distinction is exactly this check.
   - **Uncommitted files in a parked worktree?** They are at risk. The registry should already list them under "Uncommitted state." If you find untracked files not in the registry, that's drift — investigate origin before any clean operation.

   *(Lesson sources: 2026-05-22 design-decisions parallel evolution discovered mid-merge; 2026-05-23 four worktrees mis-categorized as "dormant" before content was read, including one with 23 unique commits + a stash, another with 2 unique commits of a never-landed CardFace refactor.)*

If any of these surface something unexpected, stop and report. Do not proceed with the user's task until state is reconciled.

### Investigation-first rule

Before any wiring, refactor, or feature work:

1. Diagnose. Read the relevant files. Map current behavior.
2. Surface findings as a written report — file paths, line numbers, git commit hashes where relevant.
3. Get direction confirmation from the user.
4. *Then* write code.

This applies even when the task seems small. The WS2 regression (commit `5f4ae5e`, May 19 2026) happened because a "small wiring change" replaced an entire content source without anyone noticing the slot-content implication. Investigation-first would have caught it.

### Scope is strict

- Do what was asked. Do not auto-extend.
- No "while I'm in here" fixes. Surface them as candidates for the next session; never silently add them to the current commit.
- If during investigation you find a regression, bug, or design violation outside the current scope: surface it, do not fix it as part of this work.

### Verification checklist at completion

Every build prompt must end with a verification checklist drawn from the relevant LOCKED section of `docs/replaymod-design-decisions.md`. Before considering the work done, walk the checklist item-by-item and report pass/fail for each.

If the user's prompt does not include a checklist, ask for one before completing the work. Do not assume you can verify against the spec without an explicit checklist — the spec lives in the design doc, but mapping spec to verification is per-build.

### Doc-before-code

A design decision is "locked" only when written into `docs/replaymod-design-decisions.md`. Discussing it in chat or in a Code session and saying "yes" is not enough — chat history does not load into future Code contexts. If a decision is reached during a session and there's no corresponding doc edit, the decision is at risk of being lost.

When a decision is reached but not yet in the doc: pause implementation work, surface the gap to the user, and either request a doc update or write the decision into a clearly-marked "Pending doc update — session X" section at the top of the design doc. **Never proceed to implementation on a doc-less decision.**

### Pre-merge verification

- Full `npm test` from the repo root before any push. Never scoped vitest (`npx vitest run <path>`) as a substitute.
- Production-equivalent build before push:
  - Routine single-sport commits: `npm --prefix basketball run build` (basketball SPA; faster iteration).
  - Commits touching shared infrastructure (anything in `shared/`, `api/`, or cross-sport components) OR any push approaching a release: `bash scripts/build-vercel.sh` (builds all sports as Vercel does).

  Either command catches missing-export and other production-bundler errors that `npm test` and `tsc` don't surface — see Item C / commit `a4b74b0` for the precedent regression. Root `npm run build` is a no-op; do not use it.
- Manual smoke test against the relevant smoke checklist in `docs/replaymod-design-decisions.md` before push.
- If `npm test` fails on something unrelated to the current work, stop and surface — do not push around it.

#### Visual / layout changes — real-browser verification required

The vitest suite runs in JSDOM. JSDOM does NOT compute CSS transforms, `scale()`, `transformOrigin`, flex/grid layout, or visual position — `getBoundingClientRect()` returns zeros. DOM-presence assertions (`getByText`, `getByTestId`) only prove an element exists in the tree; they do NOT prove it renders inside the visible viewport. A bug class slipped through this gap: a strip card scaffold rendered scaled content at negative pixel coordinates and `overflow: hidden` clipped everything, while every JSDOM presence assertion stayed green. See the rework section of `docs/h2h-reveal-arc-design.md` for the precedent.

Two rules apply to any visual / layout change:

1. **Reuse working scaffolds before deriving new ones.** When an equivalent layout (sized card in a sized cell, scaled card in a strip, overlay positioned over a fixed canvas, etc.) is already working elsewhere in the codebase, COPY that scaffold. Do not hand-write a parallel one — divergences in `transformOrigin`, `display: flex` vs `position: absolute`, or natural-width constants will not be caught by JSDOM tests.
2. **Real-browser bounding-box check required.** Before claiming a visual / layout change verified, run a real-browser check that asserts each rendered element's `getBoundingClientRect()` falls inside its container's rect (Playwright or equivalent). DOM presence and snapshot assertions do not satisfy this. The check should walk the relevant state(s) and verify visible layout, not just mount.

This rule applies to: strip cells, hand-strip-style scaled card surfaces, hero-zone composition, overlay positioning, fixed/absolute stacking decisions, and any new component that mounts a sport-provided `renderCard` inside a sized box.

### End-of-session ritual

Before considering a session complete:

1. Report a deliberate doc diff: every locked decision added, every pending item resolved, every vocabulary change. Surface this to the user as a list, not buried in prose.
2. Confirm the design doc reflects current reality. If it doesn't, update it now, not "next session."
3. Confirm what's pushed vs what's local. If something is intentionally push-held, name it explicitly.

### Vocabulary (use these exactly)

- **Edit** — file changed in working directory, not in git
- **Commit** — local snapshot, not pushed
- **Push** / **shipped** — uploaded to origin, visible to production (deployment pipeline permitting)
- **Applied** — file changed on disk, not necessarily committed
- **Push held** — commits exist locally, deliberately not pushed (must be explicitly stated; not the default)
- **Stamps** — `BAD BEAT`, `[TIER] MISS`, `CAREER HI`, `RECORD`, `SEASON HI`. Not synonymous with badges (the 19 stat markers) or tiers (BUST/ROOKIE/STARTER/ALL STAR/MVP/LEGEND).
- **MISS** (formerly `NEAR MISS`) — locked vocabulary change. Tier-prefixed in stamp form: `STARTER MISS`, `ALL STAR MISS`, etc.
- Slate is the day's player pool; not a synonym for roster swap.

When current code uses old vocabulary (e.g. `near_miss` in trigger names), rename as part of the relevant feature work — do not perpetuate drift.

### Worktree discipline

This repo uses multiple worktrees under `.claude/worktrees/`:

- `feat+achievements-and-challenges` — unrelated to main work. Do not touch for non-achievements tasks.
- `feat-team-stamps` (or similar feature-named worktrees) — dedicated per-feature build environments.

Confirm worktree at session start (step 1 of the session-start ritual). Cross-worktree confusion has caused real regressions; the dedicated-worktree-per-feature pattern is how we avoid it.

### Third-party framework note (SuperClaude, etc.)

SuperClaude and similar frameworks add slash commands (`/sc:*`), specialized agents, and behavioral injection at session start. They are useful for exploration, brainstorming, and research tasks. They are **not** authoritative on this project's process. When a SuperClaude default workflow and the rules in this document disagree, this document wins.

In particular: do not let `/sc:analyze`, `/sc:brainstorm`, agent personas, or framework "modes" bypass the investigation-first rule, the doc-before-code rule, or the verification checklist requirement.

---

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

## Sport design rules

### Positional requirements rule

A sport has positional roster slots if and only if its positions accumulate different stats (e.g. goalkeeper saves, pitcher pitch counts). Basketball does NOT have positional slots — all players accumulate the same stat categories (pts/reb/ast/stl/blk/etc.). Football, baseball, and soccer DO have positional slots because of position-unique stats. When implementing or modifying deal-generation, stat-tracking, or roster logic, do not introduce positional structure to basketball even if shared code suggests it. Basketball's deal is N undifferentiated cards under cap, period.

## Communication Mode

Default to concise implementation-focused responses:
- minimal filler
- short execution-oriented answers
- concise bullets/checklists
- no long summaries unless requested

Do NOT reduce reasoning quality for product/design discussions.

## Session bootstrap for reasoning Claudes

Chat-based reasoning sessions (chat.claude.ai) lack filesystem access by default but can process zip uploads. At the start of a new reasoning-Claude session about this project, run `npm run digest` (or `node scripts/buildDigest.mjs`) to produce a project digest zip. Upload that single file to the reasoning session. Refresh the digest when the branch state changes during the conversation. The digest is gitignored.
