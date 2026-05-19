# Tech debt: handleButtonClick WIN_CELEBRATION/RESULTS reset duplicates onWinCelebrationComplete

**Date surfaced:** 2026-05-19
**Status:** open — fix held for a future session
**Severity:** quality / DRY — no active bug after `61ea208` landed
**Related commit:** `61ea208 fix(gameview): handCount increment at hand resolution, not celebration dismiss`

## What's there

`shared/views/GameView.tsx` has two paths that exit `WIN_CELEBRATION`:

1. `onWinCelebrationComplete()` (line 1726–1748 post-fix) — fires on celebration-area tap or score-row double-tap. Owns `setWinTier(null)`, `setWinPayout(0)`, `setGameState("RESULTS")`, plus the name_prompt gate.
2. `handleButtonClick()` lines 1669–1704 — fires on action-button / play-again tap. Duplicates the same state-reset logic inline (FTUE-completion bookkeeping, reveal reset, overlay reset, placeholder roster, lockedCardIds reset, statsFlippedIds reset, mvpId, winTier, winPayout, and finally `setGameState("IDLE")`).

The two branches do not delegate. Pre-`61ea208`, the second path also skipped `incrementHandCount` entirely (Bug A — silently broke every handCount-gated surface for users who advanced via the button). That's fixed at the source — increment now lives in `_useReveal.ts` at hand resolution, independent of which exit path the user takes.

## What's still wrong

Even with the increment moved, the duplicated state-reset is drift waiting to happen:
- Any future addition to `onWinCelebrationComplete`'s cleanup that doesn't also land in the inline branch will silently behave differently across paths.
- Any future addition to the inline branch (e.g., an FTUE-specific reset) that doesn't also land in `onWinCelebrationComplete` will have the inverse problem.
- The intent ("let the user skip the celebration animation cleanly") is good UX. The implementation should be: the skip path **triggers** the same cleanup, not **duplicates** it.

## Suggested fix shape

In `handleButtonClick`, replace lines 1669–1704's inline reset with:

```ts
if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
  if (gameState === "WIN_CELEBRATION") {
    onWinCelebrationComplete();   // handles winTier/winPayout/gameState reset
  }
  // FTUE-completion bookkeeping + reveal/overlay reset + placeholder roster
  // ... whatever survives that isn't already in onWinCelebrationComplete
}
```

The exact split depends on which reset steps are WIN_CELEBRATION-tap-equivalent vs. action-button-additional (e.g., the FTUE completion + placeholder-roster reset arguably are button-only, since the celebration-tap path doesn't re-IDLE the game in one step).

## Why not bundled with `61ea208`

The user explicitly held this for a separate commit: the active bug was the bypassed increment, and folding the DRY cleanup into the same commit would obscure the regression-test scope. Land the increment fix, verify in smoke test, then come back to the structural cleanup.

## Verification plan when the fix lands

1. Tests: 424/424 pre and post.
2. Smoke: play a non-FTUE hand, advance via the action button (the bypass path) — verify `replaymod_hand_count` increments. (Should already work post-`61ea208`; this just confirms the DRY refactor didn't reintroduce the bypass.)
3. Smoke: play a non-FTUE hand, advance via celebration-area tap — same verification.
4. Smoke: FTUE hand → completion via action button — verify FTUE completion flow still fires (the FTUE-specific bookkeeping at lines 1670–1684 must survive).
