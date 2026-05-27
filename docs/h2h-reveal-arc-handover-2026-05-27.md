# H2H Reveal Arc — End-of-Session Handover (2026-05-27)

For the next Code-Claude session picking up the H2H reveal arc work.

## Session 2026-05-27 work shipped

Phase 5a recipient flow shipped end-to-end on `replayifs.com`. Real challenge data resolves into a full H2H reveal arc → results overlay → CTAs. Strip ordering correct on both surfaces. No spoiler flash. Build pipeline unblocked. All commits on `origin/main`:

| Hash       | Scope                                                                                 |
|------------|---------------------------------------------------------------------------------------|
| `27910b4`  | refactor(challenge): lift attempt POST + CTA handlers (phase 5a prep)                |
| `bc4617d`  | feat(challenge): sender-hand prefetch + `ChallengeCtx.resolvedSenderHand`            |
| `f6f8d05`  | feat(challenge): H2H reveal arc + overlay in recipient flow (phase 5a)               |
| `b6e338a`  | chore(deploy): unblock Vercel deploys — drop function count 20 → 11                  |
| `05b115b`  | fix(h2h): sort H2H strips by revealOrder, not slotIndex (phase 5a amend1)            |
| `520afc5`  | fix(h2h): sort overlay strips by revealOrder too (phase 5a amend2)                   |
| `6383ef9`  | chore: instrument strip sort with [h2h-sort] diagnostic logs (reverted in amend3)    |
| `80e10de`  | fix(h2h): pre-play state on mount + revert sort diagnostic (phase 5a amend3)         |

### Recipient flow — committed and deployed

Three-commit refactor → prefetch → wire pattern landed cleanly. `H2HRecipientReveal` is the production wrapper: composes the arc + overlay, gates on `challengeCtx + resolvedSenderHand + (REVEALING|RESULTS)`, additive to the existing single-player surface (which remains intact behind it). `useChallengeAttempt` extracted from `ChallengeComparisonScreen`. `App.tsx` prefetches the sender hand on `onAccept`; the comparison sheet is mutually-exclusively mounted via `!resolvedSenderHand`. `?mockSenderHand=1` dev affordance still works for local iteration.

### Build pipeline unblock (`b6e338a`)

Vercel Hobby caps deployments at 12 serverless functions. We hit 20 because `api/hand/lib/` wasn't underscore-prefixed (Vercel auto-routes every file in `api/` that doesn't start with `_`). Fix: rename `api/hand/lib/` → `api/hand/_lib/`, delete never-shipped legacy helpers + dead test files. End count: 11. Net deletion ~3k LOC of dead code.

### Strip-sort fixes (amend1 + amend2)

The strip-order bug had **two render layers**, not one. `H2HRevealScreen.HandStrip` (the arc) was fixed in amend1 (`05b115b`). Production verification appeared to show the bug persisting because the user was reading order from the OVERLAY's strips, not the arc's. Amend2 (`520afc5`) extended the same fix to `H2HResultsOverlay.ResultsStrip`. Both now prefer `revealOrder` over `slotIndex`. Contract-lock tests in both test files.

### Spoiler flash fix (amend3)

After amend1 + amend2, production verification surfaced a ~250ms window during the HOLD-to-arc crossfade where the user saw the fully-resolved state (final scores, headline, CTA) before entrance choreography began. Root cause: `useH2HReveal` defaulted `phase="done"` on mount (designed for the dev-route static end-state). The production wrapper inherited that. Fix: added `initialPhase?: "idle" | "done"` option, default `"done"`. Production wrapper passes `"idle"`. Dev route unchanged.

## TL;DR — where we are

Phase 4 of the H2H reveal arc has been amended through amend9 (2026-05-27 session — code/docs committed locally, push held for explicit user direction). It delivers:

- Full reveal arc choreography (entrance with depleting face-up decks → anticipation pulse → 6 paired matchups → end-hold).
- Full-viewport results overlay with per-strip independent card flip, headline + trash-talk on the left, FP totals on the right, single primary CTA below the bottom strip.
- Locked vertical geometry: top strip / both hero slots / bottom strip pixel-identical between arc and overlay.
- Brightness invariant (Option β — amend8, supersedes amend5): bright = active OR pre-reveal; dim = post-revealed and not active. Top + bottom strips independent.
- **Pre-reveal rule (amend8):** cards show State B (greyed projected FP, no badges, no fire/ice) until each card has taken its turn in the hero zone. No held-card carve-out (new `ignoreHeldStatus` prop).
- **All emotional reveal effects (shake, blast, band-vs-dead-band contrast) now match single-player (amend9).** Band-tier cards get the full single-player treatment (shake + blast); dead-band cards get a short plain "hype" wobble; per-matchup gating waits for the slower of the two pre-rollup beats.
- Mock fixture with the right NBA player IDs (amend6).

570 tests pass across 49 test files (full repo).

## Fire/ice — RESOLVED (amend7)

The amend6 outstanding bug shipped this session. Two-defect root cause: (A) H2H static cells passed `visibleFp=undefined` so PlayerCardShell's stamp effect bailed at the undefined check; (B) `useH2HReveal.runMatchup` never advanced `visibleFp` past the 0.001 sentinel so even the active hero card never satisfied the rollup-complete precondition. Fix: new `staticEndState` prop on PlayerCardShell (immediate stamp fire when caller knows no rollup is coming) + per-tick `visibleFpMap` advance inside the hook's tick closure (mirrors `useEmotionalReveal.ts:490`). See design-doc amend7 section for the full trace.

## What's done — file-by-file

### Production code
- `shared/components/H2HRevealScreen.tsx` — full-viewport reveal screen. Outer flex column with locked geometry; battlefield is a 3-col × 2-row grid (left rail | hero center | right rail) + absolute matchup-delta float; reserved bottom space below the bottom strip.
- `shared/components/H2HResultsOverlay.tsx` — mirrors the arc's geometry exactly; per-strip flip mechanic; CTA + countdown in the reserved bottom space (anchored flex-end for thumb position).
- `shared/components/useH2HReveal.ts` — hook driving phase transitions (idle / entering / anticipating / revealing / paused / end-hold / done), entrance stage machine, visibleFp map for FP rollup, running totals, active matchup. `activeMatchup` returns `matchups[0]` once the deck empties so the hero zone is never visually empty.
- `shared/components/CardBackGeneric.tsx` — reused; powers the back-face render where applicable.

### Dev wiring (basketball)
- `basketball/src/dev/H2HRevealMockRoute.tsx` — mounted at `/basketball/dev/h2h-reveal-mock`. Drives the screen + overlay loop with the mock fixture. URL params: `?autoplay=1`, `?overlay=1`, `?variant=WIN|LOSS_OPEN|LOSS_CLOSED`, `?margin=photo_finish|narrow|blowout`, `?topFlipped=<cardId>`, `?bottomFlipped=<cardId>`.
- `basketball/src/dev/h2hMockFixture.ts` — 12 cards (6 sender + 6 recipient) with correct NBA IDs after amend6's fix. Giannis's `projectedFp = 40` so his existing `actualFp = 62.8` puts him in the ON FIRE band (ratio 1.57).

### Tests
- `shared/components/__tests__/H2HRevealScreen.test.tsx` — 20 tests. Asserts layout, active-card brightness inversion, mid-rail render gating, etc.
- `shared/components/__tests__/H2HResultsOverlay.test.tsx` — 21 tests. Asserts state-machine + CTA labels + per-strip flip invariants + no margin pill + no Dismiss CTA + crossfade.
- Plus the existing useH2HReveal + adjacent suites — 103 tests total pass.

### Docs
- `docs/h2h-reveal-arc-design.md` — locked design decisions, append-only history of amendments. Phase-4 amendments 1-6 each have a section above the phase-4 restructure section.
- `docs/smoke-tests/2026-05-27-h2h-phase4-amend*-smoke.md` — one smoke artifact per amend (six in total today, plus the original phase-4 smoke from yesterday). Each documents acceptance criteria, screenshots, verification table, known issues.
- `docs/smoke-tests/2026-05-27-h2h-phase4-amend6-photo-fireice-smoke.md` — the latest, with the fire/ice live-verification failure documented as the open followup.

## What's not done — open followups, in priority order

### Closed today
- ~~Phase 5a — wire to real data.~~ **Shipped.** Real challenge data resolves end-to-end. `?mockSenderHand=1` retained as a dev affordance.
- ~~Amend7 fire/ice fix.~~ Shipped and live-verified yesterday.
- ~~Strip sort order (amend1 / amend2).~~ Shipped and verified on production.
- ~~Spoiler flash (amend3).~~ Shipped (push held for user verification at session end).
- ~~Vercel function-count overflow.~~ Resolved at 11/12.

### Still open

1. **Phase 5b — sender-side notification + overlay flow.** The recipient side ships; the sender side does not. Sender sees the overlay only (no arc) per the locked decision from phase 5 design. Several product questions remain — see "Phase 5b open product questions" below.

2. **Phase 6 — climax animation between arc end-hold and overlay mount.** Currently a 350ms placeholder crossfade. Phase 6 replaces with the real win/loss climax.

3. **Phase 7 — commentary engine.** Trash-talk strings are still picked from `chadChallenge.ts`. Phase 7 evolves into a real generative engine.

4. **Phase 8 — copy polish on headlines + trash-talk.** Deferred from phase 4.

5. **Right-rail FP totals (178.4 / 182.4) clip at 390 wide.** Pre-existing condition since phase 3. The `ScoreCell` renders in the 80px right column but is obscured by horizontally-overflowing strip cells in mobile captures. Not addressed in phase 4 or 5a.

6. **Right-edge clipping of the 6th strip card at 390 wide.** Cards 4-6 of each strip partially clip past the strip's right edge. Pre-existing.

7. **Hero card overflow on overlay flip.** `AthleteCard` back face renders at its natural 329px width inside a 145-max wrapper, so flipped hero cards visually overflow their column. Pre-existing.

8. **Amend1/2/3 smoke artifacts.** Live-browser verification was performed but no smoke-test files were authored for the phase-5a amendments. Future cleanup: capture screenshots + write `docs/smoke-tests/2026-05-27-h2h-phase5a-amend{1,2,3}-smoke.md`.

## Phase 5b open product questions

5b implements the sender-side flow: the sender receives an in-app notification when a recipient plays their challenge. Per locked decision E from the phase-5 design session, the sender sees the **overlay only — no arc**. Several product questions need answering before implementation begins, so 5b should start with design alignment.

1. **Sender-side CTAs on the overlay.** "Send It Back" doesn't apply — the sender already played. What CTAs make sense for "you got challenged AND won/lost"? Options to think through: "Challenge someone else," "View the matchup," "Replay their hand," "Dismiss." Each implies different downstream wiring.

2. **Notification deep-link → `ChallengeCtx` construction.** The deep-link route needs to construct a `ChallengeCtx` for the sender side from a `challenge_id` query param. The sender's own `hand_log` already has the data — the recipient's data is what's missing. New endpoint? Reuse `/api/challenge/{id}` with sender perspective? Endpoint surface needs design before code.

3. **Sender's view of the opponent.** When the sender lands on their overlay, what does the recipient's lineup look like? Same per-strip flip mechanic as recipient's view of sender, or different? Same headline + trash-talk treatment? Same FP totals layout? Open question: is there parity between the two views, or is the sender's view materially different (e.g., showing how the recipient's swap decisions diverged from the sender's)?

These are product questions, not implementation questions. Surface them in tomorrow's session before any code work begins.

## Process lessons from today

1. **Preview URLs (random-hash subdomains) are frozen per-deploy.** Today's strip-sort verification rounds were extended by testing against stale Vercel preview URLs while production had moved on. Always test against the production custom domain (`replayifs.com`) or the stable production Vercel URL. Bookmark these — never bookmark a per-PR preview URL.

2. **Multi-surface bugs need multi-surface instrumentation.** When iterating fixes that may have multiple render surfaces, add component-identifying console logs in EVERY suspected surface BEFORE declaring a fix verified. Today's strip-sort bug had two render layers (arc + overlay); fixing one and verifying the other "wasn't fixed yet" caused three rounds of fix-and-still-broken. With instrumentation in both layers from the start, this would have been one round.

3. **Investigation-first paid off.** The "stop, instrument both, look at the data" cycle settled the strip-order bug in one round once we had real production data. Don't propose fixes against incomplete diagnostics — when the same bug pattern appears to survive multiple fixes, the bug is somewhere else, not in the layer you keep patching.

## Mental model — key invariants to preserve

Carrying these forward:

- **Locked geometry.** Top strip, both hero slot Ys, bottom strip Y are pixel-identical between `H2HRevealScreen` and `H2HResultsOverlay`. Constants live in both files (LEFT_RAIL_WIDTH_PX 100, RIGHT_RAIL/SCORE_COLUMN_WIDTH 80, BATTLEFIELD/HERO_ROW_GAP_PX 14, safe-area + 20 paddings). Changing one MUST mirror the other.
- **Tight composition near top + reserved bottom slack.** Outer flex column uses `justifyContent: "flex-start"` with `gap: 18` between top-strip ↔ battlefield ↔ bottom-strip. A `flex: 1 1 auto` spacer AFTER the bottom strip absorbs viewport slack. On overlay, that spacer holds CTA + countdown; on arc, it's empty.
- **Brightness inversion.** Active mini-card opacity 1; others 0.35. When no card is active on a strip, all 6 bright. Top + bottom strips drive independently on the overlay.
- **Per-strip flip on overlay.** Each strip has its own selection. Both hero slots can be filled simultaneously for 1v1 comparison.
- **Hero zone never empty.** During `entering`, the deck visual renders while any card is in `pre`. As soon as the deck depletes, `activeMatchup` returns `matchups[0]` and CardCenterCell takes over. During `anticipating`, the matchup-0 hero cards stay visible while the pre-reveal pulse animates on the strip cells.

## Pickup pointers

- The dev route URL `http://localhost:5173/basketball/dev/h2h-reveal-mock?autoplay=1` is the primary entry point for visual verification.
- The hook (`useH2HReveal`) is the orchestration source of truth. All phase transitions + per-card stage transitions schedule from `play()`.
- The screen (`H2HRevealScreen`) reads from the hook and renders. It doesn't own animation state — it visualizes the hook's state.
- The overlay (`H2HResultsOverlay`) is independent of the hook. It has its own per-strip flip state. Mount is gated by `useCrossfade(shouldShowOverlay, OVERLAY_CROSSFADE_MS)` in the dev route.
- For the fire/ice followup specifically: the relevant render path is `AthleteCard` → `PlayerCardShell` → `CardFront`. The stamp flows through `PlayerCardShell.useEffect@393` (sets stamp when rollup completes); the gradient flows through `CardFront@668-786` (reads stamp, renders fire/ice layer).

## Tonight's amend timeline (oldest → newest)

| Amend | Hash      | Scope                                                                                          |
|-------|-----------|------------------------------------------------------------------------------------------------|
| amend1| `c2e78fb` | Deck-metaphor entrance + arc layout tighten + overlay 3-zone middle + per-strip flip          |
| amend2| `d2b8c71` | Real face-up deck + locked geometry + TIE/EVEN removal + safe-area floor                       |
| amend3| `fc2e746` | Tight top-to-bottom composition; reserved space BELOW bottom strip                            |
| amend4| `80254c6` | Eliminate empty-middle during anticipating; pixel-identical hero-cell heights                  |
| amend5| `30e0621` | Hero visible while deck depleted; invert mini-card brightness (active bright, others dim)     |
| amend6| `692a96f` | Fix hero photo mismatch (wrong NBA IDs); attempt fire/ice wiring (live-broken — see open #1)   |

Current `main` = `80e10de` (phase 5a amend3), pushed to `origin/main`. Full repo test count: 460 pass across 46 test files.

## How to reach me (the next session)

This file is the authoritative pickup pointer alongside `docs/h2h-reveal-arc-design.md`. The design doc's `### Phase 5a amend{1,2,3}` sections + the new "Lessons learned during phase 5a" subsection capture the architectural detail behind today's fixes.

No outstanding bugs from today. The full recipient flow ships against real data with correct strip ordering and no spoiler flash. Tomorrow's 5b session should begin with the product questions in the "Phase 5b open product questions" section above — design alignment before code.
