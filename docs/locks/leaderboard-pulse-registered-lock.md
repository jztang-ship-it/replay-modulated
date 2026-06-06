# Leaderboard pulse for registered users — build lock

**Type:** build lock.
**Branch:** `fix/leaderboard-pulse-registered`.
**Status:** LOCKED. 2026-06-06.

## Why this exists

Recon (2026-06-06) found a gap in the existing trophy-pulse logic. The trophy in `GameBar.tsx` has three visual states: dim (default), static gold (`rm_on_board_today === "1"`), and pulsing gold (`trophyPulsing` prop). The only `setTrophyPulsing(true)` site in the repo (`shared/views/GameView.tsx:885`) is reachable through two chad-commentary topics — `leaderboard_intro` (hard-gated by `isAnonymous`) and `leaderboard_explainer` (a one-shot tutorial gated on `handCount >= 3`, orthogonal to actually being on the board). A **registered** user who lands on the daily top-10 gets the static-gold color but no celebration animation, ever.

This branch adds a celebration trigger that fires for ANY user (anon or registered) the moment they make the board, parallel to the existing chad path. The new path is observation-only on `rm_on_board_today` (read by value, never written — that flag's writer is `shared/utils/leaderboardContext.ts:125`, owned by the other track's lane). Edge detection lives in a NEW localStorage key, `rm_board_pulsed_state`, owned by this branch.

## Files this lock owns (sole writer)

- `shared/views/GameView.tsx` — adds `trophyBurst` React state, an edge-detect `useEffect` keyed off `rm_on_board_today` vs the new `rm_board_pulsed_state` localStorage key, and wires `trophyBurst` into the GameBar render and into both existing trophy-tap clears (`onViewLeaderboard`, `onTrophyOpened`). Does NOT modify the existing `leaderboard_intro` / `leaderboard_explainer` chad checks or any commentary topic.
- `shared/components/GameBar.tsx` — adds a `trophyBurst?: boolean` prop. When true, the trophy button plays a one-shot burst (~700–900ms, scale-pop + radiating star rays via NEW CSS keyframes), then settles into the existing `iconBlink` pulse loop (the static-gold border driven by `rm_on_board_today` stays underneath as the durable layer). Reuses the existing pulse styling for the settle phase; only the burst keyframes are new.

## What this lock forbids

- Any edit under `api/`, `shared/utils/`, `shared/data/`, `shared/commentary/`. In particular, `shared/utils/leaderboardContext.ts` (the writer of `rm_on_board_today`) is off-limits — this branch is a pure consumer of that flag.
- Any modification to the existing `leaderboard_intro` / `leaderboard_explainer` chad checks, `setTrophyPulsing(true)` at `GameView.tsx:885`, or any reveal/commentary topic. The new burst path is strictly parallel to them.
- Authoring any new commentary copy. No new strings from `shared/commentary/`.

## localStorage keys

- **Read-only (owned by other lane):** `rm_on_board_today` — written by `shared/utils/leaderboardContext.ts:125`. This branch reads the value at render time and reacts to its edge transitions; it never writes to it.
- **New (owned by this branch):** `rm_board_pulsed_state` — values `"0"` / `"1"`. Tracks whether the burst has been celebrated for the current on-board state. Reset to `"0"` when `rm_on_board_today` is absent or `"0"`, so a subsequent flip to `"1"` re-arms the burst.
