# OAuth-resume sender confirmation — build lock

**Type:** build lock (Thread #1 / OAuth-resume sender lands on nothing).
**Branch:** `feat/oauth-resume-sender-confirmation` (parked off `main` for an isolated Vercel preview); do NOT merge to main.
**Status:** LOCKED. Rev 3 (2026-06-05):
  - **Item 1 — Auth-nudge race fix.** Adds a presence-only sessionStorage check (`hasPendingResumeShare()`) plus an `isAnonymous` re-check inside the auth-modal setTimeout in `shared/views/GameView.tsx`. Stops the spurious "Save your progress" modal that the OAuth-resume Close revealed.
  - **Item 3 — Signed-in path converged onto the same modal.** `ChallengeSharePrompt` now opens `ChallengeSentConfirmation` after a successful create on the signed-in path too; the native `navigator.share()` / `shareChallenge` call from this site is gone. Both paths land on one identical surface.
  - **Item 2 — Destination-button platform icons.** Held — no brand assets in repo, no icon library in deps; lightest option (inline SVG glyphs) proposed, **pending user OK** before pulling any dependency.

## Why this exists

Recon (this branch, prior turn) confirmed: there is no challenge-sent route in the codebase. The signed-in path "works" only because GameView stays mounted in RESULTS with `ChallengeSharePrompt` still on screen (its CTA label flips to `"Link Copied! ✓"` for 2.5s). The OAuth path does a full-page Supabase redirect, which re-mounts a virgin GameView in IDLE; `ResumeShareSurface.handlePostChallenge` (`shared/components/ResumeShareSurface.tsx:131-202`) re-POSTs the challenge but reconstructs no view. The sender lands on a normal game.

We are building the missing sender-side confirmation, not routing to an existing one.

## Files this lock owns (sole writer)

- `shared/components/ChallengeSentConfirmation.tsx` (new) — sender-side post-share confirmation, **consolidated modal** (rev 2). Props: `{ shareUrl, sport, shareHeadline, onDismiss }`. Layout top→bottom: header (title slot + close X), message preview rendered as-is from `shareHeadline` (empty slot if the prop is empty — no fallback copy authored), read-only selectable share-link field, 3×2 grid of six destination buttons (X/Twitter, Facebook, Bluesky, WhatsApp, Telegram, Reddit) each opening its `shareIntents.ts` URL via `window.open(url, "_blank", "noopener")`, full-width Copy link bar at the bottom reusing `COPY_LINK_LABEL`/`LINK_COPIED_LABEL`. NOT the recipient take-challenge page.
- `shared/components/shareIntents.ts` (new) — pure URL builders for the six destinations. No React, no side effects, `encodeURIComponent` on every interpolated value. Exposes `twitterUrl(text, url)`, `facebookUrl(url)`, `blueskyUrl(text, url)`, `whatsAppUrl(text, url)`, `telegramUrl(text, url)`, `redditUrl(text, url)`.
- `shared/components/shareCopyLabels.ts` (new) — lifted-out constant(s) so `ChallengeSentConfirmation` and the existing `ChallengeSharePrompt` reuse the same string by reference. Also holds the six destination-button UI labels (`SHARE_X_LABEL`, `SHARE_FACEBOOK_LABEL`, `SHARE_BLUESKY_LABEL`, `SHARE_WHATSAPP_LABEL`, `SHARE_TELEGRAM_LABEL`, `SHARE_REDDIT_LABEL`) — UI labels only, NOT share message copy.
- `shared/components/ResumeShareSurface.tsx` — adds `onResumeChallengeCreated({ challengeId, shareUrl, sport, shareHeadline })` prop; fires after the successful `/api/challenge/create` POST. `clearPending()` / `setPending(null)` preserved. The prior auto-share/clipboard block (was at `:223-231` in rev 1) is **deleted** — the consolidated modal is the share surface; `resumeShareUrl` and the `track(...)` analytics call remain.
- `basketball/src/App.tsx` — holds `resumeSent` state (now `{ challengeId, shareUrl, sport, shareHeadline } | null`); passes `onResumeChallengeCreated` to `ResumeShareSurface` (mounted at `:285`); on fire, renders `<ChallengeSentConfirmation>` over the IDLE tree; `onDismiss` clears the state.
- `shared/components/ChallengeSharePrompt.tsx` — **rev 3 expansion**: signed-in path now opens the consolidated modal. Adds local `sentModal` state; `continueShareAfterName` calls `setSentModal({ shareUrl, shareHeadline: effectiveHeadline })` after `createChallenge` succeeds instead of `shareChallenge(...)`. The prior `copied` / 2.5s setTimeout affordance + the `LINK_COPIED_LABEL` import are removed (the modal's own Copy link bar owns the affordance now). `useChallengeShare.shareChallenge` is no longer called from this site; the hook is **NOT touched** (the export stays, dead on the call side — `shareChallenge` had exactly one caller per the lock recon).
- `shared/views/GameView.tsx` — **rev 3 addition**: presence-only `hasPendingResumeShare()` module-level helper that reads `sessionStorage.getItem("replaymod_pending_challenge_share_v1") !== null`. Does NOT parse, does NOT import the key constant from `ResumeShareSurface` (the key string is duplicated intentionally to keep the gate dependency-free). The helper gates the two auth-nudge effects (`big_win` ~:923, `hand_5` ~:931) and short-circuits the chad pass at the top of the chad effect (~:843) so the chained `tryOpenAuthModal` at ~:872 never schedules. Plus an `isAnonymousRef` mirror + an `isAnonymous` re-check inside `tryOpenAuthModal`'s setTimeout body as a belt-and-suspenders guard for any already-scheduled timer.

## What this lock forbids

- `history.pushState` or any navigation to `/${sport}/challenge/${id}` (the recipient route is the wrong surface).
- Any change to `shared/auth/AuthProvider.tsx` or the OAuth redirect (`oauthRedirectUrl`, `signInWithOAuth`, `linkIdentity`).
- Any edit under `api/`, `shared/utils/`, `shared/data/`, `shared/commentary/`.
- Any edit to `shared/hooks/useChallengeShare.ts`. Item 3 (rev 3) stops *calling* `shareChallenge` from `ChallengeSharePrompt` but does NOT alter the hook itself. The dead export stays; cleanup is a separate follow-up.
- Any edit to `baseball/src/App.tsx` or `football/src/App.tsx`. Parity is reported as a pre-written fast-follow diff for per-sport on-glass verification before any of those ship.

## Strings

The new surface authors NO **share message** copy — the message preview slot renders the `shareHeadline` prop as-is and falls back to empty when it's empty. `COPY_LINK_LABEL`/`LINK_COPIED_LABEL` in `shareCopyLabels.ts` are lifted verbatim from inline presentation-chrome literals already in `shared/components/`. The six `SHARE_*_LABEL` constants are new UI labels (brand names only — `"X"`, `"Facebook"`, etc.) and are explicitly scoped to button chrome by this lock; they are NOT share copy. None of these strings come from `shared/commentary/`, `shared/data/`, `shared/utils/`, or `api/`.
