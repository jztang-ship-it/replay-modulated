# Football Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drifted `worldcup/` SPA with a clean `football/` SPA built on the canonical shared infrastructure (Phase 2 shape), with World Cup as the launch competition. Architecture supports adding EPL / La Liga / etc. by swapping data later.

**Architecture:** Bulldoze and rebuild. Use basketball's SPA as the canonical reference. Keep the substantive work already done in worldcup (position-specific FP weights, position-keyed badges, within-position salary normalization, StatsBomb data, transform script). Replace the structural drift (466-line GameView fork, hardcoded $12,451.29 bonus pool, local hooks/engines/components that should be re-exports). Ship in two PRs: PR 1 = playable loop, PR 2 = polish + validation.

**Tech Stack:** Vite + React (SPA), TypeScript, Vercel serverless API (`@vercel/node`), Vitest for tests, Vercel KV for bonus pool, StatsBomb for source data.

**Spec:** `docs/superpowers/specs/2026-05-05-football-bulldoze-and-rebuild-design.md`

**Branching:** Two feature branches off `main`:
- `feature/football-pr1-playable-loop` (Tasks 1.1 – 1.27)
- `feature/football-pr2-polish-validation` (Tasks 2.1 – 2.18, branched off `main` after PR 1 merges)

---

## File Structure

### PR 1 file map

**Renamed (preserves git history):**
- `worldcup/` → `football/` (entire directory, via `git mv`)
- `football/src/adapters/worldcupConfig.ts` → `football/src/adapters/footballConfig.ts`
- `football/src/components/PlayerCard.tsx` → `football/src/components/SoccerCard.tsx`

**Deleted (replaced by re-exports or shims):**
- `football/src/views/GameView.tsx` (466-line fork) — replaced by ~150-line shim
- `football/src/components/{GameBar,WinCelebration,AppHeader,RosterGrid,CardBackGeneric,ErrorBoundary}.tsx` — replaced by re-exports from `@shared/components/`
- `football/src/hooks/{useEmotionalReveal,useCardFlipState}.ts` — replaced by re-exports from `@shared/hooks/`
- `football/src/engines/{dataEngine,economyEngine,resolveEngine,rosterEngine}.ts` — replaced by re-exports from `@shared/engines/`

**Rewritten:**
- `football/src/App.tsx` — clone basketball's auth-aware shell
- `football/src/views/GameView.tsx` — ~150-line shim wrapping `@shared/views/GameView` with a `GameAdapter`
- `football/src/adapters/footballConfig.ts` — new tier ladder, sport key, multipliers, roster size; preserves position weights + badges + economy + statDisplay
- `football/src/adapters/SportAdapter.ts` — full `SportAdapter` contract impl
- `football/src/adapters/gameAdapter.ts` — minimal updates (config import name, roster slot count)
- `football/index.html` — title, sport label
- `football/package.json` — name field
- `football/vite.config.ts` — base path

**Created:**
- `football/src/components/SoccerCard.tsx` (rename of PlayerCard.tsx, refactored to wrap shared `<CardFront>`)
- `football/src/components/LandingPage.tsx` — ~140-line shim wrapping `@shared/components/LandingPage` with a `LandingAdapter`
- `football/src/adapters/ftueRoster.ts` — Messi-anchored 5-card FTUE roster + drawn-result snapshot
- `football/src/utils/playerCulture.ts` — sport-specific commentary flavor data (placeholder for now)
- `football/src/utils/teamFlavor.ts` — country/team flavor data
- `football/src/utils/soundPack.ts` — audio asset list (placeholder)
- `football/src/utils/payoutLogic.ts` — re-export from shared

**Modified outside `football/`:**
- `api/bonus-pool.ts` — `SUPPORTED_SPORTS` set updated; per-competition keying support
- `chooser/index.html` — third sport card (⚽ Football, "World Cup '26"); 3-card grid; bucket logic for 3 sports
- `scripts/build-vercel.sh` — add `football` to install + build matrix
- `vercel.json` — add `/football/:path*` rewrite

### PR 2 file map

**Modified:**
- `football/src/components/SoccerCard.tsx` — add stat → FP attribution rendering
- `football/src/components/RosterGrid.tsx` (or wherever the slot label lives in shared) — FLEX label + tooltip
- `football/src/adapters/footballConfig.ts` — calibrated tier thresholds (replaces seeds)
- `football/src/adapters/footballConfig.ts` — `ftueTextConfig` coach copy soccer-coded

**Created:**
- `football/src/__tests__/edgeCases.test.ts` — substitute, 0-min, position fluidity, GK-goal, red-card, penalty-shootout

---

## PR 1 — Bulldoze + playable loop

**Branch:** `feature/football-pr1-playable-loop`

**Goal:** A working `football/` SPA that ships the deal → hold → draw → reveal → results loop end-to-end with seeded tier thresholds and placeholder coach copy. Polish ships in PR 2.

### Task 1.1: Create branch + verify clean working tree

**Files:** none (git operations only)

- [ ] **Step 1: Verify on main + clean tree**

```bash
git status
```

Expected: `On branch main`, `nothing to commit, working tree clean`. If not, commit or stash before proceeding.

- [ ] **Step 2: Create + check out branch**

```bash
git checkout -b feature/football-pr1-playable-loop
```

Expected: `Switched to a new branch 'feature/football-pr1-playable-loop'`.

---

### Task 1.2: Rename `worldcup/` → `football/` (preserves git history)

**Files:**
- Rename: `worldcup/` → `football/`

- [ ] **Step 1: git mv the directory**

```bash
git mv worldcup football
```

- [ ] **Step 2: Verify git sees the rename**

```bash
git status --short
```

Expected: many `R worldcup/X -> football/X` lines (renames, not deletes+adds).

- [ ] **Step 3: Commit**

```bash
git commit -m "rename worldcup → football (directory only, contents unchanged)"
```

---

### Task 1.3: Update `football/package.json` name field

**Files:**
- Modify: `football/package.json`

- [ ] **Step 1: Edit package.json — change `"name": "worldcup"` → `"name": "football"`**

Use Edit with `old_string` containing the current name field and `new_string` with `"name": "football"`. (Read the file first if you don't know the surrounding context.)

- [ ] **Step 2: Reinstall to update lockfile**

```bash
npm --prefix football install
```

Expected: completes without errors. Lockfile updates.

- [ ] **Step 3: Commit**

```bash
git add football/package.json football/package-lock.json
git commit -m "rename(football): update package.json name field"
```

---

### Task 1.4: Update `football/vite.config.ts` base path

**Files:**
- Modify: `football/vite.config.ts`

- [ ] **Step 1: Read the current config**

```bash
cat football/vite.config.ts
```

Locate the `base:` line — currently `base: '/worldcup/'`.

- [ ] **Step 2: Edit base path**

Change `base: '/worldcup/'` → `base: '/football/'`. Preserve everything else (the `dedupe: ['react', 'react-dom']` block must stay — Vercel monorepo builds break without it per CLAUDE.md).

- [ ] **Step 3: Verify**

```bash
grep "base:" football/vite.config.ts
```

Expected: `base: '/football/'` (or with double-quotes — match existing style).

- [ ] **Step 4: Commit**

```bash
git add football/vite.config.ts
git commit -m "rename(football): vite base path /worldcup/ → /football/"
```

---

### Task 1.5: Update `football/index.html` title + meta

**Files:**
- Modify: `football/index.html`

- [ ] **Step 1: Read and update**

Change page title from "World Cup ..." or similar to "Replay IFS — Football". Update any `og:title` / `twitter:title` if they reference World Cup as the sport (keep "World Cup" only where it refers to the *competition*).

- [ ] **Step 2: Commit**

```bash
git add football/index.html
git commit -m "rename(football): index.html title — Football"
```

---

### Task 1.6: Update `scripts/build-vercel.sh` to build football alongside basketball + baseball

**Files:**
- Modify: `scripts/build-vercel.sh`

- [ ] **Step 1: Read the current build script**

```bash
cat scripts/build-vercel.sh
```

Identify the section that installs + builds basketball and baseball. There will be parallel blocks like:

```bash
npm --prefix basketball install
npm --prefix basketball run build
cp -R basketball/dist/. dist/basketball/

npm --prefix baseball install
npm --prefix baseball run build
cp -R baseball/dist/. dist/baseball/
```

(Check existing references to `worldcup` in this file — they should be replaced with `football`, OR the file may not yet build worldcup at all, in which case we add a new block for football.)

- [ ] **Step 2: Add (or rename) the football block**

```bash
npm --prefix football install
npm --prefix football run build
mkdir -p dist/football
cp -R football/dist/. dist/football/
```

If `worldcup` references already exist in the script, replace them with `football`. If not, add the block above between baseball and the chooser-copy step.

- [ ] **Step 3: Test the build locally**

```bash
bash scripts/build-vercel.sh
```

Expected: completes without errors. `dist/football/` should exist and contain `index.html` + `assets/`. (May fail later in the build if other tasks haven't run — that's OK; we'll verify clean build after Task 1.27.)

- [ ] **Step 4: Commit**

```bash
git add scripts/build-vercel.sh
git commit -m "build: add football to vercel build pipeline"
```

---

### Task 1.7: Add `/football/` rewrite to `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read current rewrites**

```bash
cat vercel.json
```

Current shape (per spec):

```json
{
  "buildCommand": "bash scripts/build-vercel.sh",
  "outputDirectory": "dist",
  "installCommand": "echo 'install handled by build-vercel.sh'",
  "rewrites": [
    { "source": "/basketball/:path*", "destination": "/basketball/index.html" },
    { "source": "/baseball/:path*", "destination": "/baseball/index.html" },
    { "source": "/((?!api/|basketball/|baseball/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 2: Add football rewrite, update fallback exclusion**

```json
{
  "buildCommand": "bash scripts/build-vercel.sh",
  "outputDirectory": "dist",
  "installCommand": "echo 'install handled by build-vercel.sh'",
  "rewrites": [
    { "source": "/basketball/:path*", "destination": "/basketball/index.html" },
    { "source": "/baseball/:path*", "destination": "/baseball/index.html" },
    { "source": "/football/:path*", "destination": "/football/index.html" },
    { "source": "/((?!api/|basketball/|baseball/|football/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "build(vercel): rewrite /football/ to football SPA"
```

---

### Task 1.8: Update `api/bonus-pool.ts` for per-competition keying + replace `worldcup` with `football`

**Files:**
- Modify: `api/bonus-pool.ts`

This is the bonus-pool API change for per-competition keying. Football requires a `competition` query param; basketball/baseball do not.

- [ ] **Step 1: Read the current file**

```bash
cat api/bonus-pool.ts
```

Note current shape (relevant lines):

```ts
const SEED = 1000;
const SUPPORTED_SPORTS = new Set(["basketball", "baseball", "worldcup"]);

function kvKey(sport: string): string {
  return `bonus_pool:${sport}`;
}
```

- [ ] **Step 2: Replace with per-competition logic**

Update the file to:

```ts
const SEED = 1000;
const SUPPORTED_SPORTS = new Set(["basketball", "baseball", "football"]);
const SUPPORTED_COMPETITIONS: Record<string, Set<string>> = {
  football: new Set(["world_cup"]),
};
const COMPETITION_REQUIRED = new Set(["football"]);

function kvKey(sport: string, competition?: string): string {
  if (competition) return `bonus_pool:${sport}:${competition}`;
  return `bonus_pool:${sport}`;
}

function validateRequest(sport: string, competition?: string): string | null {
  if (!SUPPORTED_SPORTS.has(sport)) return `Unsupported sport: ${sport}`;
  if (COMPETITION_REQUIRED.has(sport)) {
    if (!competition) return `Sport ${sport} requires competition param`;
    if (!SUPPORTED_COMPETITIONS[sport]?.has(competition)) {
      return `Unsupported competition for ${sport}: ${competition}`;
    }
  }
  return null;
}
```

Update the GET and POST handlers to read `competition` from `req.query` and pass it through to `kvKey()` and `validateRequest()`. Return 400 with the error string if `validateRequest` returns non-null.

- [ ] **Step 3: Update doc comment at top of file**

Replace the `GET ?sport=<basketball|baseball>` line with:

```
GET  ?sport=<basketball|baseball>                           → { pool: number }
GET  ?sport=football&competition=<world_cup>                → { pool: number }
POST { sport, action: "contribute", amount, competition? }  → { pool: number }
```

Keep the comment line that says *"Bonus-pool terminology only — never 'jackpot' in copy/code/schema."* (it's the canonical guidance).

- [ ] **Step 4: Add (or update) tests**

Locate `api/__tests__/bonus-pool.test.ts` if it exists. If yes, update tests to cover:
- `GET ?sport=basketball` → 200, returns pool
- `GET ?sport=football` → 400, "requires competition param"
- `GET ?sport=football&competition=world_cup` → 200, returns pool from `bonus_pool:football:world_cup`
- `GET ?sport=football&competition=epl` → 400, "Unsupported competition"

If no test file exists, create one at that path with the four cases above.

- [ ] **Step 5: Run tests**

```bash
npx vitest run api/__tests__/bonus-pool.test.ts
```

Expected: PASS for all cases.

- [ ] **Step 6: Commit**

```bash
git add api/bonus-pool.ts api/__tests__/bonus-pool.test.ts
git commit -m "feat(bonus-pool): per-competition keying for football; replace worldcup with football"
```

---

### Task 1.9: Rename `worldcupConfig.ts` → `footballConfig.ts`

**Files:**
- Rename: `football/src/adapters/worldcupConfig.ts` → `football/src/adapters/footballConfig.ts`

- [ ] **Step 1: git mv the file**

```bash
git mv football/src/adapters/worldcupConfig.ts football/src/adapters/footballConfig.ts
```

- [ ] **Step 2: Update imports of the old name**

Find all importers:

```bash
grep -rn "worldcupConfig" football/ --include="*.ts" --include="*.tsx"
```

For each match, update the import path to `./footballConfig` (or relative path equivalent).

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -rn "worldcupConfig" football/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add football/
git commit -m "rename: worldcupConfig.ts → footballConfig.ts"
```

---

### Task 1.10: Rewrite `footballConfig.ts` content — sport key, class name, tier ladder, roster size

**Files:**
- Modify: `football/src/adapters/footballConfig.ts`

This is the main config update. **Preserve** position weights, badges, position aliases, statDisplay, economy config, headshotUrl. **Change** sport key, class/var name, roster size, tier names, multipliers, threshold seeds.

- [ ] **Step 1: Read current file** (you should have seen it during Task 1.9)

```bash
cat football/src/adapters/footballConfig.ts
```

- [ ] **Step 2: Apply these specific edits**

Replace at the top of the file:

```ts
export const WorldCupSportConfig: SportConfigShape = {
  sportKey: "worldcup",
  sportLabel: "World Cup",
```

with:

```ts
export const FootballSportConfig: SportConfigShape = {
  sportKey: "football",
  sportLabel: "Football",
  competition: "world_cup",   // launch competition
```

(`competition` is a new field. If `SportConfigShape` doesn't have it, add `competition?: string` to the shared type in `shared/types/index.ts` or wherever `SportConfigShape` is defined — see Task 1.11.)

Update the roster section:

```ts
  rosterSize: 5,
  maxPlayers: 5,
  rosterSlots: ["GK", "DEF", "MID", "FWD", "FLEX"],
  excludeFromFlex: ["GK"],
  salaryCap: 180,
```

Replace the `winTiers` array completely:

```ts
  winTiers: [
    { name: "SUB",      minFp: 130, multiplier: 0.5, color: "#94A3B8" },
    { name: "STARTER",  minFp: 150, multiplier: 1.5, color: "#10B981" },
    { name: "CAPTAIN",  minFp: 167, multiplier: 3,   color: "#3B82F6" },
    { name: "MOTM",     minFp: 192, multiplier: 8,   color: "#F59E0B" },
    { name: "LEGEND",   minFp: 215, multiplier: 50,  color: "#EF4444" },
  ],
```

(Threshold values are seeds. PR 2 calibrates via simulator.)

Comment update: replace any "World Cup specific" comment headers with "Football (World Cup '26 launch competition)".

- [ ] **Step 3: Verify the file still parses**

```bash
npm --prefix football run typecheck
```

If errors reference `WorldCupSportConfig`, search for remaining importers and update:

```bash
grep -rn "WorldCupSportConfig" football/ --include="*.ts" --include="*.tsx"
```

Update each to `FootballSportConfig`.

- [ ] **Step 4: Re-run typecheck**

```bash
npm --prefix football run typecheck
```

Errors are expected at this stage from other still-stale files (will be fixed by later tasks). The specific class-name errors should be gone.

- [ ] **Step 5: Commit**

```bash
git add football/src/
git commit -m "feat(football): rewrite footballConfig — new tier ladder, 5-slot roster, sport key"
```

---

### Task 1.11: Add `competition?: string` to `SportConfigShape`

**Files:**
- Modify: `shared/types/index.ts` (or wherever `SportConfigShape` is exported from)

- [ ] **Step 1: Find the type definition**

```bash
grep -rn "SportConfigShape" shared/types/ shared/ | head -5
```

- [ ] **Step 2: Add the optional field**

In the `SportConfigShape` interface, after `sportLabel`, add:

```ts
  /** Active competition (e.g. "world_cup", "epl"). Optional — sports with one
   *  competition (basketball/NBA, baseball/MLB) omit this. Football requires it. */
  competition?: string;
```

- [ ] **Step 3: Run a repo-wide typecheck**

```bash
npx vitest run --typecheck
```

Or if a separate `tsc` invocation makes more sense:

```bash
npm --prefix basketball run typecheck && \
npm --prefix baseball run typecheck && \
npm --prefix football run typecheck
```

Other sports' configs don't set `competition`, which is fine because it's optional.

- [ ] **Step 4: Commit**

```bash
git add shared/types/
git commit -m "types(SportConfigShape): add optional competition field"
```

---

### Task 1.12: Update `football/src/adapters/SportAdapter.ts` — import new config, ensure full contract

**Files:**
- Modify: `football/src/adapters/SportAdapter.ts`

- [ ] **Step 1: Read the file**

```bash
cat football/src/adapters/SportAdapter.ts
```

- [ ] **Step 2: Update imports + reference**

Replace `import { WorldCupSportConfig } from "./worldcupConfig"` (or similar) with:

```ts
import { FootballSportConfig } from "./footballConfig";
```

Replace any usage `WorldCupSportConfig` → `FootballSportConfig`.

- [ ] **Step 3: Verify the adapter exposes everything CLAUDE.md lists**

The shared `SportAdapter` base class should provide most of the contract. Football's adapter only adds:

- `CardComponent` (will set after Task 1.18 creates `SoccerCard`)
- `LandingHero` (set after Task 1.19 creates landing shim — though this is provided via the `LandingAdapter`, not the SportAdapter, so may not need to be on SportAdapter)
- `headshotUrl: () => null` (already in footballConfig, just confirm)

If the adapter is missing required members, refer to `basketball/src/adapters/SportAdapter.ts` as the canonical reference and add the equivalent members.

- [ ] **Step 4: Typecheck**

```bash
npm --prefix football run typecheck
```

Expect remaining errors from later tasks. The SportAdapter-specific errors should be gone.

- [ ] **Step 5: Commit**

```bash
git add football/src/adapters/SportAdapter.ts
git commit -m "feat(football): SportAdapter — wire FootballSportConfig"
```

---

### Task 1.13: Update `football/src/adapters/gameAdapter.ts` — preserves position parity logic

**Files:**
- Modify: `football/src/adapters/gameAdapter.ts`

This file already implements within-position salary normalization (the position-parity foundation per the spec). Most of it stays. We need to update imports + the `excludeFromFlex` literal which is currently hardcoded twice.

- [ ] **Step 1: Read the file**

The file is ~200 lines. The two relevant lines are around 142 and 170 (per the earlier read):

```ts
const rosterConfig = {
  rosterSize:       sportAdapter.rosterSize,
  slotRequirements: sportAdapter.rosterSlots,
  excludeFromFlex:  ["GK"],
};
```

- [ ] **Step 2: Source `excludeFromFlex` from config (don't hardcode twice)**

Update both occurrences (in `dealInitialRoster` and `redrawRoster`) to:

```ts
const rosterConfig = {
  rosterSize:       sportAdapter.rosterSize,
  slotRequirements: sportAdapter.rosterSlots,
  excludeFromFlex:  sportAdapter.config.excludeFromFlex ?? [],
};
```

(The exact path may be `sportAdapter.excludeFromFlex` if exposed directly; check the adapter shape and adjust.)

- [ ] **Step 3: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add football/src/adapters/gameAdapter.ts
git commit -m "feat(football): gameAdapter sources excludeFromFlex from config"
```

---

### Task 1.14: Bulldoze `football/src/views/GameView.tsx` — replace 466-line fork with shim

**Files:**
- Replace: `football/src/views/GameView.tsx` (all 466 lines)

This is the centerpiece structural change. The new file is a ~150-line shim that builds a `GameAdapter` and passes it to `@shared/views/GameView`. The exact shape is parallel to `basketball/src/views/GameView.tsx`.

- [ ] **Step 1: Read basketball's GameView as the template**

```bash
cat basketball/src/views/GameView.tsx
```

Note its imports, the `useMemo`-built `GameAdapter` literal, and the final render of `<SharedGameView adapter={...} />`.

- [ ] **Step 2: Replace football's GameView**

Use Write to overwrite `football/src/views/GameView.tsx` with content based on basketball's shim, adapted for football:

- Replace `import { sportAdapter } from "../adapters/SportAdapter"` (already correct)
- Replace `import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter"` (already correct)
- Replace `import { AthleteCard } from "../components/AthleteCard"` → `import { SoccerCard } from "../components/SoccerCard"` (SoccerCard created in Task 1.18)
- Replace basketball's `BASKETBALL_WIN_TIERS` references with `sportAdapter.winTiers`
- Replace basketball-specific tier-row JSX with football tier rows (SUB / STARTER / CAPTAIN / MOTM / LEGEND)
- Set `bonusPoolKey: "football:world_cup"` (or however shared GameView consumes per-competition)
- Skip basketball-only adapter slots (e.g., `getStreakMultiplier` if basketball-only — check the GameAdapter contract in `shared/views/GameAdapter.ts`)

If the SoccerCard component doesn't exist yet, leave that import — Task 1.18 creates it. The typecheck will fail until then. That's expected.

- [ ] **Step 3: Verify line count**

```bash
wc -l football/src/views/GameView.tsx
```

Expected: ≤ 200 lines (per acceptance criterion #1). Basketball's is 156. If football's is significantly larger, refactor again.

- [ ] **Step 4: Commit (typecheck not green yet — that's expected)**

```bash
git add football/src/views/GameView.tsx
git commit -m "feat(football): GameView shim — wraps shared GameView with football GameAdapter"
```

---

### Task 1.15: Replace local engine forks with re-exports from `@shared/engines`

**Files:**
- Replace: `football/src/engines/dataEngine.ts`
- Replace: `football/src/engines/economyEngine.ts`
- Replace: `football/src/engines/resolveEngine.ts`
- Replace: `football/src/engines/rosterEngine.ts`

- [ ] **Step 1: Replace each file with a re-export**

For `football/src/engines/dataEngine.ts`:

```ts
export * from "@shared/engines/dataEngine";
export { default } from "@shared/engines/dataEngine";
```

(Drop the `default` line if `@shared/engines/dataEngine` has no default export — check first.)

Repeat the same pattern for `economyEngine.ts`, `resolveEngine.ts`, `rosterEngine.ts`.

- [ ] **Step 2: Typecheck**

```bash
npm --prefix football run typecheck
```

If a function football imports from these engines doesn't exist in the shared module, follow the import error: either the shared module is the source of truth and the local fork had drift (rare — usually the local was a re-export already), OR football's engine had real local logic that needs to be promoted to shared. Most likely scenario: the local files were already thin wrappers and this just replaces the wrapper with an explicit re-export.

- [ ] **Step 3: Commit**

```bash
git add football/src/engines/
git commit -m "refactor(football): engines re-export from @shared (no local forks)"
```

---

### Task 1.16: Replace local hooks with re-exports from `@shared/hooks`

**Files:**
- Replace: `football/src/hooks/useEmotionalReveal.ts`
- Replace: `football/src/hooks/useCardFlipState.ts`

- [ ] **Step 1: Replace each file**

`football/src/hooks/useEmotionalReveal.ts`:

```ts
export * from "@shared/hooks/useEmotionalReveal";
```

`football/src/hooks/useCardFlipState.ts`:

```ts
export * from "@shared/hooks/useCardFlipState";
```

- [ ] **Step 2: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add football/src/hooks/
git commit -m "refactor(football): hooks re-export from @shared"
```

---

### Task 1.17: Delete local component forks (re-exports of canonical shared components)

**Files:**
- Delete: `football/src/components/{GameBar,WinCelebration,AppHeader,RosterGrid,CardBackGeneric,ErrorBoundary}.tsx`

These components are canonical in `@shared/components/` per CLAUDE.md. Football's local forks are deleted entirely; importers update their import paths to pull from `@shared/components/...`.

- [ ] **Step 1: Identify importers of each local component**

```bash
for c in GameBar WinCelebration AppHeader RosterGrid CardBackGeneric ErrorBoundary; do
  echo "=== $c ==="
  grep -rn "components/$c" football/src --include="*.ts" --include="*.tsx"
done
```

- [ ] **Step 2: Update import paths**

For each importer, change `from "./components/GameBar"` (or similar relative path) to `from "@shared/components/GameBar"`. Apply to all six components.

- [ ] **Step 3: Delete the local files**

```bash
git rm football/src/components/GameBar.tsx \
       football/src/components/WinCelebration.tsx \
       football/src/components/AppHeader.tsx \
       football/src/components/RosterGrid.tsx \
       football/src/components/CardBackGeneric.tsx \
       football/src/components/ErrorBoundary.tsx
```

- [ ] **Step 4: Typecheck**

```bash
npm --prefix football run typecheck
```

If any `@shared/components/X` doesn't exist, basketball/baseball use a different name; investigate by searching `shared/components/`. Likely it's just a casing difference (e.g., `RosterGrid` vs `Roster`).

- [ ] **Step 5: Commit**

```bash
git add football/src/
git commit -m "refactor(football): delete local component forks; import from @shared"
```

---

### Task 1.18: Rename `PlayerCard.tsx` → `SoccerCard.tsx`, refactor to wrap shared `<CardFront>`

**Files:**
- Rename: `football/src/components/PlayerCard.tsx` → `football/src/components/SoccerCard.tsx`
- Modify: importers (GameView already imports SoccerCard per Task 1.14; LandingPage will import in Task 1.19)

- [ ] **Step 1: git mv the file**

```bash
git mv football/src/components/PlayerCard.tsx football/src/components/SoccerCard.tsx
```

- [ ] **Step 2: Update internal references**

In the new `SoccerCard.tsx`, rename:
- Component export: `function PlayerCard(...)` → `function SoccerCard(...)`
- Default export name: `export default PlayerCard` → `export default SoccerCard` (and matching named export if used)
- Display name (if set): `PlayerCard.displayName = "PlayerCard"` → `SoccerCard.displayName = "SoccerCard"`

Don't yet refactor the rendering logic — keep the existing flag+name hero. The refactor to wrap shared `<CardFront>` happens in Step 3.

- [ ] **Step 3: Refactor to wrap shared `<CardFront>`**

Read basketball's `AthleteCard.tsx` and `AthleteCardFront.tsx` as the canonical reference for "wrap shared CardFront with sport-specific tile content."

```bash
cat basketball/src/components/AthleteCard.tsx
```

Football's SoccerCard should:
- Import `CardFront` from `@shared/components/CardFront`
- Pass sport-specific stat tiles (using `sportAdapter.config.statDisplay[position]`)
- Pass the country-flag-plus-last-name "hero" element (the `headshotUrl` returns null, so the fallback render path is used)
- Forward all other props (tier, salary, tap handlers, etc.) to `CardFront`

A minimal shape:

```tsx
import { CardFront } from "@shared/components/CardFront";
import { sportAdapter } from "../adapters/SportAdapter";
import type { PlayerCard as PlayerCardData } from "../adapters/types";

export function SoccerCard(props: { card: PlayerCardData; /* other props */ }) {
  const { card } = props;
  const heroSlot = (
    <FlagAndNameHero card={card} />
  );
  const statTiles = useMemo(
    () => sportAdapter.config.statDisplay[card.position] ?? sportAdapter.config.statDisplay.default,
    [card.position]
  );
  return (
    <CardFront
      card={card}
      hero={heroSlot}
      statTiles={statTiles}
      {...otherProps}
    />
  );
}

// Keep the existing FlagAndNameHero implementation from PlayerCard
function FlagAndNameHero(...) { ... }
```

The exact prop shape depends on `CardFront`'s API — read `shared/components/CardFront.tsx` first to see the interface.

- [ ] **Step 4: Update importers**

```bash
grep -rn "from.*components/PlayerCard" football/src --include="*.ts" --include="*.tsx"
```

Change each `from "./components/PlayerCard"` (or relative) to `"./components/SoccerCard"`. Update named imports `import { PlayerCard }` → `import { SoccerCard }`.

- [ ] **Step 5: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add football/src/
git commit -m "refactor(football): SoccerCard wraps shared CardFront (rename of PlayerCard)"
```

---

### Task 1.19: Create `football/src/components/LandingPage.tsx` shim

**Files:**
- Create: `football/src/components/LandingPage.tsx`

Thin shim wrapping `@shared/components/LandingPage` with a football `LandingAdapter`. Mirrors basketball's pattern.

- [ ] **Step 1: Read basketball's LandingPage**

```bash
cat basketball/src/components/LandingPage.tsx
```

- [ ] **Step 2: Create football's LandingPage**

Write file content:

```tsx
/**
 * football/src/components/LandingPage.tsx — sport-specific shim.
 *
 * Renders @shared/components/LandingPage with a football LandingAdapter:
 * five demo cards (Messi, Mbappé, Vinícius, Bellingham, Saka), the SoccerCard
 * renderer, no headshot URL (returns null → flag+name fallback), and a 5-card
 * landing grid. Tier is derived from salary.
 */
import { useMemo } from "react";
import { LandingPage as SharedLandingPage } from "@shared/components/LandingPage";
import type { LandingAdapter, LandingCardDef } from "@shared/components/LandingPage";
import { SoccerCard } from "./SoccerCard";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";

const CARDS: LandingCardDef[] = [
  { id: "c1", name: "Lionel Messi",      pos: "FWD", salary: 60, fp: 70.5, team: "ARG", season: "2022", basePlayerId: "5503" },
  { id: "c2", name: "Kylian Mbappé",     pos: "FWD", salary: 55, fp: 68.0, team: "FRA", season: "2022", basePlayerId: "278726" },
  { id: "c3", name: "Vinícius Jr.",      pos: "MID", salary: 42, fp: 52.0, team: "BRA", season: "2022", basePlayerId: "1180524" },
  { id: "c4", name: "Jude Bellingham",   pos: "MID", salary: 38, fp: 48.0, team: "ENG", season: "2022", basePlayerId: "881650" },
  { id: "c5", name: "Bukayo Saka",       pos: "FWD", salary: 35, fp: 45.0, team: "ENG", season: "2022", basePlayerId: "859877" },
];

export function LandingPage(props: { onPlay: () => void }) {
  const adapter: LandingAdapter = useMemo(() => ({
    sportKey: "football",
    sportLabel: "Football",
    competitionLabel: "World Cup '26",
    cards: CARDS,
    tierForCard: (c) => tierFromSalary(c.salary, DEFAULT_ECONOMY_CONFIG),
    headshotUrl: () => null,
    CardComponent: SoccerCard,
    gridLayout: { columns: 5, rows: 1 },
  }), []);

  return <SharedLandingPage adapter={adapter} onPlay={props.onPlay} />;
}
```

(The exact `LandingAdapter` interface — fields like `gridLayout`, `competitionLabel` — needs to be confirmed by reading `shared/components/LandingPage.tsx`. Adjust the literal to match.)

The card data values are seed data for the landing-page preview only. Update `basePlayerId` values to actual StatsBomb IDs by cross-referencing `football/public/data/players.json` (search for each name).

- [ ] **Step 3: Verify basePlayerIds resolve**

```bash
for id in 5503 278726 1180524 881650 859877; do
  grep -c "\"basePlayerId\":\"$id\"\|basePlayerId\":\"$id" football/public/data/players.json
done
```

If any return 0, that ID is wrong — search the file for the player by name and update the ID.

- [ ] **Step 4: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add football/src/components/LandingPage.tsx
git commit -m "feat(football): LandingPage shim with 5-card demo roster (Messi, Mbappé, Vinícius, Bellingham, Saka)"
```

---

### Task 1.20: Create `football/src/adapters/ftueRoster.ts` — Messi-anchored

**Files:**
- Create: `football/src/adapters/ftueRoster.ts`

5-card FTUE roster + drawn-result snapshot. Messi (FWD, $60) anchors. Other 4 are mid-tier. Drawn result from a real Messi-MOTM 2022 game.

- [ ] **Step 1: Read basketball's ftueRoster as a template**

```bash
cat basketball/src/adapters/ftueRoster.ts
```

- [ ] **Step 2: Identify a real Messi MOTM game**

```bash
node -e "
  const logs = require('./football/public/data/game-logs.json');
  const messiLogs = logs.filter(l => l.basePlayerId === '5503' && l.stats);
  messiLogs.forEach(l => console.log(l.gameKey, JSON.stringify(l.stats)));
"
```

Pick a game where Messi posted ≥1 goal and ≥1 assist (the 2022 quarterfinal vs. Netherlands or the final vs. France are likely candidates). Record the `gameKey` and stats.

- [ ] **Step 3: Pick 4 supporting cards**

For each supporting slot (GK, DEF, MID, FLEX), pick a player from the same era with mid-tier stats. They don't need to be from the same match as Messi — the resolver pulls each card's stats from its own gameKey.

Example shape (replace placeholder names/IDs/stats with real values from `players.json` and `game-logs.json`):

```ts
import type { FtueRoster } from "@shared/types";

export const FOOTBALL_FTUE_ROSTER: FtueRoster = {
  initialRoster: [
    { slot: 0, position: "FWD", basePlayerId: "5503", name: "Lionel Messi",       team: "ARG", salary: 60, projectedFp: 50, gameKey: "2022_arg_fra_final" },
    { slot: 1, position: "GK",  basePlayerId: "<id>", name: "Emiliano Martínez",  team: "ARG", salary: 25, projectedFp: 25, gameKey: "<key>" },
    { slot: 2, position: "DEF", basePlayerId: "<id>", name: "<DEF name>",         team: "<>",  salary: 30, projectedFp: 28, gameKey: "<key>" },
    { slot: 3, position: "MID", basePlayerId: "<id>", name: "<MID name>",         team: "<>",  salary: 35, projectedFp: 32, gameKey: "<key>" },
    { slot: 4, position: "FLEX", actualPos: "FWD", basePlayerId: "<id>", name: "<FLEX name>", team: "<>", salary: 30, projectedFp: 28, gameKey: "<key>" },
  ],
  drawnResult: {
    // Messi's actual stats from the chosen game — pulled from game-logs.json
    "5503": { goals: 2, assists: 1, shots_on_target: 4, key_passes: 3, dribbles_completed: 5 },
    // Stats for each other card from their respective gameKey
  },
};
```

(The exact `FtueRoster` type lives in `shared/types`. Read it first to align the shape.)

- [ ] **Step 4: Wire into footballConfig**

In `football/src/adapters/footballConfig.ts`, after the badges block, add:

```ts
ftueRoster: FOOTBALL_FTUE_ROSTER.initialRoster,
ftueDrawnRoster: FOOTBALL_FTUE_ROSTER.drawnResult,
ftueTextConfig: {
  // Placeholder soccer-coded copy. Polished in PR 2.
  holdIntroText: [
    "Five players. One Argentine ace anchoring it.",
    "GK / DEF / MID / FWD slots are fixed. The FLEX takes any outfield position — not GK.",
    "Hold who you trust. Redraw the rest.",
  ],
  dealCoachText: ["Let's see what we got."],
  drawCoachText: ["Stats incoming."],
  winCoachText: ["That's the World Cup magic."],
},
```

Import the roster at the top of footballConfig:

```ts
import { FOOTBALL_FTUE_ROSTER } from "./ftueRoster";
```

- [ ] **Step 5: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add football/src/adapters/
git commit -m "feat(football): FTUE roster — Messi-anchored 5-card with real 2022 WC drawn result"
```

---

### Task 1.21: Create utility files (`playerCulture`, `teamFlavor`, `soundPack`, `payoutLogic`)

**Files:**
- Create: `football/src/utils/playerCulture.ts`
- Create: `football/src/utils/teamFlavor.ts`
- Create: `football/src/utils/soundPack.ts`
- Create: `football/src/utils/payoutLogic.ts`

These can be minimal at PR 1; PR 2 / future work fills them in.

- [ ] **Step 1: `football/src/utils/payoutLogic.ts` — re-export from shared**

```ts
export * from "@shared/utils/payoutLogic";
```

- [ ] **Step 2: `football/src/utils/playerCulture.ts` — empty placeholder**

```ts
/**
 * football/src/utils/playerCulture.ts
 *
 * Sport-specific commentary flavor data for football. Empty at launch;
 * populated when the football commentary library lands (post-PR 2).
 */
export const FOOTBALL_PLAYER_CULTURE: Record<string, string[]> = {};
```

- [ ] **Step 3: `football/src/utils/teamFlavor.ts` — empty placeholder**

```ts
/**
 * football/src/utils/teamFlavor.ts
 *
 * Country/team flavor strings for football commentary. Empty at launch.
 */
export const FOOTBALL_TEAM_FLAVOR: Record<string, string[]> = {};
```

- [ ] **Step 4: `football/src/utils/soundPack.ts` — register an empty sound pack**

```ts
/**
 * football/src/utils/soundPack.ts
 *
 * Sound asset registration. No assets at launch — the audio director
 * silently no-ops when assets are absent.
 */
import { setSoundPack } from "@shared/utils/soundPack";

setSoundPack("football", {
  // No bundled sound assets at launch.
});
```

- [ ] **Step 5: Import the sound pack in App.tsx (will happen in Task 1.22)**

(No action this step — note for next task.)

- [ ] **Step 6: Typecheck**

```bash
npm --prefix football run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add football/src/utils/
git commit -m "feat(football): utils — empty stubs for culture/flavor/sound; payoutLogic re-export"
```

---

### Task 1.22: Rewrite `football/src/App.tsx` to clone basketball's auth-aware shell

**Files:**
- Replace: `football/src/App.tsx`

- [ ] **Step 1: Read basketball's App.tsx**

```bash
cat basketball/src/App.tsx
```

Note its structure: ErrorBoundary → AuthProvider → ?play=1 / ?signin=1 / ?profile=1 / sticky `replay_skip_landing` → debug bar → conditional render of LandingPage vs GameView vs ProfileScreen vs RegisterModal.

- [ ] **Step 2: Replace football's App.tsx**

Write the football App.tsx based on basketball's, with these substitutions:
- `import GameView from "./views/GameView"` (no change needed; we have one)
- `import { LandingPage } from "./components/LandingPage"` (Task 1.19 created this)
- `import "./utils/soundPack"` (registers football sound pack)
- localStorage keys: `replaymod_basketball_*` → `replaymod_football_*` (skip-landing flag, FTUE done flag, etc.)
- `sportKey: "football"` wherever basketball passes its key

- [ ] **Step 3: Typecheck**

```bash
npm --prefix football run typecheck
```

Should now be **green** for the first time since Task 1.10.

- [ ] **Step 4: Lint**

```bash
npm --prefix football run lint
```

- [ ] **Step 5: Commit**

```bash
git add football/src/App.tsx
git commit -m "feat(football): App.tsx — auth-aware shell, query-param handlers, sticky skip-landing"
```

---

### Task 1.23: Update `chooser/index.html` — add third sport card (⚽ Football)

**Files:**
- Modify: `chooser/index.html`

- [ ] **Step 1: Read the current file**

(You read it during the earlier conversation — 600+ lines. Find the `.cards` grid block around line 342.)

- [ ] **Step 2: Adjust grid to 3 cards**

Change the CSS:

```css
.cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;   /* was 1fr 1fr */
  gap: 14px;
  width: 100%;
  max-width: 540px;                     /* was 380px */
}
```

Add a media query for narrow viewports:

```css
@media (max-width: 480px) {
  .cards { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Add the football card**

After the baseball card button (line ~358), insert:

```html
<button class="card football" type="button" data-sport="football" aria-label="Play football">
  <span class="emoji">⚽</span>
  <span class="name">Football</span>
  <span class="league">World Cup '26</span>
  <span class="sep" aria-hidden="true"></span>
  <span class="to-beat-label">To Beat</span>
  <span class="to-beat-score" id="football-top">—</span>
</button>
```

Add the corresponding hover style next to the basketball/baseball ones:

```css
.card.football:hover {
  border-color: rgba(140,200,255,0.55);
  background: rgba(80,160,255,0.10);
}
```

- [ ] **Step 4: Update the bucket logic and TO BEAT loader**

In the inline `<script>`, find these references and extend for football:

- `KEY = 'replay_last_sport'` — already generic
- `last === 'basketball' || last === 'baseball'` → add `|| last === 'football'`
- `ftueB = ...basketball; ftueBB = ...baseball` → add `ftueF = localStorage.getItem('replaymod_ftue_football') === '1'`
- `bestB / bestBB` → add `bestF`
- `bucket` calculation: extend "all played" / "none played" / "some played" logic for 3 sports
- `loadTop('basketball'); loadTop('baseball')` → add `loadTop('football')`
- The `loadTop` function calls `/api/leaderboard?sport=football&...` — confirm `/api/leaderboard` accepts `sport=football` (it should once Task 1.8 lands; if not, add to its allowlist)

For the football leaderboard URL, **add `&competition=world_cup`** to match the per-competition keying.

- [ ] **Step 5: Test the chooser locally**

```bash
bash scripts/build-vercel.sh
# Then visit http://localhost:3000 (or wherever vercel dev runs)
```

Confirm 3 cards render, and clicking each navigates to the right sport.

- [ ] **Step 6: Commit**

```bash
git add chooser/index.html
git commit -m "feat(chooser): add ⚽ Football card with World Cup '26 label; bucket logic for 3 sports"
```

---

### Task 1.24: Cleanup audit — GOAT references, dead BonusPoolRow imports, orphan refs

**Files:**
- Audit only; deletions where found

- [ ] **Step 1: Repo-wide GOAT grep**

```bash
grep -rn "GOAT" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
  --include="*.html" --include="*.json" --include="*.md" \
  . 2>/dev/null | grep -v node_modules | grep -v "/dist/" | grep -v "/.git/"
```

Expected: zero hits. If any found, evaluate context — most should be replaced with `LEGEND` (the renamed top tier). Real-word usage (e.g., "GOAT" in a player-culture string about who's the greatest) can stay; tier-system references must be cleaned.

- [ ] **Step 2: Dead BonusPoolRow check**

```bash
grep -rn "BonusPoolRow\|12,451.29\|12451.29" --include="*.ts" --include="*.tsx" \
  . 2>/dev/null | grep -v node_modules | grep -v "/dist/"
```

Expected: zero hits (Task 1.14 deleted football's local copy when bulldozing GameView).

- [ ] **Step 3: Orphan worldcup references**

```bash
grep -rIn "worldcup" --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.html" --include="*.json" \
  . 2>/dev/null | grep -v node_modules | grep -v "/dist/" | grep -v "/.git/"
```

Investigate each. Acceptable: `transformWorldCupData.mjs` filename (data-pipeline-specific), comments referencing the World Cup competition. Not acceptable: `sportKey: "worldcup"`, import paths `from "./worldcup"`, etc.

- [ ] **Step 4: Commit cleanup if any edits made**

```bash
git add -p   # selectively stage cleanup edits
git commit -m "cleanup: remove orphan GOAT/worldcup refs"
```

---

### Task 1.25: Repo-wide verification — typecheck, lint, vitest, build

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all sports**

```bash
npm --prefix basketball run typecheck && \
npm --prefix baseball run typecheck && \
npm --prefix football run typecheck
```

Expected: all green.

- [ ] **Step 2: Lint all sports**

```bash
npm --prefix basketball run lint && \
npm --prefix baseball run lint && \
npm --prefix football run lint
```

Expected: all green (or only pre-existing warnings — no new errors from football work).

- [ ] **Step 3: Vitest repo-wide**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 4: Build locally**

```bash
bash scripts/build-vercel.sh
```

Expected: completes; `dist/football/index.html` exists.

- [ ] **Step 5: Inspect built artifacts**

```bash
ls dist/ dist/football/
```

Expected: `dist/index.html` (chooser), `dist/basketball/`, `dist/baseball/`, `dist/football/`, `dist/og-*.png`.

- [ ] **Step 6: Commit any final fixups discovered**

If steps 1–5 found issues, fix and commit:

```bash
git add -p
git commit -m "fix(football): pre-PR-1 verification fixups"
```

If steps 1–5 were all green, no commit needed.

---

### Task 1.26: Manual smoke test on local preview

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Note: per CLAUDE.md, `npm run dev` proxies `/api` to a deployed Vercel preview. So local dev tests the new SPA against existing deployed APIs. This is fine for smoke testing FTUE/game flow but won't exercise the updated `/api/bonus-pool.ts` until that's deployed.

For local dev with full API:

```bash
npm install -g vercel
vercel dev
```

Or alternatively, push to a preview branch (Task 1.27) and smoke against the preview URL.

- [ ] **Step 2: Walk through the chooser**

Visit `http://localhost:3000/?pick=1`. Confirm 3 sport cards render. Click ⚽ Football. URL should become `/football/?play=1`.

- [ ] **Step 3: Walk through FTUE**

Confirm the deal lands a 5-card roster with Messi as the FWD anchor. The card-tier colors should be visible. Confirm hold/draw/reveal/win flow works end-to-end. Win celebration should land at MOTM or LEGEND tier (per the seeded thresholds + Messi MOTM game).

- [ ] **Step 4: Confirm bonus pool widget renders**

The bonus pool number should not be `$12,451.29` (that's the dead seed). It should be `$1,000` or whatever the KV-backed `bonus_pool:football:world_cup` returns (likely 1000 SEED if KV doesn't have the key yet).

- [ ] **Step 5: Confirm leaderboard preview on chooser**

Return to `/?pick=1`. The football card's "TO BEAT" should show `—` (no plays yet) or a number if you've already saved a hand.

If any step fails, file the issue and fix in a small commit before opening the PR.

---

### Task 1.27: Push branch + open PR 1

**Files:** none (git/GitHub operations)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/football-pr1-playable-loop
```

- [ ] **Step 2: Open PR with gh**

```bash
gh pr create --title "feat: football SPA — bulldoze + playable loop (PR 1 of 2)" --body "$(cat <<'EOF'
## Summary

Replaces the drifted `worldcup/` SPA with a clean `football/` SPA built on the canonical shared infrastructure (Phase 2 shape: shared GameView, LandingPage, bonusPoolStore). World Cup is the launch competition; architecture supports adding EPL / La Liga / Bundesliga later by swapping data.

Spec: `docs/superpowers/specs/2026-05-05-football-bulldoze-and-rebuild-design.md`

This is **PR 1 of 2**. PR 1 ships the playable loop with seeded tier thresholds and placeholder coach copy. PR 2 ships polish + validation (stat→FP attribution, calibrated thresholds via simulator, edge-case tests, FTUE copy refinement, FLEX live tooltip, position-parity validation gate).

### What landed

- Renamed `worldcup/` → `football/` with full git-history-preserving rename
- New tier ladder: SUB → STARTER → CAPTAIN → MOTM → LEGEND (mirrors basketball's 5-tier curve + 0.5×/1.5×/3×/8×/50× multipliers)
- 5-slot roster: 1 GK + 1 DEF + 1 MID + 1 FWD + 1 FLEX (FLEX excludes GK)
- Bulldozed 466-line `GameView.tsx` fork → ~150-line shim around shared GameView
- Local component/hook/engine forks replaced with `@shared` re-exports
- New `SoccerCard.tsx` wrapping shared `<CardFront>`; `LandingPage.tsx` shim
- Messi-anchored 5-card FTUE roster from real 2022 WC data
- Bonus pool API per-competition keying: `bonus_pool:football:world_cup`
- Chooser landing: third sport card (⚽ Football, "World Cup '26"); bucket logic for 3 sports
- Cleanup audit: zero stale GOAT references; zero `$12,451.29` dead seed references; `transformWorldCupData.mjs` retained as data-pipeline-specific filename

### What's NOT in this PR (lands in PR 2)

- Stat → FP attribution rendering on card backs
- Calibrated tier thresholds (PR 1 ships seeds: 130 / 150 / 167 / 192 / 215)
- Edge-case unit tests (subs, 0-min, position fluidity, GK goals, red cards, penalty shootouts)
- FTUE coach copy polish (PR 1 has minimal placeholder copy)
- FLEX live UI tooltip (FTUE teaches it; tooltip on slot is PR 2)
- Football commentary library — deferred past PR 2 until the player pool is locked

## Test plan

- [ ] Repo-wide typecheck green (`npm --prefix {basketball,baseball,football} run typecheck`)
- [ ] Repo-wide lint green
- [ ] Vitest green (`npx vitest run`)
- [ ] Local build produces `dist/football/`
- [ ] Manual: chooser shows 3 cards; clicking ⚽ routes to `/football/?play=1`
- [ ] Manual: FTUE walkthrough lands Messi-anchored deal → hold → draw → reveal → win
- [ ] Manual: bonus pool widget shows live KV value, not the dead `$12,451.29` seed
- [ ] Manual: tier ladder shows SUB / STARTER / CAPTAIN / MOTM / LEGEND
- [ ] Preview deploy renders cleanly across all three sports

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify PR opened, capture URL**

The `gh pr create` output prints the PR URL. Save it to share with reviewers.

---

## PR 2 — Polish + validation

**Branch:** `feature/football-pr2-polish-validation` (off `main`, after PR 1 merges)

**Goal:** Make football *feel right*. Stat → FP attribution rendering, calibrated tier thresholds, edge-case tests, FTUE copy polish, FLEX live tooltip, and the position-parity validation gate.

> **Note:** PR 2 tasks have less step-by-step granularity than PR 1 because PR 2's specifics depend on PR 1 outcomes (simulator output, which edge cases bug, which copy needs polish). Each task below describes the work and acceptance gate; the executor may need to iterate within a task more than PR 1.

### Task 2.1: Branch + verify PR 1 merged

- [ ] Confirm PR 1 merged to main (`git log main --oneline | head -5`)
- [ ] Pull latest main (`git checkout main && git pull`)
- [ ] Branch (`git checkout -b feature/football-pr2-polish-validation`)

### Task 2.2: Add stat → FP attribution to `SoccerCard.tsx` card back

**Files:**
- Modify: `football/src/components/SoccerCard.tsx`

The card back currently shows raw stat counts (e.g., `GOALS 1`). Update to show the FP contribution alongside (`GOALS 1 +22 FP`). Sum tilesplus badges should equal the card's `actualFp`.

- [ ] Read `SportAdapter.computeFantasyPointsDetailed` (it should return per-stat breakdown, not just total). If it doesn't, extend it.
- [ ] Update `SoccerCard.tsx` (or its inner stat-tile renderer) to display `${count} +${fpContribution} FP` per tile
- [ ] Add badges row showing each badge's `+${fp}` contribution
- [ ] Add a "TOTAL" row that sums to `actualFp`
- [ ] Add a unit test in `football/src/__tests__/scoringClarity.test.tsx`: render a SoccerCard with known stats, assert each tile shows the expected FP, total ties out
- [ ] Commit: `feat(football): stat → FP attribution on card back`

### Task 2.3: Add FLEX live UI tooltip

**Files:**
- Modify: `shared/components/RosterGrid.tsx` (or wherever the slot label is rendered)
- The implementation should be sport-agnostic — controlled by adapter config

- [ ] Add an optional `slotLabels` field to the GameAdapter (or RosterGrid props) — keyed by slot index
- [ ] Football's GameView passes `{ 4: { label: "ANY OUTFIELD", tooltip: "Any outfield player (no goalkeepers)" } }` for the FLEX slot
- [ ] Render the label in the slot header
- [ ] On hover/tap of the slot, show the tooltip (use existing tooltip component if shared has one; otherwise minimal CSS-driven affordance)
- [ ] Manual smoke: hover/tap the FLEX slot — tooltip appears
- [ ] Commit: `feat(football): FLEX slot label + live tooltip`

### Task 2.4: Polish FTUE coach copy

**Files:**
- Modify: `football/src/adapters/footballConfig.ts` (`ftueTextConfig`)

Replace the placeholder strings with proper soccer-coded copy per the spec's FTUE teaching beats section.

- [ ] Update `holdIntroText` with the three sequential teaches: position lockouts, FLEX rule, card-tier colors
- [ ] Update `dealCoachText`, `drawCoachText`, `winCoachText` with soccer phrasing
- [ ] Manual: walk through FTUE, confirm each beat lands correctly
- [ ] Commit: `feat(football): FTUE coach copy — soccer-coded teaching beats`

### Task 2.5: Edge-case unit tests

**Files:**
- Create: `football/src/__tests__/edgeCases.test.ts`

Six cases. Each test reads from real `players.json` / `game-logs.json` data, finds an example, asserts expected behavior.

- [ ] **Substitute (low minutes)**: find a player with `minutes_played < 30`. Assert their FP computes correctly (no per-90 normalization).
- [ ] **0-minute appearance**: confirm `filterScoringLogs` excludes them.
- [ ] **Position fluidity**: feed a "Right Wing Back" string through `positionAliases`, confirm it normalizes to `DEF`.
- [ ] **GK-scored-goal**: find or construct a stat line with `_position: "GK"`, `goals: 1, saves: 5`. Assert `computeFantasyPoints` returns `60 (goal) + 20×5 (saves) - 6×0 (no GA) = 160 FP`.
- [ ] **Red card**: stat with `red_cards: 1, minutes_played: 25, goals: 0`. Assert FP includes `-15` for the red card.
- [ ] **Penalty shootout**: read 1–2 known WC final logs, document whether shootout goals appear in the `goals` count, and add a comment in `transformWorldCupData.mjs` recording the choice.

- [ ] Run tests: `npx vitest run football/src/__tests__/edgeCases.test.ts`
- [ ] Commit: `test(football): edge cases — subs, 0-min, position fluidity, GK goals, red cards, shootouts`

### Task 2.6: Run 10k-hand simulator → calibrate tier thresholds

**Files:**
- Modify: `football/src/adapters/footballConfig.ts` (`winTiers` thresholds)

- [ ] Run: `npx ts-node shared/tools/runSimulator.ts football 10000`
- [ ] Capture output: tier hit-rate distribution, LEGEND-rate-by-anchor-position, FP separation between adjacent tiers
- [ ] Save raw output to `docs/superpowers/notes/2026-05-XX-football-simulator-run.md` for reference
- [ ] Adjust `winTiers[*].minFp` so hit rates land on targets:
  - SUB ~25%, STARTER ~12%, CAPTAIN ~5%, MOTM ~1.5%, LEGEND ~0.3% (each ±20%)
  - Adjacent-tier FP separation ≥20 (lower) to ≥30 (upper)
- [ ] Re-run simulator with adjusted thresholds; iterate until quantitative gates met
- [ ] Verify position-parity gate: LEGEND-rate by anchor position must be within 2× across FWD / MID / DEF / GK
- [ ] Commit: `tune(football): calibrated tier thresholds via 10k-hand simulator`

### Task 2.7: Position parity validation gate

**Files:**
- Read-only verification

- [ ] Re-read the simulator output from Task 2.6
- [ ] If position parity ratio > 2× across positions (e.g., FWD anchors hit LEGEND 5× more often than DEF), parity is broken. Diagnosis options:
  1. Position weights too low for DEF/GK badges (adjust badge FP values)
  2. Position weights miscalibrated (run a per-position simulator and compare avg FP — should be 16–25 range across all positions)
  3. Tier thresholds unfair (already settled in 2.6 — unlikely culprit)
- [ ] Adjust badges or weights as needed; re-run simulator
- [ ] Commit any adjustments: `tune(football): position parity — adjust X to balance Y`

### Task 2.8: 50-hand qualitative validation

**Files:** none (manual)

- [ ] Play 50 hands locally (preview deploy or `vercel dev`)
- [ ] For each hand, log: anchor position, hit tier, "boring" or "memorable" (or neutral)
- [ ] Compute: boring < 20%? memorable > 30%?
- [ ] If gates not met, identify what's flat — likely bigger reveal animations, badge moments, or commentary needing earlier landing (commentary is deferred, so this might mean adjusting the existing fallback library's selection rules for football-specific archetypes)

### Task 2.9: Verify all PR 2 acceptance criteria

- [ ] AC #6: Tier thresholds calibrated, simulator output committed → ✓
- [ ] AC #9: Position parity verified (within 2× across positions) → ✓
- [ ] AC #10: Stat → FP attribution renders on every card back → ✓
- [ ] AC #11 (PR 2 part): FLEX live UI tooltip → ✓
- [ ] AC #14: Edge-case tests pass → ✓

### Task 2.10: Push branch + open PR 2

```bash
git push -u origin feature/football-pr2-polish-validation
gh pr create --title "feat: football polish + validation (PR 2 of 2)" --body "$(cat <<'EOF'
## Summary

PR 2 of 2 for the football bulldoze. PR 1 shipped the playable loop; this PR ships the polish layer that makes football *feel right*.

Spec: `docs/superpowers/specs/2026-05-05-football-bulldoze-and-rebuild-design.md`

### What landed

- Stat → FP attribution rendering on every card back (the math layer)
- Calibrated tier thresholds via 10k-hand simulator (replaces seeds)
- Position-parity validation gate met: LEGEND-rate within 2× across FWD/MID/DEF/GK anchors
- Edge-case unit tests: substitutes, 0-min appearances, position fluidity, GK-scored-goal, red cards, penalty shootouts
- FTUE coach copy refined to soccer-coded teaching beats
- FLEX live UI tooltip (slot label + hover/tap explainer)
- 50-hand qualitative validation passed (boring < 20%, memorable > 30%)

### What's deferred (post-PR 2)

- Football commentary library — phrasing depends on the active player pool being locked, which won't happen until after PR 2 is in production for a while. Football continues to inherit the existing fallback library at launch.
- Real headshot source (Wikimedia Commons / paid API) — flag-plus-name fallback continues at launch.

## Test plan

- [ ] All AC items in spec section "Acceptance criteria" with (PR 2) tag pass
- [ ] Simulator output committed to `docs/superpowers/notes/`
- [ ] Edge-case test suite green
- [ ] Manual 50-hand log committed (for reference / future tuning)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

After writing/updating this plan, verify:

1. **Spec coverage:** Every spec section maps to one or more tasks here. Position parity → Task 1.13 (preserves logic) + Task 2.7 (validation). Bonus pool → Task 1.8. Tier ladder → Task 1.10. FTUE → Task 1.20. Etc.
2. **Placeholder scan:** No "TBD", no "implement later", no "similar to Task N", no "add appropriate error handling". Where I left placeholders for content the executor must determine (e.g., the supporting-card IDs in Task 1.20), I gave the executor an explicit query to run against the data file.
3. **Type consistency:** `FootballSportConfig` (not `WorldCupSportConfig`) used everywhere. `SoccerCard` (not `PlayerCard`) used everywhere after Task 1.18. Sport key string `"football"` (not `"worldcup"`) used everywhere after Task 1.10.
4. **Branch shape:** PR 1 commits per task (~25 commits). PR 2 commits per task (~10 commits). Both branches off `main`.

If any task references a function/type/file not yet defined, that's a plan failure — fix inline.

## Risk mitigations

- **Task 1.14 leaves typecheck red** until Task 1.18 creates `SoccerCard`. This is the only intentional red-typecheck window in the plan. If executors get confused, point them to this note.
- **Task 1.20 supporting-card data** requires reading `players.json` and `game-logs.json` to fill in IDs and stats. The plan provides the query; results are data-driven, not pre-known.
- **Task 2.6 simulator iteration** may take more than one round of threshold adjustments. Budget for 2–3 simulator runs.
- **Task 2.7 position parity** may surface a real game-balance issue that requires badge-FP tuning. If FWD anchors hit LEGEND 5× more often, the fix isn't tier thresholds (those are global) — it's position weight or badge calibration. Document any adjustments in the commit message.
