# Phase 2: GameView lift to shared/ — design

**Date:** 2026-04-29
**Status:** Spec — not yet implemented
**Branch:** `phase-2/gameview-shared` (long-lived working branch)

## Context

Phase 1 promoted `LandingPage.tsx` into `shared/components/LandingPage.tsx` via a per-component `LandingAdapter` prop. Per-sport landing files shrank from 335/374 lines to 79/137 lines. That pattern shipped in PR #10 (2026-04-28) and CLAUDE.md flips `LandingPage` from "drifted" to "lifted."

Phase 2 applies the same treatment to `GameView.tsx`. Today:

- `basketball/src/views/GameView.tsx` — 2455 lines
- `baseball/src/views/GameView.tsx` — 2185 lines
- `worldcup/src/views/GameView.tsx` — 466 lines (deferred; worldcup stays on its own track)

The diff between basketball and baseball is ~1903 lines. CLAUDE.md estimates ~80% should be shared. A line-by-line recon (2026-04-29) confirms ~85%.

## Goal

End state: one canonical `shared/views/GameView.tsx` (~1900 lines). Basketball and baseball each shrink to a wrapper of ~80 lines that constructs a `GameAdapter` literal and renders `<SharedGameView adapter={...} />`. Worldcup unchanged.

## Non-goals

- Touching worldcup's GameView.
- Adding eslint `no-cross-sport-imports` / `no-duplicate-canonical-files` rules (CLAUDE.md flags as future work).
- Building the CI parity snapshot test (CLAUDE.md flags as future work).
- New unit/integration tests. Verification is manual preview smoke-testing per sub-PR, matching the established workflow.
- Refactoring `useFTUE`, `useEmotionalReveal`, `CoachLayer` (already shared and stable).
- **Migrating existing localStorage keys to sport-scoped names.** The `localStorageNamespace` adapter field ships with `""` so behavior is unchanged. Actual per-sport namespacing + the read-old-fallback transition lands in a follow-up PR after Phase 2 is in production. This keeps the lift a pure refactor.

## Architecture

```
shared/views/GameView.tsx              ← new, canonical (~1900 lines)
shared/views/GameAdapter.ts            ← new, the prop interface
basketball/src/views/GameView.tsx      ← shrinks 2455 → ~80 lines (wrapper)
baseball/src/views/GameView.tsx        ← shrinks 2185 → ~80 lines (wrapper)
worldcup/src/views/GameView.tsx        ← UNTOUCHED
```

Each sport's wrapper:

1. Imports the sport's `sportAdapter` singleton.
2. Imports gameplay functions from the sport's `gameAdapter.ts` (`dealInitialRoster`, `redrawRoster`, `resolveRoster`).
3. Imports sport-specific React components (`AthleteCard` / `BaseballCard`, optional `PostHandSheet`).
4. Imports the sport's FTUE roster from `ftueRoster.ts`.
5. Constructs a `GameAdapter` literal bundling the above.
6. Renders `<SharedGameView adapter={gameAdapter} />`.

The wrapper path stays at `{sport}/src/views/GameView.tsx` so `App.tsx` imports remain unchanged.

## `GameAdapter` contract

```typescript
export interface GameAdapter {
  // Identity
  sportKey: "basketball" | "baseball";
  sportAdapter: SportAdapter;  // re-exposed; shared GameView calls
                               // computeFantasyPoints, salaryCap, etc.

  // Persistence + scope (explicit seams to prevent cross-sport state bleed)
  localStorageNamespace: string;   // prefix for sport-scoped keys.
                                   // Phase 2 ships with "" (current behavior
                                   // preserved). A follow-up PR sets per-sport
                                   // values + migration logic. Field exists
                                   // now so call sites never hardcode keys.
  leaderboardScope: string;        // routed to /api/leaderboard sport param.
                                   // Already implemented at the API layer in
                                   // PR #11; this PR removes hardcoded sport
                                   // literals at call sites.
  routeBasePath?: string;          // optional Vite base path
                                   // ("/basketball/", "/baseball/") for any
                                   // sport-specific internal navigation.

  // Tier system (real data divergence)
  gaugeThresholds: { tier: string; minFP: number }[];
  tierFromSalary: (salary: number) => string;

  // Roster lifecycle
  dealInitialRoster: () => Promise<{ roster: PlayerCard[] }>;
  redrawRoster: (args: { currentCards: PlayerCard[];
                         lockedCardIds: Set<string> })
                => Promise<{ roster: PlayerCard[] }>;
  resolveRoster: (args: { finalCards: PlayerCard[] })
                => Promise<{ roster: PlayerCard[];
                              mvpCardId?: string }>;

  // Components
  CardComponent: React.ComponentType<CardProps>;
  resetAllOverlays: () => void;

  // FTUE
  ftueRoster: PlayerCard[];
  ftueDrawnRoster: PlayerCard[];
  ftueTextConfig: FtueTextConfig;

  // Optional sport-specific overlays
  PostHandSheet?: React.ComponentType<PostHandSheetProps>;

  // Audio
  audioBedSrc: string | null;
}
```

~17 fields. Wider than `LandingAdapter` (10 fields) but the same structural pattern: data + components + lifecycle hooks.

The `sportAdapter` re-export is the key seam — it gives shared GameView access to all the sport-specific math (`computeFantasyPoints`, `winTiers`, `salaryCap`, `getWinThresholds`, etc.) without each method needing its own slot.

**Why three persistence/scope fields up front:** the biggest silent risk in this lift is not visual diffs — it is shared state bleeding between sports. Today both sports read/write `replaymod_streak`, `rm_best_hand`, `rm_on_board_today`, `rm_session_id` etc. as global keys. The leaderboard fix in PR #11 scoped server-side KV keys per sport, but localStorage stayed cross-sport. Adding `localStorageNamespace` to the adapter contract during the lift creates the seam without changing behavior. The actual key migration (read-old-fallback, write-new) lands as a separate PR after Phase 2 is shipped, so a refactor stays a refactor.

## Feature flags vs adapter

Some "sport-specific" behavior in the current GameViews is actually feature flags in disguise (chad message variants like `rookie_first_win`, `rm_usher_mvp_thanks`, fourth-wall checks). These do NOT go on the adapter. They route through `shared/featureFlags.ts` during the lift.

## Branch & merge strategy

**Long-lived branch:** `phase-2/gameview-shared`, off main.

**Sub-PRs** branch off the long-lived branch and merge BACK into it (not into main). The whole accumulated `phase-2/gameview-shared` branch is the actual cutover; that's the merge to main when complete.

Trade-off: the lift can't ship to prod in pieces — it lands all at once in one merge commit. Mitigation: each sub-PR is reviewable in isolation off the working branch, and we manually test the cumulative `phase-2/gameview-shared` preview after each merge.

**Rollback plan:** if prod breaks after `phase-2/gameview-shared → main`, `git revert` the merge commit. All wrapper rewrites and the shared GameView land in a single merge commit so revert is clean. No partial-state risk.

## Sub-PR sequence

Each row is one PR off `phase-2/gameview-shared`, merged back into it.

| # | Sub-PR | What lands | Approx lines | Risk |
|---|---|---|---|---|
| 00 | `phase-2/00-branch-setup` | Long-lived branch off main. Empty PR — scaffold + spec doc copy. | 0 | None |
| 01 | `phase-2/01-extract-pure-helpers-+-storage-audit` | Move `RosterGridScaleFit`, `RollingNumber`, `tierFromSalary`, `toRevealableCards`, `sleep`, etc. into `shared/views/_gameViewHelpers.ts`. **Plus: catalog every `localStorage.getItem` / `setItem` call site in basketball + baseball GameViews.** Output a complete key list with sport-scoping classification (cross-sport-shared vs already-scoped via `_bb` suffix vs sport-agnostic). No behavior change. | ~250 | Low |
| 02 | `phase-2/02-define-adapter-+-skeleton` | Add `shared/views/GameAdapter.ts` (interface + types only, including `localStorageNamespace`, `leaderboardScope`, `routeBasePath`). Add `shared/views/GameView.tsx` as a stub. Sport wrappers construct adapters with `localStorageNamespace: ""` (no behavior change) and pass `leaderboardScope` from the existing sport literal. Hardcoded `sport: "basketball"` / `"baseball"` literals at the call sites are removed in this PR — they read from `adapter.leaderboardScope`. | ~300 | Low |
| 03 | `phase-2/03-lift-state-+-fixed-helpers` | Move shared state hooks (`gameState`, `streak`, `balance`, `roster`, `winTier`, etc.) and leaderboard/log helpers (`submitToLeaderboard`, `checkLeaderboardRank`, `logHandToDb`) into shared core. Sport wrappers call into them. All localStorage calls go through `adapter.localStorageNamespace + "_" + key` (with empty namespace = current behavior). | ~600 | Medium — touches localStorage + leaderboard wiring just stabilized in PR #11 |
| 04 | `phase-2/04-lift-reveal-+-spring` | Move reveal orchestration: `runSpring`, `onAnchorFpComplete`, `onCardFpStart`, FTUE/non-FTUE split, win-tier flip. The `pendingBalanceUpdateRef` pattern + ROOKIE-neutral logic move with it. | ~500 | Medium — gameplay timing |
| 05 | `phase-2/05-lift-jsx-+-overlays` | Move main JSX (header, RosterGrid, GameBar, TierGauge, footer, auth modal, `LeaderboardScreen`, `ProfileScreen`, `BellSheet`, `FeedbackModal`). `PostHandSheet` becomes the optional adapter slot. | ~700 | Medium-high — visual diffs likely |
| 06 | `phase-2/06-shrink-wrappers` | Delete dead per-sport code; each `{sport}/src/views/GameView.tsx` becomes the ~80-line wrapper. Sport-specific imports + adapter literal only. | ~-1900 net | High — the cutover |
| 07 | `phase-2/07-cleanup-drift` | Opportunistic cleanup the recon flagged. See "Cleanup punch list" below. | ~50 | Low |
| MERGE | `phase-2/gameview-shared → main` | Whole accumulated diff lands on main. Vercel rebuilds prod. | ~+1900 / -3700 net | The real cutover. Merge during a quiet window. |

**Stop points:** at any sub-PR, if things feel wrong (preview regressions, adapter contract feels off), pause and re-think. The branch can be abandoned without affecting main.

## Cleanup punch list (sub-PR #07)

- Drop unused `calculatePayout` and `BASKETBALL_WIN_TIERS` imports in basketball.
- Unify `tierFromSalary` thresholds (basketball checks RED, baseball doesn't). Pick one and route through adapter.
- Normalize chad-check signature — basketball's `resultsOnly?: boolean` field either added to baseball or removed.
- Convert basketball-specific commented-out code in baseball (`// PostHandSheet overlay disabled for baseball — old design, blocks play.`) to a real adapter-driven conditional.
- Fold `deriveTierFromFp` (baseball-only helper) into shared, or delete if redundant with `calculateWinTier`.

## Risks

1. **Reveal timing regressions.** Reveal orchestration (`runSpring`, `onAnchorFpComplete`, FTUE/non-FTUE split) is the most timing-sensitive code in the repo. The recent baseball branch fixed budget rolldown and skip-jump bugs in this region. Mitigation: sub-PR #04 isolates this; thorough manual smoke on its preview before continuing.

2. **localStorage key collisions.** Both sports share `replaymod_streak`, `rm_best_hand`, `rm_on_board_today`, etc. The leaderboard fix scoped the API by sport, but localStorage is still cross-sport. The lift might inadvertently change which sport "wins" a given key. Mitigation: catalog all localStorage reads/writes in #03 and confirm no behavior change.

3. **FTUE state machine breakage.** FTUE has many gates (`isFTUE`, `ftueWinCelebrationActive`, `ftueGaugeOscDone`, `ftueReplayReady`, etc.) with subtle wiring. Mitigation: lift FTUE wiring as part of #04 (with reveal) — don't try to factor it out separately.

4. **CoachLayer + commentary wiring.** The chad system has feature-flagged variants that differ between sports. Mitigation: route through `shared/featureFlags.ts` during #03 — do not add a `chadFlags` adapter field.

5. **Preview cache drift.** Vercel previews on the working branch might cache stale assets. Mitigation: hard-refresh between sub-PR previews.

## Testing

Manual smoke test on every sub-PR preview, run identically on **both** `/basketball` and `/baseball`:

```
☐ First-time FTUE (clear localStorage, refresh, run through FTUE end-to-end)
☐ Returning user (FTUE skipped, lands directly in normal play)
☐ Deal → hold → draw → reveal full cycle
☐ BUST hand
☐ ROOKIE hand (verify streak does NOT advance — neutral)
☐ STARTER+ hand (verify streak advances + fire emoji shows)
☐ Leaderboard submit (verify entry appears in correct sport-scoped board)
☐ Refresh page after a hand (verify state persists correctly via localStorage)
```

Final merge to main: same checklist, then verify replayifs.com on both sports immediately after deploy.

`npm test` should continue to show only the 8 pre-existing failures (detectTopGame test-hook mismatch + scoring negative-baseFP clamp). Any new failure during the lift is a regression to address before continuing.

## Success criteria

- Basketball and baseball both render and play through a full hand identically to pre-lift behavior.
- FTUE flows correctly in both sports.
- Leaderboard submissions land in the correct sport-scoped KV keys.
- Streak math behaves correctly: ROOKIE neutral, BUST resets, STARTER+ advances.
- `replayifs.com/basketball` and `replayifs.com/baseball` work end-to-end on production.
- Each sport's `GameView.tsx` wrapper is ~80 lines (matching Phase 1's `LandingPage.tsx` shim of 79/137).
- Shared GameView contains no `if (sportKey === ...)` branches; all variation flows through the adapter or feature flags.

## Open questions

None at design time. Anything that surfaces during implementation gets resolved on the working branch and noted in the relevant sub-PR's description.
