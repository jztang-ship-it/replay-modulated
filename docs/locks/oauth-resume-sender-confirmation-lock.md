# OAuth-resume sender confirmation — build lock

**Type:** build lock (Thread #1 / OAuth-resume sender lands on nothing).
**Branch:** `fix/rare-pull-rank-and-career-categories` (worktree); do NOT merge to main this PR.
**Status:** LOCKED.

## Why this exists

Recon (this branch, prior turn) confirmed: there is no challenge-sent route in the codebase. The signed-in path "works" only because GameView stays mounted in RESULTS with `ChallengeSharePrompt` still on screen (its CTA label flips to `"Link Copied! ✓"` for 2.5s). The OAuth path does a full-page Supabase redirect, which re-mounts a virgin GameView in IDLE; `ResumeShareSurface.handlePostChallenge` (`shared/components/ResumeShareSurface.tsx:131-202`) re-POSTs the challenge but reconstructs no view. The sender lands on a normal game.

We are building the missing sender-side confirmation, not routing to an existing one.

## Files this lock owns (sole writer)

- `shared/components/ChallengeSentConfirmation.tsx` (new) — sender-side post-share confirmation. Props: `{ shareUrl, sport, onDismiss }`. Renders the share URL plus a Copy link button that writes to clipboard on tap (user gesture) and flips its label to the Link Copied affordance. NOT the recipient take-challenge page.
- `shared/components/shareCopyLabels.ts` (new) — lifted-out constant(s) so `ChallengeSentConfirmation` and the existing `ChallengeSharePrompt` reuse the same string by reference. No new copy authored.
- `shared/components/ResumeShareSurface.tsx` — adds `onResumeChallengeCreated({ challengeId, shareUrl, sport })` prop; fires after the successful `/api/challenge/create` POST. `clearPending()` / `setPending(null)` preserved. The existing auto-share/clipboard block (lines 182-191) stays in place, defensively wrapped so a post-redirect gesture failure can't throw and abort the handler before the callback fires.
- `basketball/src/App.tsx` — holds `resumeSent` state; passes `onResumeChallengeCreated` to `ResumeShareSurface` (mounted at `:285`); on fire, renders `<ChallengeSentConfirmation>` over the IDLE tree; `onDismiss` clears the state.
- `shared/components/ChallengeSharePrompt.tsx` — strings-only touch. Replaces the inline `"Link Copied! ✓"` literal at `:538` with an import from `shareCopyLabels.ts`. The signed-in path (`:299-308`) is byte-unchanged.

## What this lock forbids

- Convergence with the signed-in path (`ChallengeSharePrompt.tsx:299-308`) — that flow works as-is; no changes this PR.
- `history.pushState` or any navigation to `/${sport}/challenge/${id}` (the recipient route is the wrong surface).
- Any change to `shared/auth/AuthProvider.tsx` or the OAuth redirect (`oauthRedirectUrl`, `signInWithOAuth`, `linkIdentity`).
- Any edit under `api/`, `shared/utils/`, `shared/data/`, `shared/commentary/`.
- Any edit to `baseball/src/App.tsx` or `football/src/App.tsx`. Parity is reported as a pre-written fast-follow diff for per-sport on-glass verification before any of those ship.

## Strings

The new surface authors NO new copy. The constants in `shareCopyLabels.ts` are lifted verbatim from inline presentation-chrome literals already in `shared/components/`. None come from `shared/commentary/`, `shared/data/`, or `api/`.
