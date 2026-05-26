# H2H phase 4 — Deck-entrance + arc layout tighten + overlay 3-zone restructure (smoke)

Date: 2026-05-27
Branch: `main` (amended `55a0309` — phase 4 commit)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-deck-entrance-overlay-restructure/`

## Scope

Three connected fixes to the phase 4 commit, landed as a single amend:

1. **Fix 1 — Deck-metaphor entrance.** Replace the prior slot-direct lay-down with a deck metaphor: two face-down deck stacks render at the top + bottom hero positions during `phase === "entering"`. Cards fly out one by one from each stack into their strip slots. The deck visibly shrinks as cards depart. Both decks animate simultaneously (pairing invariant). Reuses `shared/components/CardBackGeneric` for the face-down asset (diamond grid + center emblem + REPLAY IFS wordmark). TIE/EVEN insignia stays hidden during entrance (already conditional on phase).

2. **Fix 2 — Arc layout tighten.** Per-matchup delta + final-margin pill (`MidRailContent`) moved OUT of the center column (between hero cards) and INTO the right rail (row 2 of the right column). Center column row 2 is now empty. Hero cards close ranks via `BATTLEFIELD_ROW_GAP_PX 6 → 2` so the two heroes read as one tight clash unit with a sliver gap. Top + bottom strips stay at their original Y positions; the bottom hero rises with the rest of the battlefield (intentional unused space below the bottom hero before the bottom strip).

3. **Fix 3 — Overlay restructure to per-strip flip + 3-zone middle.** `H2HResultsOverlay` middle row switches from a single-flip invariant to per-strip flip: each strip has its own selection, and both hero slots can be filled simultaneously for 1v1 face-to-face comparison. Right rail content reduces to two FP totals (top anchored to top hero Y, bottom to bottom hero Y) — NO delta pill in the middle anymore. Send It Back CTA stays below the bottom strip. **Dismiss CTA removed entirely** — × close button is the only dismiss path.

## Acceptance criteria for each fix

### Fix 1 (deck entrance)
- During `phase === "entering"`: two face-down stacks visible at top + bottom hero positions.
- Each stack initially shows N=6 cards; visibly shrinks as cards fly out.
- Cards fly from deck position (hero Y, hero scale) to their strip slot (strip Y, strip scale).
- Both decks animate in lockstep — same `cardsRemaining` count for both stacks (drives by `entranceStages.filter(s => "pre")`).
- After all cards land, deck visual disappears (entranceDeckCount → 0).

### Fix 2 (arc layout)
- Right column row 2 (between top + bottom hero score cells) holds the `MidRailContent` (matchup delta + final-margin pill stacked vertically) — visible only during `revealing` / `paused` / `end-hold` / `done` phases.
- Center column row 2 is empty.
- `BATTLEFIELD_ROW_GAP_PX === 2` (down from 6). Hero cards visually touch with a thin sliver.
- Top + bottom strips still at original anchor positions.

### Fix 3 (overlay restructure)
- `H2HResultsOverlay` exposes `initialTopFlippedCardId` + `initialBottomFlippedCardId` props (single `initialFlippedCardId` removed).
- DOM exposes `data-h2h-overlay-selected-top` and `data-h2h-overlay-selected-bottom` (not the prior single `data-h2h-overlay-selected`).
- Top strip tap → only TOP hero cell occupies. Bottom strip tap → only BOTTOM hero cell. Both can be filled at once.
- Tapping a different card within the same strip swaps that strip's selection (other strip unaffected).
- No `[data-h2h-overlay-margin]` element renders (margin pill removed from row 2 center).
- No `[data-h2h-overlay-dismiss]` element renders (Dismiss CTA removed).
- Dev route URL params: `?topFlipped=cardId` + `?bottomFlipped=cardId` seed both selections (single `?flipped=` deprecated).

## Screenshots

### 01-deck-entrance-mid-mobile.png (390×844, `?autoplay=1`, vt=1200ms)

The flagship Fix 1 capture — **deck metaphor live**:
- Two face-down branded card-back stacks rendered at top hero position + bottom hero position. The REPLAY IFS emblem + center "R" + diamond grid pattern visible on each stack's face-up card.
- Top strip: 2 cards landed (NR, DR) + 4 dashed placeholder slots at right.
- Bottom strip: 2 cards landed (BP, JB) + 4 dashed placeholder slots at right.
- Dev controls: `entering · 1/6 dealt · Play | Skip`. (Stale-by-one — the dealt counter samples `settled` only; cards mid-flight in `lay`/`travel` show landed but don't count as dealt yet.)
- Both deck stacks visible simultaneously (pairing invariant).

### 02-arc-mid-revealing-mobile.png (390×844, `?autoplay=1`, vt=12000ms)

Revealing matchup 0. Both swap-cheapest heroes visible at full hero size:
- Top hero: Naz Reid (sender, slot 0) — 11.3 FP.
- Bottom hero: Bobby Portis (recipient, slot 0) — 6.9 FP.
- Hero cards visually CLOSE — `BATTLEFIELD_ROW_GAP_PX === 2` lands a thin sliver between them. (Confirms Fix 2 hero tighten.)
- Top strip: 6 cards, leftmost dimmed (active matchup card 0).
- Bottom strip: 6 cards, leftmost dimmed.
- Dev controls: `revealing · 1/6 · Play | Skip`.

### 03-overlay-noflip-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow`, vt=5000ms)

Overlay in default state (both hero slots empty):
- Top strip MIKE; bottom strip YOU.
- Left rail: `Got 'em by 4.5.` (green WIN headline) + `Stole it. Send it before Mike sees.` (orange trash-talk).
- Center hero zone is EMPTY (both top + bottom slots unoccupied — `data-occupied="false"`).
- No margin pill in row 2 (Fix 3 removed it).
- Single primary CTA at the bottom: `Send It Back`. **No Dismiss CTA** (Fix 3 removed it; × close button at top-right is the only dismiss path).
- Dev controls panel pinned bottom-right.

### 04-overlay-both-flipped-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow&topFlipped=1628369_card&bottomFlipped=1629680_card`, vt=5000ms)

The flagship Fix 3 capture — **per-strip flip, both hero slots filled simultaneously**:
- Top hero slot: Jayson Tatum back face (sender slot 2) — `Jan 08, 2025 vs TOR`, 32.1 FP, stats line, `TAP TO FLIP BACK` hint.
- Bottom hero slot: Tyrese Maxey back face (recipient slot 2) — `Jan 08, 2025 vs BKN`, 28.4 FP, stats line, `TAP TO FLIP BACK` hint.
- Left rail: headline + trash-talk (`Razor-thin. Send it back.`) on the left edge.
- Both hero slots visible at full hero size; user can compare both card backs simultaneously (the 1v1 face-to-face use case Fix 3 enables).
- Bottom strip + Send It Back CTA scroll into view at the bottom; × close button at top-right.

## Tests

All shared component tests pass after the restructure: `7 files, 104 tests` total.
Overlay-specific suite: `21 tests` (rewrote `__tests__/H2HResultsOverlay.test.tsx` for per-strip flip + removed Dismiss + removed margin pill).

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  104 passed (104)
```

## Out of scope

- **Right-rail FP totals (178.4 / 182.4) clipping on mobile.** Pre-existing condition. The right-column `ScoreCell` is rendered but not visible in 390-wide captures — same as phase 3 + phase 4 prior captures (e.g. `2026-05-26-h2h-phase3-reveal-choreography/22-end-state-mobile.png` has no visible 178.4/182.4 either). Not addressed in this amend; tracked for a later layout/scroll-padding pass.
- **Right-edge clipping of the 6th strip card on mobile.** Inherited from earlier phases.
- **Headline copy / trash-talk polish.** Reserved for phase 8.
- **Variant + margin toggle's synthetic deltas mismatch the arc end-state.** Acceptable for phase 4 dev iteration; phase 5 derives variant from real data.
- **Tier visual effects regression.** Out of scope per task brief.
- **Production dismiss destination.** Phase 5+ wires real navigation; phase 4 dev route logs `[h2h-mock] CTA "Dismiss" pressed`.
- **Commentary engine.** Phase 7+.

## Files touched

- `shared/components/H2HRevealScreen.tsx`
  - New `EntranceDeck` component (face-down stack via `CardBackGeneric`).
  - New `HERO_CARD_SCALE`, `ENTRANCE_DECK_TRANSLATE_Y_TOP_PX`, `ENTRANCE_DECK_TRANSLATE_Y_BOTTOM_PX`, `computeDeckTranslateX()` helpers.
  - `HandStrip` cell switch: `case "pre"` now uses `deckTransform` (hero scale at deck Y); `case "lay"` flies from deck → slot with z-index promotion.
  - `BATTLEFIELD_ROW_GAP_PX 6 → 2`.
  - Battlefield grid row 1 / row 3 center column conditionally renders `EntranceDeck` during `phase === "entering"`, `CardCenterCell` otherwise. Score cells hidden during entering.
  - `MidRailContent` moved from center column row 2 → right column row 2, restyled as vertical stack (matchup delta on top, final-margin pill below) to fit the 80px right rail.

- `shared/components/H2HResultsOverlay.tsx`
  - Per-strip flip: `topSelectedCardId` + `bottomSelectedCardId` state (was single `selectedCardId`).
  - New props `initialTopFlippedCardId` + `initialBottomFlippedCardId`.
  - DOM attrs `data-h2h-overlay-selected-top` + `data-h2h-overlay-selected-bottom`.
  - `MarginPill` component + render removed.
  - Dismiss CTA button removed.

- `basketball/src/dev/H2HRevealMockRoute.tsx`
  - URL params: `?topFlipped=` + `?bottomFlipped=` (was single `?flipped=`).
  - Overlay mount passes both initial flipped ids.

- `shared/components/__tests__/H2HResultsOverlay.test.tsx`
  - Suite rewritten for per-strip flip mechanic + removed Dismiss + removed margin pill.
  - 21 tests total.

- `docs/h2h-reveal-arc-design.md`
  - Added "Phase 4 restructure — deck entrance + arc layout tighten + overlay 3-zone middle + per-strip flip" section.
  - Results-overlay section updated to reflect the 3-zone middle structure.
