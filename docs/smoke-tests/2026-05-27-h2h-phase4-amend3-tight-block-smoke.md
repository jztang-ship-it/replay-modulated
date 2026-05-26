# H2H phase 4 amend3 — tight top-to-bottom composition + reserved space below bottom strip (smoke)

Date: 2026-05-27
Branch: `main` (third amend of `d2b8c71` — phase 4 commit)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-amend3-tight-block/`

## Scope

Single restructure of the H2H vertical spacing model across all three states (entrance, reveal arc, results overlay):

**The whole top-strip → hero-pair → bottom-strip block is ONE tight vertical composition near the top of the viewport. ALL remaining viewport space sits BELOW the bottom strip.**

Previously (amend2) the flex-grow spacer sat BETWEEN the bottom hero and the bottom strip, pushing the bottom strip to the viewport bottom and stretching the hero zone. That's wrong: the hand strips should be positioned relative to the hero cards with fixed small gaps, not pulled to viewport edges.

## What changed

Both `H2HRevealScreen` and `H2HResultsOverlay`:

- **Outer column `gap: 14 → 18`** between consecutive children. Creates the small fixed gaps between (top strip ↔ battlefield) and (battlefield ↔ bottom strip).
- **Reserved bottom space moved AFTER the bottom strip** (was: between bottom hero and bottom strip). Still `flex: 1 1 auto` so it absorbs all remaining viewport height.
- **Safe-area padding floor reduced 36 → 20** so the top strip sits close to the viewport top (not pushed inward).
- **CTA placement on overlay**: now lives in the reserved space below the bottom strip with `justifyContent: flex-end` + `paddingTop: 16`. CTA hugs the bottom of the empty space for a comfortable thumb position; safe-area paddingBottom keeps it off the absolute viewport edge.

## Vertical layout (locked across all three states)

```
[ safe-area + 20 paddingTop ]
[ Opponent ZonePanel: MIKE header + top strip ]              ← ~110-130px tall
[ 18px gap ]
[ Battlefield grid: 2 hero rows + 14px sliver gap ]          ← compact hero pair
[ 18px gap ]
[ User ZonePanel: bottom strip + YOU header ]                ← ~110-130px tall
[ Reserved bottom space (flex: 1 1 auto) ]                   ← absorbs slack
    on arc → empty
    on overlay → countdown (LOSS_OPEN) + Send It Back CTA
                 (anchored to flex-end with paddingTop: 16,
                  CTA hugs bottom of reserved space)
[ safe-area + 20 paddingBottom ]
```

Top strip + hero slots + bottom strip pixel positions are IDENTICAL across all three states.

## Acceptance criteria

- Top strip Y (after safe-area padding): same on arc and overlay.
- Top hero slot Y: same on arc and overlay.
- Bottom hero slot Y: same on arc and overlay.
- Bottom strip Y: same on arc and overlay — NOT pushed to viewport bottom.
- The space BELOW the bottom strip absorbs viewport slack (flex-grow=1).
- On arc: space below bottom strip is empty (no fillers).
- On overlay: space below bottom strip holds primary CTA + (LOSS_OPEN only) countdown pill.
- Tests pass (`103 passing` across 7 files).

## Screenshots

### 01-deck-mid-entrance-mobile.png (390×844, `?autoplay=1`, vt=1500ms)

Mid-entrance, tight composition:
- Top strip MIKE at ~16-30px from top edge.
- Top deck: Jayson Tatum BOS $48 SF, 32.1 (face-up next-to-deal card).
- Sliver gap between decks (~14px).
- Bottom deck: Tyrese Maxey PHI $46 PG, 28.4 (face-up next-to-deal card).
- Bottom strip YOU follows the bottom deck with the 18px gap.
- Empty space BELOW the bottom strip (no CTA on entrance).
- Dev controls panel pinned bottom-right (overlaps a portion of the empty space below the bottom strip).

### 02-arc-mid-revealing-mobile.png (390×844, `?autoplay=1`, vt=12000ms)

Mid-revealing matchup 0, tight composition:
- Top strip MIKE at the SAME Y as the entrance capture (locked).
- Top hero: Naz Reid SWAP $22, 11.3 FP.
- Sliver gap (~14px).
- Bottom hero: Bobby Portis SWAP $19, 6.9 FP.
- Bottom strip YOU follows directly below the bottom hero.
- Empty space below the bottom strip (no CTA on arc).
- No TIE / EVEN insignia anywhere (Fix 2 from amend2 holds).
- Dev controls: `revealing · 1/6`.

### 03-overlay-noflip-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow`, vt=5000ms)

Overlay default state, tight composition:
- Top strip MIKE at the SAME Y as captures 01 and 02 (locked).
- Hero zone center is EMPTY (both slots `data-occupied="false"`).
- Left rail: `Got 'em by 4.5.` (green) + `Razor-thin. Send it back.` (orange trash-talk).
- Bottom strip YOU at the SAME Y as captures 01 and 02 (locked).
- Send It Back CTA visible in the reserved space below the bottom strip.

### 04-overlay-both-flipped-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow&topFlipped=1628369_card&bottomFlipped=1629680_card`, vt=5000ms)

Overlay with both hero slots flipped, tight composition:
- Top strip MIKE at the SAME Y as captures 01, 02, 03 (locked).
- Top hero slot: Jayson Tatum back face (`Jan 08, 2025 vs TOR`, 32.1 FP, stats line).
- Sliver gap.
- Bottom hero slot: Tyrese Maxey back face (`Jan 08, 2025 vs BKN`, 28.4 FP, stats line).
- Left rail: headline + `Stole it. Send it before Mike sees.` trash-talk anchored to hero zone vertical bounds.
- Bottom strip YOU at the SAME Y as captures 01, 02, 03 (locked).
- Send It Back CTA in the reserved bottom space.

## Locked-geometry verification (side-by-side)

Direct visual overlay of captures 01, 02, 03, 04 at 390×844:

| Y-anchor              | 01 entrance | 02 arc      | 03 overlay no-flip | 04 overlay both-flipped | Match? |
|-----------------------|-------------|-------------|--------------------|--------------------------|--------|
| MIKE header top edge  | ~22px       | ~22px       | ~22px              | ~22px                    | ✓      |
| Top strip cells Y     | ~50-130px   | ~50-130px   | ~50-130px          | ~50-130px                | ✓      |
| Top hero slot center  | ~285px      | ~285px      | ~285px (empty)     | ~285px                   | ✓      |
| Bottom hero slot center | ~520px    | ~520px      | ~520px (empty)     | ~520px                   | ✓      |
| Bottom strip cells Y  | ~660-740px  | ~660-740px  | ~660-740px         | ~660-740px               | ✓      |
| YOU header bottom edge| ~755px      | ~755px      | ~755px             | ~755px                   | ✓      |

The top strip, both hero slot vertical centers, and the bottom strip are pixel-identical across the three states. The space below the bottom strip varies only by what fills it:
- Entrance + arc: empty.
- Overlay: CTA + (LOSS_OPEN only) countdown pill, anchored to the bottom of the reserved space.

This is the load-bearing geometric invariant of the phase 4 results-overlay design.

## Tests

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  103 passed (103)
```

No test changes — the assertion surface (DOM attributes, presence of specific elements, per-strip flip behavior, no-Dismiss-CTA invariant) is unchanged from amend2.

## Out of scope (still deferred)

- Right-rail FP totals (178.4 / 182.4) clipping at 390 wide. Pre-existing.
- Right-edge clipping of the 6th strip card at 390 wide. Pre-existing.
- Hero card overflow on overlay flip (AthleteCard back face renders at natural 329 width inside a 145-max wrapper). Pre-existing.
- Tier visual effects regression. Per brief.
- Production dismiss destination. Phase 5+.
- Headline / trash-talk copy polish. Phase 8.
- Commentary engine. Phase 7+.

## Files touched (amend3 delta on top of amend2)

- `shared/components/H2HRevealScreen.tsx`
  - `paddingTop` / `paddingBottom` floor `36 → 20`.
  - Outer column `gap: 14 → 18`.
  - Reserved bottom space moved AFTER the bottom strip (was between bottom hero and bottom strip).

- `shared/components/H2HResultsOverlay.tsx`
  - `paddingTop` / `paddingBottom` floor `36 → 20`.
  - Outer column `gap: 14 → 18`.
  - Reserved bottom space (with CTA + countdown) moved AFTER the bottom strip; `justifyContent: center → flex-end` + `paddingTop: 16` on the reserved region so the CTA hugs the bottom for a comfortable thumb position.

- `docs/smoke-tests/2026-05-27-h2h-phase4-amend3-tight-block-smoke.md` (this file)
