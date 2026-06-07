# Challenge-landing v2 declutter (#4a render lane) — build lock

**Type:** build lock.
**Branch:** `feat/challenge-landing-declutter`.
**Status:** LOCKED. 2026-06-07.

## Why this exists

#4a render-lane polish on the recipient-facing challenge-accept landing. Two
passes land here: (1) the recovered typography pass — usp/line-owner/evidence-line
muted to ivory, leaving orange on only two poles (the TAKE and the CTA) — which
had been living as uncommitted WIP and is now committed for real; (2) the content
declutter — headline blank-case floor, per-card tier+salary strip, and removal of
the redundant stacked "X'S LINE / HOLD: …" exhibit (cards already carry held state
via HOLD badges). Sole sender attribution is preserved by promoting the bottom
"from {sender}" line to fire whenever there's a real name.

## Files this lock owns (sole writer)

- `shared/components/ChallengeTakeCardLanding.tsx` — typography demotions; headline
  third-rung floor `|| "THIS IS THE LINE."`; deletes the `{card.tier}` chip and the
  `${card.salary}` segment in `HandCard` (keeps `{card.team}`); deletes the
  `{showHeldList && …}` `held-list` block plus the now-unused `showHeldList` /
  `lineOwnerLabel` derivations; flips the attribution gate
  `(!showHeldList && namedChallenger)` → `namedChallenger`. Pure presentation — no
  prop/data-shape changes, no generator changes.
- `__tests__/ChallengeTakeCardLanding.test.tsx` — specs updated to assert the
  held-list block is absent and that attribution names the sender on holds-recorded
  named rows; adds a blank-case floor test.

## What this lock forbids

- Any edit to the string/generator lane: `shared/challengeTakeCard/`,
  `shared/commentary/`, `chadChallenge.ts`, `voiceContract.ts`, `api/headline.ts`.
- Any change to `ChallengeLandingData` / `Props` shape or the shell
  (`ChallengeLandingScreen.tsx`).
- The rare-pull hero rule — on HOLD pending a `rare_pull` glass; not in this lock.
