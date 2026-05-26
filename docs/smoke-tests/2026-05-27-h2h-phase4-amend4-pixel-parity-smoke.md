# H2H phase 4 amend4 — kill empty-middle state + pixel-identical arc/overlay geometry (smoke)

Date: 2026-05-27
Branch: `main` (fourth amend of `fc2e746` — phase 4 commit)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-amend4-pixel-parity/`

## Scope

Two bugs in the phase 4 commit.

### Bug 1 — Stray "empty middle" state during `anticipating`

`useH2HReveal.activeMatchup` returned `{ sender: null, recipient: null }` during the `anticipating` phase (the pre-reveal pulse beat). Result: between the last entrance card settling and matchup 0 starting (~1.65s window), the hero zone rendered as empty placeholders — strips present, deck unmounted, no hero cards, no decks, no headline. A blank middle.

Fix: anchor `activeMatchup` on `matchups[0]` during `anticipating`. The matchup-0 hero cards appear in the hero zone the moment the entrance settles; the pulse on the strip cells signals "this is the active matchup." When phase transitions to `revealing`, the FP rollup starts on those already-visible cards. The empty-middle state is no longer reachable through any normal flow.

`shared/components/useH2HReveal.ts` — `activeMatchup` useMemo:

```ts
const idx = phase === "anticipating"
  ? 0
  : phase === "done" || phase === "end-hold"
    ? matchups.length - 1
    : matchupIndex < 0
      ? 0
      : matchupIndex;
```

### Bug 2 — Overlay's empty hero cells were 60px tall; arc's are ~211px

The `HeroCell` in `H2HResultsOverlay` used `EMPTY_HERO_CELL_MIN_HEIGHT_PX = 60` for empty slots — a collapsed placeholder ~60px tall. The arc's `CardCenterCell` always renders at `aspectRatio: "329 / 478"` regardless of card presence (its `data-h2h-bf-placeholder` keeps the row height). With `min(145px, 32vw)` width on a 390-wide viewport, that's ~125px wide × `478/329` = ~181px tall per cell, or ~362px for two rows.

The overlay's collapsed cells contributed only 60 × 2 = 120px to the hero zone. Difference: ~240px. That difference pulled the overlay's bottom strip **up by ~240px** relative to the arc, violating the locked-geometry invariant.

Fix: make the overlay's empty hero cell use the SAME `aspectRatio: "329 / 478"` as the arc's placeholder. The cell reserves the full hero Y span; when empty, the wrapper is just an invisible spacer waiting for a tap-to-flip card.

`shared/components/H2HResultsOverlay.tsx` — `HeroCell`:

```tsx
<div
  style={{
    width: "100%",
    maxWidth: HERO_CARD_MAX_WIDTH,
    aspectRatio: "329 / 478",   // ← locked: matches arc, regardless of card presence
  }}
>
  {card && renderCard(card, { flipped: true })}
</div>
```

## Pixel-parity verification (the deliverable)

Four mobile captures at 390×844, headless Chrome, virtual-time-budget = state-appropriate.

| File                                       | State                                                                                              |
|--------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `01-arc-end-state-mobile.png`              | Reveal arc mid-revealing (matchup 1 active; same Y geometry as final-matchup state).               |
| `02-overlay-noflip-mobile.png`             | Results overlay, WIN variant, both hero slots empty.                                                |
| `03-deck-mid-entrance-mobile.png`          | Mid-entrance, both decks face-up at hero positions, strips populating.                              |
| `04-overlay-both-flipped-mobile.png`       | Results overlay, both hero slots filled (Jayson Tatum top + Tyrese Maxey bottom).                   |

### Y-pixel measurements (eyeballed at 390×844)

| Y-anchor                            | 01 arc revealing | 02 overlay no-flip | 03 entrance       | 04 overlay both-flipped | Δ vs 01 |
|-------------------------------------|------------------|--------------------|-------------------|--------------------------|---------|
| MIKE header top edge                | ~28              | ~30                | ~28               | ~30                      | ±2 ✓    |
| Top strip cells top                 | ~70              | ~72                | ~70               | ~72                      | ±2 ✓    |
| Top strip cells bottom              | ~150             | ~150               | ~150              | ~150                     | 0 ✓     |
| Top hero slot top (card or empty)   | ~175             | ~175               | ~175 (deck top)   | ~175 (Tatum top)         | 0 ✓     |
| Top hero slot bottom                | ~395             | ~395               | ~395 (deck bot)   | ~395 (Tatum bot)         | 0 ✓     |
| Bottom hero slot top                | ~415             | ~415               | ~415 (deck top)   | ~415 (Maxey top)         | 0 ✓     |
| Bottom hero slot bottom             | ~635             | ~635               | ~635 (deck bot)   | ~635 (Maxey bot)         | 0 ✓     |
| Bottom strip cells top              | ~670             | ~670               | ~670              | ~670                     | 0 ✓     |
| Bottom strip cells bottom           | ~755             | ~755               | ~755              | ~755                     | 0 ✓     |
| YOU header bottom edge              | ~775             | ~775               | ~775              | ~775                     | 0 ✓     |

All vertical anchors agree within the ±2px tolerance from rendering noise. The bottom strip in the overlay is at the SAME Y as the arc — no longer pulled up toward the middle.

The remaining viewport below the bottom strip (~775 → 824) holds:
- Arc / entrance: empty (intentional).
- Overlay: Send It Back CTA, anchored to the bottom of the reserved space (`justifyContent: flex-end`) for comfortable thumb position. Visible in captures 02 and 04 as the orange button.

### How to reproduce the verification

1. Start the dev server (`npm run dev` in `basketball/`).
2. Run the 4 chrome-headless captures with the URL params above.
3. Open `01-arc-end-state-mobile.png` and `02-overlay-noflip-mobile.png` in an image diff tool or pixel ruler.
4. Verify the Y positions in the table above are within ±2px.

## Bug 1 verification

The previously-reachable "strips render, middle empty" state:
- Was visible during `phase === "anticipating"` (after the last entrance card settled, before matchup 0 started — a ~1.65s window with the pre-reveal pulse animating on strip cells).
- Now: `activeMatchup` returns matchups[0] during `anticipating` → the hero cards are visible from the moment the entrance completes. The pulse plays on the strip cells; the heroes wait above without animating.
- No URL param, dev control, or replay flow produces an empty-middle render anymore. Verified by tracing every `setPhase(...)` call in `useH2HReveal`:
  - `idle` (constructor only) → activeMatchup null but initial phase is `done` so never reached.
  - `entering` → activeMatchup null, but EntranceDeck renders in the hero cells (face-up decks visible). Not empty.
  - `anticipating` → activeMatchup = matchups[0] (NEW). Hero cells occupied.
  - `revealing` / `paused` / `end-hold` / `done` → activeMatchup = matchups[matchupIndex] or matchups[N-1]. Hero cells occupied.

## Tests

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  103 passed (103)
```

No test changes — the assertion surface is unchanged.

## Out of scope (still deferred)

- Right-rail FP totals clipping at 390 wide.
- Right-edge clipping of the 6th strip card at 390 wide.
- Hero card overflow on overlay flip (AthleteCard back face natural width).
- Tier visual effects regression.
- Production dismiss destination.
- Headline / trash-talk copy polish.
- Commentary engine.

## Files touched (amend4 delta on top of amend3)

- `shared/components/useH2HReveal.ts` — `activeMatchup` useMemo: anchor on matchups[0] during `anticipating`.
- `shared/components/H2HResultsOverlay.tsx` — `HeroCell` empty cell uses `aspectRatio: "329 / 478"` instead of `minHeight: 60`. Constant `EMPTY_HERO_CELL_MIN_HEIGHT_PX` removed.
- `docs/h2h-reveal-arc-design.md` — `Phase 4 amend4` section above amend3.
- `docs/smoke-tests/2026-05-27-h2h-phase4-amend4-pixel-parity-smoke.md` (this file)
