# Phase 2: GameView Shared Lift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `basketball/src/views/GameView.tsx` (2455 lines) and `baseball/src/views/GameView.tsx` (2185 lines) into a single canonical `shared/views/GameView.tsx` (~1900 lines), with each sport's wrapper shrinking to ~80 lines that build a `GameAdapter` literal and pass it as a prop. Worldcup untouched. Pure refactor — no behavior changes.

**Architecture:** Per-component adapter pattern (mirrors Phase 1 LandingAdapter). Sport-specific code (math, components, FTUE roster, overlays, audio, persistence namespace) bundles into a `GameAdapter` object. Shared GameView contains zero `if (sportKey === ...)` branches; all variation flows through the adapter, `sportAdapter`, optional component slots, or `shared/featureFlags.ts`.

**Tech Stack:** Vite + React + TypeScript. Monorepo: independent sport SPAs (`basketball/`, `baseball/`, `worldcup/`) sharing a `@shared` alias for the `shared/` library. Vercel deployment.

**Spec:** `docs/superpowers/specs/2026-04-29-gameview-shared-phase-2-design.md`

**Branch:** `phase-2/gameview-shared` (long-lived working branch, off main). All sub-PRs branch off this and merge BACK into it. Final merge of `phase-2/gameview-shared → main` is the production cutover.

---

## File Structure

### New files (created during the lift)

| Path | Responsibility |
|---|---|
| `shared/views/_gameViewHelpers.ts` | Pure helpers: `RosterGridScaleFit`, `RollingNumber`, `tierFromSalary`, `toRevealableCards`, `sleep`. Sport-agnostic. (Task 1) |
| `shared/views/GameAdapter.ts` | TypeScript interface for the adapter prop. (Task 2) |
| `shared/views/GameView.tsx` | Canonical GameView. Consumes `GameAdapter` via prop. ~1900 lines once lift completes. (Task 2 stub → Task 5 final) |
| `docs/storage-keys-audit.md` | Catalog of all localStorage keys used by basketball + baseball GameViews, classification, namespace plan. (Task 1) |

### Modified files

| Path | Final shape |
|---|---|
| `basketball/src/views/GameView.tsx` | ~80-line wrapper: builds GameAdapter literal, renders `<SharedGameView adapter={...} />`. (Task 6) |
| `baseball/src/views/GameView.tsx` | Same — ~80-line wrapper. (Task 6) |
| `basketball/src/adapters/basketballConfig.ts` | Add `sportKey: "basketball"` field. (Task 2 prerequisite) |
| `worldcup/src/views/GameView.tsx` | UNTOUCHED |

### Per-task PR flow

```
phase-2/gameview-shared (long-lived branch off main)
├── phase-2/00-branch-setup        → Task 0
├── phase-2/01-helpers-+-audit     → Task 1
├── phase-2/02-adapter-+-skeleton  → Task 2
├── phase-2/03-lift-state          → Task 3
├── phase-2/04-lift-reveal-spring  → Task 4
├── phase-2/05-lift-jsx-overlays   → Task 5
├── phase-2/06-shrink-wrappers     → Task 6
└── phase-2/07-cleanup-drift       → Task 7

then: phase-2/gameview-shared → main (production cutover)
```

Each sub-branch opens a PR with base `phase-2/gameview-shared`, NOT `main`. After review, merge into `phase-2/gameview-shared`. Production is unaffected until the final merge.

---

## Reporting Protocol (per user guardrail)

**At the end of every Task** (before moving to the next), produce this report block:

```
TASK N COMPLETE — <sub-pr-name>

Files changed:
- <path> (lines <±N>)

Behavior changed:
- <list any behavior diff, or "none — pure refactor">

Behavior unchanged (verified):
- <list relevant areas: typecheck, smoke checklist, etc.>

Local test result:
- npm test: <X passed / Y failed (Z pre-existing)>
- Typecheck: <basketball / baseball / shared status>

Vercel preview smoke checklist (basketball + baseball):
- [ ] First-time FTUE
- [ ] Returning user
- [ ] Deal → hold → draw → reveal full cycle
- [ ] BUST hand
- [ ] ROOKIE hand (verify streak does NOT advance)
- [ ] STARTER+ hand (verify streak advances + fire emoji)
- [ ] Leaderboard submit (verify sport-scoped)
- [ ] Refresh page after a hand (verify localStorage persistence)

Preview URL: <vercel preview link>

STOP CONDITIONS observed (if any):
- <reveal timing change | FTUE break | leaderboard regress | streak math diff | localStorage diff>
- If any are non-empty, STOP and surface to user before proceeding.
```

If a stop condition fires, do NOT proceed to the next task. Report and await user direction.

---

## Task 0: Branch Setup

**Files:**
- No code changes. This task only verifies the long-lived branch exists and CI is healthy on it.

- [ ] **Step 1: Verify the long-lived branch exists and is current**

```bash
git fetch origin
git checkout phase-2/gameview-shared
git pull origin phase-2/gameview-shared
git log --oneline -3
```

Expected: HEAD is at the merge commit of the spec from `main`. The branch should be even with origin.

- [ ] **Step 2: Run baseline tests on the long-lived branch**

```bash
cd /Users/john/Desktop/ReplayMod
npm test 2>&1 | grep -E "(Test Files|Tests )" | tail -3
```

Expected:
```
Test Files  2 failed | 18 passed (20)
      Tests  8 failed | 241 passed (249)
```

These 8 failures are pre-existing (detectTopGame test-hook + scoring negative-baseFP). Document this baseline; any new failure during the lift is a regression.

- [ ] **Step 3: Verify typecheck baseline on each sport**

```bash
cd /Users/john/Desktop/ReplayMod/basketball && npx tsc --noEmit 2>&1 | tail -5
cd /Users/john/Desktop/ReplayMod/baseball && npx tsc --noEmit 2>&1 | tail -5
cd /Users/john/Desktop/ReplayMod/worldcup && npx tsc --noEmit 2>&1 | tail -5
```

Expected: basketball + worldcup silent. Baseball reports 8 pre-existing `Cannot find name` errors from `shared/components/ProfileScreen.tsx` (lines 455–482) — pre-existing tsconfig drift, not blocking. Document as baseline.

- [ ] **Step 4: Confirm Vercel preview builds the branch**

```bash
gh api repos/jztang-ship-it/replay-modulated/deployments --jq '[.[] | select(.environment == "Preview – replay-mod" and (.ref | startswith("phase-2/gameview-shared")))] | .[0:1] | map({sha: .sha[0:7], created_at})'
```

If empty: the branch hasn't deployed yet. Push an empty commit (`git commit --allow-empty -m "chore: kick CI"`) to trigger Vercel.

- [ ] **Step 5: Generate Task 0 report**

Use the Reporting Protocol above. Behavior changed: none. No PR opened.

---

## Task 1: Extract Pure Helpers + Storage Audit

**Files:**
- Create: `shared/views/_gameViewHelpers.ts`
- Create: `docs/storage-keys-audit.md`
- Modify: `basketball/src/views/GameView.tsx` (replace inline helpers with imports)
- Modify: `baseball/src/views/GameView.tsx` (replace inline helpers with imports)

**Branch:** `phase-2/01-helpers-+-audit` (off `phase-2/gameview-shared`)

- [ ] **Step 1: Create the working sub-branch**

```bash
git checkout phase-2/gameview-shared
git pull
git checkout -b phase-2/01-helpers-+-audit
```

- [ ] **Step 2: Identify all pure helpers in the two GameViews**

Read both files and list every helper that meets ALL of these criteria:
- No closure over component state or refs
- No sport-specific values
- Identical or near-identical implementation in both files

Run:
```bash
grep -n "^function\|^const.*=.*=>" basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx | head -40
```

Expected candidates (verify by reading each):
- `sleep(ms: number)` — both files, identical
- `RosterGridScaleFit` — component, both files
- `RollingNumber` — component, both files
- `tierFromSalary(salary: number)` — function, both files (note: thresholds DIFFER — see Step 3)
- `toRevealableCards(cards: PlayerCard[])` — both files
- `cardId(card: any)` — both files
- `sumSalary(roster: PlayerCard[])` — both files

- [ ] **Step 3: Audit `tierFromSalary` divergence**

Read both versions:
```bash
grep -n -A 5 "function tierFromSalary" basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx
```

Basketball checks RED tier (salary >= 73), baseball does NOT. Two options:
- (a) Move basketball's version (with RED check) to shared. Baseball calls it; the RED branch is dead for baseball cards because no baseball card has salary >= 73. Safe.
- (b) Keep per-sport for now and lift later via adapter.

Choose (a). The function is sport-aware via input data, not via hardcoded sport branches.

- [ ] **Step 4: Create `shared/views/_gameViewHelpers.ts`**

Create the file with all extracted helpers. Each is the basketball version verbatim (basketball is canonical per CLAUDE.md). Example:

```typescript
/**
 * shared/views/_gameViewHelpers.ts
 *
 * Pure helpers extracted from per-sport GameView.tsx during the Phase 2 lift.
 * Each was duplicated identically in basketball + baseball; lifted here so
 * future GameView consolidation can build on a single source.
 */

import type { PlayerCard, RevealableCard } from "@shared/types";
// ... full helper implementations, copied verbatim from basketball/src/views/GameView.tsx
```

Copy each helper verbatim from `basketball/src/views/GameView.tsx`. Do NOT modify them while moving.

- [ ] **Step 5: Replace inline helpers in basketball with imports**

In `basketball/src/views/GameView.tsx`:
1. Add the import at the top: `import { sleep, RosterGridScaleFit, RollingNumber, tierFromSalary, toRevealableCards, cardId, sumSalary } from "@shared/views/_gameViewHelpers";`
2. Delete the inline definitions of these functions/components.

- [ ] **Step 6: Replace inline helpers in baseball with imports**

Same as Step 5 but in `baseball/src/views/GameView.tsx`. Note: baseball's `tierFromSalary` had different thresholds — when baseball's GameView calls the shared version, it now uses basketball's thresholds (which include RED). Verify no baseball card has salary >= 73 by reading `baseball/public/data/players.json` salary distribution. Document any RED-tier baseball cards in the audit doc (Step 8).

- [ ] **Step 7: Typecheck**

```bash
cd /Users/john/Desktop/ReplayMod/basketball && npx tsc --noEmit 2>&1 | tail -10
cd /Users/john/Desktop/ReplayMod/baseball && npx tsc --noEmit 2>&1 | grep -v "ProfileScreen" | tail -10
```

Expected: silent (no new errors). If errors, fix the import paths or missing types.

- [ ] **Step 8: Write the storage audit doc**

Create `docs/storage-keys-audit.md`. Catalog every `localStorage.getItem` and `localStorage.setItem` call in basketball + baseball GameViews.

```bash
grep -n "localStorage\." basketball/src/views/GameView.tsx > /tmp/basketball-keys.txt
grep -n "localStorage\." baseball/src/views/GameView.tsx > /tmp/baseball-keys.txt
```

The doc should have three sections:

**Section 1: Cross-sport-shared keys** (same key, both sports). Examples expected: `replaymod_streak`, `rm_best_hand`, `rm_best_tier`, `rm_on_board_today`, `rm_session_id`, `rm_whisper_intro_count`, `rm_ever_on_board`, `rm_last_rank`.

**Section 2: Already sport-scoped keys** (different key per sport). Examples expected: `rm_usher_rookie_first_win` (basketball) vs `rm_usher_rookie_first_win_bb` (baseball).

**Section 3: Sport-agnostic keys** (auth, identity, settings — keys not relating to gameplay state). Examples expected: `rm_session_id`, nickname-related.

For each key in Section 1, mark the future migration plan: "wraps as `${ns}_<key>` after Phase 2; `ns` defaults to `''` for back-compat."

- [ ] **Step 9: Run tests**

```bash
cd /Users/john/Desktop/ReplayMod && npm test 2>&1 | grep -E "(Test Files|Tests )" | tail -3
```

Expected: `8 failed | 241 passed`. Same as baseline.

- [ ] **Step 10: Commit**

```bash
git add shared/views/_gameViewHelpers.ts docs/storage-keys-audit.md basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/01): extract pure helpers + storage audit

Lift sleep, RosterGridScaleFit, RollingNumber, tierFromSalary,
toRevealableCards, cardId, sumSalary out of basketball + baseball
GameView and into shared/views/_gameViewHelpers.ts. Basketball is
canonical; baseball previously had a tierFromSalary missing the RED
check (no baseball card has salary >= 73 today, so the new threshold
is dead-but-harmless for baseball — documented in storage audit).

Plus: docs/storage-keys-audit.md catalogs every localStorage call
in basketball + baseball GameViews. Cross-sport-shared keys flagged
for the post-Phase-2 namespacing migration. No keys changed yet —
this is documentation only.

No behavior change. Phase 2 sub-PR 01 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Push, open PR, merge into working branch**

```bash
git push -u origin phase-2/01-helpers-+-audit
gh pr create --base phase-2/gameview-shared --head phase-2/01-helpers-+-audit \
  --title "phase-2/01: extract pure helpers + storage audit" \
  --body "Sub-PR 01 of Phase 2. See docs/superpowers/specs/2026-04-29-gameview-shared-phase-2-design.md."
```

Wait for Vercel preview to build, run smoke checklist, then merge:

```bash
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared
git pull
```

- [ ] **Step 12: Generate Task 1 report**

Use Reporting Protocol. Behavior changed: none. Vercel preview tested both sports.

---

## Task 2: Define `GameAdapter` Interface + Skeleton + Leaderboard Scope Cleanup

**Files:**
- Create: `shared/views/GameAdapter.ts`
- Create: `shared/views/GameView.tsx` (stub)
- Modify: `basketball/src/adapters/basketballConfig.ts` (add `sportKey` field)
- Modify: `basketball/src/views/GameView.tsx` (remove hardcoded sport literals)
- Modify: `baseball/src/views/GameView.tsx` (remove hardcoded sport literals)

**Branch:** `phase-2/02-adapter-+-skeleton`

- [ ] **Step 1: Create the sub-branch**

```bash
git checkout phase-2/gameview-shared
git pull
git checkout -b phase-2/02-adapter-+-skeleton
```

- [ ] **Step 2: Add `sportKey` to basketballConfig**

Read `basketball/src/adapters/basketballConfig.ts` lines 1–35 to confirm sportKey is missing. Add it under the existing `name`/`sportLabel` fields:

```typescript
// In BasketballSportConfig:
sportKey: "basketball" as const,
```

This normalizes basketball to the shape baseball + worldcup already use. Verify with:

```bash
cd /Users/john/Desktop/ReplayMod/basketball && npx tsc --noEmit 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 3: Create `shared/views/GameAdapter.ts`**

Write the interface verbatim from the spec, with full JSDoc on each field. Example structure:

```typescript
/**
 * shared/views/GameAdapter.ts
 *
 * The adapter prop consumed by shared/views/GameView.tsx. Each sport's
 * wrapper builds a GameAdapter literal bundling the existing sportAdapter
 * singleton + sport-specific React components + sport-specific config.
 *
 * Shared GameView contains zero `if (sportKey === ...)` branches; all
 * variation flows through this adapter, sportAdapter, optional component
 * slots, or shared/featureFlags.ts.
 */

import type { ComponentType } from "react";
import type { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import type { PlayerCard } from "@shared/types";
// ... import other types

export interface GameAdapter {
  sportKey: "basketball" | "baseball";
  sportAdapter: SharedSportAdapter;
  localStorageNamespace: string;
  leaderboardScope: string;
  routeBasePath?: string;
  gaugeThresholds: { tier: string; minFP: number }[];
  tierFromSalary: (salary: number) => string;
  dealInitialRoster: () => Promise<{ roster: PlayerCard[] }>;
  redrawRoster: (args: { currentCards: PlayerCard[]; lockedCardIds: Set<string> })
                => Promise<{ roster: PlayerCard[] }>;
  resolveRoster: (args: { finalCards: PlayerCard[] })
                => Promise<{ roster: PlayerCard[]; mvpCardId?: string }>;
  CardComponent: ComponentType<any>;       // sport-specific Card component
  resetAllOverlays: () => void;
  ftueRoster: PlayerCard[];
  ftueDrawnRoster: PlayerCard[];
  ftueTextConfig: any;                     // type stays loose this PR; tightens in Task 5
  PostHandSheet?: ComponentType<any>;
  audioBedSrc: string | null;
}
```

Use `any` for `CardComponent`, `ftueTextConfig`, `PostHandSheet` props for now — they tighten in Task 5 once we know exact prop shapes. This is a stub.

- [ ] **Step 4: Create `shared/views/GameView.tsx` as a stub**

```typescript
/**
 * shared/views/GameView.tsx
 *
 * Phase 2 stub. Full lift lands in tasks 3–6. Each sport's wrapper passes
 * a GameAdapter; this stub doesn't use it yet, just satisfies the prop
 * contract.
 */

import type { GameAdapter } from "./GameAdapter";

interface Props {
  adapter: GameAdapter;
}

export function GameView(_props: Props): null {
  // Stub — full implementation lands in subsequent sub-PRs.
  return null;
}
```

This file is intentionally not yet wired into either sport's main flow.

- [ ] **Step 5: Replace hardcoded `"basketball"` leaderboard literals in basketball GameView**

In `basketball/src/views/GameView.tsx`, find every place `sport: "basketball"` or `?sport=basketball` is hardcoded. Replace with `sportAdapter.sportKey`.

```bash
grep -n '"basketball"' basketball/src/views/GameView.tsx | head -20
```

Replace each occurrence inside the `submitToLeaderboard` body and `checkLeaderboardRank` URLs:

```typescript
// Before:
body: JSON.stringify({ action: "submit", sport: "basketball", metric, value, ... }),

// After:
body: JSON.stringify({ action: "submit", sport: sportAdapter.sportKey, metric, value, ... }),
```

```typescript
// Before:
fetch("/api/leaderboard?sport=basketball&metric=hand_best&...")

// After:
fetch(`/api/leaderboard?sport=${sportAdapter.sportKey}&metric=hand_best&...`)
```

The `sportAdapter` singleton is already imported at line 10 of basketball GameView.

- [ ] **Step 6: Same in baseball GameView**

```bash
grep -n '"baseball"' baseball/src/views/GameView.tsx | head -20
```

Replace `sport: "baseball"` and `?sport=baseball` literals with `sportAdapter.sportKey`. The `sportAdapter` singleton is imported at line 10 of baseball GameView.

- [ ] **Step 7: Same for `LeaderboardScreen` and `ProfileScreen` mount sites**

These currently pass `sport="basketball"` / `sport="baseball"` as a prop literal. Replace with `sport={sportAdapter.sportKey}`:

```bash
grep -n 'sport="basketball"\|sport="baseball"' basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx
```

- [ ] **Step 8: Typecheck**

```bash
cd /Users/john/Desktop/ReplayMod/basketball && npx tsc --noEmit 2>&1 | tail -5
cd /Users/john/Desktop/ReplayMod/baseball && npx tsc --noEmit 2>&1 | grep -v "ProfileScreen" | tail -5
cd /Users/john/Desktop/ReplayMod/worldcup && npx tsc --noEmit 2>&1 | tail -5
```

Expected: silent. The `sportAdapter.sportKey` getter resolves to a string at runtime; the `LeaderboardScreen.sport` prop type is `"basketball" | "baseball" | "worldcup"`. Verify TypeScript narrows correctly. If it doesn't, cast at the call site: `sport={sportAdapter.sportKey as "basketball"}`.

- [ ] **Step 9: Run tests**

```bash
cd /Users/john/Desktop/ReplayMod && npm test 2>&1 | grep -E "(Test Files|Tests )" | tail -3
```

Expected: `8 failed | 241 passed`. Same as baseline.

- [ ] **Step 10: Commit**

```bash
git add shared/views/GameAdapter.ts shared/views/GameView.tsx basketball/src/adapters/basketballConfig.ts basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/02): GameAdapter interface + stub + leaderboard scope cleanup

- Add shared/views/GameAdapter.ts: per-component adapter interface
  (sportKey, sportAdapter re-export, localStorageNamespace,
  leaderboardScope, routeBasePath, gauge thresholds, roster lifecycle,
  CardComponent, FTUE config, optional PostHandSheet, audio bed).
- Add shared/views/GameView.tsx as a stub. Full lift lands in PRs 03-06.
- Add sportKey: "basketball" to basketballConfig (already on baseball +
  worldcup configs — drift normalize, basketball is canonical per
  CLAUDE.md).
- Replace hardcoded sport: "basketball" / sport: "baseball" literals in
  /api/leaderboard call sites with sportAdapter.sportKey. Also routes
  LeaderboardScreen + ProfileScreen sport prop through adapter.

No behavior change. Phase 2 sub-PR 02 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Push, open PR, merge into working branch**

```bash
git push -u origin phase-2/02-adapter-+-skeleton
gh pr create --base phase-2/gameview-shared --head phase-2/02-adapter-+-skeleton \
  --title "phase-2/02: GameAdapter interface + skeleton + leaderboard scope cleanup" \
  --body "Sub-PR 02 of Phase 2."
```

Wait for Vercel preview build. Run smoke checklist on basketball + baseball — leaderboard submission is the highest-risk change in this PR (verify a baseball hand still lands in `lb:baseball:*` keys). Then merge.

```bash
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared
git pull
```

- [ ] **Step 12: Generate Task 2 report**

Use Reporting Protocol. STOP CONDITION to specifically verify: leaderboard submissions still land in correctly sport-scoped keys. Confirm by playing one hand in each sport and checking the leaderboard view shows the new entry.

---

## Task 3: Lift Shared State + Leaderboard Helpers Into Shared Core

**Files:**
- Modify: `shared/views/GameView.tsx` (now starts holding real state)
- Modify: `shared/views/GameAdapter.ts` (no signature change unless needed)
- Modify: `basketball/src/views/GameView.tsx` (delete state hooks now in shared)
- Modify: `baseball/src/views/GameView.tsx` (same)

**Branch:** `phase-2/03-lift-state`

**Scope:** Move into shared:
- State hooks: `gameState`, `streak`, `balance`, `roster`, `winTier`, `winPayout`, `currentBet`, `betMultiplier`, `handCount`, `revealIndex`, `revealedSalary`, `lockedSalary`, `displayFp`, `springSettled`, `lastRevealedCardId`, etc.
- Leaderboard helpers: `submitToLeaderboard`, `checkLeaderboardRank`, `logHandToDb`, `getPlayerUid`, `getNickname`, `getSessionId` (if not already shared).
- All localStorage reads/writes go through `adapter.localStorageNamespace + key` helpers (with empty namespace = current behavior).

This is the largest single sub-PR — ~600 lines of state + helpers move. Break into substeps.

- [ ] **Step 1: Create the sub-branch**

```bash
git checkout phase-2/gameview-shared && git pull
git checkout -b phase-2/03-lift-state
```

- [ ] **Step 2: Compare basketball vs baseball state hook lists**

```bash
grep -n "useState\|useRef" basketball/src/views/GameView.tsx | head -50 > /tmp/basketball-hooks.txt
grep -n "useState\|useRef" baseball/src/views/GameView.tsx | head -50 > /tmp/baseball-hooks.txt
diff /tmp/basketball-hooks.txt /tmp/baseball-hooks.txt
```

For every hook in BOTH lists, mark as a "lift target." For hooks in only one, leave per-sport (they're sport-specific — investigate before lifting).

- [ ] **Step 3: Build the shared GameView body skeleton**

Replace the `shared/views/GameView.tsx` stub with:

```typescript
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { GameAdapter } from "./GameAdapter";
// ... all imports basketball GameView currently has, EXCEPT sport-specific
//     ones (gameAdapter functions, AthleteCard, sportAdapter — those come
//     through props.adapter)

interface Props {
  adapter: GameAdapter;
}

export function GameView({ adapter }: Props) {
  // 1. State hooks (lifted) — copy verbatim from basketball GameView
  //    except where they read localStorage; those go through ns helper.
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [streak, setStreak] = useState<number>(() =>
    parseInt(localStorage.getItem(nsKey(adapter, "replaymod_streak")) ?? "0", 10)
  );
  // ... etc.
  
  // 2. Leaderboard helpers (lifted)
  // ... submitToLeaderboard, checkLeaderboardRank, logHandToDb
  
  // 3. Reveal/spring orchestration — Task 4 lifts this. Stub for now.
  
  // 4. JSX — Task 5 lifts this. Return null for now.
  return null;
}

// localStorage namespace helper.
function nsKey(adapter: GameAdapter, key: string): string {
  return adapter.localStorageNamespace
    ? `${adapter.localStorageNamespace}_${key}`
    : key;  // empty namespace = current behavior, no migration yet
}
```

- [ ] **Step 4: Move state hooks one by one**

For each shared state hook:
1. Cut from basketball GameView
2. Paste into `shared/views/GameView.tsx` (above the leaderboard helpers section)
3. If it reads/writes localStorage, wrap key with `nsKey(adapter, ...)`
4. Run typecheck after every 5 hooks: `cd basketball && npx tsc --noEmit`

Hooks to move (in order, basketball line numbers approximate):
- `gameState` (~line 540)
- `roster` (~line 545)
- `streak` (~line 776) — has localStorage
- `balance` (~line 780) — has localStorage (if implemented)
- `winTier`, `winPayout` (~line 800)
- `currentBet`, `betMultiplier` (~line 810)
- `handCount` (~line 820) — may have localStorage
- `revealIndex`, `revealedSalary`, `lockedSalary` (~line 830)
- `springSettled`, `displayFp`, `lastRevealedCardId` (~line 850)
- ... continue per the audit

- [ ] **Step 5: Move leaderboard helpers**

Move `submitToLeaderboard`, `checkLeaderboardRank`, `logHandToDb` from basketball GameView into shared GameView. Inside each, replace the now-removed `sportAdapter.sportKey` reference with `adapter.leaderboardScope`:

```typescript
// In submitToLeaderboard (now inside shared GameView):
body: JSON.stringify({
  action: "submit",
  sport: adapter.leaderboardScope,  // was: sportAdapter.sportKey
  metric, value, uid, nickname,
  ...
}),
```

- [ ] **Step 6: Wire baseball GameView through the same shared core**

For now, do NOT yet delete state hooks from baseball — basketball is the canonical source of truth in this lift. We're proving the shared GameView works for basketball first; baseball wiring lands in Task 6 (wrapper rewrite). But: baseball's leaderboard helper changes DO need to mirror basketball's. Apply the same `adapter.leaderboardScope` substitution in baseball's local copy.

Wait — this would be premature. Baseball's GameView still owns its own state in this sub-PR. Defer baseball changes to Task 6.

Action: leave baseball untouched in this Task. Only basketball gets state lifted.

- [ ] **Step 7: Wire basketball wrapper to read from shared GameView**

In `basketball/src/views/GameView.tsx`, at the end of the file (where the JSX render returns), DO NOT yet route through `shared/views/GameView.tsx`. The shared GameView's JSX is still null in this sub-PR. Basketball still renders its own JSX, using state imported from shared.

This requires shared's GameView to EXPOSE the state hooks as a custom hook (e.g., `useSharedGameState(adapter)`) rather than a component, since basketball needs to consume the state without rendering shared's null JSX.

Refactor: move state hooks into a hook called `useSharedGameState(adapter)` that returns an object with all the state values + setters. Basketball GameView calls this hook at the top, destructures, and uses the returned values exactly as before.

```typescript
// shared/views/_useSharedGameState.ts
export function useSharedGameState(adapter: GameAdapter) {
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [streak, setStreak] = useState<number>(() =>
    parseInt(localStorage.getItem(nsKey(adapter, "replaymod_streak")) ?? "0", 10)
  );
  // ... all the state
  
  return {
    gameState, setGameState,
    streak, setStreak,
    // ... etc.
    submitToLeaderboard,  // function bound to adapter
    checkLeaderboardRank,
    logHandToDb,
  };
}
```

In `basketball/src/views/GameView.tsx`:
```typescript
const adapter: GameAdapter = useMemo(() => ({
  sportKey: "basketball",
  sportAdapter,
  localStorageNamespace: "",
  leaderboardScope: sportAdapter.sportKey,
  // ... etc — partial GameAdapter for now; full literal in Task 6
}), []);

const {
  gameState, setGameState,
  streak, setStreak,
  // ...
  submitToLeaderboard, checkLeaderboardRank, logHandToDb,
} = useSharedGameState(adapter);
```

The shared GameView component itself stays a stub for now; the hook is what gets used.

- [ ] **Step 8: Typecheck + run tests**

```bash
cd basketball && npx tsc --noEmit
cd baseball && npx tsc --noEmit | grep -v ProfileScreen
cd /Users/john/Desktop/ReplayMod && npm test | grep -E "(Test Files|Tests )" | tail -3
```

Expected: silent typechecks, same 8 pre-existing test failures.

- [ ] **Step 9: Smoke test the basketball Vercel preview**

After push, basketball MUST behave identically. Specific checks:
- localStorage keys still written with no prefix (since `localStorageNamespace: ""`)
- Streak persists across page refresh
- Leaderboard submit lands in `lb:basketball:*` KV keys
- All gameplay flows work

If ANY behavior differs, STOP. Report. Do not continue.

- [ ] **Step 10: Commit + PR + merge**

```bash
git add shared/views/_useSharedGameState.ts shared/views/GameView.tsx basketball/src/views/GameView.tsx
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/03): lift basketball state + leaderboard helpers to shared

- New shared/views/_useSharedGameState.ts hook owns all GameView state
  hooks (gameState, streak, balance, roster, winTier, etc.) + leaderboard
  helpers (submitToLeaderboard, checkLeaderboardRank, logHandToDb).
- Basketball GameView builds a partial GameAdapter literal and consumes
  the hook. localStorage keys go through nsKey(adapter, ...) — empty
  namespace = current behavior preserved.
- Baseball UNCHANGED in this sub-PR (basketball lift first; baseball
  wiring lands in Task 6 wrapper rewrite).

No behavior change for basketball (verified via smoke checklist).
Phase 2 sub-PR 03 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin phase-2/03-lift-state
gh pr create --base phase-2/gameview-shared --head phase-2/03-lift-state \
  --title "phase-2/03: lift basketball state hooks + leaderboard helpers to shared"
# After preview verified:
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared && git pull
```

- [ ] **Step 11: Generate Task 3 report**

STOP CONDITIONS to verify with extra care:
- Streak persistence across refresh
- Leaderboard submission lands in correctly scoped KV keys
- localStorage reads return same values as before

---

## Task 4: Lift Reveal + Spring Orchestration

**Files:**
- Modify: `shared/views/_useSharedGameState.ts` or `shared/views/_useReveal.ts` (new hook for reveal state)
- Modify: `basketball/src/views/GameView.tsx` (consume from shared)

**Branch:** `phase-2/04-lift-reveal-spring`

**Scope:** Move into shared:
- `runSpring` function
- `onAnchorFpComplete` callback
- `onCardFpStart` callback (the budget rolldown trigger)
- `onCardComplete`, `onCardReveal` callbacks
- FTUE/non-FTUE branch in `pendingBalanceUpdateRef` (the ROOKIE-neutral logic)
- `useEmotionalReveal` hook usage (already shared, just wire through)
- `springSettled`, `displayFp`, `lastRevealedCardId`, `revealIndex` updates
- Spring timers ref (`springTimersRef`)

Highest-risk task — this is the timing-sensitive code. Take extra care with `pendingBalanceUpdateRef` flow and the FTUE-vs-non-FTUE branch.

- [ ] **Step 1: Create sub-branch**

```bash
git checkout phase-2/gameview-shared && git pull
git checkout -b phase-2/04-lift-reveal-spring
```

- [ ] **Step 2: Read the reveal section in basketball GameView (lines ~960–1145)**

Identify the exact line range for:
- `onAnchorFpComplete` callback — where reveal calculates the win tier and pendingBalanceUpdateRef gets set
- `onCardFpStart` callback — budget deduction
- `onCardComplete` callback
- `runSpring` function

Plus the supporting state: `springTimersRef`, `springHasFiredRef`, `anchorFpCallCountRef`, `deductedSalaryCardsRef`.

```bash
sed -n '960,1145p' basketball/src/views/GameView.tsx
```

- [ ] **Step 3: Create `shared/views/_useReveal.ts`**

A hook that takes the adapter + the state from `useSharedGameState` and returns the reveal callbacks + spring state.

```typescript
export function useReveal(args: {
  adapter: GameAdapter;
  state: ReturnType<typeof useSharedGameState>;
  // any other deps
}) {
  const springTimersRef = useRef<number[]>([]);
  // ... full reveal logic, copied from basketball lines 960-1145
  
  const onAnchorFpComplete = useCallback(/* ... */);
  const onCardFpStart = useCallback(/* ... */);
  const onCardComplete = useCallback(/* ... */);
  
  return {
    springSettled, setSpringSettled,
    displayFp,
    onAnchorFpComplete,
    onCardFpStart,
    onCardComplete,
    runSpring,
    springTimersRef,
  };
}
```

The function bodies move verbatim from basketball. Inside, replace any `sportAdapter.X` reference with `adapter.sportAdapter.X` (since `adapter` is the GameAdapter prop, and `sportAdapter` lives on it).

- [ ] **Step 4: Cut reveal callbacks out of basketball GameView**

Delete the now-moved code from `basketball/src/views/GameView.tsx`. Add the import:

```typescript
import { useReveal } from "@shared/views/_useReveal";
```

And wire it into the existing flow:
```typescript
const state = useSharedGameState(adapter);
const reveal = useReveal({ adapter, state });
const { onAnchorFpComplete, onCardFpStart, onCardComplete, runSpring } = reveal;
```

These callbacks then get passed to `useEmotionalReveal` exactly where they were before.

- [ ] **Step 5: Special attention — `pendingBalanceUpdateRef` ROOKIE logic**

The non-FTUE branch in `onAnchorFpComplete` contains the streak logic that was just fixed in PR #12. Verify the moved code preserves:
- `isStreakWin = !bust && tier !== "ROOKIE"`
- `isStreakLoss = bust`
- ROOKIE: no streak change
- BUST: setStreak(0) + localStorage write
- STARTER+: setStreak(prev+1) + localStorage write + leaderboard submit

Re-read the moved code in `_useReveal.ts` and confirm these branches are intact.

- [ ] **Step 6: Typecheck + smoke test on basketball preview**

```bash
cd basketball && npx tsc --noEmit
cd /Users/john/Desktop/ReplayMod && npm test | grep -E "(Test Files|Tests )" | tail -3
```

Then push and run the FULL smoke checklist on the preview. Specific checks for THIS task:
- BUST hand → streak resets to 0 (verify via DevTools localStorage `replaymod_streak` reads "0")
- ROOKIE hand → streak unchanged (no fire emoji change)
- STARTER+ hand → streak +1, fire emoji count increments
- Skip-mid-reveal → budget doesn't go negative
- Anchor card with held cards → reveal sequence behaves correctly

If ANY check fails, STOP. Report. Do not commit.

- [ ] **Step 7: Commit + PR + merge**

```bash
git add shared/views/_useReveal.ts basketball/src/views/GameView.tsx
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/04): lift reveal + spring orchestration to shared

Move runSpring, onAnchorFpComplete, onCardFpStart, onCardComplete, plus
the spring/anchor/deductedSalary refs into shared/views/_useReveal.ts.
Hook is consumed by basketball GameView; baseball still on its own copy
until Task 6 wrapper rewrite.

ROOKIE-neutral / BUST-resets / STARTER+-advances streak logic preserved
verbatim. pendingBalanceUpdateRef pattern moves intact. FTUE branch
unchanged (still calls completeFTUE → handleButtonClick).

Highest-risk sub-PR — verified via full smoke checklist on basketball
preview, all 8 items pass.

Phase 2 sub-PR 04 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin phase-2/04-lift-reveal-spring
gh pr create --base phase-2/gameview-shared --head phase-2/04-lift-reveal-spring \
  --title "phase-2/04: lift reveal + spring orchestration to shared"
# Manual smoke run — extra-careful — then merge.
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared && git pull
```

- [ ] **Step 8: Generate Task 4 report**

This is the most-flagged task in the spec. STOP CONDITIONS to verify exhaustively:
- Streak math correct on every tier outcome
- Budget rolldown smooth (no jump on skip)
- FTUE flow unchanged
- Spring settles produce same `springSettled` state transitions

---

## Task 5: Lift Main JSX + Overlays

**Files:**
- Modify: `shared/views/GameView.tsx` (becomes the real component)
- Modify: `basketball/src/views/GameView.tsx` (consumes shared component)

**Branch:** `phase-2/05-lift-jsx-overlays`

**Scope:** Move into shared:
- Main JSX render: header, RosterGrid, GameBar, TierGauge, footer, splitFooter, controlsHost, multipliersHost
- Overlay components: auth modal (`RegisterModal`), `LeaderboardScreen`, `ProfileScreen`, `BellSheet`, `FeedbackModal`, `CollectScreen`, `LegendModal` (whatever exists)
- `PostHandSheet` — moves to optional adapter slot (basketball has it, baseball doesn't)
- All inline `<style>` blocks — move with the JSX

- [ ] **Step 1: Create sub-branch**

```bash
git checkout phase-2/gameview-shared && git pull
git checkout -b phase-2/05-lift-jsx-overlays
```

- [ ] **Step 2: Identify JSX boundary in basketball GameView**

The render function probably starts ~line 1500–1700 of basketball GameView. Use:

```bash
grep -n "^  return\|^  );$" basketball/src/views/GameView.tsx | head -10
```

Find the top-level `return (` and the closing `);` of the component body.

- [ ] **Step 3: Replace the shared GameView stub with the real implementation**

```typescript
// shared/views/GameView.tsx
import type { GameAdapter } from "./GameAdapter";
import { useSharedGameState } from "./_useSharedGameState";
import { useReveal } from "./_useReveal";
// ... all imports basketball GameView has, EXCEPT:
//     - sport-specific Card component (passed via adapter.CardComponent)
//     - sport-specific PostHandSheet (passed via adapter.PostHandSheet)
//     - sportAdapter singleton (use adapter.sportAdapter)

interface Props { adapter: GameAdapter; }

export function GameView({ adapter }: Props) {
  const state = useSharedGameState(adapter);
  const reveal = useReveal({ adapter, state });
  
  // ... all setup that was in basketball GameView body
  // ... uses adapter.CardComponent in RosterGrid prop, adapter.PostHandSheet
  //     in conditional render, etc.
  
  return (
    <div>
      {/* full JSX from basketball, with sport-specific bits via adapter */}
      <RosterGrid
        cards={state.roster}
        CardComponent={adapter.CardComponent}
        // ... all other props
      />
      {/* ... */}
      {adapter.PostHandSheet && state.showPostHandSheet && (
        <adapter.PostHandSheet {...postHandSheetProps} />
      )}
      {/* ... */}
    </div>
  );
}
```

- [ ] **Step 4: Update basketball GameView to consume the shared component**

```typescript
// basketball/src/views/GameView.tsx — significantly shrunk
import { GameView as SharedGameView } from "@shared/views/GameView";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { AthleteCard, resetAllOverlays } from "../components/AthleteCard";
import { PostHandSheet } from "../components/PostHandSheet";
import { ftueRoster, ftueDrawnRoster } from "../adapters/ftueRoster";
import { ftueTextConfig } from "../adapters/basketballConfig";
import { GAUGE_THRESHOLDS, tierFromSalary } from "@shared/views/_gameViewHelpers";
import type { GameAdapter } from "@shared/views/GameAdapter";

export default function BasketballGameView() {
  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "basketball",
    sportAdapter,
    localStorageNamespace: "",
    leaderboardScope: sportAdapter.sportKey,
    routeBasePath: "/basketball/",
    gaugeThresholds: GAUGE_THRESHOLDS,
    tierFromSalary,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    CardComponent: AthleteCard,
    resetAllOverlays,
    ftueRoster,
    ftueDrawnRoster,
    ftueTextConfig,
    PostHandSheet,
    audioBedSrc: "/audio/basketball/crowd/bed-murmur.mp3",
  }), []);
  
  return <SharedGameView adapter={adapter} />;
}
```

The exact set of imports depends on what basketball/src/adapters/basketballConfig.ts and basketball/src/adapters/ftueRoster.ts export. Verify each import resolves.

The wrapper at this point is functionally complete for basketball — but baseball is not yet wired. Baseball's GameView still owns its own (now-orphaned) copy of state hooks + reveal + JSX. That's OK; Task 6 cleans baseball up.

- [ ] **Step 5: Typecheck + smoke test basketball**

```bash
cd basketball && npx tsc --noEmit
```

Expected: silent. If errors are about missing fields on GameAdapter, tighten the interface in `shared/views/GameAdapter.ts` (e.g., loosen `CardComponent: ComponentType<any>` to a specific shape that AthleteCard satisfies).

Then push, smoke-test ALL 8 checklist items on basketball preview.

If basketball renders blank or with errors: STOP. The most likely cause is a missing prop or import in shared GameView. Diff against the original basketball JSX (`git diff main -- basketball/src/views/GameView.tsx`).

- [ ] **Step 6: Commit + PR + merge**

```bash
git add shared/views/GameView.tsx basketball/src/views/GameView.tsx shared/views/GameAdapter.ts
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/05): lift JSX + overlays to shared GameView

- shared/views/GameView.tsx is now the real component. Renders the full
  GameView JSX (header, RosterGrid, GameBar, TierGauge, footer, all
  overlays) using state from useSharedGameState + useReveal hooks.
- Basketball GameView shrinks to a wrapper: builds a GameAdapter literal
  and renders <SharedGameView adapter={...} />.
- PostHandSheet becomes adapter.PostHandSheet (basketball-only today;
  baseball will pass undefined → conditional render skips).
- Sport-specific Card component, headshot URL, FTUE roster all flow via
  adapter.

Baseball UNCHANGED in this sub-PR. Baseball wrapper rewrite + dead-code
removal lands in Task 6.

Phase 2 sub-PR 05 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin phase-2/05-lift-jsx-overlays
gh pr create --base phase-2/gameview-shared --head phase-2/05-lift-jsx-overlays \
  --title "phase-2/05: lift JSX + overlays to shared GameView"
# Smoke test basketball preview thoroughly. Visual diffs likely; flag any.
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared && git pull
```

- [ ] **Step 7: Generate Task 5 report**

Visual diffs are the highest risk. Compare basketball preview to production replayifs.com side-by-side. Note any differences. STOP CONDITION: any visible regression — pixel-level diffs in card layout, missing overlays, broken interactions.

---

## Task 6: Shrink Wrappers (Cutover)

**Files:**
- Modify: `baseball/src/views/GameView.tsx` (rewrite as ~80-line wrapper)
- Modify: `basketball/src/views/GameView.tsx` (already wrapper from Task 5; verify lean)
- Delete: dead code in baseball that's now redundant with shared

**Branch:** `phase-2/06-shrink-wrappers`

**Scope:** Baseball's GameView gets the same wrapper treatment basketball got in Task 5. The shared GameView already has all its logic; baseball just needs to build a GameAdapter literal and render `<SharedGameView adapter={...} />`. After this task, both per-sport wrappers are ~80 lines.

- [ ] **Step 1: Create sub-branch**

```bash
git checkout phase-2/gameview-shared && git pull
git checkout -b phase-2/06-shrink-wrappers
```

- [ ] **Step 2: Build the baseball wrapper**

Replace `baseball/src/views/GameView.tsx` ENTIRELY with a wrapper analogous to basketball's (from Task 5):

```typescript
// baseball/src/views/GameView.tsx
import { useMemo } from "react";
import { GameView as SharedGameView } from "@shared/views/GameView";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { BaseballCard, resetAllOverlays } from "../components/BaseballCard";
import { ftueRoster, ftueDrawnRoster } from "../adapters/ftueRoster";
import { ftueTextConfig } from "../adapters/baseballConfig";
import { tierFromSalary } from "@shared/views/_gameViewHelpers";
import type { GameAdapter } from "@shared/views/GameAdapter";

const BASEBALL_GAUGE_THRESHOLDS = [
  { tier: "ROOKIE",   minFP: 170 },
  { tier: "STARTER",  minFP: 200 },
  { tier: "ALL_STAR", minFP: 230 },
  { tier: "MVP",      minFP: 260 },
  { tier: "LEGEND",   minFP: 310 },
];

export default function BaseballGameView() {
  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "baseball",
    sportAdapter,
    localStorageNamespace: "",          // no migration this PR
    leaderboardScope: sportAdapter.sportKey,
    routeBasePath: "/baseball/",
    gaugeThresholds: BASEBALL_GAUGE_THRESHOLDS,
    tierFromSalary,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    CardComponent: BaseballCard,
    resetAllOverlays,
    ftueRoster,
    ftueDrawnRoster,
    ftueTextConfig,
    PostHandSheet: undefined,           // baseball has none; shared skips render
    audioBedSrc: null,                  // baseball ships no crowd bed
  }), []);
  
  return <SharedGameView adapter={adapter} />;
}
```

Delete every other line from baseball's old GameView. Final baseball file should be ~80 lines.

- [ ] **Step 3: Verify basketball is still ~80 lines**

```bash
wc -l basketball/src/views/GameView.tsx baseball/src/views/GameView.tsx
```

Expected: both around 70–90 lines. If basketball is still longer, dead code lingers — clean up.

- [ ] **Step 4: Typecheck all three sports**

```bash
cd basketball && npx tsc --noEmit
cd baseball && npx tsc --noEmit | grep -v ProfileScreen
cd worldcup && npx tsc --noEmit
```

Expected: silent. If errors, the most likely culprit is a missing import or a GameAdapter field type mismatch (e.g., baseball's `BaseballCard` props might not match what shared GameView passes).

- [ ] **Step 5: Smoke test BOTH sports**

This is the cutover. Run the full 8-item checklist on basketball AND baseball.

Critical checks specific to baseball:
- FTUE works (Ohtani anchor, hold/draw flow)
- Position pills show 🏏 / ⚾ correctly
- Baseball card SVG bat displays
- No procedural crowd noise
- Streak math: ROOKIE neutral (verify after PR #12 fix preserved)
- Two-way player log filtering still works (verify after PR #13 fix preserved)

If ANY regression: STOP. Report.

- [ ] **Step 6: Commit + PR + merge**

```bash
git add baseball/src/views/GameView.tsx basketball/src/views/GameView.tsx
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/06): shrink baseball wrapper — Phase 2 cutover

Baseball GameView now matches basketball: ~80-line wrapper that builds
a GameAdapter literal and renders <SharedGameView adapter={...} />.
All gameplay logic, state, JSX, and orchestration lives in
shared/views/GameView.tsx + supporting hooks.

Per-sport diff between basketball and baseball wrappers is now ONLY:
- sportKey + sportAdapter import path (basketball/baseball)
- gaugeThresholds (170/200/230/260/310 vs 190/205/225/235/255)
- CardComponent (AthleteCard vs BaseballCard)
- ftueRoster + ftueTextConfig (sport-specific player sets)
- PostHandSheet (basketball: present, baseball: undefined)
- audioBedSrc (basketball: crowd bed, baseball: null)

No behavior change for either sport. Verified via full smoke checklist
on both /basketball and /baseball.

Phase 2 sub-PR 06 of 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin phase-2/06-shrink-wrappers
gh pr create --base phase-2/gameview-shared --head phase-2/06-shrink-wrappers \
  --title "phase-2/06: shrink baseball wrapper — cutover"
# Full smoke on both sports — extra careful — then merge.
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared && git pull
```

- [ ] **Step 7: Generate Task 6 report**

The cutover. Report should explicitly state every smoke item passed on BOTH sports. List any visual differences (even cosmetic) for separate triage.

---

## Task 7: Cleanup Drift

**Files:**
- Modify: `basketball/src/views/GameView.tsx` (drop unused imports)
- Modify: chad templates (signature unification, if applicable)
- Modify: `shared/views/GameView.tsx` (delete commented-out code)

**Branch:** `phase-2/07-cleanup-drift`

**Scope:** Apply the cleanup punch list from the spec.

- [ ] **Step 1: Create sub-branch**

```bash
git checkout phase-2/gameview-shared && git pull
git checkout -b phase-2/07-cleanup-drift
```

- [ ] **Step 2: Drop unused payout imports in basketball**

Verify the wrapper no longer imports `calculatePayout` or `BASKETBALL_WIN_TIERS`:

```bash
grep -n "calculatePayout\|BASKETBALL_WIN_TIERS" basketball/src/views/GameView.tsx
```

If any imports remain unused, delete them.

- [ ] **Step 3: Unify chad-check signature**

Read the current shape of chad checks (likely in `shared/commentary/chad.ts`):

```bash
grep -n "ChadCheck\|resultsOnly" shared/commentary/chad.ts shared/views/GameView.tsx
```

If basketball's checks have `resultsOnly?: boolean` and baseball's don't, align: either add to all or remove unused. Pick the inclusive option (preserve `resultsOnly`) since it's already wired in.

- [ ] **Step 4: Convert commented-out PostHandSheet code to adapter conditional**

In the original baseball GameView, there was a comment:
```typescript
// PostHandSheet overlay disabled for baseball — old design, blocks play.
// Trophy button on GameBar opens LeaderboardScreen instead.
```

Confirm this is now reflected as `adapter.PostHandSheet === undefined` in baseball's wrapper. If any stale comment remains in shared GameView, delete it — the conditional `{adapter.PostHandSheet && ...}` is self-documenting.

- [ ] **Step 5: Fold `deriveTierFromFp` if redundant**

Check if `deriveTierFromFp` (baseball-only helper) duplicates `calculateWinTier`:

```bash
grep -rn "deriveTierFromFp\|calculateWinTier" shared/ basketball/ baseball/
```

If functionally identical, delete `deriveTierFromFp` and route callers to `calculateWinTier`. If they differ, document the difference and lift `deriveTierFromFp` to shared via adapter (likely under `gaugeThresholds` driven logic).

- [ ] **Step 6: Typecheck + tests**

```bash
cd basketball && npx tsc --noEmit
cd baseball && npx tsc --noEmit | grep -v ProfileScreen
cd /Users/john/Desktop/ReplayMod && npm test | grep -E "(Test Files|Tests )" | tail -3
```

Expected: silent + 8 pre-existing failures.

- [ ] **Step 7: Commit + PR + merge**

```bash
git add basketball/src/views/GameView.tsx shared/views/GameView.tsx shared/commentary/chad.ts
git commit -m "$(cat <<'EOF'
refactor(gameview,phase-2/07): cleanup drift after lift

Punch list cleanup the recon flagged:
- Drop unused calculatePayout / BASKETBALL_WIN_TIERS imports in
  basketball wrapper.
- Unify chad-check signature (resultsOnly preserved across sports).
- Remove commented-out PostHandSheet code in baseball wrapper —
  adapter.PostHandSheet === undefined is self-documenting.
- Fold deriveTierFromFp into calculateWinTier (if redundant) or surface
  via adapter gauge-thresholds (if different).

No behavior change. Phase 2 sub-PR 07 of 7. Working branch is now
ready to merge to main.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin phase-2/07-cleanup-drift
gh pr create --base phase-2/gameview-shared --head phase-2/07-cleanup-drift \
  --title "phase-2/07: cleanup drift after lift"
gh pr merge --merge --delete-branch
git checkout phase-2/gameview-shared && git pull
```

- [ ] **Step 8: Generate Task 7 report**

This is the last sub-PR. Working branch should now be ready for the cutover.

---

## Task 8: Final Merge to Main (Production Cutover)

**Files:** All accumulated changes from Tasks 1–7 land on main in one merge commit.

**Branch:** Open PR `phase-2/gameview-shared → main`. Do NOT delete the branch after merge — keep around briefly for revert capability.

- [ ] **Step 1: Final smoke pass on the working branch preview**

```bash
gh api repos/jztang-ship-it/replay-modulated/deployments --jq '[.[] | select(.environment == "Preview – replay-mod" and (.ref | startswith("phase-2/gameview-shared")))] | .[0].id' | xargs -I {} gh api repos/jztang-ship-it/replay-modulated/deployments/{}/statuses --jq '.[0].environment_url'
```

Run the full 8-item smoke checklist on basketball AND baseball one last time.

- [ ] **Step 2: Verify CLAUDE.md migration status update**

CLAUDE.md should be updated to reflect Phase 2 complete:
- "Migration status" section: GameView moves from "drifted, awaiting promotion" to "lifted via shared/views/GameView.tsx with GameAdapter prop."

If CLAUDE.md hasn't been updated, do it as a final commit on `phase-2/gameview-shared` before merging:

```bash
git checkout phase-2/gameview-shared
# edit CLAUDE.md
git add CLAUDE.md
git commit -m "docs(claude): Phase 2 complete — GameView lifted to shared/"
git push
```

- [ ] **Step 3: Open the production cutover PR**

```bash
gh pr create --base main --head phase-2/gameview-shared \
  --title "Phase 2: GameView lifted to shared/views/GameView.tsx" \
  --body "$(cat <<'EOF'
## Summary
- `shared/views/GameView.tsx` is the canonical implementation; basketball + baseball wrappers are now ~80 lines each.
- Sport-specific code flows through `GameAdapter` (per-component prop pattern, mirrors Phase 1 LandingAdapter).
- Zero `if (sportKey === ...)` branches in shared. All variation via adapter / sportAdapter / featureFlags.
- localStorage namespace seam in place; key migration deferred to a follow-up PR.

## Test plan
- [ ] /basketball: full smoke checklist (FTUE, returning user, deal/hold/draw/reveal, BUST, ROOKIE, STARTER+, leaderboard, refresh)
- [ ] /baseball: same checklist
- [ ] worldcup: still loads (untouched, but shared imports must still resolve)
- [ ] Production replayifs.com smoke after deploy

## Rollback plan
If prod regresses, `git revert` the merge commit. All wrapper rewrites + shared GameView land in a single merge commit so revert is clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge during a quiet window**

```bash
gh pr merge --merge   # do NOT delete branch immediately
git checkout main && git pull
```

- [ ] **Step 5: Verify production**

Wait for Vercel prod deploy. Run smoke checklist on `replayifs.com/basketball` and `replayifs.com/baseball`.

If regression: revert immediately:
```bash
git revert -m 1 <merge-commit-sha>
git push origin main
```

- [ ] **Step 6: Generate final Phase 2 report**

Document:
- Final line counts (each wrapper, shared GameView)
- Adapter contract final shape
- Any deviations from the spec
- localStorage migration follow-up PR ticket (open as a placeholder issue if appropriate)
- Phase 2 status: COMPLETE

- [ ] **Step 7: Cleanup**

After 24–48 hours of stable production:
```bash
git push origin --delete phase-2/gameview-shared
git branch -D phase-2/gameview-shared
```

---

## Self-Review Notes

**Spec coverage:** Each spec section has corresponding tasks:
- Architecture → Tasks 2 + 5
- GameAdapter contract → Task 2
- Branch + merge strategy → Task 0 + Task 8
- Sub-PR sequence → Tasks 1–7
- Cleanup punch list → Task 7
- Risks → addressed via stop conditions in Tasks 3, 4, 5, 6
- Testing → smoke checklist in Reporting Protocol + each task's verification step
- Non-goals → respected throughout (no worldcup, no new tests, no localStorage migration)

**Type consistency:** `GameAdapter` interface defined in Task 2, consumed in Tasks 3–7 with the same field names. State hook return shape from `useSharedGameState` referenced consistently. `useReveal` hook signature stable across Tasks 4–7.

**Placeholder scan:** No "TBD" / "implement later" / "fill in details" in any task. Where types are loose (`ComponentType<any>` in Task 2), they tighten in Task 5 with explicit narrowing instructions.

**Stop conditions:** Each task has explicit stop conditions tied to the user's guardrails (reveal timing, FTUE, leaderboard, streak, localStorage). No sub-PR proceeds without verification.

---

## Open Items After Phase 2

The following are explicitly NOT in this plan and remain open work:

1. **localStorage namespace migration.** A separate PR sets `localStorageNamespace: "basketball"` / `"baseball"` and adds read-old-fallback transition logic. Estimated 1 sub-PR, ~150 lines.
2. **CI parity snapshot test.** Render `<GameView adapter={basketballAdapter}>` and `<GameView adapter={baseballAdapter}>` in test environment, assert structural HTML matches modulo sport-specific text. Estimated 1 sub-PR, ~200 lines.
3. **ESLint rules.** `no-cross-sport-imports` and `no-duplicate-canonical-files` to prevent future drift. Estimated 1 sub-PR, ~100 lines + rule scaffolding.
4. **Worldcup GameView lift.** When worldcup gets gameplay parity work, lift it to the same shared GameView. Estimated effort tied to worldcup feature work, not Phase 2.
5. **8 pre-existing test failures.** Not addressed in Phase 2. Open ticket separately.
