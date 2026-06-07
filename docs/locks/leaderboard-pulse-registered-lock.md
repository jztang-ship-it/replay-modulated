# Leaderboard pulse for registered users — build lock

**Type:** build lock.
**Branch:** `fix/leaderboard-pulse-registered`.
**Status:** LOCKED. 2026-06-06.

## Why this exists

Recon (2026-06-06) found a gap in the existing trophy-pulse logic. The trophy in `GameBar.tsx` has three visual states: dim (default), static gold (`rm_on_board_today === "1"`), and pulsing gold (`trophyPulsing` prop). The only `setTrophyPulsing(true)` site in the repo (`shared/views/GameView.tsx:885`) is reachable through two chad-commentary topics — `leaderboard_intro` (hard-gated by `isAnonymous`) and `leaderboard_explainer` (a one-shot tutorial gated on `handCount >= 3`, orthogonal to actually being on the board). A **registered** user who lands on the daily top-10 gets the static-gold color but no celebration animation, ever.

This branch adds a celebration trigger that fires for ANY user (anon or registered) the moment they make the board, parallel to the existing chad path. The new path is observation-only on `rm_on_board_today` (read by value, never written — that flag's writer is `shared/utils/leaderboardContext.ts:125`, owned by the other track's lane). Edge detection lives in a NEW localStorage key, `rm_board_pulsed_state`, owned by this branch.

## Files this lock owns (sole writer)

- `shared/views/GameView.tsx` — adds `trophyBurst` + `onBoardTick` React state, an edge-detect `useEffect` keyed off `rm_on_board_today` vs the new `rm_board_pulsed_state` localStorage key, and wires `trophyBurst` + `onBurstEnd` into the GameBar render and into both existing trophy-tap clears (`onViewLeaderboard`, `onTrophyOpened`). The edge-detect effect also writes `rm_board_ack="0"` on the not-on-board → on-board edge; the tap handlers write `rm_board_ack="1"`. Passes `setOnBoardTick` into `useReveal` via the args bag (same pattern as the existing `setBigWinFired`). Does NOT modify the existing `leaderboard_intro` / `leaderboard_explainer` chad checks or any commentary topic.
- `shared/components/GameBar.tsx` — adds `trophyBurst?: boolean` and `onBurstEnd?: () => void` props. The 800ms `trophyBurst` keyframe is now a strict one-shot (the trophy button's new `onAnimationEnd` checks `e.animationName === "trophyBurst"` and calls `onBurstEnd` so GameView can clear the in-memory `trophyBurst` state — kills the prior cross-hand persistence leak). The steady `iconBlink` loop is driven by a `pulseActive` derivation read inline alongside `trophyOnBoard` at the existing `:1387` site: `localStorage.getItem("rm_on_board_today") === "1" && localStorage.getItem("rm_board_ack") !== "1"`. The chad-driven `trophyPulsing` prop still triggers `iconBlink` as before (OR'd with `pulseActive`). Only the burst keyframes are new; the iconBlink loop is the existing keyframe.
- `shared/views/_useReveal.ts` — adds `setOnBoardTick` to `UseRevealArgs`, destructures it, and converts the existing fire-and-forget `setTimeout(() => checkLeaderboardRank(), 2000)` at the post-hand submit site into an `await`-then-bump (`await checkLeaderboardRank(); setOnBoardTick(t => t + 1)`). The bump strictly follows the localStorage write inside `checkLeaderboardRank`'s body, so the GameView edge-detect effect re-evaluates same-hand with the fresh value — eliminating the prior race where a fast-tap user could miss the burst on the hand they made the board (it would have fired one hand late via the next `handCount` transition). Covers both write branches (`"1"` and `"0"`); the early-return path is a harmless no-op re-evaluation. Does NOT touch `checkLeaderboardRank`'s body or `_useSharedGameState.ts`.

## What this lock forbids

- Any edit under `api/`, `shared/utils/`, `shared/data/`, `shared/commentary/`. In particular, `shared/utils/leaderboardContext.ts` (the writer of `rm_on_board_today`) is off-limits — this branch is a pure consumer of that flag.
- Any modification to the existing `leaderboard_intro` / `leaderboard_explainer` chad checks, `setTrophyPulsing(true)` at `GameView.tsx:885`, or any reveal/commentary topic. The new burst path is strictly parallel to them.
- Authoring any new commentary copy. No new strings from `shared/commentary/`.

## localStorage keys

- **Read-only (owned by other lane):** `rm_on_board_today` — written by `shared/utils/leaderboardContext.ts:125`. This branch reads the value at render time and reacts to its edge transitions; it never writes to it.
- **New (owned by this branch):** `rm_board_pulsed_state` — values `"0"` / `"1"`. Tracks whether the burst has been celebrated for the current on-board state. Reset to `"0"` when `rm_on_board_today` is absent or `"0"`, so a subsequent flip to `"1"` re-arms the burst.
- **New (owned by this branch):** `rm_board_ack` — values `"0"` / `"1"`. Durable acknowledgement of the current on-board entry. Written `"0"` by the edge-detect effect at the same time as `rm_board_pulsed_state="1"` (a fresh on-board entry is unacknowledged); written `"1"` by the trophy-tap handlers in GameView. GameBar's `pulseActive` derivation reads it to gate the `iconBlink` loop. NOT reset on the off-board branch (it'll re-zero naturally on the next not→on edge).
