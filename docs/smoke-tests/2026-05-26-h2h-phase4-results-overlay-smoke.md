# H2H phase 4 — results overlay smoke

Date: 2026-05-26
Branch: main (phase 4 commit pending)
Route: `/basketball/dev/h2h-reveal-mock` (+ optional `?autoplay=1`, `?overlay=1`, `?variant=`, `?margin=`, `?flipped=`)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-26-h2h-phase4-results-overlay/`

## Scope

Phase 4 ships the full-viewport results overlay that lands after the H2H reveal arc completes. Replaces `ChallengeComparisonScreen.tsx` (bottom sheet) in the recipient flow with a takeover surface — visual language matches the H2H reveal screen (gradient, glass-panel chrome, 480px inner column).

Mock data only — no `/attempt` POST, no real CTA handlers (phase 5 wires these). Dev route hosts the full loop:

- Reveal arc plays on `?autoplay=1` (or via the Play button).
- Arc end-state → overlay lands directly (simple cut; phase 6 climax animation is the placeholder note).
- `?overlay=1` jumps straight to the overlay without watching the ~22s arc.
- Variant + margin toggles let the user iterate every overlay state.
- Each overlay card is tap-to-flip (reuses single-player's `AthleteCard` + `BackBStats`).

## What's reused (verbatim, no new components)

- `AthleteCard` + `PlayerCardShell` + `CardFront` + `BackBStats` — full card rendering pipeline including the 3D rotateY flip mechanic (`canFlip={true}` + `flipped` + `onToggleFlip`).
- `trashTalkBucket(delta)` + `chadTrashTalk(bucket, name, delta)` from `shared/commentary/chadChallenge.ts` — same trash-talk picks by signed-delta bucket the comparison sheet used.
- `gameInfo` + `statLine` fields per card from the existing phase-2 mock fixture — card-back renders out-of-the-box (no fixture extensions).
- Glass-panel zone chrome (border + blur + soft bg) + gradient background — matches `H2HRevealScreen` so the overlay reads as the same surface.

## What's NEW

- `shared/components/H2HResultsOverlay.tsx` — the overlay component.
- `shared/components/__tests__/H2HResultsOverlay.test.tsx` — 13 tests covering variants, CTAs, headline copy, margin bucket resolution, lineup rendering.
- `basketball/src/dev/H2HRevealMockRoute.tsx` extended — dev controls now expose variant + margin toggles + "Skip to overlay" + per-card flip state. URL params (`?overlay`, `?variant`, `?margin`, `?flipped`) for scripted smoke captures.

## What's REMOVED from the comparison sheet

- `resolutionLine` (the substantive WHY copy that used to sit between scores and CTAs) — phase 7's commentary rail in the arc carries this load. Trash-talk line stays as emotional punchline near the headline.
- Bottom-sheet gestures — swipe-down dismiss, backdrop-tap collapse, swipe handle. Full-viewport overlay → drop. Dismiss is an explicit CTA + an × button top-right.
- `POST /api/challenge/{id}/attempt` — phase 5 wires this. Phase 4 mocks `windowClosesAtMs` (60min from mount) for the LOSS_OPEN countdown.

## State machine + headline copy

Preserved verbatim from the comparison sheet (WIN / LOSS_OPEN / LOSS_CLOSED). Headline copy is phase-4 placeholder — polish lands in phase 8.

| Variant       | Bucket          | Sample headline                                  | Primary CTA          | Timer |
|---------------|-----------------|--------------------------------------------------|----------------------|-------|
| `WIN`         | `win_big`       | `Cooked. +{d} FP over Mike.`                     | Send It Back         | —     |
| `WIN`         | `win_narrow`    | `Got 'em by {d}.`                                | Send It Back         | —     |
| `WIN`/`LOSS_*`| `photo_finish`  | `Photo finish — {d} FP.`                         | (per state)          | (per state) |
| `LOSS_OPEN`   | `loss_narrow`   | `Off by {d}. Window's still open.`               | Try Again            | 1h    |
| `LOSS_OPEN`   | `loss_big`      | `Off by {d}. One more swing in the window.`      | Try Again            | 1h    |
| `LOSS_CLOSED` | `loss_narrow`   | `Came up {d} short. Window closed.`              | Play your own hand   | —     |
| `LOSS_CLOSED` | `loss_big`      | `Off by {d}. Window closed.`                     | Play your own hand   | —     |

Buckets reuse `trashTalkBucket(delta)`'s existing internal names (`win_big` / `loss_big` instead of the user-spec's `win_blowout` / `loss_blowout`). Mapping is transparent to consumers; the design doc records the alias.

## Screenshots

### 01-overlay-win-narrow-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow`)

Default smoke target — overlay after a narrow win.
- Headline: `Got 'em by 4.5.` (green).
- Trash-talk: `Mike's not gonna sleep tonight.`
- YOU lineup (Bobby Portis, Jalen Brunson, Tyrese Maxey, Jaylen Brown, Devin Booker, Giannis) with `182.9` in green (winner accent).
- MIKE lineup with `178.4` in muted grey (loser).
- Primary CTA: `Send It Back` (orange). Secondary: `Dismiss`.
- Dev controls: `done · overlay win` + Variant / Margin toggle rows.

### 02-overlay-loss-closed-mobile.png (390×844, `?overlay=1&variant=LOSS_CLOSED&margin=narrow`)

LOSS_CLOSED variant — window already closed.
- Headline: `Came up 4.5 short. Window closed.` (off-white).
- Trash-talk: `Right there. Try another hand.`
- Both lineups visible. YOU now muted (loser); MIKE shown without winner accent (LOSS_CLOSED suppresses opponent green).
- Primary CTA: `Play your own hand`.
- No countdown pill (LOSS_CLOSED has no timer).

### 03-overlay-card-back-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow&flipped=201939_card`)

Card flip verified — Stephen Curry (MIKE slot 4) flipped to back.
- Back face shows: date `Jan 12, 2025`, FP hero `38.9`, stat row `24 PTS, 5 REB, 0 BLK, 1 STL` + `TAP TO FLIP`.
- Renders via existing `BackBStats` from `gameInfo` + `statLine` fields already in the mock fixture. No fixture extensions needed.

### 04-overlay-win-narrow-desktop.png (1024×800, same URL as 01)

Desktop layout. Both 6-card lineups fully visible side-by-side at full mini scale. Inner column caps at 480px and centers horizontally — same chrome shape as the reveal screen. Headline + trash-talk top; CTAs bottom; dev controls bottom-right.

## Mechanics verified

- ✅ Variant toggle drives primary CTA label (Send It Back / Try Again / Play your own hand) + dismiss button always present.
- ✅ Margin bucket resolves from signed `recipient.totalFp - sender.totalFp` via `trashTalkBucket(delta)`.
- ✅ Headline copy varies by (variant, bucket) — see table above.
- ✅ Trash-talk line renders near the headline (orange, secondary weight) — picks from existing `TRASH_NAMED` / `TRASH_UNNAMED` banks.
- ✅ LOSS_OPEN shows the 1-hour countdown pill with urgency styling at < 5 min. WIN and LOSS_CLOSED hide the pill.
- ✅ Both lineups render the same renderCard pattern as the reveal screen; cards are tap-to-flip and the back face renders the existing `BackBStats`.
- ✅ × close button + Dismiss CTA both fire `onDismiss`.
- ✅ Phase 4 CTAs no-op to `console.info` — wiring is phase 5.

## Phase 4 amendment — strip-density lineups + crossfade + revert entrance

Four fixes after the initial smoke surfaced issues:

1. **Lineup overlap (critical).** Initial overlay rendered cards at
   ~150px tall in two-row strips — they overflowed the viewport,
   occluded each other, blocked the LOSS_OPEN countdown, and broke
   the flip interaction. Replaced with hand-strip density (~55px ×
   80px) matching `H2HRevealScreen.HandStrip` — all 12 cards fit
   mobile, no overlap, flip works.
2. **Scale-up on flip.** At strip density the back face is too small
   to read. Tap-to-flip now scales the cell's content by 2.4×
   (visual ~55→130px wide) + `z-index: 100`. Back-face stats become
   legible. Tap again restores strip density.
3. **Dismiss closes the overlay (critical).** Added a `dismissed`
   state in the dev route. × button + Dismiss CTA both fire it →
   overlay crossfades out → underlying arc end-state is visible
   again. Replay clears it.
4. **Bottom strip entrance still wrong (critical).** Reverted phase
   3.8's "lay at center-stage → travel to slot" choreography for
   the reveal arc. Cards now lay DIRECTLY into their strip slot
   positions with a small fade + ±16px translateY slide (sender
   from above, recipient from below) — phase 3.7-style. The
   `useH2HReveal` state machine stages are preserved so pacing +
   pulse + arc rhythm stay stable; TRAVEL is now visually a no-op.
5. **Crossfade arc → overlay (quality).** Phase 4 originally hard-cut.
   The overlay now accepts a `visible` prop; when false it fades to
   `opacity: 0` + `pointer-events: none` over 350ms. Dev route's
   `useCrossfade` hook coordinates mount/unmount.

### Amended smoke screenshots

#### 05-overlay-win-strip-mobile.png (390×844, ?overlay=1&variant=WIN&margin=narrow)

Strip-density lineup verified.
- Headline `Got 'em by 4.5.` + trash-talk `Razor-thin. Send it back.`
- YOU strip: BP, JB, TM, JB, DB, (GA partially clipped right edge —
  inherited phase-2 mobile clipping; followup for phase 8).
- MIKE strip: NR, DR, JT, KD, SC, (NJ partial).
- Cards at hand-strip density, no overlap, all 12 readable.
- Send It Back primary + Dismiss secondary CTAs.

#### 06-overlay-loss-open-mobile.png (390×844, ?overlay=1&variant=LOSS_OPEN&margin=narrow)

Countdown visibility verified.
- Headline `Off by 4.5. Window's still open.` (red).
- Both strips visible.
- **Countdown pill: `59:59 to flip this.`** — clearly readable, not
  blocked by lineups. Was previously hidden under overlapping cards.
- Try Again primary CTA.

#### 07-overlay-card-back-mobile.png (390×844, ?overlay=1&variant=WIN&flipped=201939_card)

Card-back legibility verified.
- Stephen Curry (MIKE slot 4) flipped — scaled up via
  `FLIPPED_SCALE_BOOST = 2.4×`.
- Back-face content readable: `Jan 12, 2025`, `38.9` FP, stat row
  `24 PTS · 5 REB / 0 BLK · 1 STL`, `TAP TO FLIP` hint.
- Flipped cell `z-index: 100` raises it above neighboring cards.
- Other 5 cards on MIKE strip stay at strip density behind.

## Phase 4 restructure — overlay uses H2H layout frame

Substantial redesign replacing the prior two-row lineup + scale-up-on-tap pattern. The overlay is now the H2H layout in result-state — same three-zone structure (top strip / hero zone / bottom strip) + same two rails as the reveal arc.

### Layout

- **Top strip:** opponent's lineup at hand-strip density (identical to arc).
- **Bottom strip:** user's lineup, symmetric.
- **Left rail (~100px on mobile, wider than arc's 80):** headline + trash-talk live here as end-of-arc commentary. Spans the full hero-zone vertical range.
- **Right rail (~64px):** opponent total at top, user total at bottom, final-margin pill in the middle. Same anchoring as arc end-state; scores persist visually from the arc.
- **Hero zone:** empty by default with a small `60px` minimum cell height so the score anchors don't squish but the overlay fits a 390×844 viewport. Tapping a card flips it at the matching hero position (top half for sender / bottom half for recipient) at full hero size.
- **CTA row + countdown:** below the bottom strip. Countdown pill only when LOSS_OPEN.

### Single-flip invariant

- Only ONE card across both strips combined can be flipped at any time.
- Tap a card → it becomes the hero. The strip cell stays in place but dims to ~0.35 opacity.
- Tap a different card → previous unflips, new takes hero.
- Tap the same card again → unflips, hero zone returns to empty.
- The flipped card renders at the SAME size as the arc's hero card — no scale-up hack from the prior amend. `BackBStats` reads naturally from the existing `gameInfo` + `statLine` fields.

### Removed in this restructure

- Two-row lineup display (LineupStrip).
- "Headline at top, lineups below" header structure.
- `FLIPPED_SCALE_BOOST = 2.4×` scale-up-on-tap hack — no longer needed since the hero zone sizes the card naturally.
- Multi-flip support (`flippedIds: Set<string>` replaced with `selectedCardId: string | null`).
- `OverlayHost` dev-route wrapper — overlay now takes `initialFlippedCardId: string | null` directly.

### Final smoke screenshots

#### 16-overlay-win-noflip-mobile.png (390×844, ?overlay=1&variant=WIN&margin=narrow)

Default WIN state:
- MIKE strip top (6 cards visible).
- Left rail: `Got 'em by 4.5.` (green) + `Stole it. Send it before Mike sees.` (orange trash-talk).
- Hero zone empty (compact 60px placeholders, just the `+4.5 YOU` margin pill in the middle).
- YOU strip bottom.
- `Send It Back` primary + `Dismiss` secondary CTAs at the bottom.
- All content fits the 844 viewport without scrolling.

#### 17-overlay-win-flipped-mobile.png (390×844, ?overlay=1&variant=WIN&margin=narrow&flipped=201939_card)

Stephen Curry tapped (sender slot 4):
- MIKE strip's Curry cell dimmed to ~0.35 opacity (signal "currently shown").
- Curry's back face renders in the TOP hero slot at full hero size: `Jan 12, 2025` / `vs LAL` / `38.9 FP` / `24 PTS · 5 REB · 7 AST / 0 BLK · 1 STL · 3 TO` / `TAP TO FLIP BACK`. Fully legible — no scale-up hack.
- Bottom hero slot remains empty.
- `+4.5 YOU` pill, YOU strip, CTAs all still fit.

#### 18-overlay-loss-open-mobile.png (390×844, ?overlay=1&variant=LOSS_OPEN&margin=narrow)

LOSS_OPEN state:
- Left rail: `Off by 4.5. Window's open.` (red) + `Brutal. Build a fresh hand.`
- `+4.5 OPP` margin pill in middle.
- **`59:59 to flip this.` countdown pill clearly visible above the CTAs** (no longer blocked by overlapping lineup cards).
- `Try Again` primary + `Dismiss` CTAs.

#### 14-overlay-loss-open-desktop.png (1024×800, same URL as 18)

Desktop adaption verified — inner column constrained to 480px max, centered. All 6 cards on both strips fully visible. Right rail scores readable (`178.4` green at top, `173.9` muted at bottom). Headline + trash-talk in left rail. Margin pill centered. CTAs at bottom (partially clipped at 800-tall window but visible at any taller viewport).

## Followups (logged, NOT in phase 4 scope)

- **Phase 5: real-data wiring.** Replace dev-route mock with: (a) production mount that fetches `/api/challenge/{id}/sender-hand` at DEAL time, (b) variant + bucket derived from real `myScore` vs `targetScore`, (c) CTA handlers calling the existing `onSendItBack` / `onTryAgain` / `onCollapse` from the GameView's challenge state machine, (d) `POST /api/challenge/{id}/attempt` on overlay mount + reading `window_closes_at_ms` from the response.
- **Phase 6: win/loss climax animation.** Phase 4's transition from arc end-state to overlay is a hard cut. The climax animation lands between.
- **Phase 7: commentary rail integration.** With the rail carrying the narrative, the trash-talk punchline could move from the overlay to the rail (or coexist). Decision deferred.
- **Phase 8: polish pass.** Headline copy refinement (current copy is placeholder), motion tuning, accessibility audit, visual treatment cleanup, copy register polish via voice-polish tool.
- **Right-edge clipping of the 6th card on mobile strips** — inherited phase-2 condition; cards 4-6 partially clip past the strip's right edge at 390px wide. Captured in earlier smoke artifacts. Not addressed in phase 4.
- **Variant + margin toggle's synthetic deltas** override `recipient.totalFp` only — the per-card `actualFp` values stay verbatim from the mock fixture. If the user replays the arc and then toggles to a LOSS variant, the arc shows `+4.0 YOU` rollup but the overlay claims `Off by ...`. Acceptable for phase 4 dev iteration; phase 5 eliminates the mismatch by deriving variant from real data.
