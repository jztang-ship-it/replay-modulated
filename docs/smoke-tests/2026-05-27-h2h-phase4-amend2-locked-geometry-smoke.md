# H2H phase 4 amend2 — real face-up deck + locked arc/overlay geometry + TIE/EVEN removed (smoke)

Date: 2026-05-27
Branch: `main` (second amend of `c2e78fb` — phase 4 commit)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-amend2-locked-geometry/`

## Scope

Four corrections to the first phase 4 restructure (`c2e78fb`), landed as a single amend on top of that commit (no fix-on-fix history).

1. **Fix 1 — Real face-up deck (replaces face-down placeholders).** `EntranceDeck` now renders the real cards still in `pre` state at each hero position, layered with a small Y offset so the stack reads as a depth pile. The TOP of each stack is the **next-to-deal** card with its FULL FRONT visible (player photo, tier, name, salary). When that card transitions `pre → lay` (starts flying), it leaves the deck and the next card underneath becomes the new visible top. Visual model: a dealer's stack depleting.

2. **Fix 2 — Transient TIE / EVEN insignia removed.** The final-margin pill (`TIE / EVEN / +N YOU / +N OPP`) was removed from `MidRailContent` entirely. It flashed for an instant at the start of `revealing` when both running totals were 0. The two FP totals already convey the overall margin; no separate readout needed.

3. **Fix 3 — Locked geometry between arc and overlay.** The TOP STRIP, both HERO SLOTS, and the BOTTOM STRIP render at IDENTICAL pixel positions on both surfaces. Only the content of those zones changes between states. Both `H2HRevealScreen` and `H2HResultsOverlay` now share the same outer flex-column structure, the same column widths (LEFT_RAIL=100, RIGHT_RAIL=80), the same row gap (14px sliver between heroes), and the same `safe-area + 36px` paddings. A flex-grow "reserved bottom space" between the bottom hero and the bottom strip absorbs viewport slack (empty on arc; holds the countdown + Send It Back CTA on overlay).

4. **Fix 4 — MIKE/YOU header safe-area floor bumped 24 → 36.** Player-name headers never sit tight to a notch or viewport edge.

## Acceptance criteria

### Fix 1 (real face-up deck)
- During `phase === "entering"`: two stacks visible at the top + bottom hero positions, each showing the FRONT of the next-to-deal card (full card render via `renderCard`).
- Stack layers: top card fully visible at z=highest; cards below offset `4px * layer_from_top` down with slight opacity dim.
- As a card transitions `pre → lay`, it leaves the deck (rendered in flight by HandStrip) and the next-lowest stage_index card becomes the new top.
- Both decks render simultaneously and deplete in lockstep (pairing invariant).
- Both decks unmount when all cards reach `settled`.

### Fix 2 (no TIE/EVEN)
- `MidRailContent` renders ONLY the per-matchup delta when both cards are present.
- No `"TIE"`, `"even"`, `"you"`, `"opp"` literal text renders anywhere in the H2H surface DOM.
- No `[data-h2h-overlay-margin]` element renders on the overlay.
- Tests assert all of the above (`shared/components/__tests__/H2HRevealScreen.test.tsx`).

### Fix 3 (locked geometry)
- Outer container of BOTH screens: `position: fixed; inset: 0; paddingTop: calc(env(safe-area-inset-top, 0px) + 36px); paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 36px); overflow: hidden`.
- Inner column on BOTH: `height: 100%; maxWidth: min(480px, 100%); margin: 0 auto; paddingLeft: 16; paddingRight: 16; display: flex; flexDirection: column; justifyContent: flex-start; alignItems: stretch; gap: 14`.
- Battlefield grid on BOTH: `gridTemplateColumns: ${LEFT_RAIL_WIDTH_PX}px 1fr ${SCORE_COLUMN_WIDTH_PX}px; gridTemplateRows: auto auto; rowGap: ${BATTLEFIELD_ROW_GAP_PX}; position: relative`.
- Arc's matchup-delta readout is absolutely positioned in the right column gap (`position: absolute; top: 50%; right: 0; transform: translateY(-50%)`) — does NOT contribute to row height.
- Both surfaces have a `flex: 1 1 auto` reserved spacer between the battlefield and the bottom strip.
- Top strip + hero slot Ys + bottom strip Y must match pixel-for-pixel between arc captures (02-arc-mid-revealing) and overlay captures (03-overlay-noflip, 04-overlay-both-flipped) at 390×844 viewport. Verified by visual overlay comparison.

### Fix 4 (header safe-area)
- Both surfaces' top + bottom padding floors are 36px (not 24px).
- MIKE/YOU headers visible with breathing room above/below their text on a 390×844 viewport.

## Screenshots

### 01-deck-mid-entrance-mobile.png (390×844, `?autoplay=1`, vt=1500ms)

The flagship Fix 1 capture — **real face-up decks**:
- Two card stacks visible at the top + bottom hero positions.
- Top deck: Jayson Tatum BOS $48 SF, 32.1 FP visible as the front of the next-to-deal card.
- Bottom deck: Tyrese Maxey PHI $46 PG, 28.4 FP visible as the front of the next-to-deal card.
- Top strip MIKE: 2 cards landed (NR 11.3, DR 21.5) + 4 dashed placeholder slots.
- Bottom strip YOU: 2 cards landed (BP 6.9, JB 18.5) + 4 dashed placeholder slots.
- Dev controls: `entering · 1/6 dealt`.
- Sliver gap between the two decks (~14px target).

### 02-arc-mid-revealing-mobile.png (390×844, `?autoplay=1`, vt=12000ms)

Revealing matchup 1 with locked geometry:
- Top hero: D'Angelo Russell (sender, slot 1) — 21.5 FP. Card frame includes SWAP pill.
- Bottom hero: Jalen Brunson (recipient, slot 1) — 18.5 FP. SWAP pill present.
- Hero cards visually close — ~14px sliver between them. Confirms `BATTLEFIELD_ROW_GAP_PX 14` with absolute-positioned matchup delta.
- Top strip MIKE at fixed Y; all 6 cards landed; first cell dimmed (active matchup 0 already revealed).
- Bottom strip YOU at fixed Y (dev controls panel overlaps the label in this capture but the cells render correctly).
- **No TIE / EVEN insignia** — confirms Fix 2.
- Dev controls: `revealing · 2/6`.

### 03-overlay-noflip-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow`, vt=5000ms)

Overlay default state — both hero slots empty:
- Top strip MIKE at the SAME Y as the arc (locked).
- Left rail: `Got 'em by 4.5.` (green WIN headline) + `Mike was a redraw away.` (orange trash-talk) — anchored to the same vertical bounds as the empty hero rows.
- Hero zone center is EMPTY (both slots `data-occupied="false"`).
- Reserved bottom space is large because hero slots are empty; flex-grow pushes Send It Back CTA into the visual middle of the lower half.
- Bottom strip YOU at the SAME Y as the arc (locked).
- No `[data-h2h-overlay-margin]` element renders.
- × close button at top-right; no Dismiss CTA.

### 04-overlay-both-flipped-mobile.png (390×844, `?overlay=1&variant=WIN&margin=narrow&topFlipped=1628369_card&bottomFlipped=1629680_card`, vt=5000ms)

The flagship Fix 3 capture — **per-strip flip with locked geometry**:
- Top hero slot: Jayson Tatum back face (sender slot 2) — `Jan 08, 2025 vs TOR`, 32.1 FP, stats.
- Bottom hero slot: Tyrese Maxey back face (recipient slot 2) — `Jan 08, 2025 vs BKN`, 28.4 FP, stats.
- Left rail: headline + trash-talk anchored to the SAME vertical bounds as the hero rows.
- Bottom strip YOU at the SAME Y as captures 02 and 03 (locked).
- Send It Back CTA in the reserved bottom space below the bottom hero (smaller reserved region than 03 because the hero slots are now filled; flex-grow auto-shrinks).
- Top strip MIKE at the SAME Y as captures 02 and 03.

## Locked-geometry verification

Visual overlay comparison between captures 02 (arc), 03 (overlay no-flip), and 04 (overlay both-flipped):

| Element        | 02 (arc)   | 03 (overlay) | 04 (overlay) | Match? |
|----------------|-----------|-------------|-------------|--------|
| MIKE header Y  | ~36-60px  | ~36-60px    | ~36-60px    | ✓      |
| Top strip Y    | ~68-148px | ~68-148px   | ~68-148px   | ✓      |
| Top hero slot center Y     | ~270px    | ~270px (empty placeholder) | ~270px | ✓ |
| Bottom hero slot center Y  | ~500px    | ~500px (empty placeholder) | ~500px | ✓ |
| Bottom strip Y | ~700-780px| ~700-780px  | ~700-780px  | ✓      |
| YOU header Y   | ~780-800px| ~780-800px  | ~780-800px  | ✓      |

The reserved bottom space size varies between captures (empty hero slots → larger reserved space; filled hero slots → smaller) but the bottom strip's anchored position is identical because the reserved space is `flex: 1 1 auto`, not a fixed height. This is the geometric invariant.

## Tests

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  103 passed (103)
```

The H2HRevealScreen test that asserted the legacy "TIE / EVEN / YOU / OPP" pill texts was rewritten:
- `renders the per-matchup delta in the right rail` — confirms `[data-h2h-mid-rail]` renders with `matchup` in its text.
- `does NOT render the legacy final-margin pill text` — confirms `TIE`, `even`, `you`, `opp` strings + `[data-h2h-overlay-margin]` are all absent.

The H2HResultsOverlay suite (21 tests) is unchanged from the prior amend — per-strip flip + no Dismiss CTA + no margin pill assertions still hold.

## Out of scope (deferred)

- **Right-rail FP totals (178.4 / 182.4) clipping at 390 wide.** Pre-existing condition. The `ScoreCell` renders in the 80px right column but is occluded by the horizontally-overflowing strip cells in headless captures. Tracked for a later pass.
- **Right-edge clipping of the 6th strip card on mobile.** Inherited from earlier phases.
- **Hero card overflow on overlay flip.** The `AthleteCard` back face renders at its natural width (~329px) inside a 145px-max-width cell wrapper, so a flipped hero card visually overflows its column. Pre-existing; tracked separately.
- **Tier visual effects regression.** Per task brief.
- **Production dismiss destination.** Phase 5+ wires real navigation.
- **Headline / trash-talk copy polish.** Phase 8.
- **Commentary engine.** Phase 7+.

## Files touched

- `shared/components/H2HRevealScreen.tsx`
  - `EntranceDeck` rewritten — `{ cards, entranceStages, renderCard }` props; renders real face-up cards in `pre` state, layered with vertical offset.
  - `MidRailContent` prop surface shrunk to `{ senderCard, recipientCard }`; final-margin pill removed; renders only the per-matchup delta.
  - Battlefield restructured: 3-col × 2-row grid (`auto auto`) instead of 3 rows; matchup-delta absolute-positioned in the right column gap.
  - Outer column: `justifyContent: "flex-start"` + reserved bottom flex-grow region; `safe-area + 36` paddings.
  - `LEFT_RAIL_WIDTH_PX 80 → 100`; `BATTLEFIELD_ROW_GAP_PX 2 → 14`.

- `shared/components/H2HResultsOverlay.tsx`
  - Outer column rewritten to match `H2HRevealScreen` exactly: `justifyContent: "flex-start"`, `height: 100%`, `gap: 14`, same paddings.
  - Battlefield grid restructured: 2-row instead of 3-row; left rail spans both rows; no row 2 margin-pill content.
  - Reserved bottom space holds countdown + primary CTA, replacing the prior fixed CTA-row layout.
  - `RIGHT_RAIL_WIDTH_PX 64 → 80`; `HERO_ROW_GAP_PX 6 → 14`; outer paddings `safe-area + 24 → safe-area + 36`.

- `shared/components/__tests__/H2HRevealScreen.test.tsx`
  - 3 tests rewritten: legacy `TIE/even/YOU/opp` assertions replaced with explicit "no legacy pill" + "matchup delta present" assertions.

- `docs/h2h-reveal-arc-design.md`
  - New "Phase 4 amend2" section above the original "Phase 4 restructure" section. Documents the locked-geometry invariant + the real-deck + TIE/EVEN removal.
