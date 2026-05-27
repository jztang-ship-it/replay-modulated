# H2H Reveal Arc — End-of-Session Handover (2026-05-27)

For the next Code-Claude session picking up the H2H reveal arc work.

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

1. **Right-rail FP totals (178.4 / 182.4) clip at 390 wide.** Pre-existing condition since phase 3. The `ScoreCell` renders in the 80px right column but is obscured by horizontally-overflowing strip cells in mobile captures. Not addressed in phase 4.

2. **Right-edge clipping of the 6th strip card at 390 wide.** Cards 4-6 of each strip partially clip past the strip's right edge. Pre-existing.

3. **Hero card overflow on overlay flip.** `AthleteCard` back face renders at its natural 329px width inside a 145-max wrapper, so flipped hero cards visually overflow their column. Pre-existing.

4. **Phase 5 — wire to real data.** Replace the fixture import in the dev route with a fetch against `/api/challenge/{id}/sender-hand`. The dev route's renderer wiring carries forward. Synthetic-hand toggles (variant + margin) get replaced by deriving from real data.

5. **Phase 6 — climax animation between arc end-hold and overlay mount.** Currently a 350ms placeholder crossfade. Phase 6 replaces with the real win/loss climax.

6. **Phase 7 — commentary engine.** Trash-talk strings are currently picked from `chadChallenge.ts`. Phase 7 evolves into a real generative engine.

7. **Phase 8 — copy polish on headlines + trash-talk.** Deferred from phase 4.

8. **Production dismiss destination.** Phase 4 logs `[h2h-mock] CTA "Dismiss" pressed` to console. Phase 5+ wires the real navigation.

9. **Amend7 fire/ice smoke artifact.** Live-browser verification was performed but no smoke-test file was authored. Future cleanup: capture screenshots + write `docs/smoke-tests/2026-05-27-h2h-phase4-amend7-fireice-fix-smoke.md` referencing them.

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

Current `main` = `692a96f`, pushed to `origin/main`. Local tests: 103 pass.

## How to reach me (the next session)

This file is the authoritative pickup pointer alongside `docs/h2h-reveal-arc-design.md`. The smoke artifacts in `docs/smoke-tests/2026-05-27-h2h-phase4-amend*-smoke.md` have the per-amend detail.

Open question #1 (fire/ice) is the only outstanding bug from tonight; everything else is intentional carryforward for later phases.
